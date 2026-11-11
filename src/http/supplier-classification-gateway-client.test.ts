import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpSupplierClassificationGatewayClient, SupplierClassificationGatewayError } from './supplier-classification-gateway-client';

test('supplier classification client forwards the bearer token and only classification input', async () => {
  let url = '';
  let auth = '';
  let body = '';
  const client = new HttpSupplierClassificationGatewayClient('https://gateway.example.test', 1000, async (input, init) => {
      assert.equal(init?.redirect, 'error');
    url = String(input);
    auth = new Headers(init?.headers).get('authorization') ?? '';
    body = String(init?.body ?? '');
    return new Response(JSON.stringify({ supplierClassification: { businessId: 73, isSupplier: true } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });
  assert.deepEqual(await client.update('signed-token', 73, true), { businessId: 73, isSupplier: true });
  assert.equal(url, 'https://gateway.example.test/v1/businesses/73/supplier-classification');
  assert.equal(auth, 'Bearer signed-token');
  assert.deepEqual(JSON.parse(body), { isSupplier: true });
});

test('supplier classification client preserves gateway denial without fallback', async () => {
  const client = new HttpSupplierClassificationGatewayClient('https://gateway.example.test', 1000, async () =>
    new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }));
  await assert.rejects(() => client.update('signed-token', 73, false),
    (error: unknown) => error instanceof SupplierClassificationGatewayError && error.status === 404);
});

test('supplier classification client rejects insecure remote gateway origins', () => {
  assert.throws(() => new HttpSupplierClassificationGatewayClient('http://gateway.example.test'), /HTTPS/);
});
