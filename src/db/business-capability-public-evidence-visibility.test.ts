import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const repository = fs.readFileSync('src/resources/business-capability/repository.ts', 'utf8');
const migration = fs.readFileSync('database/migrations/20261109140000_close_evidence_and_founder_review_authority.sql', 'utf8');

test('public capability listings use a narrow predicate instead of direct evidence-table reads', () => {
  assert.ok(repository.includes('ghm.is_business_capability_publicly_evidence_eligible(bc_assertion.id)'));
  assert.equal(repository.includes('FROM ghm.business_capability_evidence'), false);
});

test('evidence expiry affects public presentation only and does not mutate audit state', () => {
  const publicQuery = repository.slice(repository.indexOf('async listPublicBusinessCapabilities'), repository.indexOf('async createBusinessCapability'));
  assert.ok(publicQuery.includes('is_business_capability_publicly_evidence_eligible'));
  assert.equal(publicQuery.includes('UPDATE ghm.business_capability'), false);
});

test('runtime cannot read evidence rows directly and public eligibility is visibility- and expiry-aware', () => {
  assert.ok(migration.includes('REVOKE SELECT ON TABLE ghm.business_capability_evidence FROM ghm_runtime'));
  assert.ok(migration.includes("evidence.visibility = 'public'"));
  assert.ok(migration.includes("evidence.verification_status = 'verified'"));
  assert.ok(migration.includes('evidence.expires_on IS NULL OR evidence.expires_on >= current_date'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION ghm.is_business_capability_publicly_evidence_eligible(bigint)'));
});

test('evidence without records retains the existing no-evidence pathway', () => {
  assert.ok(migration.includes('NOT EXISTS ('));
  assert.ok(migration.includes('business_capability_id = p_business_capability_id'));
});

test('founder directory review is fully disabled without deleting reviewer history', () => {
  assert.equal(migration.includes('DELETE FROM ghm.directory_listing_founder_reviewer'), false);
  const helper = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION ghm.is_directory_listing_founder_reviewer'), migration.indexOf('CREATE OR REPLACE FUNCTION ghm.reject_expired_capability_evidence_verification'));
  assert.ok(helper.includes('SELECT false'));
  assert.equal(helper.includes('founder_system_admin_bootstrap_state'), false);
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION ghm.submit_business_directory_review(bigint, bigint)'));
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION ghm.list_businesses_for_directory_review(bigint, text, integer, integer)'));
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION ghm.review_business_directory_listing(bigint, bigint, text, text)'));
});

test('expired evidence cannot be verified or have its verified expiry moved into the past', () => {
  assert.ok(migration.includes("NEW.verification_status = 'verified'"));
  assert.ok(migration.includes('NEW.expires_on < current_date'));
  assert.ok(migration.includes('Expired capability evidence cannot be verified'));
  assert.ok(migration.includes('BEFORE INSERT OR UPDATE OF verification_status, expires_on'));
});
