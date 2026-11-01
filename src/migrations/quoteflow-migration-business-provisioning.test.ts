import assert from 'node:assert/strict';
import test from 'node:test';
import { createBusinessMigrationProvisioningService } from './quoteflow-migration-business-provisioning';

const base = {
  sourceProvider: 'supabase' as const,
  sourceOrganizationId: ' org-7 ',
  businessName: ' Example Business ',
  businessSlug: ' example-business ',
  ownerAccountId: 42,
  evidenceReference: ' evidence/ticket-7 ',
  reviewedBy: ' founder-review ',
  reviewedAt: new Date('2026-10-31T12:00:00.000Z'),
};

test('passes exact provenance and review evidence to the migration store', async () => {
  const calls: unknown[] = [];
  const service = createBusinessMigrationProvisioningService({
    async provisionBusinessWithOwnerAndMapping(input) {
      calls.push(input);
      return { outcome: 'created', businessId: 12, ownerMembershipId: 34, reasonCode: 'CREATED_PENDING_REVIEW' };
    },
  });
  const result = await service.provision(base);
  assert.deepEqual(result, {
    outcome: 'created', businessId: 12, ownerMembershipId: 34, reasonCode: 'CREATED_PENDING_REVIEW',
  });
  assert.deepEqual(calls, [{
    sourceProvider: 'supabase',
    sourceOrganizationId: 'org-7',
    businessName: 'Example Business',
    businessSlug: 'example-business',
    ownerAccountId: 42,
    evidenceReference: 'evidence/ticket-7',
    reviewedBy: 'founder-review',
    reviewedAt: '2026-10-31T12:00:00.000Z',
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
  const result = await service.provision({ ...base, ownerAccountId: 0 });
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.reasonCode, 'OWNER_ACCOUNT_INVALID');
  assert.equal(called, false);
});

test('blocks invalid review timestamps without invoking the store', async () => {
  let called = false;
  const service = createBusinessMigrationProvisioningService({
    async provisionBusinessWithOwnerAndMapping() {
      called = true;
      throw new Error('store must not be called');
    },
  });
  const result = await service.provision({ ...base, reviewedAt: new Date('invalid') });
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.reasonCode, 'REVIEW_TIMESTAMP_INVALID');
  assert.equal(called, false);
});

test('rejects blank source, business, and review fields', async () => {
  const service = createBusinessMigrationProvisioningService({
    async provisionBusinessWithOwnerAndMapping() {
      throw new Error('store must not be called');
    },
  });
  await assert.rejects(() => service.provision({ ...base, sourceOrganizationId: ' ' }), /sourceOrganizationId must be non-blank/);
  await assert.rejects(() => service.provision({ ...base, evidenceReference: ' ' }), /evidenceReference must be non-blank/);
  await assert.rejects(() => service.provision({ ...base, reviewedBy: ' ' }), /reviewedBy must be non-blank/);
});
