import assert from 'node:assert/strict';
import {
  createMigrationReconciliationExecutor,
  type ExternalIdentityReconciliationStore,
} from '../src/migrations/quoteflow-migration-reconciliation.js';
import {
  generateDryRunManifest,
  type AccountResolution,
  type QuoteFlowMigrationSnapshot,
} from '../src/migrations/quoteflow-snapshot-contract.js';

const snapshot: QuoteFlowMigrationSnapshot = {
  schemaVersion: 1,
  evidence: {
    sourceSystem: 'supabase',
    extractionMechanism: 'synthetic-fixture',
    extractionTimestamp: '2026-10-04T00:00:00Z',
    datasetVersion: 'synthetic-1',
    evidenceReference: 'fixture://quoteflow-migration',
    environment: 'non_production',
    recordCounts: { accounts: 3, organizations: 0, memberships: 0 },
  },
  accounts: [
    {
      sourceSubject: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      email: 'One@Example.com',
    },
    {
      sourceSubject: '22222222-2222-4222-8222-222222222222',
      status: 'active',
      email: 'two@example.com',
    },
    {
      sourceSubject: '33333333-3333-4333-8333-333333333333',
      status: 'active',
      email: 'three@example.com',
    },
  ],
  organizations: [],
  memberships: [],
};

const resolutions: AccountResolution[] = [
  {
    sourceSubject: '11111111-1111-4111-8111-111111111111',
    targetAccountId: 101,
    externalMappingOutcome: 'created',
    credentialDisposition: 'reset_required',
  },
  {
    sourceSubject: '22222222-2222-4222-8222-222222222222',
    targetAccountId: 102,
    externalMappingOutcome: 'already_linked',
    credentialDisposition: 'migrate_verified_hash',
  },
  {
    sourceSubject: '33333333-3333-4333-8333-333333333333',
    targetAccountId: null,
    externalMappingOutcome: 'account_not_found',
    credentialDisposition: 'blocked',
  },
];

const manifest = generateDryRunManifest(snapshot, resolutions, []);
const links = new Map<string, number>();
let calls = 0;

const store: ExternalIdentityReconciliationStore = {
  async linkExternalIdentity(_provider, subject, accountId) {
    calls += 1;
    const existing = links.get(subject);
    if (existing !== undefined) {
      return existing === accountId ? 'already_linked' : 'conflict';
    }
    if (accountId === 102) {
      links.set(subject, accountId);
      return 'already_linked';
    }
    links.set(subject, accountId);
    return 'created';
  },
};

const executor = createMigrationReconciliationExecutor(store);

const first = await executor.reconcileExistingAccounts(manifest, resolutions);
assert.deepEqual(
  first.map((result) => [result.sourceSubject, result.migrationOutcome, result.mappingOutcome]),
  [
    ['11111111-1111-4111-8111-111111111111', 'RESET_REQUIRED', 'created'],
    ['22222222-2222-4222-8222-222222222222', 'MIGRATED', 'already_linked'],
    ['33333333-3333-4333-8333-333333333333', 'BLOCKED', 'not_attempted'],
  ],
);

const callsAfterFirstRun = calls;
const second = await executor.reconcileExistingAccounts(manifest, resolutions);
assert.deepEqual(
  second.map((result) => [result.sourceSubject, result.migrationOutcome, result.mappingOutcome]),
  [
    ['11111111-1111-4111-8111-111111111111', 'RESET_REQUIRED', 'already_linked'],
    ['22222222-2222-4222-8222-222222222222', 'MIGRATED', 'already_linked'],
    ['33333333-3333-4333-8333-333333333333', 'BLOCKED', 'not_attempted'],
  ],
);
assert.equal(calls, callsAfterFirstRun + 2);

const conflictResolutions = resolutions.map((resolution) =>
  resolution.sourceSubject === '11111111-1111-4111-8111-111111111111'
    ? { ...resolution, targetAccountId: 999 }
    : resolution,
);
const conflict = await executor.reconcileExistingAccounts(manifest, conflictResolutions);
assert.equal(conflict[0].migrationOutcome, 'CONFLICT');
assert.equal(conflict[0].reasonCode, 'EXTERNAL_MAPPING_CONFLICT');

console.log('QuoteFlow migration reconciliation qualification: PASS');
console.log(JSON.stringify({
  firstRun: first.map((result) => result.migrationOutcome),
  secondRun: second.map((result) => result.mappingOutcome),
  conflict: conflict[0].reasonCode,
}, null, 2));
