import 'dotenv/config';

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const MIGRATION_PATTERN = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'database', 'migrations');
const LEDGER_TABLE = 'ghm_schema_migrations';
const MIGRATION_LOCK = 731824;

type Migration = {
  version: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
};

const loadMigrations = async (): Promise<Migration[]> => {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const migrations: Migration[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = MIGRATION_PATTERN.exec(entry.name);
    if (!match) continue;

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, entry.name), 'utf8');
    migrations.push({
      version: match[1],
      name: match[2],
      filename: entry.name,
      sql,
      checksum: crypto.createHash('sha256').update(sql, 'utf8').digest('hex'),
    });
  }

  migrations.sort((a, b) => a.version.localeCompare(b.version));

  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index - 1].version === migrations[index].version) {
      throw new Error(`Duplicate migration version: ${migrations[index].version}`);
    }
  }

  return migrations;
};

const migrate = async (): Promise<void> => {
  const migrations = await loadMigrations();
  if (migrations.length === 0) {
    throw new Error('No migrations found');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);

    const ledgerExists = await client.query<{ exists: boolean }>(
      `SELECT to_regclass($1) IS NOT NULL AS exists`,
      [LEDGER_TABLE],
    );

    if (!ledgerExists.rows[0]?.exists && migrations[0].version !== '00000000000000') {
      throw new Error(
        `Migration ledger is missing and the first migration is not 00000000000000: ${migrations[0].filename}`,
      );
    }

    const applied = ledgerExists.rows[0]?.exists
      ? await client.query<{ version: string; checksum: string }>(
          `SELECT version, checksum FROM ${LEDGER_TABLE}`,
        )
      : { rows: [] as Array<{ version: string; checksum: string }> };

    const appliedByVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const existingChecksum = appliedByVersion.get(migration.version);

      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(
            `Migration checksum mismatch for ${migration.filename}: database=${existingChecksum}, repository=${migration.checksum}`,
          );
        }
        continue;
      }

      await client.query(migration.sql);
      await client.query(
        `INSERT INTO ${LEDGER_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
        [migration.version, migration.name, migration.checksum],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

migrate()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error('GHM migration failed:', error);
    await pool.end();
    process.exitCode = 1;
  });
