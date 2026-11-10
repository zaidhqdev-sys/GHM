import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { Capability, CapabilityService } from '../resources/capability/contracts';

const capability: Capability = {
  id: '11111111-1111-4111-8111-111111111111', parentId: null,
  name: 'Building', slug: 'building', description: 'Built environment',
  sortOrder: 5, lifecycleStatus: 'draft', taxonomyVersion: 1,
  effectiveFrom: null, effectiveTo: null, sourceAuthority: 'GHM System Administration',
  sourceReference: 'policy-42', replacedByCapabilityId: null, isSelectable: false,
  createdAt: new Date(1000), updatedAt: new Date(1000),
};

const start = async (service: CapabilityService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, capabilityService: service }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('capability catalogue governance is admin-only', async () => {
  const service = {} as CapabilityService;
  const { server, baseUrl } = await start(service);
  try {
    assert.equal((await fetch(`${baseUrl}/api/v1/admin/capabilities`)).status, 401);
    const customer = { authorization: `Bearer ${tokenFor({ userId: 7, role: 'customer' })}` };
    assert.equal((await fetch(`${baseUrl}/api/v1/admin/capabilities`, { headers: customer })).status, 403);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('admin capability catalogue supports governed read, draft create/update and lifecycle transition', async () => {
  const calls: unknown[][] = [];
  const service = {
    listGoverned: async (...args: unknown[]) => { calls.push(['list', ...args]); return [capability]; },
    createDraft: async (...args: unknown[]) => { calls.push(['create', ...args]); return capability; },
    updateDraft: async (...args: unknown[]) => { calls.push(['update', ...args]); return capability; },
    transition: async (...args: unknown[]) => { calls.push(['transition', ...args]); return { ...capability, lifecycleStatus: 'active', isSelectable: true }; },
    listSelectableCapabilities: async () => [capability],
  } as unknown as CapabilityService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 99, role: 'admin' })}`, 'content-type': 'application/json' };
    const list = await fetch(`${baseUrl}/api/v1/admin/capabilities`, { headers });
    assert.equal(list.status, 200);
    assert.deepEqual((await list.json() as { capabilities: Capability[] }).capabilities[0].id, capability.id);

    const body = { name: 'Building', slug: 'building', description: 'Built environment', parentId: null, sortOrder: 5, sourceReference: 'policy-42' };
    const created = await fetch(`${baseUrl}/api/v1/admin/capabilities/drafts`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(created.status, 201);
    const updated = await fetch(`${baseUrl}/api/v1/admin/capabilities/${capability.id}/draft`, { method: 'PATCH', headers, body: JSON.stringify(body) });
    assert.equal(updated.status, 200);
    const transitioned = await fetch(`${baseUrl}/api/v1/admin/capabilities/${capability.id}/transition`, {
      method: 'POST', headers, body: JSON.stringify({ targetStatus: 'active' }),
    });
    assert.equal(transitioned.status, 200);
    assert.deepEqual(calls.map(call => call[0]), ['list', 'create', 'update', 'transition']);
    assert.deepEqual(calls[1], ['create', { userId: 99, role: 'admin' }, body]);
    assert.deepEqual(calls[3], ['transition', { userId: 99, role: 'admin' }, capability.id, 'active', undefined]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('admin capability routes reject malformed payloads and non-canonical IDs', async () => {
  let calls = 0;
  const service = {
    listGoverned: async () => { calls += 1; return []; },
    createDraft: async () => { calls += 1; return capability; },
    updateDraft: async () => { calls += 1; return capability; },
    transition: async () => { calls += 1; return capability; },
    listSelectableCapabilities: async () => [],
  } as unknown as CapabilityService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 99, role: 'admin' })}`, 'content-type': 'application/json' };
    assert.equal((await fetch(`${baseUrl}/api/v1/admin/capabilities/drafts`, { method: 'POST', headers, body: JSON.stringify({ name: 'Build', slug: 'build', accountId: 7 }) })).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/v1/admin/capabilities/not-a-uuid/draft`, { method: 'PATCH', headers, body: JSON.stringify({ name: 'Build', slug: 'build' }) })).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/v1/admin/capabilities/${capability.id}/transition`, { method: 'POST', headers, body: JSON.stringify({ targetStatus: 'draft' }) })).status, 400);
    assert.equal(calls, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
