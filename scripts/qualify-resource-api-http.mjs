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

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-resource-http-${randomUUID()}`;
const fixture = { accountIds: [], businessIds: [] };

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
    const result = await client.query(`INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, $2) RETURNING id`, [`${marker}-${role}`, role]);
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

const sign = (userId, role) => jwt.sign({ userId, role }, config.jwtSecret);
const assertStatus = (actual, expected, label) => {
  if (actual.status !== expected) throw new Error(`${label}: expected ${expected}, got ${actual.status}: ${JSON.stringify(actual.body)}`);
};
const assertError = (actual, expected, label) => {
  assertStatus(actual, expected, label);
  if (typeof actual.body?.error !== 'string') throw new Error(`${label}: missing stable error body: ${JSON.stringify(actual.body)}`);
};

const server = http.createServer(createApp({ businessIdentityService: new BusinessIdentityServiceImpl(new PostgresBusinessIdentityRepository(runtimePool)) }));

try {
  const businessAccountId = await createAccount('business');
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

  const create = await request(baseUrl, 'POST', '/api/v1/businesses', businessToken, { name: `${marker} Created` });
  assertStatus(create, 201, 'Business creation');
  const createdBusinessId = create.body?.business?.id;
  if (!Number.isSafeInteger(createdBusinessId) || create.body?.membership?.role !== 'owner' || create.body?.membership?.status !== 'active') throw new Error(`Business creation ownership boundary failed: ${JSON.stringify(create.body)}`);
  fixture.businessIds.push(createdBusinessId);
  console.log('RESOURCE API BUSINESS CREATE + OWNER MEMBERSHIP PASS');

  assertError(await request(baseUrl, 'POST', '/api/v1/businesses', customerToken, { name: `${marker} Customer Attempt` }), 403, 'Customer business creation denial');
  assertError(await request(baseUrl, 'POST', '/api/v1/businesses', businessToken, { name: `${marker} Second Attempt` }), 409, 'Existing active membership creation conflict');
  console.log('RESOURCE API BUSINESS CREATE AUTHORIZATION + CONFLICT PASS');

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

  console.log('GHM RESOURCE API HTTP QUALIFICATION: PASS');
} finally {
  await new Promise((resolve) => server.close(() => resolve()));
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    await cleanupPool.query(`DELETE FROM ghm.business WHERE id = ANY($1::bigint[])`, [fixture.businessIds]);
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
