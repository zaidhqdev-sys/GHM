import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { AuthContext } from '../auth/authorization';
import type {
  BusinessRegistrationIdentity,
  BusinessRegistrationIdentityService,
  UpdateBusinessRegistrationIdentityInput,
} from '../resources/business-registration-identity/contracts';

const startServer = async (service: BusinessRegistrationIdentityService) => {
  const server = http.createServer(createApp({
    resourceAuthMiddleware: httpTestAuth,
    businessRegistrationIdentityService: service,
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const identity: BusinessRegistrationIdentity = {
  businessId: 55,
  registrationStatus: 'registered',
  registrationNumber: '2020/123456/07',
  legalName: 'Example (Pty) Ltd',
  updatedAt: new Date('2026-10-19T12:00:00.000Z'),
};

test('registration identity read requires authentication', async () => {
  const service = { getRegistrationIdentity: async () => { throw new Error('must not be called'); } } as unknown as BusinessRegistrationIdentityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/registration-identity`);
    assert.equal(response.status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('registration identity read rejects non-canonical IDs before service execution', async () => {
  let called = false;
  const service = { getRegistrationIdentity: async () => { called = true; return identity; } } as unknown as BusinessRegistrationIdentityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/055/registration-identity`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('registration identity read binds authenticated context and returns the private projection', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedBusinessId: number | undefined;
  const service = {
    getRegistrationIdentity: async (context: AuthContext, businessId: number) => {
      receivedContext = context;
      receivedBusinessId = businessId;
      return identity;
    },
  } as unknown as BusinessRegistrationIdentityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/registration-identity`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.equal(receivedBusinessId, 55);
    assert.deepEqual(await response.json(), { registrationIdentity: { ...identity, updatedAt: identity.updatedAt?.toISOString() } });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('registration identity update rejects unknown fields and incomplete body', async () => {
  let called = false;
  const service = { updateRegistrationIdentity: async () => { called = true; return identity; } } as unknown as BusinessRegistrationIdentityService;
  const { server, baseUrl } = await startServer(service);
  try {
    for (const body of [
      { registrationStatus: 'registered', registrationNumber: '123', legalName: 'Example Pty Ltd', businessId: 999 },
      { registrationStatus: 'registered', registrationNumber: '123' },
      { registrationStatus: 'approved', registrationNumber: null, legalName: null },
    ]) {
      const response = await fetch(`${baseUrl}/api/v1/businesses/55/registration-identity`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('registration identity update binds only the canonical complete declaration', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: UpdateBusinessRegistrationIdentityInput | undefined;
  const service = {
    updateRegistrationIdentity: async (context: AuthContext, input: UpdateBusinessRegistrationIdentityInput) => {
      receivedContext = context;
      receivedInput = input;
      return identity;
    },
  } as unknown as BusinessRegistrationIdentityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/registration-identity`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        registrationStatus: 'registered',
        registrationNumber: '2020/123456/07',
        legalName: 'Example (Pty) Ltd',
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(receivedInput, {
      businessId: 55,
      registrationStatus: 'registered',
      registrationNumber: '2020/123456/07',
      legalName: 'Example (Pty) Ltd',
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
