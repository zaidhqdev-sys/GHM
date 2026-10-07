import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountAuthStateStore } from '../auth/ghm-bearer';
import { resolveCommercialPaymentActor } from './commercial-internal-router';

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
