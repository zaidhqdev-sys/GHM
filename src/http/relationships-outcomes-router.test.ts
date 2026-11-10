import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { RelationshipsOutcomesService } from '../resources/relationships-outcomes/contracts';

const start = async (service: RelationshipsOutcomesService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, relationshipsOutcomesService: service }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('relationship and outcome routes require GHM authentication', async () => {
  const { server, baseUrl } = await start({} as RelationshipsOutcomesService);
  try {
    assert.equal((await fetch(`${baseUrl}/api/v1/businesses/11/relationships`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/v1/businesses/11/outcomes`)).status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('relationship and outcome routes validate inputs and return canonical projections', async () => {
  const calls: unknown[][] = [];
  const service = {
    getBusinessRelationships: async (...args: unknown[]) => { calls.push(args); return [{ id: 9, source_business_id: 11 }]; },
    getBusinessOutcomes: async (...args: unknown[]) => { calls.push(args); return [{ id: 10, subject_business_id: 11 }]; },
  } as unknown as RelationshipsOutcomesService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` };
    for (const url of [
      '/api/v1/businesses/0/relationships',
      '/api/v1/businesses/11/relationships?limit=101',
      '/api/v1/businesses/11/relationships?other=x',
      '/api/v1/businesses/11/outcomes?status=NotValid',
    ]) assert.equal((await fetch(`${baseUrl}${url}`, { headers })).status, 400);
    const relationship = await fetch(`${baseUrl}/api/v1/businesses/11/relationships?status=active&limit=25`, { headers });
    assert.equal(relationship.status, 200);
    assert.deepEqual(await relationship.json(), { relationships: [{ id: 9, source_business_id: 11 }] });
    const outcome = await fetch(`${baseUrl}/api/v1/businesses/11/outcomes?status=confirmed`, { headers });
    assert.equal(outcome.status, 200);
    assert.deepEqual(await outcome.json(), { outcomes: [{ id: 10, subject_business_id: 11 }] });
    assert.deepEqual(calls, [
      [{ userId: 42, role: 'business' }, 11, 'active', 25],
      [{ userId: 42, role: 'business' }, 11, 'confirmed', 100],
    ]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('relationship and outcome routes do not disclose records outside Business membership', async () => {
  const service = {
    getBusinessRelationships: async () => { throw new Error('Business read permission required'); },
    getBusinessOutcomes: async () => { throw new Error('Business read permission required'); },
  } as unknown as RelationshipsOutcomesService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` };
    assert.equal((await fetch(`${baseUrl}/api/v1/businesses/11/relationships`, { headers })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/v1/businesses/11/outcomes`, { headers })).status, 403);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
