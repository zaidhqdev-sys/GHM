import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app.js';
import { httpTestAuth, tokenFor } from './test-resource-auth.js';
import type { AuthContext } from '../auth/authorization.js';
import type { BusinessOffering, BusinessOfferingService } from '../resources/business-offering/contracts.js';

const offering = (overrides: Partial<BusinessOffering> = {}): BusinessOffering => ({
  id: '11111111-1111-4111-8111-111111111111',
  businessId: 7,
  offeringType: 'service',
  name: 'Web Development',
  slug: 'web-development',
  description: 'A governed offering.',
  priceAmount: '1500.00',
  currencyCode: 'ZAR',
  priceUnit: 'project',
  isActive: true,
  sortOrder: 0,
  createdBy: 21,
  createdAt: new Date('2026-10-03T00:00:00.000Z'),
  updatedAt: new Date('2026-10-03T00:00:00.000Z'),
  ...overrides,
});

const service = (overrides: Partial<BusinessOfferingService> = {}): BusinessOfferingService => ({
  listBusinessOfferings: async () => [offering()],
  getBusinessOfferingBySlug: async () => offering(),
  createBusinessOffering: async () => offering(),
  updateBusinessOffering: async () => offering(),
  listPublicBusinessOfferings: async () => [offering()],
  ...overrides,
});

const start = async (businessOfferingService: BusinessOfferingService) => {
  const app = createApp({ resourceAuthMiddleware: httpTestAuth, businessOfferingService });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const close = (server: http.Server) => new Promise<void>(resolve => server.close(() => resolve()));
const auth = (context: AuthContext) => ({ Authorization: `Bearer ${tokenFor(context)}` });

test('public Business Offering list is anonymous and returns active offerings', async () => {
  let seen: number | undefined;
  const { server, baseUrl } = await start(service({
    listPublicBusinessOfferings: async businessId => { seen = businessId; return [offering()]; },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses/7/offerings`);
    assert.equal(response.status, 200);
    assert.equal(seen, 7);
    assert.equal((await response.json() as { offerings: BusinessOffering[] }).offerings[0].slug, 'web-development');
  } finally { await close(server); }
});

test('public Business Offering list rejects invalid business id', async () => {
  let called = false;
  const { server, baseUrl } = await start(service({
    listPublicBusinessOfferings: async () => { called = true; return []; },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses/0/offerings`);
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await close(server); }
});

test('private Business Offering list requires business or admin role', async () => {
  const { server, baseUrl } = await start(service(),);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/7/offerings`, { headers: auth({ userId: 21, role: 'customer' }) });
    assert.equal(response.status, 403);
  } finally { await close(server); }
});

test('private Business Offering list binds context, business id and activeOnly', async () => {
  let seen: { context: AuthContext; businessId: number; activeOnly?: boolean } | undefined;
  const { server, baseUrl } = await start(service({
    listBusinessOfferings: async (context, input) => { seen = { context, ...input }; return [offering()]; },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/7/offerings?activeOnly=false`, { headers: auth({ userId: 21, role: 'business' }) });
    assert.equal(response.status, 200);
    assert.deepEqual(seen, { context: { userId: 21, role: 'business' }, businessId: 7, activeOnly: false });
  } finally { await close(server); }
});

test('Business Offering slug lookup returns not_found when canonical service returns null', async () => {
  const { server, baseUrl } = await start(service({ getBusinessOfferingBySlug: async () => null }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/7/offerings/missing`, { headers: auth({ userId: 21, role: 'business' }) });
    assert.equal(response.status, 404);
  } finally { await close(server); }
});

test('Business Offering creation rejects server-owned fields', async () => {
  const { server, baseUrl } = await start(service());
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-offerings`, {
      method: 'POST',
      headers: { ...auth({ userId: 21, role: 'business' }), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...offering(), businessId: 7 }),
    });
    assert.equal(response.status, 400);
  } finally { await close(server); }
});

test('Business Offering creation passes canonical input', async () => {
  let seen: unknown;
  const { server, baseUrl } = await start(service({
    createBusinessOffering: async (_context, input) => { seen = input; return offering(); },
  }));
  try {
    const input = { businessId: 7, name: 'Web Development', slug: 'web-development', priceAmount: '1500.00' };
    const response = await fetch(`${baseUrl}/api/v1/business-offerings`, {
      method: 'POST',
      headers: { ...auth({ userId: 21, role: 'business' }), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(seen, input);
  } finally { await close(server); }
});

test('Business Offering update rejects unsupported fields', async () => {
  const { server, baseUrl } = await start(service());
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-offerings/11111111-1111-4111-8111-111111111111`, {
      method: 'PATCH',
      headers: { ...auth({ userId: 21, role: 'business' }), 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: 7 }),
    });
    assert.equal(response.status, 400);
  } finally { await close(server); }
});

test('Business Offering update passes canonical editable fields', async () => {
  let seen: unknown;
  const { server, baseUrl } = await start(service({
    updateBusinessOffering: async (_context, id, input) => { assert.equal(id, '11111111-1111-4111-8111-111111111111'); seen = input; return offering(input); },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-offerings/11111111-1111-4111-8111-111111111111`, {
      method: 'PATCH',
      headers: { ...auth({ userId: 21, role: 'business' }), 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceAmount: '2000.00', isActive: false }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(seen, { priceAmount: '2000.00', isActive: false });
  } finally { await close(server); }
});

test('Business Offering creation and update reject customer role', async () => {
  const { server, baseUrl } = await start(service());
  try {
    const headers = { ...auth({ userId: 21, role: 'customer' }), 'Content-Type': 'application/json' };
    const create = await fetch(`${baseUrl}/api/v1/business-offerings`, { method: 'POST', headers, body: JSON.stringify({ businessId: 7, name: 'X', slug: 'x' }) });
    const update = await fetch(`${baseUrl}/api/v1/business-offerings/11111111-1111-4111-8111-111111111111`, { method: 'PATCH', headers, body: JSON.stringify({ name: 'X' }) });
    assert.equal(create.status, 403);
    assert.equal(update.status, 403);
  } finally { await close(server); }
});
