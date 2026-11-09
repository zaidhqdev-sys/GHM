import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('database/migrations/20261109140000_close_evidence_and_founder_review_authority.sql', 'utf8');

test('expired evidence cannot transition into verified state', () => {
  assert.match(migration, /NEW\.verification_status = 'verified'[\s\S]*NEW\.expires_on < current_date/);
  assert.match(migration, /Expired capability evidence cannot be verified/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF verification_status[\s\S]*ON ghm\.business_capability_evidence/);
});

test('founder review has no system-admin bypass and starts with no reviewer authority', () => {
  assert.match(migration, /DELETE FROM ghm\.directory_listing_founder_reviewer/);
  const helper = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION ghm.is_directory_listing_founder_reviewer'), migration.indexOf('CREATE OR REPLACE FUNCTION ghm.reject_expired_capability_evidence_verification'));
  assert.match(helper, /FROM ghm\.directory_listing_founder_reviewer/);
  assert.doesNotMatch(helper, /founder_system_admin_bootstrap_state|is_system_admin/);
});
