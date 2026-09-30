import { randomUUID } from 'node:crypto';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for the HTTP authorization qualification connection');
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
const fixture = { marker: `ghm-http-auth-${randomUUID()}`, accountIds: [] };

const request = async (baseUrl, path, token) => {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return { status: response.status, body: await response.json() };
};

const createFixtureAccount = async (role) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, $2) RETURNING id`,
      [`${fixture.marker}-${role}`, role],
    );
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

const sign = (userId, role, secret) => jwt.sign({ userId, role }, secret);

const server = http.createServer(
  createApp({
    businessIdentityService: new BusinessIdentityServiceImpl(
      new PostgresBusinessIdentityRepository(runtimePool),
    ),
  }),
);

try {
  const businessAccountId = await createFixtureAccount('business');
  const customerAccountId = await createFixtureAccount('customer');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP qualification server did not expose an address');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const missing = await request(baseUrl, '/api/v1/profile');
  if (missing.status !== 401 || missing.body?.error !== 'unauthorized') {
    throw new Error(`Missing-auth boundary failed: ${JSON.stringify(missing)}`);
  }
  console.log('HTTP MISSING AUTH DENIAL PASS');

  const invalid = await request(baseUrl, '/api/v1/profile', 'not-a-valid-token');
  if (invalid.status !== 401 || invalid.body?.error !== 'unauthorized') {
    throw new Error(`Invalid-token boundary failed: ${JSON.stringify(invalid)}`);
  }
  console.log('HTTP INVALID TOKEN DENIAL PASS');

  const businessToken = sign(businessAccountId, 'business', config.jwtSecret);
  const businessProfile = await request(baseUrl, '/api/v1/profile', businessToken);
  if (businessProfile.status !== 200 || businessProfile.body?.profile?.id !== businessAccountId || businessProfile.body?.profile?.role !== 'business') {
    throw new Error(`Canonical authenticated profile failed: ${JSON.stringify(businessProfile)}`);
  }
  console.log('HTTP AUTHENTICATED CANONICAL PROFILE PASS');

  const customerToken = sign(customerAccountId, 'customer', config.jwtSecret);
  const customerProfile = await request(baseUrl, '/api/v1/profile', customerToken);
  if (customerProfile.status !== 200 || customerProfile.body?.profile?.id !== customerAccountId || customerProfile.body?.profile?.role !== 'customer') {
    throw new Error(`Canonical customer profile failed: ${JSON.stringify(customerProfile)}`);
  }
  console.log('HTTP VERIFIED IDENTITY BINDING PASS');

  const invalidRoleToken = jwt.sign({ userId: businessAccountId, role: 'operator' }, config.jwtSecret);
  const invalidRole = await request(baseUrl, '/api/v1/profile', invalidRoleToken);
  if (invalidRole.status !== 401 || invalidRole.body?.error !== 'unauthorized') {
    throw new Error(`Invalid-role boundary failed: ${JSON.stringify(invalidRole)}`);
  }
  console.log('HTTP INVALID ROLE DENIAL PASS');

  console.log('GHM HTTP AUTHORIZATION QUALIFICATION: PASS');
} finally {
  await new Promise((resolve) => server.close(() => resolve()));
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    await cleanupPool.query(
      `DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`,
      [fixture.accountIds],
    );
    await cleanupPool.query('COMMIT');
  } catch (error) {
    await cleanupPool.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await Promise.all([runtimePool.end(), cleanupPool.end()]);
  }
}
