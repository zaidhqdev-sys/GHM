import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://qualification:test@localhost:5432/ghm';
process.env.CORS_ORIGINS = 'http://localhost:3000';

import {
  createPasswordRecoveryService,
  type PasswordRecoveryDelivery,
} from './password-recovery';

const fakePersistence = (overrides: Record<string, unknown> = {}) =>
  ({
    lookupPasswordByEmail: async () => ({
      accountId: 42,
      loginEmail: 'user@example.com',
      loginEmailNormalized: 'user@example.com',
      passwordHash: 'hash',
      credentialStatus: 'active',
      argon2MemoryKib: 65536,
      argon2TimeCost: 3,
      argon2Parallelism: 1,
      accountStatus: 'active',
    }),
    issueRecovery: async () => ({
      recoveryTokenWire: 'opaque-recovery-token',
      credentialId: 9,
      expiresAt: new Date('2026-10-02T00:30:00.000Z'),
    }),
    ...overrides,
  }) as never;

test('password recovery passes the raw credential only to the delivery boundary', async () => {
  type Delivered = Parameters<PasswordRecoveryDelivery['deliver']>[0];
  let delivered: Delivered | undefined;
  const delivery: PasswordRecoveryDelivery = {
    deliver: async (input) => {
      delivered = input;
    },
  };

  await createPasswordRecoveryService(fakePersistence(), delivery).request('User@Example.com');

  assert.ok(delivered);
  assert.equal(delivered.accountId, 42);
  assert.equal(delivered.email, 'user@example.com');
  assert.equal(delivered.recoveryToken, 'opaque-recovery-token');
  assert.equal(delivered.expiresAt instanceof Date, true);
});

test('password recovery does not deliver for unknown accounts', async () => {
  let calls = 0;
  const delivery: PasswordRecoveryDelivery = {
    deliver: async () => {
      calls += 1;
    },
  };
  const persistence = fakePersistence({
    lookupPasswordByEmail: async () => null,
  });

  await createPasswordRecoveryService(persistence, delivery).request('missing@example.com');
  assert.equal(calls, 0);
});

test('password recovery does not report success when delivery fails', async () => {
  const delivery: PasswordRecoveryDelivery = {
    deliver: async () => {
      throw new Error('delivery unavailable');
    },
  };

  await assert.rejects(
    () => createPasswordRecoveryService(fakePersistence(), delivery).request('user@example.com'),
    /delivery unavailable/,
  );
});

test('password recovery HTTP boundary never returns the recovery credential', async () => {
  const { createApp } = await import('../http/app');
  const delivery: PasswordRecoveryDelivery = {
    deliver: async (input) => {
      assert.equal(input.recoveryToken, 'opaque-recovery-token');
    },
  };
  const passwordRecoveryService = createPasswordRecoveryService(fakePersistence(), delivery);

  const app = createApp({
    businessIdentityService: {} as never,
    projectService: {} as never,
    publicProjectService: {} as never,
    enquiryService: {} as never,
    campaignService: {} as never,
    passwordRecoveryService,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/password-recovery/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    assert.equal(response.status, 202);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body, { ok: true });
    assert.equal(JSON.stringify(body).includes('opaque-recovery-token'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('password recovery HTTP boundary rejects malformed requests', async () => {
  const { createApp } = await import('../http/app');
  const app = createApp({
    businessIdentityService: {} as never,
    projectService: {} as never,
    publicProjectService: {} as never,
    enquiryService: {} as never,
    campaignService: {} as never,
    passwordRecoveryService: createPasswordRecoveryService(fakePersistence(), {
      deliver: async () => undefined,
    }),
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/password-recovery/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 42 }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
