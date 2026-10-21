import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { Pool } from 'pg';
import 'dotenv/config';
import { assertMatchingPostgresTargets, assertNonProductionQualificationTarget, assertPostgresTargetConfiguration } from '../dist/db/postgres-target-guard.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const expectedDatabaseName = process.env.GHM_NONPRODUCTION_DATABASE_NAME;
const expectedDatabaseHost = process.env.GHM_NONPRODUCTION_DATABASE_HOST;

const runtimeTarget = assertPostgresTargetConfiguration(runtimeUrl, {
  databaseName: expectedDatabaseName, host: expectedDatabaseHost, label: 'GHM runtime qualification target',
});
const cleanupTarget = assertPostgresTargetConfiguration(migratorUrl, {
  databaseName: expectedDatabaseName, host: expectedDatabaseHost, label: 'GHM qualification cleanup target',
});
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');
assertMatchingPostgresTargets(runtimeTarget, cleanupTarget, 'GHM identity qualification target');
assertNonProductionQualificationTarget(runtimeTarget, 'GHM identity qualification');

process.env.CORS_ORIGINS ??= 'http://localhost';
const { BusinessIdentityServiceImpl } = await import('../dist/resources/business-identity/service.js');
const { PostgresBusinessIdentityRepository } = await import('../dist/resources/business-identity/repository.js');
const { config } = await import('../dist/config.js');
const { createApp } = await import('../dist/http/app.js');
const { createAccessJwtService } = await import('../dist/auth/foundation/access-jwt.js');
const { loadEs256Keys } = await import('../dist/auth/foundation/es256-keys.js');

// Render's non-production PostgreSQL requires TLS; disposable local CI PostgreSQL does not.
const ssl = process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false };
const poolOptions = ssl ? { ssl } : {};
const runtimePool = new Pool({ connectionString: runtimeUrl, ...poolOptions, connectionTimeoutMillis: 15000 });
const cleanupPool = new Pool({ connectionString: migratorUrl, ...poolOptions, connectionTimeoutMillis: 15000 });

const runtimeIdentity = async () => {
  const { rows } = await runtimePool.query(`
    SELECT current_database() AS database_name,
           session_user,
           current_user,
           current_role
  `);
  const identity = rows[0];
  if (
    identity.database_name !== expectedDatabaseName ||
    identity.session_user !== 'ghm_runtime' ||
    identity.current_user !== 'ghm_runtime' ||
    identity.current_role !== 'ghm_runtime'
  ) {
    throw new Error(`Runtime qualification refused: expected ${expectedDatabaseName} / ghm_runtime identity, received ${JSON.stringify(identity)}`);
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
    identity.database_name !== expectedDatabaseName ||
    identity.session_user !== 'ghm_migrator' ||
    identity.current_user !== 'ghm_migrator' ||
    identity.current_role !== 'ghm_migrator'
  ) {
    throw new Error(`Cleanup authority refused: expected ${expectedDatabaseName} / ghm_migrator identity, received ${JSON.stringify(identity)}`);
  }
  return identity;
};

const createFixtureAccount = async (fullName) => {
  const client = await cleanupPool.connect();
  try {
    await client.query(`BEGIN`);
    await client.query(`SET LOCAL ROLE ghm_schema_owner`);
    const { rows } = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, $2) RETURNING id`,
      [fullName, 'business'],
    );
    await client.query(`COMMIT`);
    return Number(rows[0].id);
  } catch (error) {
    await client.query(`ROLLBACK`).catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const fixture = {
  marker: `ghm-runtime-qualification-${randomUUID()}`,
  accountIds: [],
  businessIds: [],
};

let qualificationServer;

try {
  console.log('GHM BUSINESS IDENTITY RUNTIME QUALIFICATION START');
  const [runtime, cleanup] = await Promise.all([runtimeIdentity(), cleanupIdentity()]);
  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanup.database_name}/${cleanup.current_user}`);

  const accountId = await createFixtureAccount(fixture.marker);
  fixture.accountIds.push(accountId);
  const context = { userId: accountId, role: 'business' };

  const repository = new PostgresBusinessIdentityRepository(runtimePool);
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


  const second = await service.createBusiness(context, { name: `${fixture.marker} secondary` });
  const secondBusiness = second.activeBusiness;
  if (!secondBusiness || second.activeMembership?.role !== 'owner' || second.activeMembership.status !== 'active') {
    throw new Error('Second Business creation did not establish the expected active owner context');
  }
  fixture.businessIds.push(secondBusiness.id);

  const afterSecond = await repository.getMembershipsForAccount(context);
  if (afterSecond.length !== 2 || afterSecond.some((membership) => membership.role !== 'owner' || membership.status !== 'active')) {
    throw new Error('Second Business creation did not preserve both active owner memberships');
  }
  console.log(`MULTI-BUSINESS CREATION + MEMBERSHIP PRESERVATION PASS: businesses=${createdBusiness.id},${secondBusiness.id}`);

  console.log('GHM IDENTITY HTTP QUALIFICATION BLOCK ENTERED');
  // Exercise the actual authenticated HTTP route using this same sandbox-backed
  // runtime pool. All accounts/businesses are disposable and removed in finally.
  const emptyAccountId = await createFixtureAccount(`${fixture.marker} empty-memberships`);
  fixture.accountIds.push(emptyAccountId);
  const singleAccountId = await createFixtureAccount(`${fixture.marker} single-membership`);
  fixture.accountIds.push(singleAccountId);
  const singleCreated = await service.createBusiness(
    { userId: singleAccountId, role: 'business' },
    { name: `${fixture.marker} single-membership business` },
  );
  if (!singleCreated.activeBusiness) throw new Error('Single-membership HTTP fixture did not create a business');
  fixture.businessIds.push(singleCreated.activeBusiness.id);

  qualificationServer = http.createServer(createApp({ businessIdentityService: service }));
  await new Promise((resolve, reject) => {
    qualificationServer.once('error', reject);
    qualificationServer.listen(0, '127.0.0.1', resolve);
  });
  const address = qualificationServer.address();
  if (!address || typeof address === 'string') throw new Error('Identity HTTP qualification server did not expose an address');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const identityJwt = createAccessJwtService(loadEs256Keys());
  const identityToken = (userId) => identityJwt.sign(Number(userId));
  const identityRequest = async (path, token) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: response.status, body: await response.json() };
  };
  const assertHttp = (result, status, label) => {
    if (result.status !== status) throw new Error(`${label}: expected HTTP ${status}, got ${result.status}: ${JSON.stringify(result.body)}`);
  };

  assertHttp(await identityRequest('/api/v1/identity'), 401, 'Identity missing authentication');
  assertHttp(await identityRequest('/api/v1/identity', 'invalid-token'), 401, 'Identity invalid token');
  console.log('IDENTITY HTTP AUTHENTICATION DENIAL PASS');

  const emptyIdentity = await identityRequest('/api/v1/identity', identityToken(emptyAccountId));
  assertHttp(emptyIdentity, 200, 'Identity empty memberships');
  if (
    emptyIdentity.body?.account?.id !== emptyAccountId ||
    !Array.isArray(emptyIdentity.body?.memberships) ||
    emptyIdentity.body.memberships.length !== 0 ||
    emptyIdentity.body.activeMembership !== null ||
    emptyIdentity.body.activeBusiness !== null
  ) throw new Error(`Identity empty-membership contract failed: ${JSON.stringify(emptyIdentity.body)}`);
  console.log('IDENTITY HTTP EMPTY MEMBERSHIP CONTRACT PASS');

  const chooserIdentity = await identityRequest('/api/v1/identity', identityToken(accountId));
  assertHttp(chooserIdentity, 200, 'Identity multiple memberships without selection');
  if (
    chooserIdentity.body?.account?.id !== accountId ||
    chooserIdentity.body?.memberships?.length !== 2 ||
    chooserIdentity.body.activeMembership !== null ||
    chooserIdentity.body.activeBusiness !== null
  ) throw new Error(`Identity multi-membership chooser contract failed: ${JSON.stringify(chooserIdentity.body)}`);
  console.log('IDENTITY HTTP MULTI-MEMBERSHIP CHOOSER PASS');

  const selectedIdentity = await identityRequest(`/api/v1/identity?businessId=${createdBusiness.id}`, identityToken(accountId));
  assertHttp(selectedIdentity, 200, 'Identity authorized business selection');
  if (
    selectedIdentity.body?.activeMembership?.accountId !== accountId ||
    selectedIdentity.body?.activeMembership?.businessId !== createdBusiness.id ||
    selectedIdentity.body?.activeBusiness?.id !== createdBusiness.id
  ) throw new Error(`Identity selected-business contract failed: ${JSON.stringify(selectedIdentity.body)}`);
  console.log('IDENTITY HTTP AUTHORIZED BUSINESS SELECTION PASS');

  const automaticIdentity = await identityRequest('/api/v1/identity', identityToken(singleAccountId));
  assertHttp(automaticIdentity, 200, 'Identity single-membership automatic selection');
  if (
    automaticIdentity.body?.memberships?.length !== 1 ||
    automaticIdentity.body?.activeMembership?.businessId !== singleCreated.activeBusiness.id ||
    automaticIdentity.body?.activeBusiness?.id !== singleCreated.activeBusiness.id
  ) throw new Error(`Identity single-membership automatic selection failed: ${JSON.stringify(automaticIdentity.body)}`);
  console.log('IDENTITY HTTP SINGLE-MEMBERSHIP AUTO-SELECTION PASS');

  const malformedSelection = await identityRequest('/api/v1/identity?businessId=not-an-id', identityToken(accountId));
  assertHttp(malformedSelection, 400, 'Identity malformed business selection');
  if (malformedSelection.body?.error !== 'invalid_request') throw new Error(`Identity malformed-selection error contract failed: ${JSON.stringify(malformedSelection.body)}`);

  const forbiddenSelection = await identityRequest(`/api/v1/identity?businessId=${createdBusiness.id}`, identityToken(emptyAccountId));
  assertHttp(forbiddenSelection, 404, 'Identity unauthorized business selection');
  if (forbiddenSelection.body?.error !== 'not_found') throw new Error(`Identity unauthorized-selection error contract failed: ${JSON.stringify(forbiddenSelection.body)}`);
  console.log('IDENTITY HTTP INVALID + UNAUTHORIZED SELECTION DENIAL PASS');

  const rollbackAccountId = await createFixtureAccount(`${fixture.marker} rollback`);
  fixture.accountIds.push(rollbackAccountId);
  const rollbackContext = { userId: rollbackAccountId, role: 'business' };

  await assertRejected(
    () => repository.createBusiness(rollbackContext, { name: `${fixture.marker} rollback` }, updated.slug),
    undefined,
    'DUPLICATE SLUG ATOMIC FAILURE PASS',
  );
  const rollbackMemberships = await repository.getMembershipsForAccount(rollbackContext);
  if (rollbackMemberships.length !== 0) throw new Error('Failed duplicate business creation left a membership behind');
  console.log('DUPLICATE SLUG ATOMIC ROLLBACK PASS');

  const concurrentAccountId = await createFixtureAccount(`${fixture.marker} concurrency`);
  fixture.accountIds.push(concurrentAccountId);
  const concurrentContext = { userId: concurrentAccountId, role: 'business' };

  const concurrentResults = await Promise.allSettled([
    service.createBusiness(concurrentContext, { name: `${fixture.marker} concurrent-a` }),
    service.createBusiness(concurrentContext, { name: `${fixture.marker} concurrent-b` }),
  ]);
  const successes = concurrentResults.filter((result) => result.status === 'fulfilled');
  const failures = concurrentResults.filter((result) => result.status === 'rejected');
  if (successes.length !== 2 || failures.length !== 0) {
    throw new Error(`Concurrency qualification expected two successful Business creations; received ${successes.length}/${failures.length}`);
  }

  const concurrentBusinesses = successes
    .map((result) => result.value.activeBusiness)
    .filter((value) => value !== undefined);

  if (concurrentBusinesses.length !== 2) {
    throw new Error('Concurrent Business creations did not return two active Businesses');
  }

  for (const concurrentBusiness of concurrentBusinesses) {
    fixture.businessIds.push(concurrentBusiness.id);
  }

  const concurrentMemberships = await repository.getMembershipsForAccount(concurrentContext);
  if (
    concurrentMemberships.length !== 2 ||
    concurrentMemberships.some((membership) => membership.role !== 'owner' || membership.status !== 'active')
  ) {
    throw new Error('Concurrency qualification did not preserve two active owner memberships');
  }

  console.log('CONCURRENT MULTI-BUSINESS CREATION SERIALIZATION + PRESERVATION PASS');

  console.log('GHM BUSINESS IDENTITY RUNTIME QUALIFICATION: PASS');
} finally {
  if (qualificationServer?.listening) {
    await new Promise((resolve) => qualificationServer.close(() => resolve()));
  }
  try {
    await cleanupPool.query(`BEGIN`);
    await cleanupPool.query(`SET LOCAL ROLE ghm_schema_owner`);
    await cleanupPool.query(
      `DELETE FROM ghm.business WHERE id = ANY($1::bigint[])`,
      [fixture.businessIds],
    );
    await cleanupPool.query(
      `DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`,
      [fixture.accountIds],
    );
    await cleanupPool.query(`COMMIT`);
    console.log('QUALIFICATION FIXTURE CLEANUP PASS');
  } catch (cleanupError) {
    await cleanupPool.query(`ROLLBACK`).catch(() => {});
    throw cleanupError;
  } finally {
    await Promise.all([runtimePool.end(), cleanupPool.end()]);
  }
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
