import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const repository = fs.readFileSync('src/resources/business-capability/repository.ts', 'utf8');

test('public capability listings use a narrow predicate instead of direct evidence-table reads', () => {
  assert.match(repository, /is_business_capability_publicly_evidence_eligible\\(bc_assertion\\.id\\)/);
  assert.doesNotMatch(repository, /FROM ghm\\.business_capability_evidence/);
});

test('evidence expiry affects public presentation only and does not mutate audit state', () => {
  const publicQuery = repository.slice(repository.indexOf('async listPublicBusinessCapabilities'), repository.indexOf('async createBusinessCapability'));
  assert.match(publicQuery, /is_business_capability_publicly_evidence_eligible/);
  assert.doesNotMatch(publicQuery, /UPDATE ghm\\.business_capability/);
});

const migration = fs.readFileSync('database/migrations/20261109140000_close_evidence_and_founder_review_authority.sql', 'utf8');

test('runtime cannot read evidence rows directly and public eligibility is visibility- and expiry-aware', () => {
  assert.match(migration, /REVOKE SELECT ON TABLE ghm\\.business_capability_evidence FROM ghm_runtime/);
  assert.match(migration, /evidence\\.visibility = 'public'/);
  assert.match(migration, /evidence\\.verification_status = 'verified'/);
  assert.match(migration, /evidence\\.expires_on IS NULL OR evidence\\.expires_on >= current_date/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\\.is_business_capability_publicly_evidence_eligible\\(bigint\\)[\\s\\S]*TO ghm_runtime/);
});

test('evidence without records retains the existing no-evidence pathway', () => {
  assert.match(migration, /NOT EXISTS \\([\\s\\S]*business_capability_evidence evidence[\\s\\S]*business_capability_id = p_business_capability_id/);
});

test('founder review is disabled without inferred system-administrator authority', () => {
  assert.match(migration, /DELETE FROM ghm\\.directory_listing_founder_reviewer/);
  const helper = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION ghm.is_directory_listing_founder_reviewer'), migration.indexOf('CREATE OR REPLACE FUNCTION ghm.reject_expired_capability_evidence_verification'));
  assert.match(helper, /FROM ghm\\.directory_listing_founder_reviewer/);
  assert.doesNotMatch(helper, /directory_listing_founder_reviewer|founder_system_admin_bootstrap_state|is_system_admin/);
});

test('expired evidence cannot be verified or have its verified expiry moved into the past', () => {
  assert.match(migration, /NEW\\.verification_status = 'verified'[\\s\\S]*NEW\\.expires_on < current_date/);
  assert.match(migration, /Expired capability evidence cannot be verified/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF verification_status, expires_on/);
});
