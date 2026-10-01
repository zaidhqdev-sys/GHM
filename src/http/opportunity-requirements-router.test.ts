import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor as es256TokenFor } from './test-resource-auth';
import type { AuthContext } from '../auth/authorization';
import type { OpportunityCapabilityRequirement, OpportunityRequirementsService } from '../resources/opportunity-requirements/contracts';

const context: AuthContext = { userId: 42, role: 'customer' };
const token = es256TokenFor;
const requirement: OpportunityCapabilityRequirement = {
  id: 1, opportunityId: 101, capabilityId: '11111111-1111-4111-8111-111111111111',
  importance: 'required', minimumProficiencyLevel: 'proficient',
  description: 'Electrical installation', sortOrder: 0,
};
const start = async (service: OpportunityRequirementsService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, resourceAuthMiddleware: httpTestAuth, opportunityRequirementsService: service }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { server, url: `http://127.0.0.1:${address.port}` };
};
const close = (server: http.Server) => new Promise<void>(resolve => server.close(() => resolve()));

test('opportunity requirements read requires authentication', async () => {
  const service = { listOpportunityRequirements: async () => { throw new Error('must not be called'); } } as unknown as OpportunityRequirementsService;
  const { server, url } = await start(service);
  try { assert.equal((await fetch(`${url}/api/v1/opportunities/101/requirements`)).status, 401); } finally { await close(server); }
});

test('opportunity requirements read validates id and binds context', async () => {
  let received: AuthContext | undefined; let receivedId: number | undefined;
  const service = { listOpportunityRequirements: async (c: AuthContext, id: number) => { received = c; receivedId = id; return [requirement]; } } as unknown as OpportunityRequirementsService;
  const { server, url } = await start(service);
  try {
    assert.equal((await fetch(`${url}/api/v1/opportunities/nope/requirements`, { headers: { authorization: `Bearer ${token}` } })).status, 400);
    const response = await fetch(`${url}/api/v1/opportunities/101/requirements`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200); assert.deepEqual(received, context); assert.equal(receivedId, 101);
    assert.deepEqual(await response.json(), { requirements: [requirement] });
  } finally { await close(server); }
});

test('opportunity requirements replacement accepts canonical fields only', async () => {
  let input: unknown;
  const service = { replaceOpportunityRequirements: async (c: AuthContext, id: number, value: unknown) => { assert.deepEqual(c, context); assert.equal(id, 101); input = value; return [requirement]; } } as unknown as OpportunityRequirementsService;
  const { server, url } = await start(service);
  try {
    const response = await fetch(`${url}/api/v1/opportunities/101/requirements`, {
      method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requirements: [{ capabilityId: requirement.capabilityId, importance: 'required', minimumProficiencyLevel: 'proficient', description: 'Electrical installation', sortOrder: 0 }] }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(input, [{ capabilityId: requirement.capabilityId, importance: 'required', minimumProficiencyLevel: 'proficient', description: 'Electrical installation', sortOrder: 0 }]);
  } finally { await close(server); }
});

test('opportunity requirements replacement rejects server-owned fields and malformed ids', async () => {
  let called = false;
  const service = { replaceOpportunityRequirements: async () => { called = true; return []; } } as unknown as OpportunityRequirementsService;
  const { server, url } = await start(service);
  try {
    for (const body of [
      { requirements: [{ capabilityId: requirement.capabilityId, id: 9 }] },
      { requirements: [{ capabilityId: 'bad' }] },
    ]) {
      const response = await fetch(`${url}/api/v1/opportunities/101/requirements`, {
        method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(called, false);
  } finally { await close(server); }
});

test('opportunity requirements replacement maps management denial', async () => {
  const service = { replaceOpportunityRequirements: async () => { throw new Error('Opportunity requirements access denied'); } } as unknown as OpportunityRequirementsService;
  const { server, url } = await start(service);
  try {
    const response = await fetch(`${url}/api/v1/opportunities/101/requirements`, {
      method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ requirements: [] }),
    });
    assert.equal(response.status, 403);
  } finally { await close(server); }
});

test('opportunity requirements replacement is not PATCH or POST', async () => {
  const service = {} as OpportunityRequirementsService;
  const { server, url } = await start(service);
  try {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    assert.equal((await fetch(`${url}/api/v1/opportunities/101/requirements`, { method: 'PATCH', headers, body: JSON.stringify({ requirements: [] }) })).status, 404);
    assert.equal((await fetch(`${url}/api/v1/opportunities/101/requirements`, { method: 'POST', headers, body: JSON.stringify({ requirements: [] }) })).status, 404);
  } finally { await close(server); }
});
