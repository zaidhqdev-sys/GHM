import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import test from 'node:test';
import { registerCommercialInternalRoutes, type PayfastHttpRouteBoundary } from './commercial-internal-router';

const start = async (payfastHttpBoundary: PayfastHttpRouteBoundary) => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  registerCommercialInternalRoutes(app, undefined, payfastHttpBoundary);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const close = async (server: http.Server) => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
};

test('PayFast checkout route rejects missing service assertion before boundary execution', async () => {
  let called = false;
  const boundary: PayfastHttpRouteBoundary = {
    createCheckout: async () => { called = true; throw new Error('must not execute'); },
    handleItn: async () => { throw new Error('must not execute'); },
  };
  const { server, baseUrl } = await start(boundary);
  try {
    const response = await fetch(`${baseUrl}/api/v1/internal/commercial/payfast/checkout/42`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
    assert.equal(called, false);
  } finally {
    await close(server);
  }
});

test('PayFast checkout route rejects browser-originated requests before assertion verification', async () => {
  let called = false;
  const boundary: PayfastHttpRouteBoundary = {
    createCheckout: async () => { called = true; throw new Error('must not execute'); },
    handleItn: async () => { throw new Error('must not execute'); },
  };
  const { server, baseUrl } = await start(boundary);
  try {
    const response = await fetch(`${baseUrl}/api/v1/internal/commercial/payfast/checkout/42`, {
      headers: { origin: 'https://connect.example' },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
    assert.equal(called, false);
  } finally {
    await close(server);
  }
});

test('PayFast ITN route passes normalized provider fields and source IP to the boundary', async () => {
  let received: { fields: Record<string, string>; sourceIp: string } | undefined;
  const boundary: PayfastHttpRouteBoundary = {
    createCheckout: async () => { throw new Error('must not execute'); },
    handleItn: async (fields, sourceIp) => { received = { fields, sourceIp }; },
  };
  const { server, baseUrl } = await start(boundary);
  try {
    const response = await fetch(`${baseUrl}/api/v1/commercial/payfast/itn`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'merchant_id=10000100&m_payment_id=42&amount=199.00&signature=abc',
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'OK');
    assert.deepEqual(received?.fields, {
      merchant_id: '10000100',
      m_payment_id: '42',
      amount: '199.00',
      signature: 'abc',
    });
    assert.equal(received?.sourceIp, '127.0.0.1');
  } finally {
    await close(server);
  }
});

test('PayFast ITN route maps provider-boundary rejection to INVALID without exposing internals', async () => {
  const boundary: PayfastHttpRouteBoundary = {
    createCheckout: async () => { throw new Error('must not execute'); },
    handleItn: async () => { throw new Error('Payfast signature invalid'); },
  };
  const { server, baseUrl } = await start(boundary);
  try {
    const response = await fetch(`${baseUrl}/api/v1/commercial/payfast/itn`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'merchant_id=10000100&m_payment_id=42',
    });
    assert.equal(response.status, 400);
    assert.equal(await response.text(), 'INVALID');
  } finally {
    await close(server);
  }
});

test('PayFast ITN route does not convert unexpected boundary failures into success', async () => {
  const boundary: PayfastHttpRouteBoundary = {
    createCheckout: async () => { throw new Error('must not execute'); },
    handleItn: async () => { throw new Error('database unavailable'); },
  };
  const { server, baseUrl } = await start(boundary);
  try {
    const response = await fetch(`${baseUrl}/api/v1/commercial/payfast/itn`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'merchant_id=10000100&m_payment_id=42',
    });
    assert.equal(response.status, 500);
    assert.equal(await response.text(), 'ERROR');
  } finally {
    await close(server);
  }
});
