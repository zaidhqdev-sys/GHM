import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

if (process.env.NODE_ENV !== 'test') throw new Error('Supplier classification qualification is restricted to NODE_ENV=test');
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) throw new Error('Distinct runtime and migrator database URLs are required');

const runtimePool = new Pool({ connectionString: runtimeUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const marker = `supplier-classification-${randomUUID()}`;
let accountId;
let memberAccountId;
let businessId;

try {
  const runtimeIdentity = await runtimePool.query('SELECT current_database() AS database_name, session_user, current_user');
  assert.equal(runtimeIdentity.rows[0].session_user, 'ghm_runtime');
  assert.equal(runtimeIdentity.rows[0].current_user, 'ghm_runtime');
  assert.equal(runtimeIdentity.rows[0].database_name, process.env.GHM_QUALIFICATION_DATABASE_NAME);
  const migrator = await migratorPool.connect();
  try {
    await migrator.query('SET ROLE ghm_schema_owner');
    const migratorIdentity = await migrator.query('SELECT current_database() AS database_name, session_user, current_user');
    assert.equal(migratorIdentity.rows[0].session_user, 'ghm_migrator');
    assert.equal(migratorIdentity.rows[0].current_user, 'ghm_schema_owner');
    assert.equal(migratorIdentity.rows[0].database_name, process.env.GHM_QUALIFICATION_DATABASE_NAME);
    await migrator.query('BEGIN');
    const owner = await migrator.query(
      "INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id",
      [marker + '-owner'],
    );
    accountId = Number(owner.rows[0].id);
    const member = await migrator.query(
      "INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id",
      [marker + '-member'],
    );
    memberAccountId = Number(member.rows[0].id);
    const business = await migrator.query(
      "INSERT INTO ghm.business (name, slug, verification_status, is_active) VALUES ($1, $2, 'unverified', true) RETURNING id, is_supplier",
      [marker, marker],
    );
    businessId = Number(business.rows[0].id);
    assert.equal(business.rows[0].is_supplier, false);
    await migrator.query(
      "INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by) VALUES ($1, $2, 'owner', 'active', $2), ($1, $3, 'member', 'active', $2)",
      [businessId, accountId, memberAccountId],
    );
    await migrator.query('COMMIT');
  } catch (error) {
    await migrator.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    migrator.release();
  }
  console.log('SUPPLIER CLASSIFICATION FIXTURE CREATED');

  const supplier = await runtimePool.query(
    'SELECT * FROM ghm.update_business_supplier_classification($1, $2, $3)',
    [accountId, businessId, true],
  );
  assert.equal(supplier.rowCount, 1);
  assert.equal(supplier.rows[0].is_supplier, true);
  console.log('OWNER SUPPLIER CLASSIFICATION UPDATE PASS');

  const contractor = await runtimePool.query(
    'SELECT * FROM ghm.update_business_supplier_classification($1, $2, $3)',
    [accountId, businessId, false],
  );
  assert.equal(contractor.rows[0].is_supplier, false);
  console.log('OWNER CONTRACTOR CLASSIFICATION UPDATE PASS');

  await assert.rejects(
    () => runtimePool.query(
      'SELECT * FROM ghm.update_business_supplier_classification($1, $2, $3)',
      [memberAccountId, businessId, true],
    ),
    /Business management permission required/,
  );
  console.log('MEMBER CLASSIFICATION WRITE DENIAL PASS');

  await assert.rejects(
    () => runtimePool.query(
      'SELECT * FROM ghm.update_business_supplier_classification($1, $2, $3)',
      [accountId, businessId, null],
    ),
    /Supplier classification must be true or false/,
  );
  console.log('NULL CLASSIFICATION REJECTION PASS');
  console.log('GHM SUPPLIER CLASSIFICATION POSTGRES QUALIFICATION: PASS');
} finally {
  if (accountId && memberAccountId && businessId) {
    const cleanup = await migratorPool.connect();
    try {
      await cleanup.query('SET ROLE ghm_schema_owner');
      await cleanup.query('BEGIN');
      await cleanup.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [businessId]);
      await cleanup.query('DELETE FROM ghm.business WHERE id = $1', [businessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id IN ($1, $2)', [accountId, memberAccountId]);
      await cleanup.query('COMMIT');
      console.log('SUPPLIER CLASSIFICATION FIXTURE CLEANUP PASS');
    } catch (error) {
      await cleanup.query('ROLLBACK').catch(() => {});
      console.error(`SUPPLIER CLASSIFICATION FIXTURE CLEANUP FAILED: ${error.message}`);
      process.exitCode = 1;
    } finally {
      cleanup.release();
    }
  }
  await Promise.all([runtimePool.end(), migratorPool.end()]);
}
