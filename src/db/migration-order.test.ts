import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAppliedMigrationNames } from './migration-order';

const migrations = [
  { version: '20261110100000', name: 'create_account_onboarding_progress' },
  { version: '20261120010000', name: 'add_signed_business_capability_create' },
];

test('accepts matching applied migration names', () => {
  assert.doesNotThrow(() => assertAppliedMigrationNames(migrations, [
    { version: '20261110100000', name: 'create_account_onboarding_progress' },
  ]));
});

test('rejects an applied migration version with a different repository name', () => {
  assert.throws(() => assertAppliedMigrationNames(migrations, [
    { version: '20261120010000', name: 'wrong_name' },
  ]), /Migration ledger name mismatch for 20261120010000/);
});

test('retains historical applied rows absent from the current repository for separate provenance audit', () => {
  assert.doesNotThrow(() => assertAppliedMigrationNames(migrations, [
    { version: '20260901000000', name: 'retained_historical_migration' },
  ]));
});
