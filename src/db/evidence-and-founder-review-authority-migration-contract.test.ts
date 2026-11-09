import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('database/migrations/20261109130000_harden_evidence_and_founder_review_authority.sql', 'utf8');

test('runtime evidence submissions cannot choose their own verification status', () => {
  assert.match(migration, /REVOKE INSERT \(verification_status\)[\s\S]*FROM ghm_runtime/);
});

test('canonical bootstrapped active system administrator has founder review authority', () => {
  assert.match(migration, /FROM ghm\.founder_system_admin_bootstrap_state f[\s\S]*JOIN ghm\.account_identity a ON a\.id = f\.account_id[\s\S]*a\.is_system_admin = true[\s\S]*a\.account_status = 'active'/);
  assert.match(migration, /FROM ghm\.directory_listing_founder_reviewer r[\s\S]*OR EXISTS/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.is_directory_listing_founder_reviewer\(bigint\)[\s\S]*FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.is_directory_listing_founder_reviewer\(bigint\)[\s\S]*TO ghm_runtime/);
});
