import assert from 'node:assert/strict';
import test from 'node:test';
import { createBusinessMigrationProvisioningService } from './quoteflow-migration-business-provisioning';

test('provisions only an explicitly supplied Supabase source and canonical owner', async () => {
  const calls: unknown[] = [];
  const service = createBusinessMigrationProvisioningService({
    async provisionBusinessWithOwnerAndMapping(input) {
      calls.push(input);
      return { outcome: 'created', businessId: 12, ownerMembershipId: 34, reasonCode: 'CREATED_PENDING_REVIEW' };
    },
  });
  const result = await service.provision({
    sourceProvider: 'supabase',
    sourceOrganizationId: ' org-7 ',
    businessName: ' Example Business ',
    businessSlug: ' example-business ',
    ownerAccountId: 42,
  });
  assert.deepEqual(result, {
    outcome: 'created',
    businessId: 12,
    ownerMembershipId: 34,
    reasonCode: 'CREATED_PENDING_REVIEW',
  });
  assert.deepEqual(calls, [{
    sourceProvider: 'supabase',
    sourceOrganizationId: 'org-7',
    businessName: 'Example Business',
    businessSlug: 'example-business',
    ownerAccountId: 42,
  }]);
});

test('blocks invalid owner IDs without invoking the store', async () => {
  let called = false;
  const service = createBusinessMigrationProvisioningService({
    async provisionBusinessWithOwnerAndMapping() {
      called = true;
      throw new Error('store must not be called');
    },
  });
  const result = await service.provision({
    sourceProvider: 'supabase',
    sourceOrganizationId: 'org-7',
    businessName: 'Example',
    businessSlug: 'example',
    ownerAccountId: 0,
  });
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.reasonCode, 'OWNER_ACCOUNT_INVALID');
  assert.equal(called, false);
});

test('rejects blank source identifiers and business fields', async () => {
  const service = createBusinessMigrationProvisioningService({
    async provisionBusinessWithOwnerAndMapping() {
      throw new Error('store must not be called');
    },
  });
  await assert.rejects(() => service.provision({
    sourceProvider: 'supabase',
    sourceOrganizationId: ' ',
    businessName: 'Example',
    businessSlug: 'example',
    ownerAccountId: 42,
  }), /sourceOrganizationId must be non-blank/);
});
