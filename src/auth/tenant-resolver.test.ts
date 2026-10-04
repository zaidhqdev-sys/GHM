import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from './authorization';
import { resolveTenantContext } from './tenant-resolver';

const context: AuthContext = { userId: 42, role: 'business' };
const fakeClient = (rows: unknown[]) => ({ query: async (_sql: string, params: unknown[]) => { assert.deepEqual(params, [11, 42]); return { rowCount: rows.length, rows }; } }) as any;

test('resolver derives tenant from active membership', async () => {
  assert.deepEqual(await resolveTenantContext(fakeClient([{ id: 7, business_id: 11, account_id: 42, membership_role: 'owner' }]), context, 11), { businessId: 11, accountId: 42, membershipId: 7, membershipRole: 'owner' });
});

test('resolver fails closed without active membership', async () => {
  await assert.rejects(() => resolveTenantContext(fakeClient([]), context, 11), /Business tenant access denied/);
});

test('resolver rejects invalid tenant before database access', async () => {
  let calls = 0;
  const client = { query: async () => { calls++; return { rowCount: 0, rows: [] }; } } as any;
  await assert.rejects(() => resolveTenantContext(client, context, 0), /Invalid business tenant/);
  assert.equal(calls, 0);
});
