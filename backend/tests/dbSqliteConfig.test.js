import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import prisma, { configureSqlitePragmas } from '../src/services/db.ts';

describe('SQLite Database PRAGMA Configuration', () => {
  it('configures WAL mode and busy_timeout correctly', async () => {
    await configureSqlitePragmas(prisma);

    const journalModeResult = await prisma.$queryRawUnsafe('PRAGMA journal_mode;');
    const busyTimeoutResult = await prisma.$queryRawUnsafe('PRAGMA busy_timeout;');

    assert.ok(Array.isArray(journalModeResult));
    const journalMode = journalModeResult[0]?.journal_mode || Object.values(journalModeResult[0] || {})[0];
    assert.equal(String(journalMode).toLowerCase(), 'wal');

    assert.ok(Array.isArray(busyTimeoutResult));
    const busyTimeout = busyTimeoutResult[0]?.timeout ?? busyTimeoutResult[0]?.busy_timeout ?? Object.values(busyTimeoutResult[0] || {})[0];
    assert.equal(Number(busyTimeout), 5000);
  });
});
