import { after, afterEach, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Test setup
//
// The store keeps its data under PROOFDESK_DATA_DIR, which it reads every time
// it touches the disk. Pointing it at a throwaway temp directory *before* the
// module is imported means these tests never touch real data and can't collide
// with other test files.
// ---------------------------------------------------------------------------
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proofdesk-team-sessions-'));
process.env.PROOFDESK_DATA_DIR = dataDir;

const { default: store, normalizeTeamSessionCode, isValidTeamRepo } = await import(
  '../src/services/teamSessions.ts'
);

const STORE_FILE = path.join(dataDir, '.team-sessions.json');
const RETENTION_MS = 12 * 60 * 60 * 1000; // mirrors TEAM_SESSION_RETENTION_MS
const T0 = 1_700_000_000_000; // a fixed "now" so time-based tests are deterministic

const repo = { owner: 'demo', name: 'book', fullName: 'demo/book' };
const host = { login: 'ada', name: 'Ada Lovelace' };

const freezeTime = (now = T0) => mock.timers.enable({ apis: ['Date'], now });

// createSession schedules its disk write for later, so tests that read the
// file have to wait for it instead of assuming it already happened.
const waitFor = async (predicate, { timeoutMs = 2000 } = {}) => {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for condition');
};

const readStoredCodes = async () => {
  try {
    return JSON.parse(await fs.readFile(STORE_FILE, 'utf-8')).map((entry) => entry.code);
  } catch {
    return [];
  }
};

after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

// ===========================================================================
// 1. Pure functions: same input, same output, nothing else involved.
//    The easiest tests to write, so start here.
// ===========================================================================
describe('normalizeTeamSessionCode', () => {
  // node:test has no it.each, so a plain loop over a table does the same job.
  const cases = [
    ['abc123', 'ABC123'], // lower case is upper-cased
    ['ab-c1 23', 'ABC123'], // separators people type or paste are dropped
    ['  ABC123\n', 'ABC123'], // surrounding whitespace
    ['a!b@c#', 'ABC'], // punctuation
    ['', ''],
    [undefined, ''], // default parameter
    [null, ''], // `value || ''`
    [123456, '123456'], // numbers are stringified
  ];
  for (const [input, expected] of cases) {
    it(`turns ${JSON.stringify(input)} into ${JSON.stringify(expected)}`, () => {
      assert.equal(normalizeTeamSessionCode(input), expected);
    });
  }
});

describe('isValidTeamRepo', () => {
  it('accepts a repo with owner, name and fullName', () => {
    assert.equal(isValidTeamRepo(repo), true);
  });

  it('does not require defaultBranch, and ignores extra fields', () => {
    assert.equal(isValidTeamRepo({ ...repo, defaultBranch: 'dev', stars: 3 }), true);
  });

  // Every way the input can be wrong. A test per field catches the day
  // someone "simplifies" the validator and forgets one.
  const invalid = [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'demo/book'],
    ['missing owner', { name: 'book', fullName: 'demo/book' }],
    ['missing name', { owner: 'demo', fullName: 'demo/book' }],
    ['missing fullName', { owner: 'demo', name: 'book' }],
    ['empty owner', { ...repo, owner: '' }],
    ['empty name', { ...repo, name: '' }],
    ['empty fullName', { ...repo, fullName: '' }],
    ['non-string owner', { ...repo, owner: 42 }],
    ['non-string name', { ...repo, name: ['book'] }],
  ];
  for (const [label, value] of invalid) {
    it(`rejects ${label}`, () => {
      assert.equal(isValidTeamRepo(value), false);
    });
  }
});

// ===========================================================================
// 2. Creating a session: output shape, defaults and fallbacks.
// ===========================================================================
describe('TeamSessionStore.createSession', () => {
  afterEach(() => mock.timers.reset());

  it('creates 6-character codes from an alphabet without look-alike characters', async () => {
    // The code is random, so one sample proves little: a forbidden letter such
    // as "O" would only show up in about 1 code in 6. 300 samples make a
    // regression all but certain to be caught.
    for (let i = 0; i < 300; i += 1) {
      const { code } = await store.createSession({ repo, createdBy: host });
      // No 0/O or 1/I: people read these codes aloud and type them by hand.
      assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it('generates a different code every time', async () => {
    const codes = new Set();
    for (let i = 0; i < 100; i += 1) {
      codes.add((await store.createSession({ repo, createdBy: host })).code);
    }
    assert.equal(codes.size, 100);
  });

  it('records the host and timestamps', async () => {
    freezeTime();
    const session = await store.createSession({ repo, createdBy: host });
    assert.equal(session.hostName, 'Ada Lovelace');
    assert.equal(session.hostLogin, 'ada');
    assert.equal(session.createdAt, T0);
    assert.equal(session.updatedAt, T0);
  });

  it('falls back from host name, to login, to "Host"', async () => {
    const byName = await store.createSession({ repo, createdBy: { login: 'ada', name: 'Ada' } });
    const byLogin = await store.createSession({ repo, createdBy: { login: 'ada' } });
    const anonymous = await store.createSession({ repo, createdBy: undefined });
    assert.equal(byName.hostName, 'Ada');
    assert.equal(byLogin.hostName, 'ada');
    assert.equal(anonymous.hostName, 'Host');
    assert.equal(anonymous.hostLogin, '');
  });

  it('defaults the branch to main but keeps one that was supplied', async () => {
    const defaulted = await store.createSession({ repo, createdBy: host });
    const explicit = await store.createSession({ repo: { ...repo, defaultBranch: 'dev' }, createdBy: host });
    assert.equal(defaulted.repo.defaultBranch, 'main');
    assert.equal(explicit.repo.defaultBranch, 'dev');
  });

  it('copies only the known repo fields, so extra input is not stored or echoed back', async () => {
    const session = await store.createSession({
      repo: { ...repo, accessToken: 'secret-token', private: true },
      createdBy: host,
    });
    assert.deepEqual(Object.keys(session.repo).sort(), ['defaultBranch', 'fullName', 'name', 'owner']);
    assert.doesNotMatch(JSON.stringify(session), /secret-token/);
  });

  it('writes the session to disk', async () => {
    const session = await store.createSession({ repo, createdBy: host });
    await waitFor(async () => (await readStoredCodes()).includes(session.code));
  });
});

// ===========================================================================
// 3. Looking sessions up, and what "expired" means.
//    Time is frozen with mock.timers so we can jump 12 hours in a few ms.
// ===========================================================================
describe('TeamSessionStore.getSession', () => {
  afterEach(() => mock.timers.reset());

  const createAndPersist = async () => {
    const session = await store.createSession({ repo, createdBy: host });
    await waitFor(async () => (await readStoredCodes()).includes(session.code));
    return session;
  };

  it('returns the session for a known code', async () => {
    const created = await createAndPersist();
    const found = await store.getSession(created.code);
    assert.equal(found.code, created.code);
    assert.equal(found.repo.fullName, 'demo/book');
  });

  it('returns null for an unknown code', async () => {
    assert.equal(await store.getSession('ZZZZZZ'), null);
  });

  it('is case-sensitive: callers must normalise the code first', async () => {
    const created = await createAndPersist();
    assert.equal(await store.getSession(created.code.toLowerCase()), null);
  });

  it('refreshes updatedAt, so a session in use stays alive', async () => {
    freezeTime();
    const created = await createAndPersist();
    mock.timers.setTime(T0 + 60_000);
    const found = await store.getSession(created.code);
    assert.equal(found.updatedAt, T0 + 60_000);
    assert.equal(found.createdAt, T0); // creation time never changes
  });

  // Boundary tests: the two moments either side of the cut-off.
  it('keeps a session that is exactly at the retention limit', async () => {
    freezeTime();
    const created = await createAndPersist();
    mock.timers.setTime(T0 + RETENTION_MS);
    assert.ok(await store.getSession(created.code));
  });

  it('drops a session that is one millisecond past the retention limit', async () => {
    freezeTime();
    const created = await createAndPersist();
    mock.timers.setTime(T0 + RETENTION_MS + 1);
    assert.equal(await store.getSession(created.code), null);
  });
});

// ===========================================================================
// 4. Loading from disk, as happens after a server restart.
// ===========================================================================
describe('TeamSessionStore.load', () => {
  afterEach(() => mock.timers.reset());

  it('restores fresh sessions and skips expired or malformed entries', async () => {
    freezeTime();
    const fresh = { code: 'FRESH1', repo, hostName: 'Ada', hostLogin: 'ada', createdAt: T0, updatedAt: T0 };
    const stale = { ...fresh, code: 'STALE1', createdAt: T0 - RETENTION_MS - 5, updatedAt: T0 - RETENTION_MS - 5 };
    const noCode = { repo, createdAt: T0, updatedAt: T0 };
    await fs.writeFile(STORE_FILE, JSON.stringify([fresh, stale, noCode]), 'utf-8');

    // A cold start: nothing in memory yet. (load() merges with what is in memory,
    // and earlier tests in this file leave sessions behind in the shared store.)
    store.sessions.clear();
    store.lastLoadedMtimeMs = 0;
    await store.load(true);

    assert.ok(store.sessions.has('FRESH1'));
    assert.equal(store.sessions.has('STALE1'), false);
    assert.equal(store.sessions.size, 1);
  });

  it('survives a corrupt store file instead of crashing', async () => {
    await fs.writeFile(STORE_FILE, '{this is not json', 'utf-8');
    await assert.doesNotReject(() => store.load(true));
  });
});

describe('TeamSessionStore.cleanupExpiredSessions', () => {
  afterEach(() => mock.timers.reset());

  it('removes only the sessions that have expired', async () => {
    freezeTime();
    const old = await store.createSession({ repo, createdBy: host });
    mock.timers.setTime(T0 + RETENTION_MS); // `old` is now exactly at the limit
    const recent = await store.createSession({ repo, createdBy: host });
    mock.timers.setTime(T0 + RETENTION_MS + 1); // `old` is past it, `recent` is 1ms old

    store.cleanupExpiredSessions();

    assert.equal(store.sessions.has(old.code), false);
    assert.equal(store.sessions.has(recent.code), true);
  });
});

// ===========================================================================
// 5. A bug these tests found, now fixed.
//
// Both createSession and getSession reload the whole store from disk. They used
// to REPLACE the in-memory map, and the disk write for a new session happens a
// moment later, so when requests overlapped, sessions that were just created
// were overwritten by an older copy from disk and silently disappeared: the
// host got an invite code that then answered "not found". Run as a plain script
// (10 rounds of 10 simultaneous creates, then a lookup of each), about 80% of
// the codes were lost. Reloading now merges, keeping the newer copy of each.
// ===========================================================================
describe('TeamSessionStore under concurrent use', () => {
  afterEach(() => mock.timers.reset());

  it('does not lose sessions that are created at the same time', async () => {
    const created = await Promise.all(
      Array.from({ length: 10 }, () => store.createSession({ repo, createdBy: host })),
    );
    const found = await Promise.all(created.map((session) => store.getSession(session.code)));
    assert.equal(found.filter(Boolean).length, 10);
  });

  it('does not lose them across many rounds of overlapping creates and lookups', async () => {
    const codes = [];
    for (let round = 0; round < 10; round += 1) {
      const created = await Promise.all(
        Array.from({ length: 10 }, () => store.createSession({ repo, createdBy: host })),
      );
      codes.push(...created.map((session) => session.code));
      // Lookups overlapping the next round's creates is what used to lose them.
      await Promise.all(created.map((session) => store.getSession(session.code)));
    }
    const found = await Promise.all(codes.map((code) => store.getSession(code)));
    assert.equal(found.filter(Boolean).length, codes.length);
  });

  it('keeps every session on disk too, so a restart would still find them', async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, () => store.createSession({ repo, createdBy: host })),
    );
    await waitFor(async () => {
      const stored = await readStoredCodes();
      return created.every((session) => stored.includes(session.code));
    });
  });

  it('still picks up a session another process wrote to the shared file', async () => {
    const mine = await store.createSession({ repo, createdBy: host });
    await waitFor(async () => (await readStoredCodes()).includes(mine.code));

    const theirs = { ...mine, code: 'ZZZZZZ', hostLogin: 'grace', createdAt: Date.now(), updatedAt: Date.now() };
    const stored = JSON.parse(await fs.readFile(STORE_FILE, 'utf-8'));
    await fs.writeFile(STORE_FILE, JSON.stringify([...stored, theirs]), 'utf-8');

    assert.equal((await store.getSession('ZZZZZZ'))?.hostLogin, 'grace');
    assert.ok(await store.getSession(mine.code), 'a reload must not drop what this process created');
  });

  it('prefers whichever copy of a session was touched most recently', async () => {
    freezeTime();
    const session = await store.createSession({ repo, createdBy: host });
    await waitFor(async () => (await readStoredCodes()).includes(session.code));

    // Another process touched it later than this one did.
    mock.timers.setTime(T0 + 1000);
    const stored = JSON.parse(await fs.readFile(STORE_FILE, 'utf-8'));
    await fs.writeFile(
      STORE_FILE,
      JSON.stringify(stored.map((entry) => (entry.code === session.code ? { ...entry, hostName: 'Renamed', updatedAt: T0 + 1000 } : entry))),
      'utf-8',
    );
    assert.equal((await store.getSession(session.code))?.hostName, 'Renamed');
  });

  it('does not bring back a session that has already expired', async () => {
    freezeTime();
    const old = await store.createSession({ repo, createdBy: host });
    mock.timers.setTime(T0 + RETENTION_MS + 1);
    store.cleanupExpiredSessions();
    await store.load(true);
    assert.equal(store.sessions.has(old.code), false);
    assert.equal(await store.getSession(old.code), null);
  });
});
