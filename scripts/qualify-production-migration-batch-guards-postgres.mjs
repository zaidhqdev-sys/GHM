// Disposable PostgreSQL regression for the supplier identity function ACL boundary.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { normalizeMigrationSqlForExecution } from '../dist/db/migration-checksum.js';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Supplier classification migration ACL qualification is restricted to NODE_ENV=test');
}

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const expectedDatabase = process.env.GHM_QUALIFICATION_DATABASE_NAME;
const expectedHost = process.env.GHM_QUALIFICATION_DATABASE_HOST;
if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) {
  throw new Error('Distinct disposable runtime and migrator database URLs are required');
}
if (expectedDatabase !== 'ghm_disposable_test' || expectedHost !== 'localhost') {
  throw new Error('Qualification is restricted to ghm_disposable_test on localhost');
}
for (const [label, value] of [['runtime', runtimeUrl], ['migrator', migratorUrl]]) {
  const parsed = new URL(value);
  if (parsed.hostname !== 'localhost' || parsed.pathname.slice(1) !== expectedDatabase) {
    throw new Error(`${label} connection is not the approved disposable PostgreSQL target`);
  }
}

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false;
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl });
const functionSignature = 'ghm.update_business_supplier_classification(bigint,bigint,boolean)';
const migrationPath = path.resolve(process.cwd(), 'database/migrations/20261110010000_add_business_supplier_classification.sql');

const runtimePrivilege = async (pool) => {
  const result = await pool.query(
    'SELECT has_function_privilege($1, $2::regprocedure, \'EXECUTE\') AS can_execute',
    ['ghm_runtime', functionSignature],
  );
  return result.rows[0]?.can_execute === true;
};

try {
  const [runtimeIdentity, migratorIdentity] = await Promise.all([
    runtimePool.query('SELECT current_database() AS database_name, session_user, current_user'),
    migratorPool.query('SELECT current_database() AS database_name, session_user, current_user'),
  ]);
  assert.equal(runtimeIdentity.rows[0].database_name, expectedDatabase);
  assert.equal(runtimeIdentity.rows[0].session_user, 'ghm_runtime');
  assert.equal(runtimeIdentity.rows[0].current_user, 'ghm_runtime');
  assert.equal(migratorIdentity.rows[0].database_name, expectedDatabase);
  assert.equal(migratorIdentity.rows[0].session_user, 'ghm_migrator');
  assert.equal(migratorIdentity.rows[0].current_user, 'ghm_migrator');

  const before = await runtimePrivilege(runtimePool);
  assert.equal(before, false, 'runtime must not have supplier function EXECUTE before qualification replay');
  const client = await migratorPool.connect();
  try {
    await client.query(`SET ROLE ghm_schema_owner`);
    await client.query('BEGIN');
    const sql = await readFile(migrationPath, 'utf8');
    await client.query(normalizeMigrationSqlForExecution(sql));

    const afterMigration = await client.query(
      'SELECT has_function_privilege($1, $2::regprocedure, \'EXECUTE\') AS can_execute',
      ['ghm_runtime', functionSignature],
    );
    assert.equal(afterMigration.rows[0]?.can_execute, false,
      'supplier migration must not grant direct runtime execution to the caller-supplied actor identity function');

        const owner = await client.query(
      'SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid = $1::regprocedure',
      [functionSignature],
    );
    assert.equal(owner.rows[0]?.owner, 'ghm_schema_owner');
    console.log('SUPPLIER MIGRATION DOES NOT GRANT RUNTIME EXECUTE: PASS');
    console.log('SECURITY DEFINER FUNCTION OWNER PRESERVED: PASS');

    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const afterRollback = await runtimePrivilege(runtimePool);
  assert.equal(afterRollback, before,
    'rollback must restore the exact pre-qualification runtime EXECUTE state');
  console.log('ROLLBACK RESTORES PRE-QUALIFICATION FUNCTION PRIVILEGE STATE: PASS');
  console.log('GHM SUPPLIER MIGRATION ACL QUALIFICATION: PASS');
} finally {
  await Promise.all([runtimePool.end(), migratorPool.end()]);
}
