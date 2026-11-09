import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('database/migrations/20261109140000_close_evidence_and_founder_review_authority.sql', 'utf8');

test('expired evidence cannot transition into verified state', () => {
  assert.match(migration, /NEW\.verification_status = 'verified'[\s\S]*NEW\.expires_on < current_date/);
  assert.match(migration, /Expired capability evidence cannot be verified/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF verification_status, expires_on[\s\S]*ON ghm\.business_capability_evidence/);
});

test('founder directory review is fully disabled without deleting reviewer history', () => {
  assert.doesNotMatch(migration, /DELETE FROM ghm\.directory_listing_founder_reviewer/);
  const helper = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION ghm.is_directory_listing_founder_reviewer'), migration.indexOf('CREATE OR REPLACE FUNCTION ghm.reject_expired_capability_evidence_verification'));
  assert.match(helper, /SELECT false/);
  assert.equal(helper.includes('FROM ghm.directory_listing_founder_reviewer'), false);
  assert.equal(helper.includes('founder_system_admin_bootstrap_state'), false);
  assert.equal(helper.includes('is_system_admin'), false);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.submit_business_directory_review\(bigint, bigint\)[\s\S]*FROM PUBLIC, ghm_runtime/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.list_businesses_for_directory_review\(bigint, text, integer, integer\)[\s\S]*FROM PUBLIC, ghm_runtime/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.review_business_directory_listing\(bigint, bigint, text, text\)[\s\S]*FROM PUBLIC, ghm_runtime/);
});
