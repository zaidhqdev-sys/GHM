import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountAuthStateStore } from '../auth/ghm-bearer';
import { parsePrepareInput, resolveCommercialPaymentActor, resolveConnectBusinessId } from './commercial-internal-router';

const store = (state: any): AccountAuthStateStore => ({
  getAccountAuthState: async (accountId) => state && accountId === state.accountId ? state : null,
});

test('commercial payment actor resolution returns canonical active account state', async () => {
  const result = await resolveCommercialPaymentActor(42, store({
    accountId: 42, accountStatus: 'active', role: 'business', isSystemAdmin: false,
  }));
  assert.deepEqual(result, { userId: 42, role: 'business' });
});

test('commercial payment actor resolution fails closed for unmapped account state', async () => {
  assert.equal(await resolveCommercialPaymentActor(42, store(null)), null);
});

test('commercial payment actor resolution fails closed for disabled account', async () => {
  assert.equal(await resolveCommercialPaymentActor(42, store({
    accountId: 42, accountStatus: 'disabled', role: 'business', isSystemAdmin: false,
  })), null);
});

test('commercial payment actor resolution cannot be redirected by a different account id', async () => {
  const canonical = { accountId: 42, accountStatus: 'active', role: 'business', isSystemAdmin: false };
  const result = await resolveCommercialPaymentActor(42, store(canonical));
  assert.deepEqual(result, { userId: 42, role: 'business' });
  assert.notEqual(result?.userId, 99);
});


const externalBusinessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const externalSubject = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('payment preparation accepts external Connect Business UUID, not a caller-supplied GHM numeric ID', () => {
  const parsed = parsePrepareInput({
    externalBusinessId,
    externalIdentity: { provider: 'supabase', subject: externalSubject },
    idempotencyKey: 'connect-payfast-sandbox-001',
  });
  assert.deepEqual(parsed && {
    externalBusinessId: parsed.externalBusinessId,
    externalIdentity: parsed.externalIdentity,
    countryId: parsed.countryId,
    idempotencyKey: parsed.idempotencyKey,
    expiresAt: parsed.expiresAt,
  }, {
    externalBusinessId,
    externalIdentity: { provider: 'supabase', subject: externalSubject },
    countryId: null,
    idempotencyKey: 'connect-payfast-sandbox-001',
    expiresAt: null,
  });

  assert.equal(parsePrepareInput({
    businessId: 123,
    externalIdentity: { provider: 'supabase', subject: externalSubject },
    idempotencyKey: 'connect-payfast-sandbox-002',
  }), null);
});

test('Connect Business mapping resolves to the canonical positive GHM business ID', async () => {
  let captured: unknown[] = [];
  const result = await resolveConnectBusinessId(externalBusinessId.toUpperCase(), async (sql, values) => {
    captured = [sql, values];
    return { rowCount: 1, rows: [{ business_id: '57' }] };
  });
  assert.equal(result, 57);
  assert.deepEqual(captured[1], ['supabase', externalBusinessId]);
  assert.match(String(captured[0]), /ghm\.auth_lookup_business_external_mapping/);
});

test('missing or invalid Connect Business mapping fails closed', async () => {
  let calls = 0;
  const query = async () => {
    calls += 1;
    return { rowCount: 0, rows: [] as Array<{ business_id: unknown }> };
  };
  assert.equal(await resolveConnectBusinessId(externalBusinessId, query), null);
  assert.equal(await resolveConnectBusinessId('not-a-uuid', query), null);
  assert.equal(calls, 1, 'malformed external IDs must not query the database');
  assert.equal(await resolveConnectBusinessId(externalBusinessId, async () => ({
    rowCount: 1, rows: [{ business_id: '0' }],
  })), null);
});
