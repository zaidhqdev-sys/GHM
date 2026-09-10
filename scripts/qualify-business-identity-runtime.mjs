import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) throw new Error('Missing DATABASE_URL for the dedicated runtime qualification connection');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for construction cleanup authority');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

process.env.CORS_ORIGINS ??= 'http://localhost';
const { BusinessIdentityServiceImpl } = await import('../dist/resources/business-identity/service.js');
const { PostgresBusinessIdentityRepository } = await import('../dist/resources/business-identity/repository.js');

const runtimePool = new Pool({ connectionString: runtimeUrl, ssl: false });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl: false });

const runtimeIdentity = async () => {
  const { rows } = await runtimePool.query(`
    SELECT current_database() AS database_name,
           session_user,
           current_user,
           current_role
  `);
  const identity = rows[0];
  if (
    identity.database_name !== 'ghm_db' ||
    identity.session_user !== 'ghm_runtime' ||
    identity.current_user !== 'ghm_runtime' ||
    identity.current_role !== 'ghm_runtime'
  ) {
    throw new Error(`Runtime qualification refused: expected ghm_db / ghm_runtime identity, received ${JSON.stringify(identity)}`);
  }
  return identity;
};

const cleanupIdentity = async () => {
  const { rows } = await cleanupPool.query(`
    SELECT current_database() AS database_name,
           session_user,
           current_user,
           current_role
  `);
  const identity = rows[0];
  if (
    identity.database_name !== 'ghm_db' ||
    identity.session_user !== 'ghm_migrator' ||
    identity.current_user !== 'ghm_migrator' ||
    identity.current_role !== 'ghm_migrator'
  ) {
    throw new Error(`Cleanup authority refused: expected ghm_db / ghm_migrator identity, received ${JSON.stringify(identity)}`);
  }
  return identity;
};

const fixture = {
  marker: `ghm-runtime-qualification-${randomUUID()}`,
  accountIds: [],
  businessIds: [],
};

try {
  const [runtime, cleanup] = await Promise.all([runtimeIdentity(), cleanupIdentity()]);
  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanup.database_name}/${cleanup.current_user}`);

  const { rows: accountRows } = await cleanupPool.query(
    `INSERT INTO account_identity (full_name, role) VALUES ($1, $2) RETURNING id`,
    [fixture.marker, 'business'],
  );
  const accountId = Number(accountRows[0].id);
  fixture.accountIds.push(accountId);
  const context = { userId: accountId, role: 'business' };

  const repository = new PostgresBusinessIdentityRepository();
  const service = new BusinessIdentityServiceImpl(repository);

  const profile = await service.getOwnProfile(context);
  if (profile.id !== accountId || profile.role !== 'business') throw new Error('Profile read qualification failed');
  console.log('PROFILE READ PASS');

  const before = await repository.getMembershipsForAccount(context);
  if (before.length !== 0) throw new Error('Fixture account unexpectedly had memberships');
  console.log('EMPTY MEMBERSHIP READ PASS');

  const created = await service.createBusiness(context, { name: `${fixture.marker} primary` });
  const createdBusiness = created.activeBusiness;
  if (!createdBusiness || created.activeMembership?.role !== 'owner' || created.activeMembership.status !== 'active') {
    throw new Error('Business creation did not establish the expected active owner context');
  }
  fixture.businessIds.push(createdBusiness.id);
  console.log(`BUSINESS CREATE + OWNER MEMBERSHIP PASS: business=${createdBusiness.id}`);

  const managed = await service.getManagedBusiness(context, createdBusiness.id);
  if (!managed || managed.id !== createdBusiness.id) throw new Error('Managed business read qualification failed');
  console.log('MANAGED READ PASS');

  const publicPending = await service.getPublicBusiness(context, createdBusiness.id);
  if (publicPending !== null) throw new Error('Unapproved business was exposed through public read');
  console.log('PUBLIC APPROVAL BOUNDARY PASS');

  const updated = await service.updateBusiness(context, createdBusiness.id, {
    name: `${fixture.marker} renamed`,
    slug: `${fixture.marker}-renamed`,
  });
  if (updated.name !== `${fixture.marker} renamed` || updated.slug !== `${fixture.marker}-renamed`) {
    throw new Error('Managed business update qualification failed');
  }
  console.log('MANAGED UPDATE PASS');

  await assertRejected(
    () => service.createBusiness({ userId: accountId, role: 'customer' }, { name: `${fixture.marker} customer` }),
    'Business creation requires a business operator role',
    'ROLE AUTHORIZATION REJECTION PASS',
  );

  await assertRejected(
    () => service.createBusiness(context, { name: `${fixture.marker} duplicate-membership` }),
    'Business creation requires no existing active business membership',
    'ACTIVE MEMBERSHIP REJECTION PASS',
  );

  const { rows: rollbackAccountRows } = await cleanupPool.query(
    `INSERT INTO account_identity (full_name, role) VALUES ($1, $2) RETURNING id`,
    [`${fixture.marker} rollback`, 'business'],
  );
  const rollbackAccountId = Number(rollbackAccountRows[0].id);
  fixture.accountIds.push(rollbackAccountId);
  const rollbackContext = { userId: rollbackAccountId, role: 'business' };

  await assertRejected(
    () => repository.createBusiness(rollbackContext, { name: `${fixture.marker} rollback` }, createdBusiness.slug),
    undefined,
    'DUPLICATE SLUG ATOMIC FAILURE PASS',
  );
  const rollbackMemberships = await repository.getMembershipsForAccount(rollbackContext);
  if (rollbackMemberships.length !== 0) throw new Error('Failed duplicate business creation left a membership behind');
  console.log('DUPLICATE SLUG ATOMIC ROLLBACK PASS');

  const { rows: concurrentAccountRows } = await cleanupPool.query(
    `INSERT INTO account_identity (full_name, role) VALUES ($1, $2) RETURNING id`,
    [`${fixture.marker} concurrency`, 'business'],
  );
  const concurrentAccountId = Number(concurrentAccountRows[0].id);
  fixture.accountIds.push(concurrentAccountId);
  const concurrentContext = { userId: concurrentAccountId, role: 'business' };

  const concurrentResults = await Promise.allSettled([
    service.createBusiness(concurrentContext, { name: `${fixture.marker} concurrent-a` }),
    service.createBusiness(concurrentContext, { name: `${fixture.marker} concurrent-b` }),
  ]);
  const successes = concurrentResults.filter((result) => result.status === 'fulfilled');
  const failures = concurrentResults.filter((result) => result.status === 'rejected');
  if (successes.length !== 1 || failures.length !== 1) {
    throw new Error(`Concurrency qualification expected one success and one rejection; received ${successes.length}/${failures.length}`);
  }
  const concurrentBusiness = successes[0].value.activeBusiness;
  if (!concurrentBusiness) throw new Error('Concurrency winner did not return an active business');
  fixture.businessIds.push(concurrentBusiness.id);
  const concurrentMemberships = await repository.getMembershipsForAccount(concurrentContext);
  if (concurrentMemberships.length !== 1 || concurrentMemberships[0].status !== 'active') {
    throw new Error('Concurrency qualification did not serialize active membership creation');
  }
  console.log('CONCURRENT BUSINESS CREATION SERIALIZATION PASS');

  console.log('GHM BUSINESS IDENTITY RUNTIME QUALIFICATION: PASS');
} finally {
  await cleanupPool.query(
    `DELETE FROM business WHERE id = ANY($1::bigint[])`,
    [fixture.businessIds],
  );
  await cleanupPool.query(
    `DELETE FROM account_identity WHERE id = ANY($1::bigint[])`,
    [fixture.accountIds],
  );
  await Promise.all([runtimePool.end(), cleanupPool.end()]);
}

async function assertRejected(work, expectedMessage, label) {
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
}
