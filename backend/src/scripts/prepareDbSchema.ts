import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRISMA_DIR = path.resolve(__dirname, '../../prisma');
const SCHEMA_DEST = path.join(PRISMA_DIR, 'schema.prisma');
const SCHEMA_SQLITE = path.join(PRISMA_DIR, 'schema.sqlite.prisma');
const SCHEMA_POSTGRES = path.join(PRISMA_DIR, 'schema.postgresql.prisma');

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL || '';
  const isPostgres = databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://') || process.env.DATABASE_PROVIDER === 'postgresql';

  const sourceSchema = isPostgres ? SCHEMA_POSTGRES : SCHEMA_SQLITE;
  const dbName = isPostgres ? 'PostgreSQL' : 'SQLite';

  console.log(`[PrepareDB] Selecting ${dbName} schema for Prisma...`);
  try {
    const content = await fs.readFile(sourceSchema, 'utf-8');
    await fs.writeFile(SCHEMA_DEST, content, 'utf-8');
    console.log(`[PrepareDB] Successfully wrote schema.prisma using ${sourceSchema}`);
  } catch (error: any) {
    console.error(`[PrepareDB] Failed to prepare schema:`, error.message);
    process.exit(1);
  }
};

void main();
