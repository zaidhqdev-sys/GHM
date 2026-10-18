import { randomUUID } from 'node:crypto';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Resource API qualification');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for construction cleanup authority');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');
process.env.CORS_ORIGINS ??= 'http://localhost';

const { config } = await import('../dist/config.js');
const { createApp } = await import('../dist/http/app.js');
const { BusinessIdentityServiceImpl } = await import('../dist/resources/business-identity/service.js');
const { PostgresBusinessIdentityRepository } = await import('../dist/resources/business-identity/repository.js');
const { ProjectServiceImpl } = await import('../dist/resources/project/service.js');
const { PostgresProjectRepository } = await import('../dist/resources/project/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-resource-http-${randomUUID()}`;
const fixture = { accountIds: [], businessIds: [], projectIds: [] };

const request = async (baseUrl, method, path, token, body) => {
  const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) };
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};

const createAccount = async (role) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await client.query(`INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, $2) RETURNING id`, [`${marker}-${role}-${fixture.accountIds.length}`, role]);
    await client.query('COMMIT');
    const id = Number(result.rows[0].id);
    fixture.accountIds.push(id);
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const createBusinessFixture = async (accountId, name, slug, verificationStatus = 'approved', isActive = true, membershipRole = 'owner') => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const business = await client.query(`INSERT INTO ghm.business (name, slug, verification_status, is_active) VALUES ($1, $2, $3, $4) RETURNING id`, [name, slug, verificationStatus, isActive]);
    const businessId = Number(business.rows[0].id);
    fixture.businessIds.push(businessId);
    await client.query(`INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by) VALUES ($1, $2, $3, 'active', $2)`, [businessId, accountId, membershipRole]);
    await client.query('COMMIT');
    return businessId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const countActiveMemberships = async (accountId) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await client.query(`SELECT business_id FROM ghm.business_membership WHERE account_id = $1 AND membership_status = 'active' ORDER BY created_at, id`, [accountId]);
    await client.query('ROLLBACK');
    return result.rows.map((row) => Number(row.business_id));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const sign = (userId, role) => jwt.sign({ userId, role }, config.jwtSecret);
const assertStatus = (actual, expected, label) => {
  if (actual.status !== expected) throw new Error(`${label}: expected ${expected}, got ${actual.status}: ${JSON.stringify(actual.body)}`);
};
const assertError = (actual, expected, label) => {
  assertStatus(actual, expected, label);
  if (typeof actual.body?.error !== 'string') throw new Error(`${label}: missing stable error body: ${JSON.stringify(actual.body)}`);
};

const server = http.createServer(createApp({
  businessIdentityService: new BusinessIdentityServiceImpl(new PostgresBusinessIdentityRepository(runtimePool)),
  projectService: new ProjectServiceImpl(new PostgresProjectRepository(runtimePool)),
}));

try {
  const businessAccountId = await createAccount('business');
  const createAccountId = await createAccount('business');
  const customerAccountId = await createAccount('customer');
  const outsiderAccountId = await createAccount('business');

  const approvedBusinessId = await createBusinessFixture(customerAccountId, `${marker} Approved`, `${marker}-approved`);
  const pendingBusinessId = await createBusinessFixture(customerAccountId, `${marker} Pending`, `${marker}-pending`, 'pending');
  const inactiveBusinessId = await createBusinessFixture(customerAccountId, `${marker} Inactive`, `${marker}-inactive`, 'approved', false);
  const managedBusinessId = await createBusinessFixture(businessAccountId, `${marker} Managed`, `${marker}-managed`, 'approved', true, 'administrator');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Resource API qualification server did not expose an address');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const customerToken = sign(customerAccountId, 'customer');
  const businessToken = sign(businessAccountId, 'business');
  const createToken = sign(createAccountId, 'business');
  const outsiderToken = sign(outsiderAccountId, 'business');

  assertError(await request(baseUrl, 'GET', `/api/v1/businesses/${approvedBusinessId}`), 401, 'Business read missing authentication');
  console.log('RESOURCE API MISSING AUTH DENIAL PASS');
  assertError(await request(baseUrl, 'GET', `/api/v1/businesses/${approvedBusinessId}`, 'not-a-valid-token'), 401, 'Business read invalid token');
  console.log('RESOURCE API INVALID TOKEN DENIAL PASS');
  assertError(await request(baseUrl, 'GET', '/api/v1/businesses/not-an-id', customerToken), 400, 'Business read invalid id');
  console.log('RESOURCE API INVALID ID DENIAL PASS');

  const publicRead = await request(baseUrl, 'GET', `/api/v1/businesses/${approvedBusinessId}`, customerToken);
  assertStatus(publicRead, 200, 'Approved public business read');
  if (publicRead.body?.business?.id !== approvedBusinessId || publicRead.body?.business?.verificationStatus !== 'approved' || publicRead.body?.business?.isActive !== true) throw new Error(`Approved public business boundary failed: ${JSON.stringify(publicRead.body)}`);
  if ('membership' in (publicRead.body?.business ?? {}) || 'accountId' in (publicRead.body?.business ?? {})) throw new Error(`Public business disclosure boundary failed: ${JSON.stringify(publicRead.body)}`);
  console.log('RESOURCE API PUBLIC BUSINESS READ PASS');

  const slugRead = await request(baseUrl, 'GET', `/api/v1/businesses/slug/${encodeURIComponent(`${marker}-approved`)}`, customerToken);
  assertStatus(slugRead, 200, 'Approved business slug read');
  if (slugRead.body?.business?.id !== approvedBusinessId) throw new Error(`Business slug route failed: ${JSON.stringify(slugRead.body)}`);
  console.log('RESOURCE API PUBLIC SLUG READ PASS');

  assertError(await request(baseUrl, 'GET', `/api/v1/businesses/${pendingBusinessId}`, customerToken), 404, 'Pending business disclosure boundary');
  assertError(await request(baseUrl, 'GET', `/api/v1/businesses/${inactiveBusinessId}`, customerToken), 404, 'Inactive business disclosure boundary');
  assertError(await request(baseUrl, 'GET', '/api/v1/businesses/999999999', customerToken), 404, 'Unknown business read');
  console.log('RESOURCE API PUBLIC DISCLOSURE + NOT FOUND PASS');

  assertError(await request(baseUrl, 'GET', `/api/v1/businesses/${managedBusinessId}/managed`, outsiderToken), 403, 'Managed read ownership denial');
  const managedRead = await request(baseUrl, 'GET', `/api/v1/businesses/${managedBusinessId}/managed`, businessToken);
  assertStatus(managedRead, 200, 'Managed read owner/administrator access');
  console.log('RESOURCE API MANAGED READ AUTHORIZATION PASS');

  const beforeCreateMemberships = await countActiveMemberships(createAccountId);
  if (beforeCreateMemberships.length !== 0) throw new Error(`Business creation fixture invariant failed: ${JSON.stringify(beforeCreateMemberships)}`);
  const create = await request(baseUrl, 'POST', '/api/v1/businesses', createToken, { name: `${marker} Created` });
  assertStatus(create, 201, 'Business creation without prior membership');
  const createdBusinessId = create.body?.business?.id;
  if (!Number.isSafeInteger(createdBusinessId) || create.body?.membership?.role !== 'owner' || create.body?.membership?.status !== 'active') throw new Error(`Business creation ownership boundary failed: ${JSON.stringify(create.body)}`);
  fixture.businessIds.push(createdBusinessId);
  console.log('RESOURCE API BUSINESS CREATE + OWNER MEMBERSHIP PASS');

  assertError(await request(baseUrl, 'POST', '/api/v1/businesses', customerToken, { name: `${marker} Customer Attempt` }), 403, 'Customer business creation denial');
  console.log('RESOURCE API BUSINESS CREATE AUTHORIZATION PASS');

  const secondCreate = await request(baseUrl, 'POST', '/api/v1/businesses', createToken, { name: `${marker} Second` });
  assertStatus(secondCreate, 201, 'Business creation with existing active membership');
  const secondBusinessId = secondCreate.body?.business?.id;
  if (!Number.isSafeInteger(secondBusinessId) || secondBusinessId === createdBusinessId || secondCreate.body?.membership?.role !== 'owner' || secondCreate.body?.membership?.status !== 'active') throw new Error(`Additional Business ownership boundary failed: ${JSON.stringify(secondCreate.body)}`);
  fixture.businessIds.push(secondBusinessId);
  const afterCreateMemberships = await countActiveMemberships(createAccountId);
  if (afterCreateMemberships.length !== 2 || !afterCreateMemberships.includes(createdBusinessId) || !afterCreateMemberships.includes(secondBusinessId)) throw new Error(`Existing Business membership was not preserved: ${JSON.stringify(afterCreateMemberships)}`);
  console.log('RESOURCE API MULTI-BUSINESS CREATION + MEMBERSHIP PRESERVATION PASS');

  const update = await request(baseUrl, 'PATCH', `/api/v1/businesses/${managedBusinessId}`, businessToken, { name: `${marker} Managed Renamed`, slug: `${marker}-managed-renamed` });
  assertStatus(update, 200, 'Managed business update');
  if (update.body?.business?.name !== `${marker} Managed Renamed` || update.body?.business?.slug !== `${marker}-managed-renamed`) throw new Error(`Managed update result failed: ${JSON.stringify(update.body)}`);
  console.log('RESOURCE API MANAGED UPDATE PASS');

  assertError(await request(baseUrl, 'PATCH', `/api/v1/businesses/${managedBusinessId}`, businessToken, { name: 'valid', verificationStatus: 'approved' }), 400, 'Unknown Business update field');
  assertError(await request(baseUrl, 'PATCH', '/api/v1/businesses/not-an-id', businessToken, { name: 'valid' }), 400, 'Invalid Business update id');
  assertError(await request(baseUrl, 'PATCH', `/api/v1/businesses/${managedBusinessId}`, outsiderToken, { name: 'forbidden' }), 403, 'Managed update ownership denial');
  console.log('RESOURCE API UPDATE INPUT + OWNERSHIP DENIAL PASS');

  const slugPrecedence = await request(baseUrl, 'GET', `/api/v1/businesses/slug/${encodeURIComponent(`${marker}-approved`)}`, customerToken);
  assertStatus(slugPrecedence, 200, 'Slug route precedence');
  if (slugPrecedence.body?.business?.id !== approvedBusinessId) throw new Error(`Slug route precedence failed: ${JSON.stringify(slugPrecedence.body)}`);
  const managedRouteOrder = await request(baseUrl, 'GET', `/api/v1/businesses/${managedBusinessId}/managed`, businessToken);
  assertStatus(managedRouteOrder, 200, 'Managed route ordering');
  console.log('RESOURCE API ROUTE ORDER PASS');

  const disclosureError = JSON.stringify((await request(baseUrl, 'PATCH', `/api/v1/businesses/${managedBusinessId}`, outsiderToken, { name: 'forbidden' })).body);
  if (/SELECT|ghm\.|postgres|runtime|migrator|password|secret/i.test(disclosureError)) throw new Error(`Error disclosure boundary failed: ${disclosureError}`);
  console.log('RESOURCE API ERROR DISCLOSURE BOUNDARY PASS');

﻿  assertError(
    await request(baseUrl, 'POST', '/api/v1/projects', undefined, {
      title: 'HTTP qualification project',
      description: 'A live Project HTTP qualification fixture for the GHM resource API.',
      category: 'construction',
      province: 'KwaZulu-Natal',
      city: 'Durban',
    }),
    401,
    'Project create missing authentication',
  );
  console.log('PROJECT HTTP MISSING AUTH DENIAL PASS');

  assertError(
    await request(baseUrl, 'POST', '/api/v1/projects', createToken, {
      title: 'HTTP qualification project',
      description: 'A live Project HTTP qualification fixture for the GHM resource API.',
      category: 'construction',
      province: 'KwaZulu-Natal',
      city: 'Durban',
      accountId: outsiderAccountId,
      status: 'completed',
    }),
    400,
    'Project create server-owned fields',
  );
  console.log('PROJECT HTTP SERVER-OWNED FIELD DENIAL PASS');

  // PROJECT QUALIFIER AUTHORITY FIX:
  // The migrator is intentionally NOINHERIT. Direct verification/fixture
  // mutation must explicitly assume ghm_schema_owner rather than granting
  // ghm_runtime broader privileges.
  await cleanupPool.query('SET ROLE ghm_schema_owner');

  const projectCreate = await request(
    baseUrl,
    'POST',
    '/api/v1/projects',
    createToken,
    {
      title: 'HTTP qualification project',
      description: 'A live Project HTTP qualification fixture for the GHM resource API.',
      category: 'construction',
      province: 'KwaZulu-Natal',
      city: 'Durban',
      budgetMin: 50000,
      budgetMax: 100000,
      urgency: 'urgent',
    },
  );

  assertStatus(projectCreate, 201, 'Project creation');
  const projectId = projectCreate.body?.project?.id;

  if (!Number.isSafeInteger(projectId)) {
    throw new Error('Project creation did not return a valid id: ' + JSON.stringify(projectCreate.body));
  }

  fixture.projectIds.push(projectId);

  if (projectCreate.body?.project?.accountId !== createAccountId) {
    throw new Error(
      'Project owner binding failed: expected ' + createAccountId + ', got ' + JSON.stringify(projectCreate.body),
    );
  }

  const projectRow = await cleanupPool.query(
    `SELECT id, account_id, title, status
       FROM ghm.project
      WHERE id = $1`,
    [projectId],
  );

  if (
    projectRow.rows.length !== 1 ||
    Number(projectRow.rows[0].id) !== projectId ||
    Number(projectRow.rows[0].account_id) !== createAccountId ||
    projectRow.rows[0].status !== 'open'
  ) {
    throw new Error(
      'Live Project persistence/ownership boundary failed: ' + JSON.stringify(projectRow.rows),
    );
  }

  console.log('PROJECT HTTP CREATE + OWNER BINDING PASS');

  const projectRead = await request(
    baseUrl,
    'GET',
    `/api/v1/projects/${projectId}`,
    createToken,
  );

  assertStatus(projectRead, 200, 'Project owner read');

  if (
    projectRead.body?.project?.id !== projectId ||
    projectRead.body?.project?.accountId !== createAccountId
  ) {
    throw new Error('Project owner read failed: ' + JSON.stringify(projectRead.body));
  }

  console.log('PROJECT HTTP OWNER READ PASS');

  assertError(
    await request(
      baseUrl,
      'GET',
      `/api/v1/projects/${projectId}`,
      outsiderToken,
    ),
    404,
    'Project non-owner read',
  );

  console.log('PROJECT HTTP NON-OWNER READ DENIAL PASS');

  assertError(
    await request(
      baseUrl,
      'GET',
      '/api/v1/projects/not-an-id',
      createToken,
    ),
    400,
    'Project invalid id',
  );

  console.log('PROJECT HTTP INVALID ID DENIAL PASS');

  const projectUpdate = await request(
    baseUrl,
    'PATCH',
    `/api/v1/projects/${projectId}`,
    createToken,
    {
      title: 'HTTP qualification project updated',
      urgency: 'standard',
    },
  );

  assertStatus(projectUpdate, 200, 'Project owner update');

  if (
    projectUpdate.body?.project?.id !== projectId ||
    projectUpdate.body?.project?.accountId !== createAccountId ||
    projectUpdate.body?.project?.title !== 'HTTP qualification project updated'
  ) {
    throw new Error('Project owner update failed: ' + JSON.stringify(projectUpdate.body));
  }

  console.log('PROJECT HTTP OWNER UPDATE PASS');

  assertError(
    await request(
      baseUrl,
      'PATCH',
      `/api/v1/projects/${projectId}`,
      outsiderToken,
      { title: 'Unauthorized project update' },
    ),
    404,
    'Project non-owner update',
  );

  console.log('PROJECT HTTP NON-OWNER UPDATE DENIAL PASS');

  await cleanupPool.query(
    `UPDATE ghm.project
        SET status = 'completed',
            updated_at = now()
      WHERE id = $1`,
    [projectId],
  );

  const closedProjectUpdate = await request(
    baseUrl,
    'PATCH',
    `/api/v1/projects/${projectId}`,
    createToken,
    { title: 'Closed project mutation attempt' },
  );

  assertError(
    closedProjectUpdate,
    409,
    'Project closed update',
  );

  console.log('PROJECT HTTP CLOSED UPDATE DENIAL PASS');

  const persistedClosedProject = await cleanupPool.query(
    `SELECT id, account_id, title, status
       FROM ghm.project
      WHERE id = $1`,
    [projectId],
  );

  if (
    persistedClosedProject.rows.length !== 1 ||
    persistedClosedProject.rows[0].status !== 'completed' ||
    persistedClosedProject.rows[0].title !== 'HTTP qualification project updated'
  ) {
    throw new Error(
      'Closed Project state was not preserved: ' + JSON.stringify(persistedClosedProject.rows),
    );
  }

  console.log('PROJECT HTTP CLOSED STATE PRESERVATION PASS');

  const projectDisclosureError = JSON.stringify(
    (
      await request(
        baseUrl,
        'PATCH',
        `/api/v1/projects/${projectId}`,
        outsiderToken,
        { title: 'forbidden' },
      )
    ).body,
  );

  if (/SELECT|ghm\.|postgres|runtime|migrator|password|secret/i.test(projectDisclosureError)) {
    throw new Error(
      'Project HTTP error disclosure boundary failed: ' + projectDisclosureError,
    );
  }

  console.log('PROJECT HTTP ERROR DISCLOSURE BOUNDARY PASS');

  console.log('GHM PROJECT RESOURCE API HTTP QUALIFICATION: PASS');

  console.log('GHM RESOURCE API HTTP QUALIFICATION: PASS');
} finally {
  await new Promise((resolve) => server.close(() => resolve()));
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    await cleanupPool.query(`DELETE FROM ghm.business WHERE id = ANY($1::bigint[])`, [fixture.businessIds]);
    await cleanupPool.query(`DELETE FROM ghm.project WHERE id = ANY($1::bigint[])`, [fixture.projectIds]);
    await cleanupPool.query(`DELETE FROM ghm.business WHERE slug LIKE $1`, [`${marker}%`]);
    await cleanupPool.query(`DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`, [fixture.accountIds]);
    await cleanupPool.query('COMMIT');
  } catch (error) {
    await cleanupPool.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await Promise.all([runtimePool.end(), cleanupPool.end()]);
  }
}