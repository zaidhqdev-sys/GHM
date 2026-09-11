import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Enquiry runtime qualification');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for construction cleanup authority');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { EnquiryServiceImpl } = await import('../dist/resources/enquiry/service.js');
const { PostgresEnquiryRepository } = await import('../dist/resources/enquiry/repository.js');
const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-enquiry-runtime-${randomUUID()}`;
const fixture = { accountIds: [], businessIds: [], membershipIds: [], enquiryIds: [] };

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query(`SELECT current_database() AS database_name, session_user, current_user, current_role`);
  const value = rows[0];
  if (value.database_name !== 'ghm_db' || value.session_user !== expectedUser || value.current_user !== expectedUser || value.current_role !== expectedUser) {
    throw new Error(`${label} refused: ${JSON.stringify(value)}`);
  }
  return value;
};

const createAccount = async (fullName, role) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows } = await client.query(`INSERT INTO ghm.account_identity (full_name, role) VALUES ($1,$2) RETURNING id`, [fullName, role]);
    await client.query('COMMIT');
    const id = Number(rows[0].id); fixture.accountIds.push(id); return id;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
};

const createBusiness = async (name, ownerId) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows: businessRows } = await client.query(`INSERT INTO ghm.business (name, slug, verification_status, is_active) VALUES ($1,$2,'approved',true) RETURNING id`, [name, `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0,8)}`]);
    const businessId = Number(businessRows[0].id);
    const { rows: membershipRows } = await client.query(`INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by) VALUES ($1,$2,'owner','active',$2) RETURNING id`, [businessId, ownerId]);
    await client.query('COMMIT');
    fixture.businessIds.push(businessId); fixture.membershipIds.push(Number(membershipRows[0].id)); return businessId;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
};

const addMembership = async (businessId, accountId, role) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN'); await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows } = await client.query(`INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by) VALUES ($1,$2,$3,'active',$2) RETURNING id`, [businessId, accountId, role]);
    await client.query('COMMIT'); fixture.membershipIds.push(Number(rows[0].id));
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
};

const assertRejected = async (work, label) => {
  try { await work(); } catch { console.log(label); return; }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

try {
  const [runtime, cleanup] = await Promise.all([identity(runtimePool, 'ghm_runtime', 'Runtime'), identity(cleanupPool, 'ghm_migrator', 'Cleanup')]);
  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanup.database_name}/${cleanup.current_user}`);

  const customerId = await createAccount(`${marker}-customer`, 'customer');
  const ownerA = await createAccount(`${marker}-owner-a`, 'business');
  const ownerB = await createAccount(`${marker}-owner-b`, 'business');
  const adminId = await createAccount(`${marker}-admin`, 'business');
  const memberId = await createAccount(`${marker}-member`, 'business');
  const businessA = await createBusiness(`${marker}-A`, ownerA);
  const businessB = await createBusiness(`${marker}-B`, ownerB);
  const ownBusiness = await createBusiness(`${marker}-OWN`, customerId);
  await addMembership(businessA, adminId, 'administrator');
  await addMembership(businessA, memberId, 'member');

  const repository = new PostgresEnquiryRepository(runtimePool);
  const service = new EnquiryServiceImpl(repository);
  const customerContext = { userId: customerId, role: 'customer' };
  const ownerAContext = { userId: ownerA, role: 'business' };
  const ownerBContext = { userId: ownerB, role: 'business' };
  const adminContext = { userId: adminId, role: 'business' };
  const memberContext = { userId: memberId, role: 'business' };

  const created = await service.createEnquiry(customerContext, {
    businessId: businessA,
    customerName: '  Customer Snapshot  ',
    customerPhone: ' 0821234567 ',
    customerEmail: ' customer@example.com ',
    project: '  Renovation Request ',
    description: '  Please renovate the kitchen and bathroom.  ',
    city: ' Durban ', budgetMin: 10000, budgetMax: 25000,
    urgency: 'urgent', source: 'marketplace',
  });
  fixture.enquiryIds.push(created.id);
  if (created.customerId !== customerId || created.businessId !== businessA || created.status !== 'new' || created.source !== 'marketplace' || created.customerName !== 'Customer Snapshot' || created.customerPhone !== '0821234567' || created.customerEmail !== 'customer@example.com' || created.project !== 'Renovation Request' || created.city !== 'Durban') throw new Error('Enquiry create binding/snapshot qualification failed');
  console.log(`ENQUIRY CREATE + CUSTOMER BINDING + SNAPSHOT PASS: enquiry=${created.id}, customer=${customerId}, business=${businessA}`);

  const ownRead = await service.getOwnEnquiry(customerContext, created.id);
  if (!ownRead || ownRead.id !== created.id || ownRead.customerId !== customerId) throw new Error('Own Enquiry read qualification failed');
  console.log('ENQUIRY OWN READ PASS');

  const otherCustomerId = await createAccount(`${marker}-other-customer`, 'customer');
  const otherCustomerContext = { userId: otherCustomerId, role: 'customer' };
  const otherRead = await service.getOwnEnquiry(otherCustomerContext, created.id);
  if (otherRead !== null) throw new Error('Cross-customer Enquiry exposure occurred');
  console.log('ENQUIRY CROSS-CUSTOMER READ DENIAL PASS');

  const received = await service.getReceivedEnquiry(ownerAContext, created.id);
  if (!received || received.businessId !== businessA) throw new Error('Received owner read qualification failed');
  console.log('ENQUIRY RECEIVED OWNER READ PASS');

  if (await service.getReceivedEnquiry(ownerBContext, created.id) !== null) throw new Error('Cross-business owner exposure occurred');
  console.log('ENQUIRY CROSS-BUSINESS READ DENIAL PASS');
  if (await service.getReceivedEnquiry(adminContext, created.id) !== null) throw new Error('Administrator received-read unexpectedly succeeded');
  console.log('ENQUIRY ADMINISTRATOR READ DENIAL PASS');
  if (await service.getReceivedEnquiry(memberContext, created.id) !== null) throw new Error('Member received-read unexpectedly succeeded');
  console.log('ENQUIRY MEMBER READ DENIAL PASS');

  await assertRejected(() => service.createEnquiry(customerContext, { businessId: ownBusiness, customerName: 'Own Business', project: 'Own', description: 'This must be rejected because the customer owns the target business.' }), 'ENQUIRY OWN-BUSINESS CREATE DENIAL PASS');

  const updated = await service.updateReceivedEnquiryStatus(ownerAContext, created.id, { status: 'contacted' });
  if (updated.status !== 'contacted') throw new Error('Enquiry status update qualification failed');
  console.log('ENQUIRY OWNER STATUS UPDATE PASS');
  const afterUpdate = await service.getOwnEnquiry(customerContext, created.id);
  if (!afterUpdate || afterUpdate.status !== 'contacted') throw new Error('Enquiry lifecycle persistence failed');
  console.log('ENQUIRY LIFECYCLE PERSISTENCE PASS');

  await assertRejected(() => service.updateReceivedEnquiryStatus(adminContext, created.id, { status: 'qualified' }), 'ENQUIRY ADMINISTRATOR STATUS DENIAL PASS');
  await assertRejected(() => service.updateReceivedEnquiryStatus(memberContext, created.id, { status: 'qualified' }), 'ENQUIRY MEMBER STATUS DENIAL PASS');
  await assertRejected(() => service.updateReceivedEnquiryStatus(ownerBContext, created.id, { status: 'qualified' }), 'ENQUIRY CROSS-BUSINESS STATUS DENIAL PASS');

  const directRuntime = async (sql, values = []) => { const client = await runtimePool.connect(); try { return await client.query(sql, values); } finally { client.release(); } };
  await assertRejected(() => directRuntime(`UPDATE ghm.enquiry SET customer_name = 'tampered' WHERE id = $1`, [created.id]), 'ENQUIRY RUNTIME SNAPSHOT UPDATE ACL DENIAL PASS');
  await assertRejected(() => directRuntime(`UPDATE ghm.enquiry SET business_id = $2 WHERE id = $1`, [created.id, businessB]), 'ENQUIRY RUNTIME RECIPIENT UPDATE ACL DENIAL PASS');
  await assertRejected(() => directRuntime(`DELETE FROM ghm.enquiry WHERE id = $1`, [created.id]), 'ENQUIRY RUNTIME DELETE ACL DENIAL PASS');
  await assertRejected(() => directRuntime(`INSERT INTO ghm.enquiry (business_id, customer_id, customer_name, project, description, source, status) VALUES ($1,$2,'x','x','long enough description','marketplace','contacted')`, [businessA, customerId]), 'ENQUIRY RUNTIME STATUS-ON-CREATE ACL DENIAL PASS');

  const { rows: acl } = await directRuntime(`SELECT has_table_privilege(current_user, 'ghm.enquiry', 'SELECT') AS can_select, has_table_privilege(current_user, 'ghm.enquiry', 'INSERT') AS can_insert, has_table_privilege(current_user, 'ghm.enquiry', 'UPDATE') AS can_update, has_table_privilege(current_user, 'ghm.enquiry', 'DELETE') AS can_delete`);
  if (!acl[0].can_select || acl[0].can_insert || acl[0].can_update || acl[0].can_delete) throw new Error(`Unexpected Enquiry table ACL: ${JSON.stringify(acl[0])}`);
  console.log('ENQUIRY RUNTIME TABLE ACL PASS');
  console.log('GHM ENQUIRY RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    await cleanupPool.query(`DELETE FROM ghm.enquiry WHERE id = ANY($1::bigint[])`, [fixture.enquiryIds]);
    await cleanupPool.query(`DELETE FROM ghm.business_membership WHERE id = ANY($1::bigint[])`, [fixture.membershipIds]);
    await cleanupPool.query(`DELETE FROM ghm.business WHERE id = ANY($1::bigint[])`, [fixture.businessIds]);
    await cleanupPool.query(`DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`, [fixture.accountIds]);
    await cleanupPool.query('COMMIT');
  } catch (error) { await cleanupPool.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await Promise.all([runtimePool.end(), cleanupPool.end()]); }
}
