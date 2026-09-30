import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { AuthContext } from '../auth/authorization';
import { config } from '../config';
import type { TrustScore, TrustScoreService } from '../resources/trust-score/contracts';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';

const startServer = async (trustScoreService: TrustScoreService) => {
  const server = http.createServer(createApp({
    businessIdentityService: {} as BusinessIdentityService,
    trustScoreService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const fixture = (businessId = 20): TrustScore => ({
  id: 1,
  businessId,
  profileComplete: 100,
  phoneVerified: 1,
  emailVerified: 1,
  idVerified: 1,
  cipcVerified: 1,
  vatVerified: 0,
  insuranceVerified: 0,
  reviewsScore: 12,
  completedProjects: 2,
  totalScore: 78,
  trustLevel: 'gold',
  lastUpdated: new Date('2026-09-18T00:00:00.000Z'),
  createdAt: new Date('2026-09-18T00:00:00.000Z'),
  updatedAt: new Date('2026-09-18T00:00:00.000Z'),
});

const tokenFor = (context: AuthContext) =>
  jwt.sign({ userId: context.userId, role: context.role }, config.jwtSecret);

test('public trust score read does not require authentication', async () => {
  let receivedBusinessId: number | undefined;
  const service = {
    getPublicTrustScore: async (businessId: number) => {
      receivedBusinessId = businessId;
      return fixture(businessId);
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/trust-scores/20`);
    assert.equal(response.status, 200);
    assert.equal(receivedBusinessId, 20);
    const body = await response.json() as { trustScore: TrustScore };
    assert.equal(body.trustScore.businessId, 20);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('public trust score read rejects invalid business ids before service execution', async () => {
  let called = false;
  const service = {
    getPublicTrustScore: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/trust-scores/not-an-id`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('public trust score read maps missing score to not found', async () => {
  const service = {
    getPublicTrustScore: async () => null,
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/trust-scores/20`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('public trust score list validates trust level and remains unauthenticated', async () => {
  let receivedLevel: unknown;
  const service = {
    listPublicByTrustLevel: async (trustLevel: string) => {
      receivedLevel = trustLevel;
      return [fixture()];
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/trust-scores?trustLevel=gold`);
    assert.equal(response.status, 200);
    assert.equal(receivedLevel, 'gold');
    const body = await response.json() as { trustScores: TrustScore[] };
    assert.equal(body.trustScores.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('public trust score list rejects invalid trust level before service execution', async () => {
  let called = false;
  const service = {
    listPublicByTrustLevel: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/trust-scores?trustLevel=diamond`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('authenticated trust score read requires authentication', async () => {
  const service = {
    getTrustScore: async () => {
      throw new Error('must not be called');
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/trust-scores/20`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('authenticated trust score read binds authenticated context', async () => {
  let received: { context: AuthContext; businessId: number } | undefined;
  const service = {
    getTrustScore: async (context: AuthContext, businessId: number) => {
      received = { context, businessId };
      return fixture(businessId);
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/trust-scores/20`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      context: { userId: 42, role: 'business' },
      businessId: 20,
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('authenticated trust score list binds context and trust level', async () => {
  let received: { context: AuthContext; trustLevel: string } | undefined;
  const service = {
    listByTrustLevel: async (context: AuthContext, trustLevel: string) => {
      received = { context, trustLevel };
      return [fixture()];
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/trust-scores?trustLevel=platinum`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      context: { userId: 42, role: 'business' },
      trustLevel: 'platinum',
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('authenticated trust score list rejects invalid trust level', async () => {
  let called = false;
  const service = {
    listByTrustLevel: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/trust-scores?trustLevel=diamond`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('trust score calculate route binds authenticated context and business id', async () => {
  let received: { context: AuthContext; businessId: number } | undefined;
  const service = {
    calculateTrustScore: async (context: AuthContext, businessId: number) => {
      received = { context, businessId };
      return fixture(businessId);
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/trust-scores/20/calculate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      context: { userId: 42, role: 'business' },
      businessId: 20,
    });
    const body = await response.json() as { trustScore: TrustScore };
    assert.equal(body.trustScore.totalScore, 78);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('trust score calculate route rejects unauthenticated requests', async () => {
  const service = {
    calculateTrustScore: async () => {
      throw new Error('must not be called');
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/trust-scores/20/calculate`, {
      method: 'POST',
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('trust score calculate route rejects invalid business ids before service execution', async () => {
  let called = false;
  const service = {
    calculateTrustScore: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as TrustScoreService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/trust-scores/0/calculate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
