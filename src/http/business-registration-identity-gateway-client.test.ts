import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpBusinessRegistrationIdentityGatewayClient, BusinessRegistrationIdentityGatewayError } from './business-registration-identity-gateway-client';

test('gateway client forwards bearer token and validates typed registration identity response', async () => {
  let requestedUrl = '';
  let authorization = '';
  const client = new HttpBusinessRegistrationIdentityGatewayClient(
    'https://gateway.example.test',
    1000,
    async (input, init) => {
      assert.equal(init?.redirect, 'error');
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      return new Response(JSON.stringify({
        registrationIdentity: {
          businessId: 55,
          registrationStatus: 'registered',
          registrationNumber: 'REG-55',
          legalName: 'Example Pty Ltd',
          updatedAt: '2026-11-10T20:00:00.000Z',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  );
  const result = await client.readRegistrationIdentity('signed-access-token', 55);
  assert.equal(requestedUrl, 'https://gateway.example.test/v1/businesses/55/registration-identity');
  assert.equal(authorization, 'Bearer signed-access-token');
  assert.equal(result.businessId, 55);
  assert.equal(result.updatedAt?.toISOString(), '2026-11-10T20:00:00.000Z');
});

test('gateway client surfaces non-success responses without attempting a fallback', async () => {
  const client = new HttpBusinessRegistrationIdentityGatewayClient(
    'https://gateway.example.test',
    1000,
    async () => new Response(JSON.stringify({ error: 'service_unavailable' }), { status: 503 }),
  );
  await assert.rejects(
    () => client.readRegistrationIdentity('signed-access-token', 55),
    (error: unknown) => error instanceof BusinessRegistrationIdentityGatewayError && error.status === 503,
  );
});

test('gateway client rejects malformed or mismatched response payloads', async () => {
  const client = new HttpBusinessRegistrationIdentityGatewayClient(
    'https://gateway.example.test',
    1000,
    async () => new Response(JSON.stringify({
      registrationIdentity: {
        businessId: 56,
        registrationStatus: 'registered',
        registrationNumber: 'REG-55',
        legalName: 'Example Pty Ltd',
        updatedAt: null,
      },
    }), { status: 200 }),
  );
  await assert.rejects(() => client.readRegistrationIdentity('signed-access-token', 55), /response is invalid/);
});

test('gateway client requires HTTPS outside localhost', () => {
  assert.throws(() => new HttpBusinessRegistrationIdentityGatewayClient('http://gateway.example.test'), /HTTPS/);
});


test('gateway client forwards typed registration identity writes with original bearer token', async () => {
  let method = '';
  let authorization = '';
  let body: unknown;
  const client = new HttpBusinessRegistrationIdentityGatewayClient(
    'https://gateway.example.test',
    1000,
    async (_input, init) => {
      method = init?.method ?? '';
      authorization = new Headers(init?.headers).get('authorization') ?? '';
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        registrationIdentity: {
          businessId: 55,
          registrationStatus: 'registered',
          registrationNumber: 'REG-55',
          legalName: 'Example Pty Ltd',
          updatedAt: '2026-11-10T20:00:00.000Z',
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  );
  await client.updateRegistrationIdentity('signed-access-token', {
    businessId: 55,
    registrationStatus: 'registered',
    registrationNumber: 'REG-55',
    legalName: 'Example Pty Ltd',
  });
  assert.equal(method, 'PUT');
  assert.equal(authorization, 'Bearer signed-access-token');
  assert.deepEqual(body, {
    registrationStatus: 'registered',
    registrationNumber: 'REG-55',
    legalName: 'Example Pty Ltd',
  });
});
