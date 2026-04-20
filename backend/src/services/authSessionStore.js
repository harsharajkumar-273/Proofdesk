import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getProofdeskDataPath } from '../utils/dataPaths.js';

const SESSION_COOKIE_NAME = 'proofdesk_session';
const OAUTH_STATE_COOKIE_NAME = 'proofdesk_oauth_state';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
const ENCRYPTION_SALT = 'proofdesk-session-store-v1';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const STORE_FILE = () => getProofdeskDataPath('.auth-sessions.json');
const PLACEHOLDER_VALUES = new Set(['replace_me', 'changeme', 'change_me']);

const toCookieHeader = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
};

export const parseCookies = (cookieHeader = '') =>
  String(cookieHeader)
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) return cookies;

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});

const hasConfiguredSecret = (value) =>
  typeof value === 'string'
  && value.trim().length > 0
  && !PLACEHOLDER_VALUES.has(value.trim().toLowerCase());

// Returns all configured secrets in priority order: [current, ...retired].
// Current secret is PROOFDESK_SESSION_SECRET (or SESSION_ENCRYPTION_SECRET for legacy compat).
// Retired keys are supplied as PROOFDESK_SESSION_SECRET_RETIRED — a comma-separated list of
// old secrets that can still decrypt existing sessions.  New sessions are always encrypted
// with the current (first) key.
const getSessionSecrets = () => {
  const current = [process.env.PROOFDESK_SESSION_SECRET, process.env.SESSION_ENCRYPTION_SECRET]
    .find(hasConfiguredSecret) || null;

  const retired = String(process.env.PROOFDESK_SESSION_SECRET_RETIRED || '')
    .split(',')
    .map((s) => s.trim())
    .filter(hasConfiguredSecret);

  return current ? [current, ...retired] : retired;
};

// Derive a 32-byte AES key from a secret string.
const deriveKey = (secret) =>
  crypto.scryptSync(secret, ENCRYPTION_SALT, 32);

// Returns the primary (current) derived key, or null if no secret is configured.
const getPrimaryKey = () => {
  const secrets = getSessionSecrets();
  return secrets.length > 0 ? deriveKey(secrets[0]) : null;
};

const encryptAccessToken = (accessToken) => {
  const key = getPrimaryKey();
  if (!key) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(accessToken, 'utf8'),
    cipher.final(),
  ]);

  return {
    encryptedAccessToken: encrypted.toString('base64'),
    accessTokenIv: iv.toString('base64'),
    accessTokenTag: cipher.getAuthTag().toString('base64'),
  };
};

// Attempts decryption with each configured key in order (current first, then retired).
// This allows rolling key rotation: add the new key as current, move the old key to
// PROOFDESK_SESSION_SECRET_RETIRED, and existing sessions decrypt transparently until
// they are re-encrypted on next write (or expire naturally).
const decryptAccessToken = (record) => {
  if (!record?.encryptedAccessToken || !record?.accessTokenIv || !record?.accessTokenTag) {
    return null;
  }

  const iv = Buffer.from(record.accessTokenIv, 'base64');
  const tag = Buffer.from(record.accessTokenTag, 'base64');
  const ciphertext = Buffer.from(record.encryptedAccessToken, 'base64');

  for (const secret of getSessionSecrets()) {
    try {
      const key = deriveKey(secret);
      const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      // Wrong key — try the next one
    }
  }

  console.error('[AuthSessionStore] Failed to decrypt a stored session token: no matching key found');
  return null;
};

const serializeSessionForStorage = (session) => {
  const serialized = {
    id: session.id,
    mode: session.mode,
    user: session.user || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };

  if (!session.accessToken) {
    return serialized;
  }

  const encryptedToken = encryptAccessToken(session.accessToken);
  if (!encryptedToken) {
    return serialized;
  }

  return {
    ...serialized,
    ...encryptedToken,
  };
};

const restoreSessionFromStorage = (entry) => {
  if (!entry?.id) return null;

  let accessToken = '';
  if (typeof entry.accessToken === 'string' && entry.accessToken.length > 0) {
    accessToken = entry.accessToken;
  } else {
    accessToken = decryptAccessToken(entry) || '';
  }

  if (!accessToken) {
    return null;
  }

  return {
    id: entry.id,
    accessToken,
    mode: entry.mode || 'github',
    user: entry.user || null,
    createdAt: entry.createdAt || Date.now(),
    updatedAt: entry.updatedAt || entry.createdAt || Date.now(),
  };
};

class AuthSessionStore {
  constructor() {
    this.sessions = new Map();
    this.persistPromise = null;
    this.persistScheduled = false;
    this.needsMigrationPersist = false;
    this.loadPromise = this.load();
    setInterval(() => this.cleanupExpiredSessions(), 30 * 60 * 1000).unref();
  }

  async ensureLoaded() {
    await this.loadPromise;
  }

  async load() {
    try {
      await fs.mkdir(path.dirname(STORE_FILE()), { recursive: true });
      const raw = await fs.readFile(STORE_FILE(), 'utf-8');
      const entries = JSON.parse(raw);
      const now = Date.now();

      for (const entry of entries) {
        const restored = restoreSessionFromStorage(entry);
        if (!restored) continue;
        if ((restored.updatedAt || restored.createdAt || 0) + SESSION_TTL_MS < now) continue;
        if (typeof entry.accessToken === 'string' && entry.accessToken.length > 0) {
          this.needsMigrationPersist = true;
        }
        this.sessions.set(restored.id, restored);
      }

      if (this.needsMigrationPersist) {
        this.schedulePersist();
      }
    } catch {
      // No persisted session file yet.
    }
  }

  schedulePersist() {
    if (this.persistScheduled) return;
    this.persistScheduled = true;

    queueMicrotask(() => {
      this.persistScheduled = false;
      this.persistPromise = this.persist().catch((error) => {
        console.error('[AuthSessionStore] Failed to persist sessions:', error.message);
      });
    });
  }

  async persist() {
    await fs.mkdir(path.dirname(STORE_FILE()), { recursive: true });
    await fs.writeFile(
      STORE_FILE(),
      JSON.stringify([...this.sessions.values()].map(serializeSessionForStorage), null, 2),
      'utf-8'
    );
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    let deleted = false;

    for (const [sessionId, session] of this.sessions.entries()) {
      const updatedAt = session.updatedAt || session.createdAt || 0;
      if (updatedAt + SESSION_TTL_MS < now) {
        this.sessions.delete(sessionId);
        deleted = true;
      }
    }

    if (deleted) {
      this.schedulePersist();
    }
  }

  async createSession({ accessToken, mode = 'github', user = null }) {
    await this.ensureLoaded();

    const now = Date.now();
    const session = {
      id: crypto.randomBytes(24).toString('hex'),
      accessToken,
      mode,
      user,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.id, session);
    this.schedulePersist();
    return session;
  }

  async destroySession(sessionId) {
    await this.ensureLoaded();
    if (!sessionId) return;
    if (this.sessions.delete(sessionId)) {
      this.schedulePersist();
    }
  }

  async getSession(sessionId) {
    await this.ensureLoaded();
    if (!sessionId) return null;

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const updatedAt = session.updatedAt || session.createdAt || 0;
    if (updatedAt + SESSION_TTL_MS < Date.now()) {
      this.sessions.delete(sessionId);
      this.schedulePersist();
      return null;
    }

    session.updatedAt = Date.now();
    this.schedulePersist();
    return session;
  }

  async updateSession(sessionId, updates = {}) {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    Object.assign(session, updates, {
      updatedAt: Date.now(),
    });
    this.schedulePersist();
    return session;
  }

  async getSessionFromRequest(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (!sessionId) return null;
    return this.getSession(sessionId);
  }

  attachSessionCookie(res, sessionId) {
    const secure = process.env.PROOFDESK_SECURE_COOKIES === 'true';
    res.append(
      'Set-Cookie',
      toCookieHeader(SESSION_COOKIE_NAME, sessionId, {
        maxAge: SESSION_MAX_AGE_SECONDS,
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure,
      })
    );
  }

  clearSessionCookie(res) {
    const secure = process.env.PROOFDESK_SECURE_COOKIES === 'true';
    res.append(
      'Set-Cookie',
      toCookieHeader(SESSION_COOKIE_NAME, '', {
        maxAge: 0,
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure,
      })
    );
  }

  createOAuthState(res) {
    const secure = process.env.PROOFDESK_SECURE_COOKIES === 'true';
    const state = crypto.randomBytes(16).toString('hex');
    res.append(
      'Set-Cookie',
      toCookieHeader(OAUTH_STATE_COOKIE_NAME, state, {
        maxAge: OAUTH_STATE_TTL_SECONDS,
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure,
      })
    );
    return state;
  }

  readOAuthState(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    return cookies[OAUTH_STATE_COOKIE_NAME] || null;
  }

  clearOAuthState(res) {
    const secure = process.env.PROOFDESK_SECURE_COOKIES === 'true';
    res.append(
      'Set-Cookie',
      toCookieHeader(OAUTH_STATE_COOKIE_NAME, '', {
        maxAge: 0,
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        secure,
      })
    );
  }

  getSessionCookieName() {
    return SESSION_COOKIE_NAME;
  }
}

const authSessionStore = new AuthSessionStore();

export default authSessionStore;
