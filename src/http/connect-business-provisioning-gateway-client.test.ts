import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConnectBusinessProvisioningGatewayError,
  HttpConnectBusinessProvisioningGatewayClient,
} from './connect-business-provisioning-gateway-client';

const payload = {
  outcome: 'provisioned',
  business: { id: 42, name: 'Acme Construction', slug: 'acme-construction', createdAt: '2026-11-12T00:00:00.000Z', updatedAt: '2026-11-12T00:00:00.000Z' },
  mapping: {
    id: 9,
    provider: 'supabase',
    externalBusinessId: '11111111-1111-4111-8111-111111111111',
    businessId: 42,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
};

test('Connect Business gateway client forwards bearer token and normalized provisioning input', async () => {
  let url = '';
  let auth = '';
  let body = '';
  const client = new HttpConnectBusinessProvisioningGatewayClient(
    'https://gateway.example.test',
    1000,
    async (input, init) => {
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      url = String(input);
      auth = new Headers(init?.headers).get('authorization') ?? '';
      body = String(init?.body ?? '');
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );

  const result = await client.provisionOrResolve('verified-token', {
    externalBusinessId: '11111111-1111-4111-8111-111111111111',
    name: ' Acme Construction ',
  });
  assert.equal(url, 'https://gateway.example.test/v1/connect/businesses/provision-or-resolve');
  assert.equal(auth, 'Bearer verified-token');
  assert.deepEqual(JSON.parse(body), {
    externalBusinessId: '11111111-1111-4111-8111-111111111111',
    name: 'Acme Construction',
  });
  assert.equal(result.outcome, 'provisioned');
  assert.equal(result.mapping.businessId, result.business.id);
});

test('Connect Business gateway client preserves membership denial without fallback', async () => {
  const client = new HttpConnectBusinessProvisioningGatewayClient(
    'https://gateway.example.test',
    1000,
    async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
  );
  await assert.rejects(
    () => client.provisionOrResolve('verified-token', {
      externalBusinessId: '11111111-1111-4111-8111-111111111111',
      name: 'Acme Construction',
    }),
    (error: unknown) => error instanceof ConnectBusinessProvisioningGatewayError && error.status === 403,
  );
});

test('Connect Business gateway client rejects malformed success responses', async () => {
  const client = new HttpConnectBusinessProvisioningGatewayClient(
    'https://gateway.example.test',
    1000,
    async () => new Response(JSON.stringify({ outcome: 'resolved', business: {}, mapping: {} }), { status: 200 }),
  );
  await assert.rejects(() => client.provisionOrResolve('verified-token', {
    externalBusinessId: '11111111-1111-4111-8111-111111111111',
    name: 'Acme Construction',
  }), /response is invalid/);
});

test('Connect Business gateway client rejects insecure remote gateway origins', () => {
  assert.throws(
    () => new HttpConnectBusinessProvisioningGatewayClient('http://gateway.example.test'),
    /HTTPS/,
  );
});
