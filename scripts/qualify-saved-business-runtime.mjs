import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { SavedBusinessServiceImpl } = await import('../dist/resources/saved-business/service.js');
const { PostgresSavedBusinessRepository } = await import('../dist/resources/saved-business/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-saved-business-${randomUUID()}`;
let fixture = null;

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query('SELECT current_database() AS database_name, session_user, current_user, current_role');
  const row = rows[0];
  if (row.database_name !== 'ghm_db' || row.session_user !== expectedUser || row.current_user !== expectedUser || row.current_role !== expectedUser) throw new Error(`${label} identity mismatch: ${JSON.stringify(row)}`);
  console.log(`${label} PASS: ${row.database_name}/${row.current_user}`);
};

const expectReject = async (work, label) => {
  try { await work(); } catch { console.log(label); return; }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

try {
  await Promise.all([identity(runtimePool, 'ghm_runtime', 'RUNTIME IDENTITY'), identity(cleanupPool, 'ghm_migrator', 'CLEANUP AUTHORITY')]);

  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const owner = await client.query(`INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'customer') RETURNING id`, [`${marker} owner`]);
    const outsider = await client.query(`INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'customer') RETURNING id`, [`${marker} outsider`]);
    const ownerId = Number(owner.rows[0].id);
    const outsiderId = Number(outsider.rows[0].id);
    const eligible = await client.query(`INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active) VALUES ($1, $2, 'approved', true, true) RETURNING id`, [`${marker} eligible`, `${marker}-eligible`]);
    const eligibleBusinessId = Number(eligible.rows[0].id);
    const inactive = await client.query(`INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active) VALUES ($1, $2, 'approved', true, false) RETURNING id`, [`${marker} inactive`, `${marker}-inactive`]);
    const inactiveBusinessId = Number(inactive.rows[0].id);
    const unverified = await client.query(`INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active) VALUES ($1, $2, 'under_review', false, true) RETURNING id`, [`${marker} unverified`, `${marker}-unverified`]);
    const unverifiedBusinessId = Number(unverified.rows[0].id);
    await client.query('COMMIT');
    fixture = { ownerId, outsiderId, eligibleBusinessId, inactiveBusinessId, unverifiedBusinessId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }

  const repository = new PostgresSavedBusinessRepository(runtimePool);
  const service = new SavedBusinessServiceImpl(repository);
  const ownerContext = { userId: fixture.ownerId, role: 'customer' };
  const outsiderContext = { userId: fixture.outsiderId, role: 'customer' };

  const created = await service.createSavedBusiness(ownerContext, { businessId: fixture.eligibleBusinessId });
  if (created.accountId !== fixture.ownerId || created.businessId !== fixture.eligibleBusinessId) throw new Error('Unexpected Saved Business create result');
  console.log('CREATE + OWNER PROVENANCE PASS');

  const listed = await service.listSavedBusinesses(ownerContext);
  if (listed.length !== 1 || listed[0].id !== created.id) throw new Error('Owner list failed');
  console.log('OWNER READ PASS');

  const ownRead = await service.getSavedBusiness(ownerContext, created.id);
  if (!ownRead || ownRead.accountId !== fixture.ownerId) throw new Error('Owner item read failed');
  console.log('OWNER ITEM READ PASS');

  const outsiderRead = await service.getSavedBusiness(outsiderContext, created.id);
  if (outsiderRead !== null) throw new Error('Cross-account read returned another account\'s Saved Business');
  console.log('CROSS-ACCOUNT READ REJECTION PASS');

  await expectReject(() => service.deleteSavedBusiness(outsiderContext, created.id), 'CROSS-ACCOUNT DELETE REJECTION PASS');
  await expectReject(() => service.createSavedBusiness(ownerContext, { businessId: fixture.inactiveBusinessId }), 'INACTIVE BUSINESS REJECTION PASS');
  await expectReject(() => service.createSavedBusiness(ownerContext, { businessId: fixture.unverifiedBusinessId }), 'UNVERIFIED BUSINESS REJECTION PASS');
  await expectReject(() => service.createSavedBusiness(ownerContext, { businessId: fixture.eligibleBusinessId }), 'DUPLICATE CREATE REJECTION PASS');

  const before = await runtimePool.query('SELECT count(*)::int AS count FROM ghm.saved_business WHERE account_id = $1 AND business_id = $2', [fixture.ownerId, fixture.eligibleBusinessId]);
  if (before.rows[0].count !== 1) throw new Error('Unexpected Saved Business row count before delete');

  await service.deleteSavedBusiness(ownerContext, created.id);
  const after = await service.listSavedBusinesses(ownerContext);
  if (after.length !== 0) throw new Error('Owner delete failed');
  console.log('OWNER DELETE PASS');

  await expectReject(() => runtimePool.query(`INSERT INTO ghm.saved_business (account_id, business_id) VALUES ($1, $2)`, [fixture.ownerId, fixture.eligibleBusinessId]), 'RUNTIME DIRECT INSERT DENIAL PASS');
  await expectReject(() => runtimePool.query(`UPDATE ghm.saved_business SET account_id = $1 WHERE id = $2`, [fixture.outsiderId, created.id]), 'RUNTIME UPDATE DENIAL PASS');
  await expectReject(() => runtimePool.query(`DELETE FROM ghm.saved_business WHERE account_id = $1`, [fixture.ownerId]), 'RUNTIME DIRECT DELETE DENIAL PASS');

  const grants = await runtimePool.query(`SELECT has_table_privilege(current_user, 'ghm.saved_business', 'SELECT') AS select_ok, has_table_privilege(current_user, 'ghm.saved_business', 'INSERT') AS insert_ok, has_table_privilege(current_user, 'ghm.saved_business', 'UPDATE') AS update_ok, has_table_privilege(current_user, 'ghm.saved_business', 'DELETE') AS delete_ok, has_function_privilege(current_user, 'ghm.create_saved_business(bigint,bigint)', 'EXECUTE') AS create_fn_ok, has_function_privilege(current_user, 'ghm.delete_saved_business(bigint,bigint)', 'EXECUTE') AS delete_fn_ok`);
  const grant = grants.rows[0];
  if (!grant.select_ok || grant.insert_ok || grant.update_ok || grant.delete_ok || !grant.create_fn_ok || !grant.delete_fn_ok) throw new Error(`Unexpected Saved Business ACL: ${JSON.stringify(grant)}`);
  console.log('RUNTIME PRIVILEGE PASS: SELECT=yes INSERT=no UPDATE=no DELETE=no CREATE/DELETE=execute-only');

  console.log('GHM SAVED BUSINESS RUNTIME QUALIFICATION: PASS');
} finally {
  if (fixture) {
    const client = await cleanupPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      await client.query('DELETE FROM ghm.saved_business WHERE account_id = ANY($1::bigint[])', [[fixture.ownerId, fixture.outsiderId]]);
      await client.query('DELETE FROM ghm.business WHERE id = ANY($1::bigint[])', [[fixture.eligibleBusinessId, fixture.inactiveBusinessId, fixture.unverifiedBusinessId]]);
      await client.query('DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])', [[fixture.ownerId, fixture.outsiderId]]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`Qualification cleanup failed: ${error.message}`);
      process.exitCode = 1;
    } finally { client.release(); }
  }
  await Promise.all([runtimePool.end(), cleanupPool.end()]);
}
