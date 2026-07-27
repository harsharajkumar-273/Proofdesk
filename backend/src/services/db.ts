import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import logger from '../utils/logger.js';

const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
const isPostgres = databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');

/**
 * How long a query waits on a locked database before failing with SQLITE_BUSY.
 *
 * better-sqlite3 applies this per connection, which is what makes it the right
 * place for the setting: `PRAGMA busy_timeout` is connection-scoped and resets
 * on every new connection, so issuing it once would not protect the pool.
 *
 * better-sqlite3 already defaults to 5000ms; this makes the value explicit and
 * tunable for deployments with heavier parallel editing.
 */
const parseTimeout = (raw: string | undefined): number => {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5000;
  return parsed;
};

export const SQLITE_BUSY_TIMEOUT_MS = parseTimeout(process.env.SQLITE_BUSY_TIMEOUT_MS);

let prisma: PrismaClient;

if (isPostgres) {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
} else {
  const adapter = new PrismaBetterSqlite3({
    url: databaseUrl,
    timeout: SQLITE_BUSY_TIMEOUT_MS,
  });
  prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export interface SqlitePragmaResult {
  /** False when the database is Postgres and pragmas do not apply. */
  applied: boolean;
  journalMode: string | null;
  busyTimeoutMs: number;
}

/**
 * Puts the SQLite database into Write-Ahead Logging mode.
 *
 * Under the default rollback journal a writer blocks all readers, which is
 * what produces `SqliteError: database is locked` when several collaborative
 * editors and a build worker touch the database at once. WAL lets readers
 * continue during a write.
 *
 * Two details worth recording, because both shape this code:
 *
 *  - `PRAGMA journal_mode=WAL` **returns a row** containing the resulting
 *    mode, so it has to go through `$queryRawUnsafe`. Sending it through
 *    `$executeRawUnsafe`, which expects an affected-row count, is not
 *    reliable. Reading the returned value also lets this verify the mode
 *    actually changed rather than assuming it did.
 *
 *  - `journal_mode` is persistent: SQLite stores it in the database header, so
 *    it survives reconnection and only needs setting once. `busy_timeout` is
 *    the opposite — it is per-connection and resets each time, which is why it
 *    is configured on the adapter above rather than issued here.
 *
 * Failures are logged rather than swallowed. A database that silently stayed
 * in rollback-journal mode would reintroduce exactly the lock contention this
 * is meant to prevent, with no signal that it had happened.
 */
export const configureSqlitePragmas = async (
  client: PrismaClient = prisma,
): Promise<SqlitePragmaResult> => {
  if (isPostgres) {
    return { applied: false, journalMode: null, busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS };
  }

  try {
    const rows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'PRAGMA journal_mode=WAL;',
    );

    const first = Array.isArray(rows) ? rows[0] : undefined;
    const journalMode = first ? String(Object.values(first)[0] ?? '').toLowerCase() : null;

    if (journalMode !== 'wal') {
      logger.warn(
        `[DB] Requested WAL journal mode but SQLite reported "${journalMode ?? 'unknown'}". ` +
          'Concurrent writes may still block readers.',
      );
    } else {
      logger.info(
        `[DB] SQLite journal mode: wal, busy timeout: ${SQLITE_BUSY_TIMEOUT_MS}ms`,
      );
    }

    return { applied: true, journalMode, busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS };
  } catch (error: any) {
    // Never fatal: a database that cannot be put into WAL mode still works,
    // just with more lock contention. But it must not fail silently.
    logger.error(
      `[DB] Failed to configure SQLite pragmas: ${error?.message ?? error}. ` +
        'Falling back to the default journal mode.',
    );
    return { applied: false, journalMode: null, busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS };
  }
};

export default prisma;
export { prisma };
