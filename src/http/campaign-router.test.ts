import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { AuthContext } from '../auth/authorization';
import { config } from '../config';
import type { Campaign, CampaignService, CreateCampaignInput, UpdateCampaignInput } from '../resources/campaign/contracts';

const campaignFixture = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: 101,
  businessId: 20,
  createdByAccountId: 42,
  title: 'Launch',
  status: 'draft',
  createdAt: new Date('2026-09-18T12:00:00.000Z'),
  updatedAt: new Date('2026-09-18T12:30:00.000Z'),
  ...overrides,
});

const startServer = async (campaignService: CampaignService) => {
  const server = http.createServer(createApp({
    businessIdentityService: {} as never,
    projectService: {} as never,
    publicProjectService: {} as never,
    enquiryService: {} as never,
    campaignService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const tokenFor = (context: AuthContext): string =>
  jwt.sign({ userId: context.userId, role: context.role }, config.jwtSecret);

const stubService = (overrides: Partial<CampaignService> = {}): CampaignService => ({
  createCampaign: async () => { throw new Error('must not be called'); },
  getCampaign: async () => { throw new Error('must not be called'); },
  listCampaigns: async () => { throw new Error('must not be called'); },
  updateCampaign: async () => { throw new Error('must not be called'); },
  ...overrides,
});

test('Campaign GET requires authentication', async () => {
  const { server, baseUrl } = await startServer(stubService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/101`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign GET returns campaign envelope with ISO dates', async () => {
  const campaign = campaignFixture();
  let receivedContext: AuthContext | undefined;
  let receivedId: number | undefined;
  const service = stubService({
    getCampaign: async (context, campaignId) => {
      receivedContext = context;
      receivedId = campaignId;
      return campaign;
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/101`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.equal(receivedId, 101);
    assert.deepEqual(await response.json(), {
      campaign: {
        ...campaign,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
      },
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign GET returns not_found when service returns null', async () => {
  const service = stubService({
    getCampaign: async () => null,
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/101`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign GET rejects invalid campaignId', async () => {
  const { server, baseUrl } = await startServer(stubService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/0`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign LIST requires authentication', async () => {
  const { server, baseUrl } = await startServer(stubService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?businessId=20`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign LIST returns campaigns envelope for businessId query', async () => {
  const campaigns = [
    campaignFixture({ id: 2, title: 'Newer' }),
    campaignFixture({ id: 1, title: 'Older' }),
  ];
  let receivedContext: AuthContext | undefined;
  let receivedBusinessId: number | undefined;
  const service = stubService({
    listCampaigns: async (context, businessId) => {
      receivedContext = context;
      receivedBusinessId = businessId;
      return campaigns;
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?businessId=20`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.equal(receivedBusinessId, 20);
    assert.deepEqual(await response.json(), {
      campaigns: campaigns.map((campaign) => ({
        ...campaign,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
      })),
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign LIST rejects missing businessId', async () => {
  const { server, baseUrl } = await startServer(stubService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign LIST rejects invalid businessId', async () => {
  const { server, baseUrl } = await startServer(stubService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?businessId=abc`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign CREATE requires authentication', async () => {
  const { server, baseUrl } = await startServer(stubService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ businessId: 20, title: 'Launch' }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign CREATE returns 201 campaign envelope and binds AuthContext creator provenance', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: CreateCampaignInput | undefined;
  const service = stubService({
    createCampaign: async (context, input) => {
      receivedContext = context;
      receivedInput = input;
      return campaignFixture({
        createdByAccountId: context.userId,
        businessId: input.businessId,
        title: input.title,
      });
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 20, title: 'Launch' }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(receivedInput, { businessId: 20, title: 'Launch' });
    const body = await response.json() as { campaign: Campaign };
    assert.equal(body.campaign.createdByAccountId, 42);
    assert.equal(typeof body.campaign.createdAt, 'string');
    assert.equal(body.campaign.createdAt, '2026-09-18T12:00:00.000Z');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign CREATE rejects caller-supplied createdByAccountId', async () => {
  let called = false;
  const service = stubService({
    createCampaign: async () => {
      called = true;
      return campaignFixture();
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 20, title: 'Launch', createdByAccountId: 999 }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign CREATE validation failure for missing title', async () => {
  const { server, baseUrl } = await startServer(stubService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 20 }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign CREATE maps business management denial to forbidden', async () => {
  const service = stubService({
    createCampaign: async () => {
      throw new Error('Business management permission required');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 20, title: 'Launch' }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign UPDATE returns 200 campaign envelope', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedId: number | undefined;
  let receivedInput: UpdateCampaignInput | undefined;
  const updated = campaignFixture({ title: 'Next', status: 'active' });
  const service = stubService({
    updateCampaign: async (context, campaignId, input) => {
      receivedContext = context;
      receivedId = campaignId;
      receivedInput = input;
      return updated;
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/101`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Next', status: 'active' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.equal(receivedId, 101);
    assert.deepEqual(receivedInput, { title: 'Next', status: 'active' });
    assert.deepEqual(await response.json(), {
      campaign: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign UPDATE maps lifecycle rejection to conflict', async () => {
  const service = stubService({
    updateCampaign: async () => {
      throw new Error('Invalid campaign status transition: archived -> active');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/101`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'conflict' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign UPDATE returns not_found for missing or unauthorized campaign', async () => {
  const service = stubService({
    updateCampaign: async () => {
      throw new Error('Campaign not found or management permission required');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/101`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Next' }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign UPDATE requires authentication', async () => {
  const { server, baseUrl } = await startServer(stubService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/101`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Next' }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Campaign DELETE is not exposed', async () => {
  const { server, baseUrl } = await startServer(stubService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/101`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
