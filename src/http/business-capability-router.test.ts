import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { config } from '../config';
import type { AuthContext } from '../auth/authorization';
import type { BusinessCapability, BusinessCapabilityService } from '../resources/business-capability/contracts';

const startServer = async (service: BusinessCapabilityService) => {
  const server = http.createServer(createApp({ businessCapabilityService: service }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const tokenFor = (context: AuthContext) =>
  jwt.sign({ userId: context.userId, role: context.role }, config.jwtSecret);

const fixture = (context: AuthContext): BusinessCapability => ({
  id: 101,
  businessId: 55,
  capabilityId: '550e8400-e29b-41d4-a716-446655440000',
  proficiencyLevel: 'proficient',
  description: 'Electrical installation',
  assertionStatus: 'active',
  assertionBasis: 'self_declared',
  verificationStatus: 'unverified',
  effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
  effectiveUntil: null,
  sourceReference: null,
  submittedAt: new Date('2026-09-01T00:00:00.000Z'),
  verifiedBy: null,
  verifiedAt: null,
  verificationReason: null,
  createdBy: context.userId,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
});

test('business capability list requires authentication', async () => {
  const service = { listBusinessCapabilities: async () => { throw new Error('must not be called'); } } as unknown as BusinessCapabilityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-capabilities?businessId=55`);
    assert.equal(response.status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('business capability list validates businessId before service execution', async () => {
  let called = false;
  const service = { listBusinessCapabilities: async () => { called = true; return []; } } as unknown as BusinessCapabilityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-capabilities?businessId=0`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('business capability list binds authenticated context and businessId', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedBusinessId: number | undefined;
  const service = {
    listBusinessCapabilities: async (context: AuthContext, businessId: number) => {
      receivedContext = context; receivedBusinessId = businessId; return [fixture(context)];
    },
  } as unknown as BusinessCapabilityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-capabilities?businessId=55`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.equal(receivedBusinessId, 55);
    const body = await response.json() as { capabilities: BusinessCapability[] };
    assert.equal(body.capabilities[0].businessId, 55);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('business capability get rejects invalid ids before service execution', async () => {
  let called = false;
  const service = { getBusinessCapability: async () => { called = true; return null; } } as unknown as BusinessCapabilityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-capabilities/nope`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('business capability get returns not found without disclosure', async () => {
  const service = { getBusinessCapability: async () => null } as unknown as BusinessCapabilityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-capabilities/101`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('business capability create rejects server-owned fields', async () => {
  let called = false;
  const service = { createBusinessCapability: async () => { called = true; return {} as BusinessCapability; } } as unknown as BusinessCapabilityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-capabilities`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 55, capabilityId: '550e8400-e29b-41d4-a716-446655440000', id: 99, createdBy: 99 }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('business capability create binds authenticated context and canonical input', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const service = {
    createBusinessCapability: async (context: AuthContext, input: unknown) => {
      receivedContext = context; receivedInput = input; return fixture(context);
    },
  } as unknown as BusinessCapabilityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-capabilities`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        businessId: 55,
        capabilityId: '550e8400-e29b-41d4-a716-446655440000',
        proficiencyLevel: 'advanced',
        description: 'Electrical installation',
        effectiveFrom: '2026-09-01T00:00:00.000Z',
      }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(receivedInput, {
      businessId: 55,
      capabilityId: '550e8400-e29b-41d4-a716-446655440000',
      proficiencyLevel: 'advanced',
      description: 'Electrical installation',
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('business capability create rejects malformed canonical input', async () => {
  let called = false;
  const service = { createBusinessCapability: async () => { called = true; return {} as BusinessCapability; } } as unknown as BusinessCapabilityService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-capabilities`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 55, capabilityId: 'not-a-uuid', verificationStatus: 'verified' }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
