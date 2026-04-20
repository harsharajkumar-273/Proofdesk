import { randomInt } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getProofdeskDataPath } from '../utils/dataPaths.js';
import { getRedisClient, isRedisSharedStateEnabled } from '../utils/redisClient.js';

const TEAM_SESSION_RETENTION_MS = 12 * 60 * 60 * 1000;
const TEAM_SESSION_RETENTION_SECONDS = Math.floor(TEAM_SESSION_RETENTION_MS / 1000);
const TEAM_SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STORE_FILE = () => getProofdeskDataPath('.team-sessions.json');
const redisKey = (code) => `proofdesk:team-session:${code}`;

export const normalizeTeamSessionCode = (value = '') =>
  String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isValidTeamRepo = (repo) =>
  repo
  && typeof repo.owner === 'string'
  && typeof repo.name === 'string'
  && typeof repo.fullName === 'string'
  && repo.owner.length > 0
  && repo.name.length > 0
  && repo.fullName.length > 0;

const generateTeamSessionCode = () => {
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += TEAM_SESSION_CODE_ALPHABET[randomInt(TEAM_SESSION_CODE_ALPHABET.length)];
  }
  return code;
};

class TeamSessionStore {
  constructor() {
    this.sessions = new Map();
    this.loadPromise = this.load();
    this.persistScheduled = false;
    this.lastLoadedMtimeMs = 0;
    setInterval(() => this.cleanupExpiredSessions(), 10 * 60 * 1000).unref();
  }

  async load(force = false) {
    if (isRedisSharedStateEnabled()) {
      return;
    }

    try {
      const storeFile = STORE_FILE();
      await fs.mkdir(path.dirname(storeFile), { recursive: true });
      const stats = await fs.stat(storeFile).catch(() => null);
      if (!stats) return;
      if (!force && stats.mtimeMs <= this.lastLoadedMtimeMs) return;

      const raw = await fs.readFile(storeFile, 'utf-8');
      const entries = JSON.parse(raw);
      const cutoff = Date.now() - TEAM_SESSION_RETENTION_MS;
      const nextSessions = new Map();

      for (const session of entries) {
        if (!session?.code) continue;
        if ((session.updatedAt || session.createdAt || 0) < cutoff) continue;
        nextSessions.set(session.code, session);
      }

      this.sessions = nextSessions;
      this.lastLoadedMtimeMs = stats.mtimeMs;
    } catch {
      // No stored team sessions yet.
    }
  }

  schedulePersist() {
    if (isRedisSharedStateEnabled()) return;
    if (this.persistScheduled) return;
    this.persistScheduled = true;
    queueMicrotask(async () => {
      this.persistScheduled = false;
      try {
        const storeFile = STORE_FILE();
        await fs.mkdir(path.dirname(storeFile), { recursive: true });
        await fs.writeFile(
          storeFile,
          JSON.stringify([...this.sessions.values()], null, 2),
          'utf-8'
        );
        const stats = await fs.stat(storeFile).catch(() => null);
        this.lastLoadedMtimeMs = stats?.mtimeMs || Date.now();
      } catch (error) {
        console.error('[TeamSessionStore] Failed to persist sessions:', error.message);
      }
    });
  }

  async createSession({ repo, createdBy }) {
    await this.loadPromise;
    let code = generateTeamSessionCode();

    if (isRedisSharedStateEnabled()) {
      const client = await getRedisClient();
      while (await client.exists(redisKey(code))) {
        code = generateTeamSessionCode();
      }
    } else {
      await this.load(true);
      while (this.sessions.has(code)) {
        code = generateTeamSessionCode();
      }
    }

    const session = {
      code,
      repo: {
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        defaultBranch: repo.defaultBranch || 'main',
      },
      hostName: createdBy?.name || createdBy?.login || 'Host',
      hostLogin: createdBy?.login || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (isRedisSharedStateEnabled()) {
      const client = await getRedisClient();
      await client.set(redisKey(code), JSON.stringify(session), {
        EX: TEAM_SESSION_RETENTION_SECONDS,
      });
    } else {
      this.sessions.set(code, session);
      this.schedulePersist();
    }

    return session;
  }

  async getSession(code) {
    await this.loadPromise;

    if (isRedisSharedStateEnabled()) {
      const client = await getRedisClient();
      const rawSession = await client.get(redisKey(code));
      if (!rawSession) return null;
      const session = JSON.parse(rawSession);
      session.updatedAt = Date.now();
      await client.set(redisKey(code), JSON.stringify(session), {
        EX: TEAM_SESSION_RETENTION_SECONDS,
      });
      return session;
    }

    await this.load(true);
    const session = this.sessions.get(code);
    if (!session) return null;

    session.updatedAt = Date.now();
    this.schedulePersist();
    return session;
  }

  cleanupExpiredSessions() {
    if (isRedisSharedStateEnabled()) return;
    const cutoff = Date.now() - TEAM_SESSION_RETENTION_MS;
    let deleted = false;
    for (const [code, session] of this.sessions.entries()) {
      if ((session.updatedAt || session.createdAt) < cutoff) {
        this.sessions.delete(code);
        deleted = true;
      }
    }

    if (deleted) {
      this.schedulePersist();
    }
  }
}

const teamSessionStore = new TeamSessionStore();

export default teamSessionStore;
