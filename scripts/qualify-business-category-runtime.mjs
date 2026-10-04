import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import '../scripts/test-env.cjs';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { BusinessCategoryServiceImpl } = await import('../dist/resources/business-category/service.js');
const { PostgresBusinessCategoryRepository } = await import('../dist/resources/business-category/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-business-category-${randomUUID()}`;
const fixture = { accounts: [], businesses: [], categories: [], assignments: [] };

const assertRejected = async (work, label, expected) => {
  try { await work(); }
  catch (error) {
    if (expected && !String(error?.message).includes(expected)) throw new Error(`${label}: expected ${expected}; received ${error?.message}`);
    console.log(label); return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const identity = async (pool, expected, label) => {
  const { rows } = await pool.query('SELECT current_database() AS database_name, session_user, current_user, current_role');
  const row = rows[0];
  if (row.database_name !== 'ghm_db' || row.session_user !== expected || row.current_user !== expected || row.current_role !== expected) throw new Error(`${label}: ${JSON.stringify(row)}`);
  console.log(`${label}: ${row.database_name}/${row.current_user}`);
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
    const other = await client.query(`INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active) VALUES ($1,$2,'approved',true,true) RETURNING id`, [`${marker} other business`, `${marker}-other-business`]);
    ids.otherBusiness = Number(other.rows[0].id); fixture.businesses.push(ids.otherBusiness);
    await client.query(
      `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1,$2,'owner','active',$2),($1,$3,'member','active',$2)`,
      [ids.business, ids.owner, ids.member],
    );
    await client.query(`INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by) VALUES ($1,$2,'owner','active',$2)`, [ids.otherBusiness, ids.outsider]);
    for (const [name, active] of [['Category A',true],['Category B',true],['Inactive',false]]) {
      const id = randomUUID();
      fixture.categories.push(id);
      await client.query(
        `INSERT INTO ghm.business_category (id,name,slug,is_active,sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [id, `${marker} ${name}`, `${marker}-${name.toLowerCase().replaceAll(' ','-')}`, active, fixture.categories.length],
      );
    }
    await client.query('COMMIT');
    return { ...ids, categoryA: fixture.categories[0], categoryB: fixture.categories[1], inactive: fixture.categories[2] };
  } catch (e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { client.release(); }
};

try {
  await Promise.all([
    identity(runtimePool,'ghm_runtime','RUNTIME IDENTITY PASS'),
    identity(cleanupPool,'ghm_migrator','CLEANUP AUTHORITY PASS'),
  ]);
  const f = await createFixture();
  const repository = new PostgresBusinessCategoryRepository(runtimePool);
  const service = new BusinessCategoryServiceImpl(repository);
  const owner = { userId:f.owner, role:'business' };
  const member = { userId:f.member, role:'business' };
  const outsider = { userId:f.outsider, role:'business' };
  const customer = { userId:f.customer, role:'customer' };

  const categories = await service.listBusinessCategories(owner);
  if (!categories.some(x => x.id === f.categoryA) || categories.some(x => x.id === f.inactive)) throw new Error('Active category read/filter failed');
  console.log('CATEGORY READ + ACTIVE FILTER PASS');

  await assertRejected(() => service.assignBusinessCategory(member,{businessId:f.business,categoryId:f.categoryA}), 'NON-MANAGEMENT ASSIGN REJECTION PASS','Business management permission required');
  await assertRejected(() => service.assignBusinessCategory(outsider,{businessId:f.business,categoryId:f.categoryA}), 'CROSS-BUSINESS MEMBER ASSIGN REJECTION PASS','Business tenant access denied');
  await assertRejected(() => service.assignBusinessCategory(customer,{businessId:f.business,categoryId:f.categoryA}), 'CUSTOMER ASSIGN REJECTION PASS','Business tenant access denied');
  await assertRejected(() => service.listBusinessCategoryAssignments(outsider,f.business), 'CROSS-BUSINESS MEMBER READ REJECTION PASS','Business tenant access denied');
  await assertRejected(() => service.assignBusinessCategory(owner,{businessId:f.business,categoryId:f.inactive}), 'INACTIVE CATEGORY REJECTION PASS','Category not found or not selectable');

  const a = await service.assignBusinessCategory(owner,{businessId:f.business,categoryId:f.categoryA});
  fixture.assignments.push(a.id);
  if (a.createdBy !== f.owner || a.isPrimary) throw new Error(`Unexpected assignment provenance/state: ${JSON.stringify(a)}`);
  console.log('ASSIGNMENT CREATE + SERVER PROVENANCE PASS');

  await assertRejected(() => service.assignBusinessCategory(owner,{businessId:f.business,categoryId:f.categoryA}), 'DUPLICATE ASSIGNMENT REJECTION PASS','duplicate key');

  const b = await service.assignBusinessCategory(owner,{businessId:f.business,categoryId:f.categoryB});
  fixture.assignments.push(b.id);
  await service.setPrimaryBusinessCategory(owner,{businessId:f.business,categoryId:f.categoryA});
  const before = await service.listBusinessCategoryAssignments(owner,f.business);
  if (before.filter(x=>x.isPrimary).length !== 1 || before.find(x=>x.categoryId===f.categoryA)?.isPrimary !== true) throw new Error('Initial primary transition failed');

  const concurrent = await Promise.all([
    service.setPrimaryBusinessCategory(owner,{businessId:f.business,categoryId:f.categoryA}),
    service.setPrimaryBusinessCategory(owner,{businessId:f.business,categoryId:f.categoryB}),
  ]);
  const after = await service.listBusinessCategoryAssignments(owner,f.business);
  const primaries = after.filter(x=>x.isPrimary);
  if (primaries.length !== 1 || concurrent.filter(x=>x.status === 'fulfilled').length < 1) throw new Error(`Concurrent primary invariant failed: ${JSON.stringify(after)}`);
  console.log(`PRIMARY TRANSITION + CONCURRENCY PASS: primary=${primaries[0].categoryId}`);

  await assertRejected(() => service.setPrimaryBusinessCategory(owner,{businessId:f.business,categoryId:f.inactive}), 'INACTIVE PRIMARY REJECTION PASS','Category not found or not selectable');
  await assertRejected(() => service.setPrimaryBusinessCategory(owner,{businessId:f.business,categoryId:randomUUID()}), 'UNASSIGNED PRIMARY REJECTION PASS','Category assignment not found');

  const privileges = (await runtimePool.query(
    `SELECT has_table_privilege(current_user,'ghm.business_category','SELECT') AS category_select,
            has_table_privilege(current_user,'ghm.business_category','INSERT') AS category_insert,
            has_table_privilege(current_user,'ghm.business_category','UPDATE') AS category_update,
            has_table_privilege(current_user,'ghm.business_category','DELETE') AS category_delete,
            has_table_privilege(current_user,'ghm.business_category_assignment','SELECT') AS assignment_select,
            has_table_privilege(current_user,'ghm.business_category_assignment','UPDATE') AS assignment_update,
            has_table_privilege(current_user,'ghm.business_category_assignment','DELETE') AS assignment_delete`
  )).rows[0];
  if (!privileges.category_select || privileges.category_insert || privileges.category_update || privileges.category_delete ||
      !privileges.assignment_select || !privileges.assignment_update || privileges.assignment_delete) {
    throw new Error(`Unexpected runtime privileges: ${JSON.stringify(privileges)}`);
  }
  console.log('RUNTIME PRIVILEGE PASS: category SELECT-only; assignment SELECT/approved UPDATE; DELETE=no');

  await assertRejected(
    () => runtimePool.query('INSERT INTO ghm.business_category (name,slug) VALUES ($1,$2)',[`${marker} forbidden`,`${marker}-forbidden`]),
    'RUNTIME CATEGORY INSERT DENIAL PASS','permission denied',
  );
  await assertRejected(
    () => runtimePool.query('DELETE FROM ghm.business_category_assignment WHERE id=$1',[a.id]),
    'RUNTIME ASSIGNMENT DELETE DENIAL PASS','permission denied',
  );
  await assertRejected(
    () => service.assignBusinessCategory(owner,{businessId:f.business,categoryId:'00000000-0000-0000-0000-000000000000'}),
    'INVALID UUID/VERSION REJECTION PASS','Category not found or not selectable',
  );
  console.log('GHM BUSINESS CATEGORY RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupPool.query('BEGIN'); await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    if (fixture.businesses.length) await cleanupPool.query('DELETE FROM ghm.business WHERE id=ANY($1::bigint[])',[fixture.businesses]);
    if (fixture.categories.length) await cleanupPool.query('DELETE FROM ghm.business_category WHERE id=ANY($1::uuid[])',[fixture.categories]);
    if (fixture.accounts.length) await cleanupPool.query('DELETE FROM ghm.account_identity WHERE id=ANY($1::bigint[])',[fixture.accounts]);
    await cleanupPool.query('COMMIT');
  } catch(e) { await cleanupPool.query('ROLLBACK').catch(()=>{}); console.error(`Qualification cleanup failed: ${e?.message??e}`); }
  await runtimePool.end(); await cleanupPool.end();
}
