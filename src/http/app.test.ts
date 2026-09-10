import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { AuthContext } from '../auth/authorization';
import { config } from '../config';
import { AccountIdentity, BusinessIdentityService } from '../resources/business-identity/contracts';

const profile = (context: AuthContext): AccountIdentity => ({
  id: context.userId,
  fullName: 'HTTP Qualification User',
  phone: null,
  avatarRef: null,
  role: context.role,
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
});

const startTestServer = async (service: BusinessIdentityService) => {
  const server = http.createServer(createApp({ businessIdentityService: service }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('protected profile route rejects missing authentication', async () => {
  const service = { getOwnProfile: async () => { throw new Error('must not be called'); } } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/profile`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('protected profile route authenticates and binds the JWT context to the service call', async () => {
  let receivedContext: AuthContext | undefined;
  const service = {
    getOwnProfile: async (context: AuthContext) => {
      receivedContext = context;
      return profile(context);
    },
  } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = jwt.sign({ userId: 42, role: 'business' }, config.jwtSecret);
    const response = await fetch(`${baseUrl}/api/v1/profile`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    const body = await response.json() as { profile: AccountIdentity };
    assert.equal(body.profile.id, 42);
    assert.equal(body.profile.role, 'business');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('protected profile route rejects an invalid JWT', async () => {
  const service = { getOwnProfile: async () => { throw new Error('must not be called'); } } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/profile`, {
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
