import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { AuthContext } from '../auth/authorization';
import type { BusinessCategoryService } from '../resources/business-category/contracts';

const start = async (service: BusinessCategoryService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, businessCategoryService: service }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};
const close = (server: http.Server) => new Promise<void>(resolve => server.close(() => resolve()));
const assignment = { id: 1, businessId: 55, categoryId: '11111111-1111-4111-8111-111111111111', isPrimary: true, createdBy: 9, createdAt: new Date(), updatedAt: new Date() };

test('managed category assignment list binds authenticated Business context', async () => {
  let received: unknown;
  const service = { listBusinessCategoryAssignments: async (context: AuthContext, id: number) => { received = { context, id }; return [assignment]; } } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/categories`, { headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'business' })}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { context: { userId: 9, role: 'business' }, id: 55 });
    assert.equal((await response.json() as { assignments: unknown[] }).assignments.length, 1);
  } finally { await close(server); }
});

test('managed category assignment create accepts only canonical category ID', async () => {
  let received: unknown;
  const service = { assignBusinessCategory: async (context: AuthContext, input: unknown) => { received = { context, input }; return assignment; } } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/categories`, {
      method: 'POST', headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'business' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: assignment.categoryId }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(received, { context: { userId: 9, role: 'business' }, input: { businessId: 55, categoryId: assignment.categoryId } });
  } finally { await close(server); }
});

test('managed primary category update uses the dedicated assignment transition', async () => {
  let received: unknown;
  const service = { setPrimaryBusinessCategory: async (context: AuthContext, input: unknown) => { received = { context, input }; return assignment; } } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/categories/${assignment.categoryId}/primary`, {
      method: 'PATCH', headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { context: { userId: 9, role: 'business' }, input: { businessId: 55, categoryId: assignment.categoryId } });
  } finally { await close(server); }
});

test('managed category assignment rejects caller-supplied primary flags', async () => {
  let called = false;
  const service = { assignBusinessCategory: async () => { called = true; return assignment; } } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/categories`, {
      method: 'POST', headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'business' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: assignment.categoryId, isPrimary: true }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await close(server); }
});
