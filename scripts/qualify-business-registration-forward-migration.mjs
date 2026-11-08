import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const databaseUrl = process.env.GHM_MIGRATOR_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('GHM_MIGRATOR_DATABASE_URL is required');

const migrationPath = path.resolve(
  process.cwd(),
  'database/migrations/20261108150000_reconcile_business_registration_identity_authorization.sql',
);
const sql = await fs.readFile(migrationPath, 'utf8');
const client = new pg.Client({ connectionString: databaseUrl, ssl: false });

await client.connect();
try {
  await client.query('SET ROLE ghm_schema_owner');
  const identity = await client.query(
    'SELECT current_user, session_user, current_database()',
  );
  if (
    identity.rows[0]?.current_user !== 'ghm_schema_owner' ||
    identity.rows[0]?.session_user !== 'ghm_migrator' ||
    identity.rows[0]?.current_database !== process.env.GHM_MIGRATION_DATABASE_NAME
  ) {
    throw new Error('Forward-migration qualification connected with an unexpected database authority identity');
  }

  await client.query('BEGIN');
  try {
    // The full CI migration pass has already created this table. Replaying the
    // forward migration inside a transaction verifies the existing-table path.
    await client.query(sql);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  process.stdout.write('PASS: forward migration safely accepts the pre-existing Business registration table; transaction rolled back.\n');
} finally {
  await client.end();
}
