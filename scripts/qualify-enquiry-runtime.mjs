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
const fixture = { accountIds: [], businessIds: [], membershipIds: [], enquiryIds: [], opportunityIds: [] };

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query(`SELECT current_database() AS database_name, session_user, current_user, current_role`);
  const value = rows[0];
  if (value.database_name !== 'ghm_db' || value.session_user !== expectedUser || value.current_user !== expectedUser || value.current_role !== expectedUser) {
    throw new Error(`${label} refused: ${JSON.stringify(value)}`);
  }
  return value;
};

const cleanupAuthorityQuery = async (sql, values = []) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await client.query(sql, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const createAccount = async (fullName, role) => {
  const { rows } = await cleanupAuthorityQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1,$2) RETURNING id`,
    [fullName, role],
  );
  const id = Number(rows[0].id);
  fixture.accountIds.push(id);
  return id;
};

const createBusiness = async (name, ownerId) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows: businessRows } = await client.query(
      `INSERT INTO ghm.business (name, slug, verification_status, is_active, is_verified)
       VALUES ($1,$2,'approved',true,true) RETURNING id`,
      [name, `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0,8)}`],
    );
    const businessId = Number(businessRows[0].id);
    const { rows: membershipRows } = await client.query(
      `INSERT INTO ghm.business_membership
        (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1,$2,'owner','active',$2) RETURNING id`,
      [businessId, ownerId],
    );
    await client.query('COMMIT');
    fixture.businessIds.push(businessId);
    fixture.membershipIds.push(Number(membershipRows[0].id));
    return businessId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const addMembership = async (businessId, accountId, role) => {
  const { rows } = await cleanupAuthorityQuery(
    `INSERT INTO ghm.business_membership
      (business_id, account_id, membership_role, membership_status, created_by)
     VALUES ($1,$2,$3,'active',$2) RETURNING id`,
    [businessId, accountId, role],
  );
  fixture.membershipIds.push(Number(rows[0].id));
};

const assertRejected = async (work, expectedMessage, label) => {
  try {
    await work();
  } catch (error) {
    if (expectedMessage && error?.message !== expectedMessage) {
      throw new Error(`${label}: expected ${expectedMessage}; received ${error?.message}`);
    }
    console.log(label);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const directRuntime = async (sql, values = []) => {
  const client = await runtimePool.connect();
  try {
    return await client.query(sql, values);
  } finally {
    client.release();
  }
};

const cleanup = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');

    await client.query(
      `DELETE FROM ghm.enquiry WHERE id = ANY($1::bigint[])`,
      [fixture.enquiryIds],
    );

    await client.query(
      `DELETE FROM ghm.opportunity WHERE id = ANY($1::bigint[])`,
      [fixture.opportunityIds],
    );

    await client.query(
      `DELETE FROM ghm.business_membership WHERE id = ANY($1::bigint[])`,
      [fixture.membershipIds],
    );

    await client.query(
      `DELETE FROM ghm.business WHERE id = ANY($1::bigint[])`,
      [fixture.businessIds],
    );

    await client.query(
      `DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`,
      [fixture.accountIds],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

try {
  const [runtime, cleanupAuthority] = await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'Runtime qualification'),
    identity(cleanupPool, 'ghm_migrator', 'Cleanup authority'),
  ]);
  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanupAuthority.database_name}/${cleanupAuthority.current_user}`);

  const schema = await directRuntime(`
    SELECT
      to_regclass('ghm.enquiry') AS enquiry_table,
      to_regclass('ghm.opportunity') AS opportunity_table,
      to_regclass('ghm.opportunity_participant') AS participant_table
  `);
  const schemaRow = schema.rows[0];
  if (schemaRow.enquiry_table !== 'ghm.enquiry' || schemaRow.opportunity_table !== 'ghm.opportunity' || schemaRow.participant_table !== 'ghm.opportunity_participant') {
    throw new Error(`Required Enquiry workflow tables are not all present: ${JSON.stringify(schemaRow)}`);
  }
  console.log('ENQUIRY WORKFLOW SCHEMA PRESENCE PASS');

  const tablePrivileges = await cleanupAuthorityQuery(`
    SELECT table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'ghm_runtime'
      AND table_schema = 'ghm'
      AND table_name IN ('enquiry','opportunity','opportunity_participant')
    ORDER BY table_name, privilege_type
  `);
  const enquiryTablePrivileges = tablePrivileges.rows
    .filter(row => row.table_name === 'enquiry')
    .map(row => row.privilege_type);
  if (JSON.stringify(enquiryTablePrivileges) !== JSON.stringify(['SELECT'])) {
    throw new Error(`Unexpected Enquiry table-level privileges: ${JSON.stringify(enquiryTablePrivileges)}`);
  }
  console.log('ENQUIRY RUNTIME TABLE-LEVEL ACL PASS');

  const columnPrivileges = await cleanupAuthorityQuery(`
    SELECT column_name, privilege_type
    FROM information_schema.column_privileges
    WHERE grantee = 'ghm_runtime'
      AND table_schema = 'ghm'
      AND table_name = 'enquiry'
    ORDER BY privilege_type, column_name
  `);
  const insertColumns = columnPrivileges.rows.filter(row => row.privilege_type === 'INSERT').map(row => row.column_name);
  const updateColumns = columnPrivileges.rows.filter(row => row.privilege_type === 'UPDATE').map(row => row.column_name);
  const expectedInsert = ['business_id','city','customer_email','customer_id','customer_name','customer_phone','description','opportunity_id','project','source','urgency'];
  if (JSON.stringify(insertColumns) !== JSON.stringify(expectedInsert)) throw new Error(`Unexpected Enquiry INSERT columns: ${JSON.stringify(insertColumns)}`);
  if (JSON.stringify(updateColumns) !== JSON.stringify(['status'])) throw new Error(`Unexpected Enquiry UPDATE columns: ${JSON.stringify(updateColumns)}`);
  console.log('ENQUIRY RUNTIME COLUMN ACL PASS');

  const sequencePrivilege = await cleanupAuthorityQuery(`
    SELECT has_sequence_privilege('ghm_runtime', 'ghm.enquiry_id_seq', 'USAGE') AS can_use
  `);
  if (!sequencePrivilege.rows[0].can_use) throw new Error('Runtime lacks Enquiry sequence USAGE');
  console.log('ENQUIRY RUNTIME SEQUENCE ACL PASS');

  const customerId = await createAccount(`${marker}-customer`, 'customer');
  const ownerA = await createAccount(`${marker}-owner-a`, 'business');
  const ownerB = await createAccount(`${marker}-owner-b`, 'business');
  const adminId = await createAccount(`${marker}-admin`, 'business');
  const memberId = await createAccount(`${marker}-member`, 'business');
  const otherCustomerId = await createAccount(`${marker}-other-customer`, 'customer');

  const businessA = await createBusiness(`${marker}-A`, ownerA);
  const businessB = await createBusiness(`${marker}-B`, ownerB);
  const ownBusiness = await createBusiness(`${marker}-OWN`, customerId);
  await addMembership(businessA, adminId, 'administrator');
  await addMembership(businessA, memberId, 'member');

  console.log(`APPROVED ACTIVE BUSINESS FIXTURE PASS: business=${businessA}`);
  console.log(`BUSINESS OWNER + ADMINISTRATOR + MEMBER FIXTURE PASS: business=${businessA}`);

  const repository = new PostgresEnquiryRepository(runtimePool);
  const service = new EnquiryServiceImpl(repository);
  const customerContext = { userId: customerId, role: 'customer' };
  const otherCustomerContext = { userId: otherCustomerId, role: 'customer' };
  const ownerAContext = { userId: ownerA, role: 'business' };
  const ownerBContext = { userId: ownerB, role: 'business' };
  const adminContext = { userId: adminId, role: 'business' };
  const memberContext = { userId: memberId, role: 'business' };

  await assertRejected(
    () => service.createEnquiry(customerContext, {
      businessId: businessA,
      customerName: 'Customer',
      project: 'Invalid source fixture',
      description: 'This source must be rejected by the service contract.',
      source: 'directory',
    }),
    'Only marketplace Enquiries may be created',
    'ENQUIRY NON-MARKETPLACE CREATE DENIAL PASS',
  );

  await assertRejected(
    () => service.createEnquiry(customerContext, {
      businessId: businessA,
      customerName: 'Customer',
      project: 'Invalid budget fixture',
      description: 'This budget range must be rejected by the service contract.',
      budgetMin: 5000,
      budgetMax: 1000,
    }),
    'budgetMax must be greater than or equal to budgetMin',
    'ENQUIRY INVALID BUDGET DENIAL PASS',
  );

  await assertRejected(
    () => service.createEnquiry(customerContext, {
      businessId: ownBusiness,
      customerName: 'Own Business',
      project: 'Own Business Request',
      description: 'This must be rejected because the customer owns the target Business.',
    }),
    'Enquiry target Business is not eligible',
    'ENQUIRY OWN-BUSINESS CREATE DENIAL PASS',
  );

  const created = await service.createEnquiry(customerContext, {
    businessId: businessA,
    customerName: '  Customer Snapshot  ',
    customerPhone: ' 0821234567 ',
    customerEmail: ' customer@example.com ',
    project: '  Renovation Request ',
    description: '  Please renovate the kitchen and bathroom.  ',
    city: ' Durban ',
    budgetMin: 10000,
    budgetMax: 25000,
    urgency: 'urgent',
    source: 'marketplace',
  });
  fixture.enquiryIds.push(created.id);
  if (
    created.customerId !== customerId ||
    created.businessId !== businessA ||
    created.status !== 'new' ||
    created.source !== 'marketplace' ||
    created.urgency !== 'urgent' ||
    created.customerName !== 'Customer Snapshot' ||
    created.customerPhone !== '0821234567' ||
    created.customerEmail !== 'customer@example.com' ||
    created.project !== 'Renovation Request' ||
    created.description !== 'Please renovate the kitchen and bathroom.' ||
    created.city !== 'Durban' ||
    created.budgetMin !== 10000 ||
    created.budgetMax !== 25000 ||
    !created.opportunityId
  ) {
    throw new Error('Enquiry create binding/snapshot/opportunity-link qualification failed');
  }
  fixture.opportunityIds.push(created.opportunityId);
  console.log(`ENQUIRY CREATE + CUSTOMER BINDING + SNAPSHOT PASS: enquiry=${created.id}`);
  console.log(`ENQUIRY OPPORTUNITY LINK PASS: enquiry=${created.id}, opportunity=${created.opportunityId}`);

  const workflow = await cleanupAuthorityQuery(`
    SELECT
      o.lifecycle_status,
      o.visibility,
      o.creator_account_id,
      o.owner_business_id,
      ot.code AS opportunity_type,
      COUNT(op.id)::int AS participant_count,
      COUNT(*) FILTER (WHERE op.account_id = $2 AND op.participation_role = 'creator' AND op.participation_status = 'active')::int AS creator_count,
      COUNT(*) FILTER (WHERE op.business_id = $3 AND op.participation_role = 'owner' AND op.participation_status = 'active')::int AS owner_count,
      COUNT(*) FILTER (WHERE op.business_id = $3 AND op.participation_role = 'recipient' AND op.participation_status = 'active')::int AS recipient_count
    FROM ghm.opportunity o
    JOIN ghm.opportunity_type ot ON ot.id = o.opportunity_type_id
    LEFT JOIN ghm.opportunity_participant op ON op.opportunity_id = o.id
    WHERE o.id = $1
    GROUP BY o.id, o.lifecycle_status, o.visibility, o.creator_account_id, o.owner_business_id, ot.code
  `, [created.opportunityId, customerId, businessA]);
  if (workflow.rowCount !== 1) throw new Error('Persisted Enquiry Opportunity workflow row missing');
  const workflowRow = workflow.rows[0];
  if (
    workflowRow.lifecycle_status !== 'open' ||
    workflowRow.visibility !== 'participants' ||
    Number(workflowRow.creator_account_id) !== customerId ||
    Number(workflowRow.owner_business_id) !== businessA ||
    workflowRow.opportunity_type !== 'service-request' ||
    workflowRow.participant_count !== 3 ||
    workflowRow.creator_count !== 1 ||
    workflowRow.owner_count !== 1 ||
    workflowRow.recipient_count !== 1
  ) {
    throw new Error(`Atomic Enquiry workflow reconciliation failed: ${JSON.stringify(workflowRow)}`);
  }
  console.log('ATOMIC OPPORTUNITY OPEN + PARTICIPANTS WORKFLOW PASS');
  console.log('CREATOR + OWNER + DISTINCT RECIPIENT PARTICIPATION PASS');

  const ownRead = await service.getOwnEnquiry(customerContext, created.id);
  if (!ownRead || ownRead.id !== created.id || ownRead.customerId !== customerId || ownRead.opportunityId !== created.opportunityId) throw new Error('Own Enquiry read qualification failed');
  console.log('ENQUIRY OWN READ PASS');

  if (await service.getOwnEnquiry(otherCustomerContext, created.id) !== null) throw new Error('Cross-customer Enquiry exposure occurred');
  console.log('ENQUIRY CROSS-CUSTOMER READ DENIAL PASS');

  const received = await service.getReceivedEnquiry(ownerAContext, created.id);
  if (!received || received.businessId !== businessA || received.opportunityId !== created.opportunityId) throw new Error('Received owner read qualification failed');
  console.log('ENQUIRY RECEIVED OWNER READ PASS');

  if (await service.getReceivedEnquiry(ownerBContext, created.id) !== null) throw new Error('Cross-business owner exposure occurred');
  console.log('ENQUIRY CROSS-BUSINESS READ DENIAL PASS');
  if (await service.getReceivedEnquiry(adminContext, created.id) !== null) throw new Error('Administrator received-read unexpectedly succeeded');
  console.log('ENQUIRY ADMINISTRATOR READ DENIAL PASS');
  if (await service.getReceivedEnquiry(memberContext, created.id) !== null) throw new Error('Member received-read unexpectedly succeeded');
  console.log('ENQUIRY MEMBER READ DENIAL PASS');

  const updated = await service.updateReceivedEnquiryStatus(ownerAContext, created.id, { status: 'contacted' });
  if (updated.status !== 'contacted') throw new Error('Enquiry status update qualification failed');
  console.log('ENQUIRY OWNER STATUS UPDATE PASS');

  const afterUpdate = await service.getOwnEnquiry(customerContext, created.id);
  if (!afterUpdate || afterUpdate.status !== 'contacted') throw new Error('Enquiry status persistence failed');
  console.log('ENQUIRY STATUS PERSISTENCE PASS');

  await assertRejected(
    () => service.updateReceivedEnquiryStatus(ownerBContext, created.id, { status: 'qualified' }),
    'Enquiry not found or business owner permission required',
    'ENQUIRY CROSS-BUSINESS STATUS DENIAL PASS',
  );
  await assertRejected(
    () => service.updateReceivedEnquiryStatus(adminContext, created.id, { status: 'qualified' }),
    'Enquiry not found or business owner permission required',
    'ENQUIRY ADMINISTRATOR STATUS DENIAL PASS',
  );
  await assertRejected(
    () => service.updateReceivedEnquiryStatus(memberContext, created.id, { status: 'qualified' }),
    'Enquiry not found or business owner permission required',
    'ENQUIRY MEMBER STATUS DENIAL PASS',
  );
  await assertRejected(
    () => service.updateReceivedEnquiryStatus(customerContext, created.id, { status: 'qualified' }),
    'Enquiry not found or business owner permission required',
    'ENQUIRY CUSTOMER STATUS DENIAL PASS',
  );

  await assertRejected(
    () => service.updateReceivedEnquiryStatus(ownerAContext, created.id, { status: 'not-a-status' }),
    'Invalid Enquiry status',
    'ENQUIRY INVALID STATUS DENIAL PASS',
  );

  await assertRejected(
    () => directRuntime(`UPDATE ghm.enquiry SET customer_name = 'tampered' WHERE id = $1`, [created.id]),
    null,
    'ENQUIRY RUNTIME SNAPSHOT UPDATE ACL DENIAL PASS',
  );
  await assertRejected(
    () => directRuntime(`UPDATE ghm.enquiry SET business_id = $2 WHERE id = $1`, [created.id, businessB]),
    null,
    'ENQUIRY RUNTIME RECIPIENT UPDATE ACL DENIAL PASS',
  );
  await assertRejected(
    () => directRuntime(`DELETE FROM ghm.enquiry WHERE id = $1`, [created.id]),
    null,
    'ENQUIRY RUNTIME DELETE ACL DENIAL PASS',
  );
  await assertRejected(
    () => directRuntime(`INSERT INTO ghm.enquiry (business_id, customer_id, customer_name, project, description, source, status) VALUES ($1,$2,'Customer','ACL fixture','This fixture must be rejected by column privileges.','marketplace','contacted')`, [businessA, customerId]),
    null,
    'ENQUIRY RUNTIME STATUS-ON-CREATE ACL DENIAL PASS',
  );

  const persisted = await cleanupAuthorityQuery(`
    SELECT
      e.id,
      e.business_id,
      e.customer_id,
      e.status,
      e.source,
      e.opportunity_id,
      o.lifecycle_status,
      o.visibility,
      COUNT(op.id)::int AS participant_count
    FROM ghm.enquiry e
    JOIN ghm.opportunity o ON o.id = e.opportunity_id
    LEFT JOIN ghm.opportunity_participant op ON op.opportunity_id = o.id
    WHERE e.id = $1
    GROUP BY e.id, e.business_id, e.customer_id, e.status, e.source, e.opportunity_id, o.lifecycle_status, o.visibility
  `, [created.id]);
  if (persisted.rowCount !== 1) throw new Error('Persisted Enquiry reconciliation row missing');
  const persistedRow = persisted.rows[0];
  if (
    Number(persistedRow.business_id) !== businessA ||
    Number(persistedRow.customer_id) !== customerId ||
    persistedRow.status !== 'contacted' ||
    persistedRow.source !== 'marketplace' ||
    Number(persistedRow.opportunity_id) !== created.opportunityId ||
    persistedRow.lifecycle_status !== 'open' ||
    persistedRow.visibility !== 'participants' ||
    persistedRow.participant_count !== 3
  ) {
    throw new Error(`Persisted Enquiry workflow reconciliation failed: ${JSON.stringify(persistedRow)}`);
  }
  console.log('PERSISTED ENQUIRY + OPPORTUNITY + PARTICIPANT RECONCILIATION PASS');

  console.log('GHM ENQUIRY RUNTIME QUALIFICATION: PASS');
} finally {
  await cleanup().catch(error => console.error(`CLEANUP ERROR: ${error.message}`));
  await runtimePool.end();
  await cleanupPool.end();
}
