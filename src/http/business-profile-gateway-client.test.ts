import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessProfileGatewayError, HttpBusinessProfileGatewayClient } from './business-profile-gateway-client';

test('Business profile client forwards verified bearer token and patch', async () => {
  let url = '';
  let auth = '';
  let body = '';
  const client = new HttpBusinessProfileGatewayClient('https://gateway.example.test', 1000, async (input, init) => {
    url = String(input);
    auth = new Headers(init?.headers).get('authorization') ?? '';
    body = String(init?.body ?? '');
    return new Response(JSON.stringify({ businessProfile: { businessId: 73 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });
  await client.update('signed-token', 73, { name: 'Updated name' });
  assert.equal(url, 'https://gateway.example.test/v1/businesses/73/profile');
  assert.equal(auth, 'Bearer signed-token');
  assert.deepEqual(JSON.parse(body), { name: 'Updated name' });
});

test('Business profile client preserves gateway denials without fallback', async () => {
  const client = new HttpBusinessProfileGatewayClient('https://gateway.example.test', 1000, async () =>
    new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }));
  await assert.rejects(() => client.update('signed-token', 73, { name: 'Updated name' }),
    (error: unknown) => error instanceof BusinessProfileGatewayError && error.status === 404);
});

test('Business profile client rejects insecure remote gateway origins', () => {
  assert.throws(() => new HttpBusinessProfileGatewayClient('http://gateway.example.test'), /HTTPS/);
});
