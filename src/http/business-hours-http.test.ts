import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import type { AuthContext } from '../auth/authorization';
import { config } from '../config';
import type { BusinessHours, BusinessHoursService } from '../resources/business-hours/contracts';

const tokenFor = (context: AuthContext): string =>
  jwt.sign({ userId: context.userId, role: context.role }, config.jwtSecret);

const hoursFixture = (overrides: Partial<BusinessHours> = {}): BusinessHours => ({
  id: 1,
  businessId: 265,
  dayOfWeek: 1,
  isClosed: false,
  openTime: '08:00:00',
  closeTime: '17:00:00',
  createdBy: 468,
  createdAt: new Date('2026-09-16T12:00:00.000Z'),
  updatedAt: new Date('2026-09-16T12:30:00.000Z'),
  ...overrides,
});

const stubHoursService = (overrides: Partial<BusinessHoursService> = {}): BusinessHoursService => ({
  getBusinessHours: async () => {
    throw new Error('must not be called');
  },
  getPublicBusinessHours: async () => {
    throw new Error('public hours must not be called');
  },
  replaceBusinessHours: async () => {
    throw new Error('replace must not be called');
  },
  ...overrides,
});

const startServer = async (businessHoursService: BusinessHoursService) => {
  const server = http.createServer(createApp({
    businessIdentityService: {} as never,
    businessHoursService,
    projectService: {} as never,
    publicProjectService: {} as never,
    enquiryService: {} as never,
    campaignService: {} as never,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('Business Hours GET requires authentication', async () => {
  const { server, baseUrl } = await startServer(stubHoursService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/265/hours`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Business Hours GET rejects invalid businessId', async () => {
  const { server, baseUrl } = await startServer(stubHoursService());
  try {
    const token = tokenFor({ userId: 468, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/businesses/not-an-id/hours`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Business Hours GET binds AuthContext and returns hours envelope', async () => {
  let received: { context: AuthContext; businessId: number } | undefined;
  const row = hoursFixture();
  const service = stubHoursService({
    getBusinessHours: async (context, businessId) => {
      received = { context, businessId };
      return [row];
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const token = tokenFor({ userId: 468, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/businesses/265/hours`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { context: { userId: 468, role: 'business' }, businessId: 265 });
    const body = await response.json() as {
      hours: Array<{
        id: number;
        businessId: number;
        dayOfWeek: number;
        isClosed: boolean;
        openTime: string | null;
        closeTime: string | null;
        createdBy: number | null;
        createdAt: string;
        updatedAt: string;
      }>;
    };
    assert.equal(body.hours.length, 1);
    assert.equal(body.hours[0].id, 1);
    assert.equal(body.hours[0].businessId, 265);
    assert.equal(body.hours[0].dayOfWeek, 1);
    assert.equal(body.hours[0].isClosed, false);
    assert.equal(body.hours[0].openTime, '08:00:00');
    assert.equal(body.hours[0].closeTime, '17:00:00');
    assert.equal(body.hours[0].createdBy, 468);
    assert.equal(body.hours[0].createdAt, '2026-09-16T12:00:00.000Z');
    assert.equal(body.hours[0].updatedAt, '2026-09-16T12:30:00.000Z');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Business Hours GET maps Business access required to forbidden', async () => {
  const service = stubHoursService({
    getBusinessHours: async () => {
      throw new Error('Business access required');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const token = tokenFor({ userId: 99, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/businesses/265/hours`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Business Hours GET for business 265 reaches service without verification gating at HTTP', async () => {
  let calledBusinessId: number | undefined;
  const service = stubHoursService({
    getBusinessHours: async (_context, businessId) => {
      calledBusinessId = businessId;
      // Domain managed read does not require verification_status=approved.
      // Returning empty schedule proves unverified businesses are still reachable.
      return [];
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const token = tokenFor({ userId: 468, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/businesses/265/hours`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.equal(calledBusinessId, 265);
    assert.deepEqual(await response.json(), { hours: [] });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
