import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import type { AuthContext } from '../auth/authorization';
import { config } from '../config';
import type {
  Opportunity,
  OpportunityPublicProjection,
  OpportunityService,
} from '../resources/opportunity/contracts';

const tokenFor = (context: AuthContext): string =>
  jwt.sign({ userId: context.userId, role: context.role }, config.jwtSecret);

const fullOpportunity = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  id: 901,
  opportunityTypeId: 1,
  creatorAccountId: 42,
  ownerBusinessId: 265,
  countryId: null,
  currencyId: null,
  title: 'Kitchen renovation',
  description: 'Need a kitchen renovation quote for a residential property.',
  lifecycleStatus: 'open',
  visibility: 'participants',
  budgetMin: 50000,
  budgetMax: 100000,
  opensAt: null,
  closesAt: null,
  createdAt: new Date('2026-09-20T12:00:00.000Z'),
  updatedAt: new Date('2026-09-20T12:30:00.000Z'),
  ...overrides,
});

const publicOpportunity = (
  overrides: Partial<OpportunityPublicProjection> = {},
): OpportunityPublicProjection => ({
  id: 902,
  opportunityTypeId: 1,
  countryId: null,
  currencyId: null,
  title: 'Public supply request',
  description: 'Authenticated/public safe Opportunity projection.',
  lifecycleStatus: 'open',
  visibility: 'authenticated',
  budgetMin: null,
  budgetMax: null,
  opensAt: null,
  closesAt: null,
  createdAt: new Date('2026-09-20T12:00:00.000Z'),
  ...overrides,
});

const stubOpportunityService = (overrides: Partial<OpportunityService> = {}): OpportunityService => ({
  createOpportunity: async () => {
    throw new Error('create must not be called');
  },
  getOpportunity: async () => {
    throw new Error('getOpportunity must not be called');
  },
  getOwnedOpportunity: async () => {
    throw new Error('getOwnedOpportunity must not be called');
  },
  updateOwnedOpportunity: async () => {
    throw new Error('updateOwnedOpportunity must not be called');
  },
  transitionOpportunity: async () => {
    throw new Error('transitionOpportunity must not be called');
  },
  ...overrides,
});

const startServer = async (opportunityService: OpportunityService) => {
  const server = http.createServer(createApp({
    businessIdentityService: {} as never,
    businessHoursService: {} as never,
    projectService: {} as never,
    publicProjectService: {} as never,
    enquiryService: {} as never,
    campaignService: {} as never,
    opportunityService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('Opportunity GET requires authentication', async () => {
  const { server, baseUrl } = await startServer(stubOpportunityService());
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities/901`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity GET rejects invalid opportunityId values', async () => {
  const { server, baseUrl } = await startServer(stubOpportunityService());
  try {
    const token = tokenFor({ userId: 468, role: 'business' });
    for (const id of ['0', '-1', '1.5', 'abc', 'not-an-id']) {
      const response = await fetch(`${baseUrl}/api/v1/opportunities/${id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 400, `expected 400 for opportunityId=${id}`);
      assert.deepEqual(await response.json(), { error: 'invalid_request' });
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity GET uses registered opportunity/read and delegates exact context and id', async () => {
  let received: { context: AuthContext; opportunityId: number } | undefined;
  const opportunity = fullOpportunity();
  const service = stubOpportunityService({
    getOpportunity: async (context, opportunityId) => {
      received = { context, opportunityId };
      return opportunity;
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities/901`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { context: { userId: 468, role: 'business' }, opportunityId: 901 });
    const body = await response.json() as {
      opportunity: Opportunity;
      accessToken?: unknown;
      refreshToken?: unknown;
    };
    assert.equal(body.opportunity.id, 901);
    assert.equal(body.opportunity.ownerBusinessId, 265);
    assert.equal(body.opportunity.creatorAccountId, 42);
    assert.equal(body.opportunity.visibility, 'participants');
    assert.equal(body.accessToken, undefined);
    assert.equal(body.refreshToken, undefined);
    assert.equal(JSON.stringify(body).includes('accessToken'), false);
    assert.equal(JSON.stringify(body).includes('refreshToken'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity GET preserves Enquiry-style participants visibility full projection for business owner', async () => {
  const opportunity = fullOpportunity({
    visibility: 'participants',
    ownerBusinessId: 265,
    creatorAccountId: 99,
  });
  const service = stubOpportunityService({
    getOpportunity: async (context) => {
      assert.deepEqual(context, { userId: 468, role: 'business' });
      return opportunity;
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities/901`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { opportunity: Opportunity };
    assert.equal(body.opportunity.visibility, 'participants');
    assert.equal(body.opportunity.ownerBusinessId, 265);
    assert.equal(body.opportunity.creatorAccountId, 99);
    assert.ok('updatedAt' in body.opportunity);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity GET returns public-safe projection envelope unchanged', async () => {
  const projection = publicOpportunity();
  const service = stubOpportunityService({
    getOpportunity: async () => projection,
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities/902`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 50, role: 'customer' })}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { opportunity: OpportunityPublicProjection };
    assert.equal(body.opportunity.id, 902);
    assert.equal(body.opportunity.visibility, 'authenticated');
    assert.equal('creatorAccountId' in body.opportunity, false);
    assert.equal('ownerBusinessId' in body.opportunity, false);
    assert.equal('updatedAt' in body.opportunity, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity GET maps domain null to not_found', async () => {
  const service = stubOpportunityService({
    getOpportunity: async () => null,
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities/901`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity GET maps domain errors through existing error handling', async () => {
  const service = stubOpportunityService({
    getOpportunity: async () => {
      throw new Error('opportunityId must be a positive integer');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities/901`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity GET does not inspect JWT claims beyond requireAuth AuthContext', async () => {
  let receivedContext: AuthContext | undefined;
  const service = stubOpportunityService({
    getOpportunity: async (context) => {
      receivedContext = context;
      return fullOpportunity();
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    // Token may carry extra claims; route must only forward AuthContext from requireAuth.
    const token = jwt.sign(
      { userId: 468, role: 'business', accessToken: 'leak', refreshToken: 'leak', session: 'leak' },
      config.jwtSecret,
    );
    const response = await fetch(`${baseUrl}/api/v1/opportunities/901`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 468, role: 'business' });
    const text = await response.text();
    assert.equal(text.includes('accessToken'), false);
    assert.equal(text.includes('refreshToken'), false);
    assert.equal(text.includes('"session"'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
