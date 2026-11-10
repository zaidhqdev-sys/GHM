import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createAccessJwtVerifier } from '../auth/foundation/access-jwt-verifier';
import { ACCESS_JWT_AUD, ACCESS_JWT_ISS } from '../auth/foundation/access-jwt-verifier';
import { createActorGatewayApp } from './app';
import type { ActorIdentity, ActorIdentityReader } from './actor-identity-reader';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const kid = 'ghm-actor-gateway-test-1';
const verifier = createAccessJwtVerifier(new Map([[kid, publicKeyPem]]));

const sign = (accountId: number, overrides: Record<string, unknown> = {}): string => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: String(accountId),
      iss: ACCESS_JWT_ISS,
      aud: ACCESS_JWT_AUD,
      iat: now,
      exp: now + 900,
      ...overrides,
    },
    privateKeyPem,
    { algorithm: 'ES256', keyid: kid },
  );
};

const withServer = async (
  reader: ActorIdentityReader,
  work: (baseUrl: string) => Promise<void>,
): Promise<void> => {
  const server = http.createServer(createActorGatewayApp({ verifier, actorIdentityReader: reader }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Actor gateway test server did not start');
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

test('actor gateway health endpoint is process-only and does not query actor identity', async () => {
  let calls = 0;
  const reader: ActorIdentityReader = {
    async readOwnIdentity(): Promise<ActorIdentity> {
      calls += 1;
      throw new Error('must not be called');
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
  assert.equal(calls, 0);
});

test('actor gateway rejects missing and invalid bearer tokens before database access', async () => {
  let calls = 0;
  const reader: ActorIdentityReader = {
    async readOwnIdentity(): Promise<ActorIdentity> {
      calls += 1;
      return { accountId: 42, role: 'business', fullName: 'Test Actor' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/v1/actor/me`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: 'unauthorized' });

    const invalid = await fetch(`${baseUrl}/v1/actor/me`, {
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    assert.equal(invalid.status, 401);
    assert.deepEqual(await invalid.json(), { error: 'unauthorized' });
  });
  assert.equal(calls, 0);
});

test('actor gateway derives actor identity from verified token sub, not request input', async () => {
  const received: number[] = [];
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      received.push(accountId);
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/actor/me?accountId=999`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      actor: { accountId: 42, role: 'business', fullName: 'Verified Actor' },
    });
  });
  assert.deepEqual(received, [42]);
});

test('actor gateway rejects database-denied or disabled actors without leaking SQL errors', async () => {
  const reader: ActorIdentityReader = {
    async readOwnIdentity(): Promise<ActorIdentity> {
      throw Object.assign(new Error('sensitive SQL detail must not be returned'), { code: '42501' });
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/actor/me`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  });
});

test('actor gateway fails closed when the database is unavailable', async () => {
  const reader: ActorIdentityReader = {
    async readOwnIdentity(): Promise<ActorIdentity> {
      throw Object.assign(new Error('database connection string must not leak'), { code: '08006' });
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/actor/me`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'service_unavailable' });
  });
});
