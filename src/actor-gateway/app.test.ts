import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createAccessJwtVerifier } from '../auth/foundation/access-jwt-verifier';
import { ACCESS_JWT_AUD, ACCESS_JWT_ISS } from '../auth/foundation/access-jwt-verifier';
import { createActorGatewayApp } from './app';
import type { ActorIdentity, ActorIdentityReader } from './actor-identity-reader';
import type { BusinessRegistrationIdentityReader } from './business-registration-identity-reader';
import type { BusinessProfileReader } from './business-profile-reader';

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
  businessRegistrationIdentityReader?: BusinessRegistrationIdentityReader,
  businessProfileReader?: BusinessProfileReader,
): Promise<void> => {
  const server = http.createServer(createActorGatewayApp({
    verifier,
    actorIdentityReader: reader,
    businessRegistrationIdentityReader,
    businessProfileReader,
  }));
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


test('actor gateway registration identity read derives account ID from token and business ID from typed path', async () => {
  const received: Array<{ accountId: number; businessId: number }> = [];
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity(accountId: number, businessId: number) {
      received.push({ accountId, businessId });
      return {
        businessId,
        registrationStatus: 'registered',
        registrationNumber: 'REG-123',
        legalName: 'Example Legal Entity',
        updatedAt: new Date('2026-11-10T20:00:00.000Z'),
      };
    },
    async updateRegistrationIdentity() { throw new Error('not used in read test'); },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity?accountId=999`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      registrationIdentity: {
        businessId: 77,
        registrationStatus: 'registered',
        registrationNumber: 'REG-123',
        legalName: 'Example Legal Entity',
        updatedAt: '2026-11-10T20:00:00.000Z',
      },
    });
  }, businessReader);
  assert.deepEqual(received, [{ accountId: 42, businessId: 77 }]);
});

test('actor gateway registration identity read rejects invalid business IDs before database access', async () => {
  let calls = 0;
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity() {
      calls += 1;
      return {
        businessId: 1,
        registrationStatus: null,
        registrationNumber: null,
        legalName: null,
        updatedAt: null,
      };
    },
    async updateRegistrationIdentity() { throw new Error('not used in read test'); },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/0/registration-identity`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  }, businessReader);
  assert.equal(calls, 0);
});

test('actor gateway hides registration identity membership denials as not found', async () => {
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity() {
      throw Object.assign(new Error('Business management permission required'), { code: '42501' });
    },
    async updateRegistrationIdentity() { throw new Error('not used in read test'); },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  }, businessReader);
});


test('actor gateway registration identity write binds actor to verified token and validates the typed payload', async () => {
  const received: Array<{ accountId: number; input: { businessId: number; registrationStatus: 'registered' | 'unregistered' | null; registrationNumber: string | null; legalName: string | null } }> = [];
  const identityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity(accountId: number, businessId: number) {
      return { businessId, registrationStatus: null, registrationNumber: null, legalName: null, updatedAt: null };
    },
    async updateRegistrationIdentity(accountId, input) {
      received.push({ accountId, input });
      return {
        businessId: input.businessId,
        registrationStatus: input.registrationStatus,
        registrationNumber: input.registrationNumber,
        legalName: input.legalName,
        updatedAt: new Date('2026-11-10T20:00:00.000Z'),
      };
    },
  };
  await withServer(identityReader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity?accountId=999`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        registrationStatus: 'registered',
        registrationNumber: 'REG-77',
        legalName: 'Example Legal Entity',
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      registrationIdentity: {
        businessId: 77,
        registrationStatus: 'registered',
        registrationNumber: 'REG-77',
        legalName: 'Example Legal Entity',
        updatedAt: '2026-11-10T20:00:00.000Z',
      },
    });
  }, businessReader);
  assert.deepEqual(received, [{
    accountId: 42,
    input: {
      businessId: 77,
      registrationStatus: 'registered',
      registrationNumber: 'REG-77',
      legalName: 'Example Legal Entity',
    },
  }]);
});

test('actor gateway registration identity write rejects malformed payloads before database access', async () => {
  let calls = 0;
  const identityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity() {
      return { businessId: 1, registrationStatus: null, registrationNumber: null, legalName: null, updatedAt: null };
    },
    async updateRegistrationIdentity() {
      calls += 1;
      throw new Error('must not be called');
    },
  };
  await withServer(identityReader, async (baseUrl) => {
    for (const body of [
      { registrationStatus: 'registered', registrationNumber: 'REG-1' },
      { registrationStatus: 'approved', registrationNumber: null, legalName: null },
      { registrationStatus: 'unregistered', registrationNumber: 'REG-1', legalName: null },
      { registrationStatus: null, registrationNumber: null, legalName: null, accountId: 999 },
    ]) {
      const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
  }, businessReader);
  assert.equal(calls, 0);
});

test('actor gateway registration identity write hides membership denial as not found', async () => {
  const identityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity() {
      return { businessId: 1, registrationStatus: null, registrationNumber: null, legalName: null, updatedAt: null };
    },
    async updateRegistrationIdentity() {
      throw Object.assign(new Error('Business management permission required'), { code: '42501' });
    },
  };
  await withServer(identityReader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ registrationStatus: null, registrationNumber: null, legalName: null }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  }, businessReader);
});


test('Business profile gateway derives actor from verified token subject', async () => {
  const calls: Array<{ accountId: number; businessId: number; patch: Record<string, unknown> }> = [];
  const reader: BusinessProfileReader = {
    async updateBusinessProfile(accountId, businessId, patch) {
      calls.push({ accountId, businessId, patch });
      return { businessId };
    },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/73/profile`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated name', physicalAddress: 'Durban', accountId: 999 }),
    });
    assert.equal(response.status, 400);
    const valid = await fetch(`${baseUrl}/v1/businesses/73/profile`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated name', physicalAddress: 'Durban' }),
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { businessProfile: { businessId: 73 } });
  }, undefined, reader);
  assert.deepEqual(calls, [{ accountId: 42, businessId: 73, patch: { name: 'Updated name', physicalAddress: 'Durban' } }]);
});

test('Business profile gateway rejects missing bearer token before database access', async () => {
  let calls = 0;
  const reader: BusinessProfileReader = {
    async updateBusinessProfile(_accountId, businessId) {
      calls += 1;
      return { businessId };
    },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: null };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/73/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated name' }),
    });
    assert.equal(response.status, 401);
  }, undefined, reader);
  assert.equal(calls, 0);
});
