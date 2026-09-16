import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Opportunity participant runtime qualification');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for construction cleanup authority');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { OpportunityServiceImpl } = await import('../dist/resources/opportunity/service.js');
const { PostgresOpportunityRepository } = await import('../dist/resources/opportunity/repository.js');
const { BusinessIdentityServiceImpl } = await import('../dist/resources/business-identity/service.js');
const { PostgresBusinessIdentityRepository } = await import('../dist/resources/business-identity/repository.js');
const { OpportunityParticipantServiceImpl } = await import('../dist/resources/opportunity-participant/service.js');
const { PostgresOpportunityParticipantRepository } = await import('../dist/resources/opportunity-participant/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-opportunity-participant-${randomUUID()}`;
const fixture = { accountIds: [], businessIds: [], opportunityIds: [] };

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query(`SELECT current_database() AS database_name, session_user, current_user, current_role`);
  const value = rows[0];
  if (value.database_name !== 'ghm_db' || value.session_user !== expectedUser || value.current_user !== expectedUser || value.current_role !== expectedUser) {
    throw new Error(`${label} refused: expected ghm_db/${expectedUser}, received ${JSON.stringify(value)}`);
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

const createAccount = async (fullName) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows } = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
      [fullName],
    );
    await client.query('COMMIT');
    const id = Number(rows[0].id);
    fixture.accountIds.push(id);
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const createMembership = async (businessId, accountId, role, createdBy) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    await client.query(
      `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1, $2, $3, 'active', $4)`,
      [businessId, accountId, role, createdBy],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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

const directRuntimeQuery = async (sql, values = []) => {
  const client = await runtimePool.connect();
  try { return await client.query(sql, values); } finally { client.release(); }
};

const cleanup = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('SET ROLE ghm_schema_owner');
    await client.query(`DELETE FROM ghm.opportunity WHERE title LIKE $1`, [`${marker}%`]);
    await client.query(`DELETE FROM ghm.business_membership WHERE account_id IN (SELECT id FROM ghm.account_identity WHERE full_name LIKE $1)`, [`${marker}%`]);
    await client.query(`DELETE FROM ghm.business WHERE name LIKE $1`, [`${marker}%`]);
    await client.query(`DELETE FROM ghm.account_identity WHERE full_name LIKE $1`, [`${marker}%`]);
  } finally { client.release(); }
};

try {
  const [runtime, cleanupAuthority] = await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'Runtime qualification'),
    identity(cleanupPool, 'ghm_migrator', 'Cleanup authority'),
  ]);
  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanupAuthority.database_name}/${cleanupAuthority.current_user}`);

  const schema = await runtimePool.query(`SELECT to_regclass('ghm.opportunity_participant') AS participant_table`);
  if (schema.rows[0].participant_table !== 'ghm.opportunity_participant') throw new Error('Opportunity participant table is not present');
  console.log('PARTICIPANT SCHEMA PRESENCE PASS');

  const privilege = await cleanupAuthorityQuery(`
    SELECT privilege_type FROM information_schema.role_table_grants
    WHERE grantee = 'ghm_runtime' AND table_schema = 'ghm' AND table_name = 'opportunity_participant'
    ORDER BY privilege_type
  `);
  const tablePrivileges = privilege.rows.map(row => row.privilege_type);
  if (!tablePrivileges.includes('SELECT') || tablePrivileges.includes('UPDATE') || tablePrivileges.includes('DELETE')) {
    throw new Error(`Unexpected participant table privileges: ${JSON.stringify(tablePrivileges)}`);
  }
  const columnPrivileges = await cleanupAuthorityQuery(`
    SELECT column_name FROM information_schema.column_privileges
    WHERE grantee = 'ghm_runtime' AND table_schema = 'ghm' AND table_name = 'opportunity_participant' AND privilege_type = 'INSERT'
    ORDER BY column_name
  `);
  const expectedInsert = ['account_id','business_id','created_by','opportunity_id','participation_role','participation_status'];
  const actualInsert = columnPrivileges.rows.map(row => row.column_name);
  if (JSON.stringify(actualInsert) !== JSON.stringify(expectedInsert)) throw new Error(`Unexpected participant INSERT columns: ${JSON.stringify(actualInsert)}`);
  console.log('PARTICIPANT RUNTIME PRIVILEGE BOUNDARY PASS');

  const ownerAccountId = await createAccount(`${marker}-owner`);
  const participantAccountId = await createAccount(`${marker}-participant`);
  const outsiderAccountId = await createAccount(`${marker}-outsider`);
  const ownerContext = { userId: ownerAccountId, role: 'business' };
  const participantContext = { userId: participantAccountId, role: 'business' };
  const outsiderContext = { userId: outsiderAccountId, role: 'business' };

  const businessRepository = new PostgresBusinessIdentityRepository(runtimePool);
  const businessService = new BusinessIdentityServiceImpl(businessRepository);
  const business = await businessService.createBusiness(ownerContext, { name: `${marker} business` });
  if (!business.activeBusiness || business.activeMembership?.role !== 'owner') throw new Error('Business fixture creation failed');
  const businessId = business.activeBusiness.id;
  fixture.businessIds.push(businessId);

  const approval = await cleanupAuthorityQuery(
    `UPDATE ghm.business SET verification_status = 'approved', is_verified = true WHERE id = $1 AND is_active = true RETURNING id, verification_status, is_verified, is_active`,
    [businessId],
  );
  if (
    approval.rowCount !== 1 ||
    approval.rows[0].verification_status !== 'approved' ||
    approval.rows[0].is_verified !== true ||
    approval.rows[0].is_active !== true
  ) {
    throw new Error('Approved Business participant fixture could not be established');
  }
  console.log(`APPROVED BUSINESS FIXTURE PASS: business=${businessId}`);

  await createMembership(businessId, participantAccountId, 'member', ownerAccountId);
  console.log(`BUSINESS + MEMBERSHIP FIXTURE PASS: business=${businessId}`);

  const opportunityRepository = new PostgresOpportunityRepository(runtimePool);
  const opportunityService = new OpportunityServiceImpl(opportunityRepository);
  const opportunity = await opportunityService.createOpportunity(ownerContext, {
    opportunityTypeId: 1,
    title: `${marker} opportunity`,
    description: 'Atomic participant qualification fixture.',
    ownerBusinessId: businessId,
    visibility: 'private',
  });
  fixture.opportunityIds.push(opportunity.id);
  console.log(`OPPORTUNITY CREATION PASS: opportunity=${opportunity.id}`);

  const participantRepository = new PostgresOpportunityParticipantRepository(runtimePool);
  const participantService = new OpportunityParticipantServiceImpl(participantRepository);

  const initial = await participantService.listOpportunityParticipants(ownerContext, opportunity.id);
  if (initial.length !== 2) throw new Error(`Expected creator + owner participants, received ${initial.length}`);
  const creator = initial.find(row => row.participationRole === 'creator');
  const owner = initial.find(row => row.participationRole === 'owner');
  if (!creator || creator.accountId !== ownerAccountId || creator.businessId !== null || creator.participationStatus !== 'active') throw new Error('Creator participant binding failed');
  if (!owner || owner.accountId !== null || owner.businessId !== businessId || owner.participationStatus !== 'active' || owner.createdBy !== ownerAccountId) throw new Error('Owner participant binding failed');
  console.log('CREATOR + OWNER PARTICIPATION ATOMIC BINDING PASS');

  const accountParticipant = await participantService.createParticipant(ownerContext, {
    opportunityId: opportunity.id,
    accountId: participantAccountId,
    participationRole: 'responder',
    participationStatus: 'invited',
  });
  if (accountParticipant.accountId !== participantAccountId || accountParticipant.businessId !== null || accountParticipant.participationRole !== 'responder' || accountParticipant.participationStatus !== 'invited' || accountParticipant.createdBy !== ownerAccountId) throw new Error('Account participant creation failed');
  console.log(`ACCOUNT PARTICIPANT CREATE PASS: participant=${accountParticipant.id}`);

  const accountRead = await participantService.getParticipant(participantContext, accountParticipant.id);
  if (!accountRead || accountRead.id !== accountParticipant.id) throw new Error('Invited account participant read failed');
  console.log('ACCOUNT PARTICIPANT SELF-READ PASS');

  const accountList = await participantService.listOpportunityParticipants(participantContext, opportunity.id);
  if (!accountList.some(row => row.id === accountParticipant.id)) throw new Error('Invited account participant missing from visible list');
  console.log('ACCOUNT PARTICIPANT VISIBLE-LIST PASS');

  const businessParticipant = await participantService.createParticipant(ownerContext, {
    opportunityId: opportunity.id,
    businessId,
    participationRole: 'recipient',
    participationStatus: 'active',
  });
  if (businessParticipant.businessId !== businessId || businessParticipant.accountId !== null || businessParticipant.participationRole !== 'recipient') throw new Error('Business participant creation failed');
  console.log(`BUSINESS PARTICIPANT CREATE PASS: participant=${businessParticipant.id}`);

  const businessMemberRead = await participantService.getParticipant(participantContext, businessParticipant.id);
  if (!businessMemberRead || businessMemberRead.id !== businessParticipant.id) throw new Error('Business participant member read failed');
  console.log('BUSINESS PARTICIPANT MEMBER-READ PASS');

  await assertRejected(
    () => participantService.getParticipant(outsiderContext, accountParticipant.id),
    'Opportunity participant access required',
    'UNRELATED ACCOUNT READ DENIAL PASS',
  );
  await assertRejected(
    () => participantService.createParticipant(outsiderContext, {
      opportunityId: opportunity.id,
      accountId: outsiderAccountId,
      participationRole: 'responder',
    }),
    'Opportunity participant management permission required',
    'UNAUTHORIZED PARTICIPANT CREATE DENIAL PASS',
  );

  await assertRejected(
    () => participantService.createParticipant(ownerContext, {
      opportunityId: opportunity.id,
      accountId: participantAccountId,
      participationRole: 'responder',
      participationStatus: 'invited',
    }),
    null,
    'DUPLICATE PARTICIPANT DB CONSTRAINT PASS',
  );

  await assertRejected(
    () => participantService.createParticipant(ownerContext, {
      opportunityId: opportunity.id,
      accountId: participantAccountId,
      businessId,
      participationRole: 'evaluator',
    }),
    'Exactly one participant principal is required',
    'PARTICIPANT PRINCIPAL XOR VALIDATION PASS',
  );

  await assertRejected(
    () => participantService.createParticipant(ownerContext, {
      opportunityId: opportunity.id,
      participationRole: 'responder',
    }),
    'Exactly one participant principal is required',
    'PARTICIPANT PRINCIPAL REQUIRED VALIDATION PASS',
  );

  await assertRejected(
    () => participantService.createParticipant(ownerContext, {
      opportunityId: opportunity.id,
      accountId: participantAccountId,
      participationRole: 'invalid-role',
    }),
    'Invalid participation role',
    'PARTICIPANT ROLE VALIDATION PASS',
  );

  await assertRejected(
    () => participantService.createParticipant(ownerContext, {
      opportunityId: opportunity.id,
      accountId: participantAccountId,
      participationRole: 'evaluator',
      participationStatus: 'invalid-status',
    }),
    'Invalid participation status',
    'PARTICIPANT STATUS VALIDATION PASS',
  );

  await assertRejected(
    () => participantService.updateParticipant(ownerContext, accountParticipant.id, { participationStatus: 'active' }),
    'Participant updates are not supported until a concrete transition authority is qualified',
    'PARTICIPANT UPDATE DEFERRED AUTHORITY PASS',
  );

  await assertRejected(
    () => directRuntimeQuery(`UPDATE ghm.opportunity_participant SET participation_status = 'completed' WHERE id = $1`, [accountParticipant.id]),
    null,
    'RUNTIME DIRECT UPDATE DENIAL PASS',
  );

  const visible = await participantService.listOpportunityParticipants(ownerContext, opportunity.id);
  if (visible.length !== 4) throw new Error(`Expected four participants after qualification writes, received ${visible.length}`);
  console.log('PARTICIPANT FULL-LIST RECONCILIATION PASS');

  const rowCheck = await cleanupAuthorityQuery(`
    SELECT participation_role, participation_status, account_id, business_id, created_by
    FROM ghm.opportunity_participant
    WHERE opportunity_id = $1
    ORDER BY id
  `, [opportunity.id]);
  if (rowCheck.rowCount !== 4) throw new Error(`Expected four persisted participant rows, received ${rowCheck.rowCount}`);
  console.log('PERSISTED PARTICIPANT ROW RECONCILIATION PASS');

  console.log('OPPORTUNITY PARTICIPANT RUNTIME QUALIFICATION PASS');
} finally {
  await cleanup().catch(error => console.error(`CLEANUP ERROR: ${error.message}`));
  await runtimePool.end();
  await cleanupPool.end();
}