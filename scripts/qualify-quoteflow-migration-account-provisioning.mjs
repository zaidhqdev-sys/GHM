import assert from 'node:assert/strict';
import { createMigrationAccountProvisioningService } from '../dist/migrations/quoteflow-migration-account-provisioning.js';

const sourceSubject = '11111111-1111-4111-8111-111111111111';
const state = new Map();
let atomicCreateCalls = 0;
let linkCalls = 0;

const store = {
  async lookupExternalIdentity(_provider, subject) {
    const accountId = state.get(subject);
    return accountId === undefined ? null : { accountId };
  },

  async provisionCredentiallessAccountAndLink(input) {
    atomicCreateCalls += 1;
    const existing = state.get(input.sourceSubject);
    if (existing !== undefined) {
      return { outcome: 'already_provisioned', accountId: existing };
    }
    const accountId = 700 + atomicCreateCalls;
    state.set(input.sourceSubject, accountId);
    return { outcome: 'created', accountId };
  },

  async linkExternalIdentity(_provider, subject, accountId) {
    linkCalls += 1;
    const existing = state.get(subject);
    if (existing === undefined) return 'account_not_found';
    if (existing !== accountId) return 'conflict';
    return 'already_linked';
  },
};

const service = createMigrationAccountProvisioningService(store);

const resetRequired = await service.provision({
  sourceProvider: 'supabase',
  sourceSubject,
  fullName: 'Migrated User',
  loginEmail: 'User@Example.com',
  normalizedEmail: 'user@example.com',
  role: 'customer',
  credentialDisposition: 'reset_required',
  targetAccountId: null,
});

assert.deepEqual(resetRequired, {
  outcome: 'created',
  targetAccountId: 701,
  credentialDisposition: 'reset_required',
  reasonCode: 'ACCOUNT_PROVISIONED_RESET_REQUIRED',
});
assert.equal(atomicCreateCalls, 1);
assert.equal(linkCalls, 0);

const retry = await service.provision({
  sourceProvider: 'supabase',
  sourceSubject,
  fullName: 'Migrated User',
  loginEmail: 'User@Example.com',
  normalizedEmail: 'user@example.com',
  role: 'customer',
  credentialDisposition: 'reset_required',
  targetAccountId: null,
});
assert.equal(retry.outcome, 'already_provisioned');
assert.equal(retry.targetAccountId, 701);
assert.equal(atomicCreateCalls, 1);

const blocked = await service.provision({
  sourceProvider: 'supabase',
  sourceSubject: '22222222-2222-4222-8222-222222222222',
  fullName: null,
  loginEmail: 'blocked@example.com',
  normalizedEmail: 'blocked@example.com',
  role: 'customer',
  credentialDisposition: 'blocked',
  targetAccountId: null,
});
assert.deepEqual(blocked, {
  outcome: 'blocked',
  targetAccountId: null,
  credentialDisposition: 'blocked',
  reasonCode: 'CREDENTIAL_MIGRATION_BLOCKED',
});
assert.equal(atomicCreateCalls, 1);

state.set('33333333-3333-4333-8333-333333333333', 900);
const conflict = await service.provision({
  sourceProvider: 'supabase',
  sourceSubject: '33333333-3333-4333-8333-333333333333',
  fullName: null,
  loginEmail: 'conflict@example.com',
  normalizedEmail: 'conflict@example.com',
  role: 'customer',
  credentialDisposition: 'reset_required',
  targetAccountId: 901,
});
assert.equal(conflict.outcome, 'conflict');
assert.equal(conflict.reasonCode, 'EXTERNAL_MAPPING_CONFLICT');

console.log('QuoteFlow migration account provisioning boundary qualification: PASS');
console.log(JSON.stringify({
  created: resetRequired,
  retry,
  blocked,
  conflict,
}, null, 2));
