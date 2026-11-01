import assert from 'node:assert/strict';
import test from 'node:test';
import { createBusinessMigrationProvisioningService, createPostgresBusinessMigrationProvisioningStore } from './quoteflow-migration-business-provisioning';

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


test('PostgreSQL store calls the migration-only function with exact review evidence', async () => {
  let observed: { sql: string; values: unknown[] } | undefined;
  const store = createPostgresBusinessMigrationProvisioningStore({
    async query(sql: string, values?: unknown[]) {
      observed = { sql, values: values ?? [] };
      return {
        rows: [{ outcome: 'created', business_id: '101', owner_membership_id: '202', reason_code: 'CREATED_PENDING_REVIEW' }],
      };
    },
  } as never);
  const result = await store.provisionBusinessWithOwnerAndMapping({
    sourceProvider: 'supabase',
    sourceOrganizationId: 'org-7',
    businessName: 'Example',
    businessSlug: 'example',
    ownerAccountId: 42,
    evidenceReference: 'ticket/7',
    reviewedBy: 'founder',
    reviewedAt: '2026-10-31T12:00:00.000Z',
  });
  assert.deepEqual(result, {
    outcome: 'created', businessId: 101, ownerMembershipId: 202, reasonCode: 'CREATED_PENDING_REVIEW',
  });
  assert.match(observed?.sql ?? '', /auth_provision_quoteflow_migration_business/);
  assert.deepEqual(observed?.values, [
    'supabase', 'org-7', 'Example', 'example', 42, 'ticket/7', 'founder', '2026-10-31T12:00:00.000Z',
  ]);
});

test('PostgreSQL store rejects an empty or unknown database outcome', async () => {
  const store = createPostgresBusinessMigrationProvisioningStore({
    async query() { return { rows: [] }; },
  } as never);
  await assert.rejects(() => store.provisionBusinessWithOwnerAndMapping({
    sourceProvider: 'supabase',
    sourceOrganizationId: 'org-7',
    businessName: 'Example',
    businessSlug: 'example',
    ownerAccountId: 42,
    evidenceReference: 'ticket/7',
    reviewedBy: 'founder',
    reviewedAt: '2026-10-31T12:00:00.000Z',
  }), /returned no outcome/);
});

test('PostgreSQL store rejects unknown database outcomes', async () => {
  const store = createPostgresBusinessMigrationProvisioningStore({
    async query() {
      return { rows: [{ outcome: 'unexpected', business_id: null, owner_membership_id: null, reason_code: 'UNKNOWN' }] };
    },
  } as never);
  await assert.rejects(() => store.provisionBusinessWithOwnerAndMapping({
    sourceProvider: 'supabase',
    sourceOrganizationId: 'org-7',
    businessName: 'Example',
    businessSlug: 'example',
    ownerAccountId: 42,
    evidenceReference: 'ticket/7',
    reviewedBy: 'founder',
    reviewedAt: '2026-10-31T12:00:00.000Z',
  }), /unknown outcome/);
});
