import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { BusinessHoursServiceImpl } = await import('../dist/resources/business-hours/service.js');
const { PostgresBusinessHoursRepository } = await import('../dist/resources/business-hours/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-business-hours-${randomUUID()}`;
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
    const owner = await client.query(`INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`, [`${marker} owner`]);
    const member = await client.query(`INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`, [`${marker} member`]);
    const outsider = await client.query(`INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`, [`${marker} outsider`]);
    const ownerId = Number(owner.rows[0].id);
    const memberId = Number(member.rows[0].id);
    const outsiderId = Number(outsider.rows[0].id);
    const business = await client.query(`INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active) VALUES ($1, $2, 'approved', true, true) RETURNING id`, [`${marker} business`, `${marker}-business`]);
    const businessId = Number(business.rows[0].id);
    await client.query(`INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by) VALUES ($1, $2, 'owner', 'active', $2), ($1, $3, 'member', 'active', $2)`, [businessId, ownerId, memberId]);
    await client.query('COMMIT');
    fixture = { ownerId, memberId, outsiderId, businessId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }

  const repository = new PostgresBusinessHoursRepository(runtimePool);
  const service = new BusinessHoursServiceImpl(repository);
  const ownerContext = { userId: fixture.ownerId, role: 'business' };
  const memberContext = { userId: fixture.memberId, role: 'business' };
  const outsiderContext = { userId: fixture.outsiderId, role: 'business' };

  const replaced = await service.replaceBusinessHours(ownerContext, {
    businessId: fixture.businessId,
    hours: [
      { dayOfWeek: 1, isClosed: false, openTime: '08:00', closeTime: '17:00' },
      { dayOfWeek: 2, isClosed: false, openTime: '08:00', closeTime: '17:00' },
      { dayOfWeek: 6, isClosed: true },
    ],
  });
  if (replaced.length !== 3 || replaced[0].createdBy !== fixture.ownerId) throw new Error('Unexpected replacement result');
  console.log('BUSINESS HOURS REPLACE + PROVENANCE PASS');

  const memberRead = await service.getBusinessHours(memberContext, fixture.businessId);
  if (memberRead.length !== 3) throw new Error('Authorized member read failed');
  console.log('BUSINESS MEMBER READ PASS');

  const publicRead = await service.getPublicBusinessHours(memberContext, fixture.businessId);
  if (publicRead.length !== 3) throw new Error('Public Business Hours read failed');
  console.log('PUBLIC READ PASS');

  await expectReject(() => service.replaceBusinessHours(memberContext, { businessId: fixture.businessId, hours: [] }), 'NON-MANAGEMENT REPLACE REJECTION PASS');
  await expectReject(() => service.replaceBusinessHours(outsiderContext, { businessId: fixture.businessId, hours: [] }), 'UNAUTHORIZED REPLACE REJECTION PASS');

  await expectReject(() => runtimePool.query(`INSERT INTO ghm.business_hours (business_id, day_of_week, is_closed, created_by) VALUES ($1, 0, true, $2)`, [fixture.businessId, fixture.ownerId]), 'RUNTIME DIRECT INSERT DENIAL PASS');
  await expectReject(() => runtimePool.query(`UPDATE ghm.business_hours SET is_closed = true WHERE business_id = $1`, [fixture.businessId]), 'RUNTIME UPDATE DENIAL PASS');
  await expectReject(() => runtimePool.query(`DELETE FROM ghm.business_hours WHERE business_id = $1`, [fixture.businessId]), 'RUNTIME DELETE DENIAL PASS');

  const grants = await runtimePool.query(`SELECT has_table_privilege(current_user, 'ghm.business_hours', 'SELECT') AS select_ok, has_table_privilege(current_user, 'ghm.business_hours', 'INSERT') AS insert_ok, has_table_privilege(current_user, 'ghm.business_hours', 'UPDATE') AS update_ok, has_table_privilege(current_user, 'ghm.business_hours', 'DELETE') AS delete_ok, has_function_privilege(current_user, 'ghm.replace_business_hours(bigint,bigint,jsonb)', 'EXECUTE') AS replace_ok`);
  const grant = grants.rows[0];
  if (!grant.select_ok || grant.insert_ok || grant.update_ok || grant.delete_ok || !grant.replace_ok) throw new Error(`Unexpected Business Hours ACL: ${JSON.stringify(grant)}`);
  console.log('RUNTIME PRIVILEGE PASS: SELECT=yes INSERT=no UPDATE=no DELETE=no REPLACE=execute-only');

  console.log('GHM BUSINESS HOURS RUNTIME QUALIFICATION: PASS');
} finally {
  if (fixture) {
    const client = await cleanupPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      await client.query('DELETE FROM ghm.business_hours WHERE business_id = $1', [fixture.businessId]);
      await client.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [fixture.businessId]);
      await client.query('DELETE FROM ghm.business WHERE id = $1', [fixture.businessId]);
      await client.query('DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])', [[fixture.ownerId, fixture.memberId, fixture.outsiderId]]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`Qualification cleanup failed: ${error.message}`);
      process.exitCode = 1;
    } finally { client.release(); }
  }
  await Promise.all([runtimePool.end(), cleanupPool.end()]);
}
