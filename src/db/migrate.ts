import 'dotenv/config';

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Pool, PoolClient } from 'pg';

const databaseUrl = process.env.GHM_MIGRATOR_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('Missing required environment variable: GHM_MIGRATOR_DATABASE_URL');

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
const MIGRATION_PATTERN = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'database', 'migrations');
const PUBLIC_LEDGER_TABLE = 'public.ghm_schema_migrations';
const GHM_LEDGER_TABLE = 'ghm.ghm_schema_migrations';
const MIGRATION_LOCK = 731824;
const MIGRATION_OWNER_ROLE = 'ghm_schema_owner';

type Migration = { version: string; name: string; filename: string; sql: string; checksum: string };

const loadMigrations = async (): Promise<Migration[]> => {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const migrations: Migration[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = MIGRATION_PATTERN.exec(entry.name);
    if (!match) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, entry.name), 'utf8');
    migrations.push({
      version: match[1], name: match[2], filename: entry.name, sql,
      checksum: crypto.createHash('sha256').update(sql, 'utf8').digest('hex'),
    });
  }
  migrations.sort((a, b) => a.version.localeCompare(b.version));
  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index - 1].version === migrations[index].version) throw new Error(`Duplicate migration version: ${migrations[index].version}`);
  }
  return migrations;
};

const resolveLedgerTable = async (client: PoolClient): Promise<string | null> => {
  const result = await client.query<{ ghm_exists: boolean; public_exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS ghm_exists, to_regclass($2) IS NOT NULL AS public_exists`,
    [GHM_LEDGER_TABLE, PUBLIC_LEDGER_TABLE],
  );
  if (result.rows[0]?.ghm_exists) return GHM_LEDGER_TABLE;
  if (result.rows[0]?.public_exists) return PUBLIC_LEDGER_TABLE;
  return null;
};

const migrate = async (): Promise<void> => {
  const migrations = await loadMigrations();
  if (migrations.length === 0) throw new Error('No migrations found');
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE ${MIGRATION_OWNER_ROLE}`);
    const identity = await client.query<{ current_user: string; session_user: string; current_database: string }>(`SELECT current_user, session_user, current_database()`);
    if (identity.rows[0]?.current_user !== MIGRATION_OWNER_ROLE || identity.rows[0]?.session_user !== 'ghm_migrator') {
      throw new Error(`Migration authority identity mismatch: current_user=${identity.rows[0]?.current_user}, session_user=${identity.rows[0]?.session_user}`);
    }
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);

    let ledgerTable = await resolveLedgerTable(client);
    if (!ledgerTable && migrations[0].version !== '00000000000000') {
      throw new Error(`Migration ledger is missing and the first migration is not 00000000000000: ${migrations[0].filename}`);
    }

    const applied = ledgerTable
      ? await client.query<{ version: string; checksum: string }>(`SELECT version, checksum FROM ${ledgerTable}`)
      : { rows: [] as Array<{ version: string; checksum: string }> };
    const appliedByVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const existingChecksum = appliedByVersion.get(migration.version);
      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) throw new Error(`Migration checksum mismatch for ${migration.filename}: database=${existingChecksum}, repository=${migration.checksum}`);
        continue;
      }
      await client.query(migration.sql);
      ledgerTable = await resolveLedgerTable(client);
      if (!ledgerTable) throw new Error(`Migration ${migration.filename} completed but the migration ledger cannot be resolved`);
      await client.query(`INSERT INTO ${ledgerTable} (version, name, checksum) VALUES ($1, $2, $3)`, [migration.version, migration.name, migration.checksum]);
      appliedByVersion.set(migration.version, migration.checksum);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

migrate().then(async () => pool.end()).catch(async (error: unknown) => {
  console.error('GHM migration failed:', error);
  await pool.end();
  process.exitCode = 1;
});
