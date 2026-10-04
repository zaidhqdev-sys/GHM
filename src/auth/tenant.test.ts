import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTenantContext, type TenantContext } from './tenant';

test('tenant context binds account and business', () => {
  const tenant: TenantContext = { businessId: 11, accountId: 42, membershipId: 7, membershipRole: 'owner' };
  assert.doesNotThrow(() => assertTenantContext({ userId: 42 }, tenant, 11));
  assert.throws(() => assertTenantContext({ userId: 42 }, tenant, 12), /context mismatch/);
  assert.throws(() => assertTenantContext({ userId: 99 }, tenant, 11), /context mismatch/);
});
