import type { PrismaClient as PrismaClientType } from '@prisma/client';
import pkg from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const { PrismaClient } = pkg;

const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
const isPostgres = databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');

let prisma: PrismaClientType;

/**
 * Configures SQLite Write-Ahead Logging (WAL) mode and busy_timeout
 */
export const configureSqlitePragmas = async (client: PrismaClientType): Promise<void> => {
  try {
    await client.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
    await client.$executeRawUnsafe('PRAGMA busy_timeout=5000;');
  } catch {
    // Ignore errors during initial setup or unmigrated shadow DBs
  }
};

if (isPostgres) {
  prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
} else {
  const adapter = new PrismaBetterSqlite3({
    url: databaseUrl,
    timeout: 5000,
  });
  prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  void configureSqlitePragmas(prisma);
}

export default prisma;
export { prisma };
