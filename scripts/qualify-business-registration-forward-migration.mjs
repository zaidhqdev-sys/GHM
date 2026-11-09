import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const databaseUrl = process.env.GHM_MIGRATOR_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('GHM_MIGRATOR_DATABASE_URL is required');

const migrationPath = path.resolve(
  process.cwd(),
  'database/migrations/20261108150000_reconcile_business_registration_identity_authorization.sql',
);
const historicalFunctionsPath = path.resolve(
  process.cwd(),
  'scripts/fixtures/business-registration-identity-historical-functions.sql',
);
const [migrationSql, historicalFunctionsSql] = await Promise.all([
  fs.readFile(migrationPath, 'utf8'),
  fs.readFile(historicalFunctionsPath, 'utf8'),
]);
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
    // Restore the exact pre-active-Business function definitions while keeping
    // the already-existing historical table, then apply the forward migration.
    await client.query(historicalFunctionsSql);
    await client.query(migrationSql);

    const functions = await client.query(`
      SELECT
        pg_get_functiondef('ghm.read_business_registration_identity(bigint,bigint)'::regprocedure) AS read_definition,
        pg_get_functiondef('ghm.update_business_registration_identity(bigint,bigint,text,text,text)'::regprocedure) AS update_definition
    `);
    if (
      !functions.rows[0]?.read_definition.includes('b.is_active = true') ||
      !functions.rows[0]?.update_definition.includes('b.is_active = true')
    ) {
      throw new Error('Forward migration did not restore the active-Business authorization checks');
    }

    const security = await client.query(`
      SELECT
        c.relrowsecurity AS rls_enabled,
        pg_catalog.pg_get_userbyid(c.relowner) AS table_owner,
        has_table_privilege('ghm_runtime', 'ghm.business_registration_identity', 'SELECT') AS runtime_can_select,
        has_function_privilege('ghm_runtime', 'ghm.read_business_registration_identity(bigint,bigint)', 'EXECUTE') AS runtime_can_read,
        has_function_privilege('ghm_runtime', 'ghm.update_business_registration_identity(bigint,bigint,text,text,text)', 'EXECUTE') AS runtime_can_update
      FROM pg_catalog.pg_class c
      WHERE c.oid = 'ghm.business_registration_identity'::regclass
    `);
    const state = security.rows[0];
    if (
      !state?.rls_enabled ||
      state.table_owner !== 'ghm_schema_owner' ||
      state.runtime_can_select ||
      !state.runtime_can_read ||
      !state.runtime_can_update
    ) {
      throw new Error(`Forward migration security contract mismatch: ${JSON.stringify(state)}`);
    }

    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  // Prove the guard rejects a pre-existing table whose constraint name is
  // present but whose definition is not the required declaration contract.
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE ghm.business_registration_identity
        DROP CONSTRAINT business_registration_identity_registration_number_length_check;
      ALTER TABLE ghm.business_registration_identity
        ADD CONSTRAINT business_registration_identity_registration_number_length_check CHECK (true);
    `);
    let rejected = false;
    try {
      await client.query(migrationSql);
    } catch (error) {
      if (!String(error.message).includes('incompatible registration-number constraint')) throw error;
      rejected = true;
    }
    if (!rejected) {
      throw new Error('Forward migration accepted a same-named but incompatible registration-number constraint');
    }
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  process.stdout.write('PASS: historical functions upgraded on the pre-existing table; full schema/security contract passed; same-named incompatible constraint was rejected; transactions rolled back.\\n');
} finally {
  await client.end();
}
