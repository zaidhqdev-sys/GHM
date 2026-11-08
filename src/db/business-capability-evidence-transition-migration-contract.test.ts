import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('database/migrations/20261109110000_reconcile_capability_evidence_pending_state.sql', 'utf8');

test('evidence transition keeps parent Capability pending while other evidence remains pending', () => {
  assert.match(migration, /count\(\*\) FILTER \(WHERE verification_status = 'pending'\)::integer/);
  assert.match(migration, /WHEN v_pending_count > 0 THEN 'pending'/);
  assert.match(migration, /verified_by = CASE WHEN v_pending_count > 0 AND v_verified_count = 0 THEN NULL/);
  assert.match(migration, /verified_at = CASE WHEN v_pending_count > 0 AND v_verified_count = 0 THEN NULL/);
});

test('evidence transition preserves verified state when unexpired verified evidence remains', () => {
  assert.match(migration, /verification_status = 'verified'[\s\S]*expires_on IS NULL OR expires_on >= current_date/);
  assert.match(migration, /WHEN v_verified_count > 0 THEN 'verified'/);
});

test('evidence transition still requires admin authority and forbids self-verification', () => {
  assert.match(migration, /v_role IS DISTINCT FROM 'admin'/);
  assert.match(migration, /v_evidence\.submitted_by = p_verifier_id/);
  assert.match(migration, /A bounded reason is required for rejection or revocation/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.transition_business_capability_evidence/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.transition_business_capability_evidence[^;]* TO ghm_runtime/);
});
