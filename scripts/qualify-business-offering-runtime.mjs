import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import '../scripts/test-env.cjs';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl) throw new Error('Missing GHM runtime/migrator database URLs');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { BusinessOfferingServiceImpl } = await import('../dist/resources/business-offering/service.js');
const { PostgresBusinessOfferingRepository } = await import('../dist/resources/business-offering/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-business-offering-${randomUUID()}`;
const fixture = { accounts: [], businesses: [], offerings: [] };

const identity = async (pool, expected, label) => {
  const { rows } = await pool.query('SELECT current_database() AS database_name, session_user, current_user, current_role');
  const row = rows[0];
  if (row.database_name !== 'ghm_db' || row.session_user !== expected || row.current_user !== expected || row.current_role !== expected) throw new Error(`${label}: ${JSON.stringify(row)}`);
  console.log(`${label}: ${row.database_name}/${row.current_user}`);
};

const expectRejected = async (work, label, expected) => {
  try { await work(); }
  catch (error) {
    if (expected && !String(error?.message).toLowerCase().includes(expected.toLowerCase())) throw new Error(`${label}: expected ${expected}; received ${error?.message}`);
    console.log(label); return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const createFixture = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const ids = {};
    for (const role of ['business','business','business','customer']) {
      const r = await client.query('INSERT INTO ghm.account_identity (full_name, role) VALUES ($1,$2) RETURNING id', [`${marker} account`, role]);
      const id = Number(r.rows[0].id); fixture.accounts.push(id);
      if (!ids.owner && role === 'business') ids.owner = id;
      else if (!ids.member && role === 'business') ids.member = id;
      else if (!ids.outsider && role === 'business') ids.outsider = id;
      else ids.customer = id;
    }
    const b = await client.query(
      `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active) VALUES ($1,$2,'approved',true,true) RETURNING id`,
      [`${marker} business`, `${marker}-business`],
    );
    ids.business = Number(b.rows[0].id); fixture.businesses.push(ids.business);
    const b2 = await client.query(
      `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active) VALUES ($1,$2,'approved',true,true) RETURNING id`,
      [`${marker} second business`, `${marker}-second-business`],
    );
    ids.otherBusiness = Number(b2.rows[0].id); fixture.businesses.push(ids.otherBusiness);
    await client.query(
      `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1,$2,'owner','active',$2),($1,$3,'member','active',$2)`,
      [ids.business, ids.owner, ids.member],
    );
    await client.query('COMMIT');
    return ids;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
};

try {
  await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'RUNTIME IDENTITY PASS'),
    identity(cleanupPool, 'ghm_migrator', 'CLEANUP AUTHORITY PASS'),
  ]);

  const f = await createFixture();
  const repository = new PostgresBusinessOfferingRepository(runtimePool);
  const service = new BusinessOfferingServiceImpl(repository);
  const owner = { userId: f.owner, role: 'business' };
  const member = { userId: f.member, role: 'business' };
  const outsider = { userId: f.outsider, role: 'business' };
  const customer = { userId: f.customer, role: 'customer' };

  await expectRejected(() => service.listBusinessOfferings(outsider, { businessId: f.business }), 'OUTSIDER READ REJECTION PASS', 'Business tenant access denied');
  await expectRejected(() => service.listBusinessOfferings(owner, { businessId: f.otherBusiness }), 'CROSS-BUSINESS READ REJECTION PASS', 'Business tenant access denied');
  await expectRejected(() => service.listBusinessOfferings(customer, { businessId: f.business }), 'CUSTOMER READ REJECTION PASS', 'Business tenant access denied');
  await expectRejected(() => service.createBusinessOffering(member, { businessId: f.business, name: 'Member', slug: `${marker}-member` }), 'NON-MANAGEMENT CREATE REJECTION PASS', 'Business management permission required');
  await expectRejected(() => service.createBusinessOffering(outsider, { businessId: f.business, name: 'Outsider', slug: `${marker}-outsider` }), 'OUTSIDER CREATE REJECTION PASS', 'Business management permission required');

  const created = await service.createBusinessOffering(owner, {
    businessId: f.business, offeringType: 'service', name: 'Primary Offering', slug: `${marker}-primary`,
    description: 'Initial description', priceAmount: '1250.00', currencyCode: 'ZAR', priceUnit: 'project', sortOrder: 1,
  });
  fixture.offerings.push(created.id);
  if (created.createdBy !== f.owner || created.businessId !== f.business || !created.isActive) throw new Error(`Unexpected creation provenance: ${JSON.stringify(created)}`);
  console.log('MANAGEMENT CREATE + SERVER PROVENANCE PASS');

  const memberRead = await service.listBusinessOfferings(member, { businessId: f.business });
  if (memberRead.length !== 1 || memberRead[0].id !== created.id) throw new Error('Authorized member read failed');
  console.log('AUTHORIZED MEMBER READ PASS');

  const bySlug = await service.getBusinessOfferingBySlug(member, f.business, created.slug);
  if (!bySlug || bySlug.id !== created.id) throw new Error('Slug lookup failed');
  console.log('SLUG LOOKUP PASS');

  const setupOther = await cleanupPool.connect();
  let otherOfferingId;
  try {
    await setupOther.query('BEGIN');
    await setupOther.query('SET LOCAL ROLE ghm_schema_owner');
    const otherOffering = await setupOther.query(
      `INSERT INTO ghm.business_offering (business_id, name, slug, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
      [f.otherBusiness, 'Other Tenant Offering', `${marker}-other`, f.owner],
    );
    otherOfferingId = String(otherOffering.rows[0].id);
    fixture.offerings.push(otherOfferingId);
    await setupOther.query('COMMIT');
  } catch (error) {
    await setupOther.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    setupOther.release();
  }
  await expectRejected(() => service.updateBusinessOffering(owner, otherOfferingId, { name: 'Cross Tenant Update' }), 'CROSS-BUSINESS UPDATE REJECTION PASS', 'Business tenant access denied');
  await expectRejected(() => service.updateBusinessOffering(member, created.id, { name: 'Nope' }), 'NON-MANAGEMENT UPDATE REJECTION PASS', 'Business management permission required');
  const updated = await service.updateBusinessOffering(owner, created.id, {
    name: 'Updated Offering', description: 'Updated description', priceAmount: '0.00', isActive: false, sortOrder: 2,
  });
  if (updated.businessId !== f.business || updated.createdBy !== f.owner || updated.name !== 'Updated Offering' || updated.isActive !== false) throw new Error('Authorized update invariant failed');
  console.log('MANAGEMENT UPDATE + IMMUTABLE FIELD INVARIANT PASS');

  const activeOnly = await service.listBusinessOfferings(owner, { businessId: f.business });
  const all = await service.listBusinessOfferings(owner, { businessId: f.business, activeOnly: false });
  if (activeOnly.some(x => x.id === created.id) || !all.some(x => x.id === created.id)) throw new Error('Active filtering failed');
  console.log('ACTIVE FILTER + DEACTIVATION PASS');

  const publicBefore = await service.listPublicBusinessOfferings(f.business);
  if (publicBefore.some(x => x.id === created.id)) throw new Error('Inactive offering leaked into public projection');
  console.log('PUBLIC INACTIVE FILTER PASS');

  const duplicateSlug = `${marker}-duplicate`;
  const [one, two] = await Promise.allSettled([
    service.createBusinessOffering(owner, { businessId: f.business, name: 'Concurrent A', slug: duplicateSlug }),
    service.createBusinessOffering(owner, { businessId: f.business, name: 'Concurrent B', slug: duplicateSlug }),
  ]);
  const fulfilled = [one, two].filter(x => x.status === 'fulfilled');
  const rejected = [one, two].filter(x => x.status === 'rejected');
  if (fulfilled.length !== 1 || rejected.length !== 1 || !String(rejected[0].reason?.message).toLowerCase().includes('duplicate key')) {
    throw new Error(`Concurrent slug invariant failed: ${JSON.stringify({ one, two })}`);
  }
  if (one.status === 'fulfilled') fixture.offerings.push(one.value.id);
  if (two.status === 'fulfilled') fixture.offerings.push(two.value.id);
  console.log('CONCURRENT DUPLICATE SLUG INVARIANT PASS');

  const direct = await runtimePool.query(
    `INSERT INTO ghm.business_offering (business_id,name,slug,created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
    [f.business, `${marker} direct`, `${marker}-direct`, f.owner],
  );
  const directId = String(direct.rows[0].id); fixture.offerings.push(directId);
  await runtimePool.query('UPDATE ghm.business_offering SET is_active = false WHERE id = $1', [directId]);
  console.log('RUNTIME DIRECT INSERT + UPDATE GRANT PASS');
  await expectRejected(() => runtimePool.query('DELETE FROM ghm.business_offering WHERE id = $1', [directId]), 'RUNTIME DELETE DENIAL PASS', 'permission denied');

  const privileges = (await runtimePool.query(
    `SELECT has_table_privilege(current_user,'ghm.business_offering','SELECT') AS select_ok,
            has_column_privilege(current_user,'ghm.business_offering','business_id','INSERT') AS insert_business_id_ok,
            has_column_privilege(current_user,'ghm.business_offering','name','INSERT') AS insert_name_ok,
            has_column_privilege(current_user,'ghm.business_offering','created_by','INSERT') AS insert_created_by_ok,
            has_column_privilege(current_user,'ghm.business_offering','name','UPDATE') AS update_name_ok,
            has_column_privilege(current_user,'ghm.business_offering','is_active','UPDATE') AS update_active_ok,
            has_column_privilege(current_user,'ghm.business_offering','id','UPDATE') AS update_id_ok,
            has_table_privilege(current_user,'ghm.business_offering','DELETE') AS delete_ok`
  )).rows[0];
  if (!privileges.select_ok ||
      !privileges.insert_business_id_ok || !privileges.insert_name_ok || !privileges.insert_created_by_ok ||
      !privileges.update_name_ok || !privileges.update_active_ok || privileges.update_id_ok ||
      privileges.delete_ok) {
    throw new Error(`Unexpected runtime privileges: ${JSON.stringify(privileges)}`);
  }
  console.log('RUNTIME PRIVILEGE PASS: SELECT=yes permitted INSERT/UPDATE columns=yes immutable UPDATE=no DELETE=no');

  console.log('GHM BUSINESS OFFERING RUNTIME QUALIFICATION: PASS');
} finally {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    if (fixture.offerings.length) await client.query('DELETE FROM ghm.business_offering WHERE id = ANY($1::uuid[])', [fixture.offerings]);
    if (fixture.businesses.length) await client.query('DELETE FROM ghm.business WHERE id = ANY($1::bigint[])', [fixture.businesses]);
    if (fixture.accounts.length) await client.query('DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])', [fixture.accounts]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Qualification cleanup failed: ${error?.message ?? error}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await Promise.all([runtimePool.end(), cleanupPool.end()]);
  }
}
