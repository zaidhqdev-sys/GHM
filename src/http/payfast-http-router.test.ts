import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import test from 'node:test';
import { registerCommercialInternalRoutes, type PayfastHttpRouteBoundary } from './commercial-internal-router';

const start = async (boundary: PayfastHttpRouteBoundary) => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  registerCommercialInternalRoutes(app, boundary);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};
const close = async (server: http.Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test('PayFast checkout route rejects missing service assertion before boundary execution', async () => {
  let called = false;
  const { server, baseUrl } = await start({ createCheckout: async () => { called = true; throw new Error('must not execute'); } });
  try {
    const response = await fetch(`${baseUrl}/api/v1/internal/commercial/payfast/checkout/42`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
    assert.equal(called, false);
  } finally { await close(server); }
});

test('PayFast checkout route rejects browser-originated requests before assertion verification', async () => {
  let called = false;
  const { server, baseUrl } = await start({ createCheckout: async () => { called = true; throw new Error('must not execute'); } });
  try {
    const response = await fetch(`${baseUrl}/api/v1/internal/commercial/payfast/checkout/42`, { headers: { origin: 'https://connect.example' } });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
    assert.equal(called, false);
  } finally { await close(server); }
});

test('general API does not expose the PayFast ITN endpoint', async () => {
  const paths: string[] = [];
  const app = {
    post: (path: string) => { paths.push(path); },
    get: (path: string) => { paths.push(path); },
  };
  registerCommercialInternalRoutes(app as never, { createCheckout: async () => ({} as never) });
  assert.equal(paths.includes('/api/v1/commercial/payfast/itn'), false);
  assert.ok(paths.includes('/api/v1/internal/commercial/payfast/checkout/:paymentAttemptId'));
});
