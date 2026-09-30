import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Opportunity runtime qualification');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for construction cleanup authority');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { OpportunityServiceImpl } = await import('../dist/resources/opportunity/service.js');
const { PostgresOpportunityRepository } = await import('../dist/resources/opportunity/repository.js');
const { BusinessIdentityServiceImpl } = await import('../dist/resources/business-identity/service.js');
const { PostgresBusinessIdentityRepository } = await import('../dist/resources/business-identity/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-opportunity-runtime-${randomUUID()}`;
const fixture = { accountIds: [], businessIds: [], opportunityIds: [] };

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query(`
    SELECT current_database() AS database_name,
           session_user,
           current_user,
           current_role
  `);
  const value = rows[0];
  if (
    value.database_name !== 'ghm_db' ||
    value.session_user !== expectedUser ||
    value.current_user !== expectedUser ||
    value.current_role !== expectedUser
  ) {
    throw new Error(`${label} refused: expected ghm_db/${expectedUser}, received ${JSON.stringify(value)}`);
  }
  return value;
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

const createInput = (suffix, overrides = {}) => ({
  opportunityTypeId: 1,
  title: `${marker} ${suffix}`,
  description: `A governed Opportunity qualification fixture for ${suffix}.`,
  visibility: 'private',
  budgetMin: 10000,
  budgetMax: 25000,
  ...overrides,
});

const directRuntimeQuery = async (sql, values = []) => {
  const client = await runtimePool.connect();
  try {
    return await client.query(sql, values);
  } finally {
    client.release();
  }
};

try {
  const [runtime, cleanup] = await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'Runtime qualification'),
    identity(cleanupPool, 'ghm_migrator', 'Cleanup authority'),
  ]);
  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanup.database_name}/${cleanup.current_user}`);

  const schema = await runtimePool.query(`
    SELECT to_regclass('ghm.opportunity') AS opportunity_table,
           to_regclass('ghm.opportunity_type') AS opportunity_type_table,
           to_regclass('ghm.country') AS country_table,
           to_regclass('ghm.currency') AS currency_table
  `);
  const tables = schema.rows[0];
  if (!tables.opportunity_table || !tables.opportunity_type_table || !tables.country_table || !tables.currency_table) {
    throw new Error(`Opportunity core migration is not present: ${JSON.stringify(tables)}`);
  }
  console.log('OPPORTUNITY CORE SCHEMA PRESENCE PASS');

  const typeResult = await runtimePool.query(
    `SELECT id FROM ghm.opportunity_type WHERE code = 'service-request' AND is_active = true`,
  );
  if (typeResult.rowCount !== 1) throw new Error('Expected active service-request Opportunity type');
  const serviceRequestTypeId = Number(typeResult.rows[0].id);

  const ownerAccountId = await createAccount(`${marker}-owner`);
  const administratorAccountId = await createAccount(`${marker}-administrator`);
  const outsiderAccountId = await createAccount(`${marker}-outsider`);
  const ownerContext = { userId: ownerAccountId, role: 'business' };
  const administratorContext = { userId: administratorAccountId, role: 'business' };
  const outsiderContext = { userId: outsiderAccountId, role: 'business' };

  const businessRepository = new PostgresBusinessIdentityRepository(runtimePool);
  const businessService = new BusinessIdentityServiceImpl(businessRepository);
  const business = await businessService.createBusiness(ownerContext, {
    name: `${marker} business`,
  });
  if (!business.activeBusiness || business.activeMembership?.role !== 'owner') {
    throw new Error('Business fixture creation failed');
  }
  fixture.businessIds.push(business.activeBusiness.id);
  console.log(`BUSINESS OWNER FIXTURE PASS: business=${business.activeBusiness.id}`);

  const membershipClient = await cleanupPool.connect();
  try {
    await membershipClient.query('BEGIN');
    await membershipClient.query('SET LOCAL ROLE ghm_schema_owner');
    await membershipClient.query(
      `INSERT INTO ghm.business_membership
         (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1, $2, 'administrator', 'active', $3)`,
      [business.activeBusiness.id, administratorAccountId, ownerAccountId],
    );
    await membershipClient.query('COMMIT');
  } catch (error) {
    await membershipClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    membershipClient.release();
  }
  console.log(`BUSINESS ADMINISTRATOR FIXTURE PASS: business=${business.activeBusiness.id}, account=${administratorAccountId}`);

  const repository = new PostgresOpportunityRepository(runtimePool);
  const service = new OpportunityServiceImpl(repository);

  const created = await service.createOpportunity(
    ownerContext,
    createInput('primary', { opportunityTypeId: serviceRequestTypeId }),
  );
  fixture.opportunityIds.push(created.id);

  if (
    created.creatorAccountId !== ownerAccountId ||
    created.lifecycleStatus !== 'draft' ||
    created.visibility !== 'private' ||
    created.title !== `${marker} primary`
  ) {
    throw new Error(`Opportunity creation binding failed: ${JSON.stringify(created)}`);
  }
  console.log(`OPPORTUNITY CREATE + CREATOR BINDING PASS: opportunity=${created.id}, account=${created.creatorAccountId}`);

  const ownerRead = await service.getOwnedOpportunity(ownerContext, created.id);
  if (!ownerRead || ownerRead.id !== created.id || ownerRead.creatorAccountId !== ownerAccountId) {
    throw new Error('Opportunity owner read qualification failed');
  }
  console.log('OPPORTUNITY OWNER READ PASS');

  const creatorFullRead = await service.getOpportunity(ownerContext, created.id);
  if (
    !creatorFullRead ||
    creatorFullRead.id !== created.id ||
    creatorFullRead.creatorAccountId !== ownerAccountId ||
    creatorFullRead.ownerBusinessId !== null ||
    !(creatorFullRead.updatedAt instanceof Date)
  ) {
    throw new Error(`Creator full Opportunity projection failed: ${JSON.stringify(creatorFullRead)}`);
  }
  console.log('OPPORTUNITY CREATOR FULL READ PROJECTION PASS');

  const outsiderOwnedRead = await service.getOwnedOpportunity(outsiderContext, created.id);
  if (outsiderOwnedRead !== null) throw new Error('Non-owner owned Opportunity read unexpectedly succeeded');
  console.log('OPPORTUNITY NON-OWNER OWNED READ DENIAL PASS');

  const outsiderPrivateRead = await service.getOpportunity(outsiderContext, created.id);
  if (outsiderPrivateRead !== null) throw new Error('Private Opportunity leaked to non-owner');
  console.log('OPPORTUNITY PRIVATE READ ISOLATION PASS');

  const updated = await service.updateOwnedOpportunity(ownerContext, created.id, {
    title: `${marker} primary updated`,
    budgetMax: 30000,
  });
  if (updated.title !== `${marker} primary updated` || updated.budgetMax !== 30000) {
    throw new Error('Opportunity owner update qualification failed');
  }
  console.log('OPPORTUNITY OWNER UPDATE PASS');

  await assertRejected(
    () => service.updateOwnedOpportunity(outsiderContext, created.id, { title: `${marker} outsider` }),
    'Opportunity not found or ownership required',
    'OPPORTUNITY NON-OWNER UPDATE DENIAL PASS',
  );

  await assertRejected(
    () => service.updateOwnedOpportunity(ownerContext, created.id, { lifecycleStatus: 'open' }),
    'Unsupported Opportunity update field: lifecycleStatus',
    'OPPORTUNITY LIFECYCLE FIELD IMMUTABILITY PASS',
  );

  const businessOwned = await service.createOpportunity(
    ownerContext,
    createInput('business-owned', {
      opportunityTypeId: serviceRequestTypeId,
      ownerBusinessId: business.activeBusiness.id,
    }),
  );
  fixture.opportunityIds.push(businessOwned.id);
  if (businessOwned.ownerBusinessId !== business.activeBusiness.id) {
    throw new Error('Business ownership binding failed');
  }
  console.log('OPPORTUNITY BUSINESS OWNERSHIP BINDING PASS');

  const businessOwnerRead = await service.getOpportunity(ownerContext, businessOwned.id);
  if (
    !businessOwnerRead ||
    businessOwnerRead.id !== businessOwned.id ||
    businessOwnerRead.creatorAccountId !== ownerAccountId ||
    businessOwnerRead.ownerBusinessId !== business.activeBusiness.id ||
    !(businessOwnerRead.updatedAt instanceof Date)
  ) {
    throw new Error(`Business owner full Opportunity projection failed: ${JSON.stringify(businessOwnerRead)}`);
  }
  console.log('OPPORTUNITY BUSINESS OWNER FULL READ PROJECTION PASS');

  const businessAdministratorRead = await service.getOpportunity(administratorContext, businessOwned.id);
  if (
    !businessAdministratorRead ||
    businessAdministratorRead.id !== businessOwned.id ||
    businessAdministratorRead.creatorAccountId !== ownerAccountId ||
    businessAdministratorRead.ownerBusinessId !== business.activeBusiness.id ||
    !(businessAdministratorRead.updatedAt instanceof Date)
  ) {
    throw new Error(`Business administrator full Opportunity projection failed: ${JSON.stringify(businessAdministratorRead)}`);
  }
  console.log('OPPORTUNITY BUSINESS ADMINISTRATOR FULL READ PROJECTION PASS');

  await assertRejected(
    () => service.createOpportunity(
      outsiderContext,
      createInput('unauthorized-business', {
        opportunityTypeId: serviceRequestTypeId,
        ownerBusinessId: business.activeBusiness.id,
      }),
    ),
    'Business management permission required',
    'OPPORTUNITY BUSINESS OWNERSHIP AUTHORIZATION PASS',
  );

  await assertRejected(
    () => service.createOpportunity(ownerContext, createInput('invalid-type', { opportunityTypeId: 999999999 })),
    'Opportunity type not found or inactive',
    'OPPORTUNITY INVALID-TYPE ATOMIC REJECTION PASS',
  );

  const failedMarker = `${marker} invalid-type`;
  const leaked = await directRuntimeQuery(
    `SELECT count(*)::int AS count FROM ghm.opportunity WHERE title = $1`,
    [failedMarker],
  );
  if (Number(leaked.rows[0].count) !== 0) throw new Error('Invalid Opportunity creation left a row behind');
  console.log('OPPORTUNITY INVALID-TYPE ROLLBACK/NO-ROW PASS');

  const opened = await service.transitionOpportunity(ownerContext, created.id, 'open');
  if (opened.lifecycleStatus !== 'open') throw new Error('Draft -> open transition failed');
  console.log('OPPORTUNITY DRAFT-TO-OPEN TRANSITION PASS');

  const authenticatedUpdated = await service.updateOwnedOpportunity(ownerContext, created.id, { visibility: 'authenticated' });
  if (authenticatedUpdated.lifecycleStatus !== 'open' || authenticatedUpdated.visibility !== 'authenticated') {
    throw new Error('Authenticated Opportunity visibility update failed');
  }

  const authenticatedRead = await service.getOpportunity(outsiderContext, created.id);
  if (!authenticatedRead) throw new Error('Authenticated visibility read failed after transition');
  if (
    'creatorAccountId' in authenticatedRead ||
    'ownerBusinessId' in authenticatedRead ||
    'updatedAt' in authenticatedRead
  ) {
    throw new Error(`Authenticated Opportunity read leaked private fields: ${JSON.stringify(authenticatedRead)}`);
  }
  if (
    authenticatedRead.id !== created.id ||
    authenticatedRead.visibility !== 'authenticated' ||
    authenticatedRead.title !== `${marker} primary updated`
  ) {
    throw new Error('Authenticated Opportunity safe projection contents failed');
  }
  console.log('OPPORTUNITY AUTHENTICATED SAFE READ PROJECTION PASS');

  const publicCandidate = await service.createOpportunity(
    ownerContext,
    createInput('public', { opportunityTypeId: serviceRequestTypeId }),
  );
  fixture.opportunityIds.push(publicCandidate.id);

  await assertRejected(
    () => service.updateOwnedOpportunity(ownerContext, publicCandidate.id, { visibility: 'public' }),
    'Public Opportunities require an explicit lifecycle transition',
    'OPPORTUNITY DRAFT PUBLIC VISIBILITY DENIAL PASS',
  );

  const openedPublic = await service.transitionOpportunity(ownerContext, publicCandidate.id, 'open');
  const publicUpdated = await service.updateOwnedOpportunity(ownerContext, publicCandidate.id, { visibility: 'public' });
  if (publicUpdated.lifecycleStatus !== 'open' || publicUpdated.visibility !== 'public') {
    throw new Error('Public Opportunity publication failed');
  }
  const publicRead = await service.getOpportunity(outsiderContext, publicCandidate.id);
  if (!publicRead || publicRead.visibility !== 'public') throw new Error('Public Opportunity disclosure failed');
  if (
    'creatorAccountId' in publicRead ||
    'ownerBusinessId' in publicRead ||
    'updatedAt' in publicRead
  ) {
    throw new Error(`Public Opportunity read leaked private fields: ${JSON.stringify(publicRead)}`);
  }
  console.log('OPPORTUNITY PUBLIC SAFE READ PROJECTION PASS');

  const participantCandidate = await service.createOpportunity(
    ownerContext,
    createInput('participants', { opportunityTypeId: serviceRequestTypeId }),
  );
  fixture.opportunityIds.push(participantCandidate.id);
  await service.transitionOpportunity(ownerContext, participantCandidate.id, 'open');
  await service.updateOwnedOpportunity(ownerContext, participantCandidate.id, { visibility: 'participants' });
  const participantRead = await service.getOpportunity(outsiderContext, participantCandidate.id);
  if (participantRead !== null) throw new Error('Participant-only Opportunity leaked before participant slice');
  console.log('OPPORTUNITY PARTICIPANT VISIBILITY FAIL-CLOSED PASS');

  await assertRejected(
    () => service.transitionOpportunity(ownerContext, created.id, 'awarded'),
    'Invalid Opportunity lifecycle transition: open -> awarded',
    'OPPORTUNITY INVALID LIFECYCLE TRANSITION DENIAL PASS',
  );

  await service.transitionOpportunity(ownerContext, created.id, 'responding');
  await service.transitionOpportunity(ownerContext, created.id, 'evaluating');
  await service.transitionOpportunity(ownerContext, created.id, 'awarded');
  await service.transitionOpportunity(ownerContext, created.id, 'in_progress');
  await service.transitionOpportunity(ownerContext, created.id, 'completed');

  await assertRejected(
    () => service.updateOwnedOpportunity(ownerContext, created.id, { title: `${marker} terminal update` }),
    'Terminal Opportunities cannot be updated',
    'OPPORTUNITY TERMINAL UPDATE DENIAL PASS',
  );

  await assertRejected(
    () => service.transitionOpportunity(ownerContext, created.id, 'cancelled'),
    'Invalid Opportunity lifecycle transition: completed -> cancelled',
    'OPPORTUNITY TERMINAL TRANSITION DENIAL PASS',
  );

  const terminal = await service.transitionOpportunity(ownerContext, created.id, 'archived');
  if (terminal.lifecycleStatus !== 'archived') throw new Error('Completed -> archived transition failed');
  console.log('OPPORTUNITY TERMINAL LIFECYCLE PROTECTION PASS');


  await assertRejected(
    () => directRuntimeQuery(`DELETE FROM ghm.opportunity WHERE id = $1`, [businessOwned.id]),
    undefined,
    'OPPORTUNITY RUNTIME DELETE ACL DENIAL PASS',
  );

  console.log('GHM OPPORTUNITY RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    await cleanupPool.query(`DELETE FROM ghm.opportunity WHERE id = ANY($1::bigint[])`, [fixture.opportunityIds]);
    await cleanupPool.query(`DELETE FROM ghm.business WHERE id = ANY($1::bigint[])`, [fixture.businessIds]);
    await cleanupPool.query(`DELETE FROM ghm.business_membership WHERE account_id = ANY($1::bigint[])`, [fixture.accountIds]);
    await cleanupPool.query(`DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`, [fixture.accountIds]);
    await cleanupPool.query('COMMIT');
  } catch (cleanupError) {
    await cleanupPool.query('ROLLBACK').catch(() => {});
    throw cleanupError;
  } finally {
    await Promise.all([runtimePool.end(), cleanupPool.end()]);
  }
}
