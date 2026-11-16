import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'database/migrations/20261116170000_add_founder_only_commercial_document_authority_gateway.sql'),
  'utf8',
);

test('owner authority is derived only from the canonical founder bootstrap singleton', () => {
  assert.match(migration, /FROM ghm\.founder_system_admin_bootstrap_state/);
  assert.match(migration, /v_founder_account_id IS DISTINCT FROM p_actor/);
  assert.match(migration, /v_founder_email IS DISTINCT FROM 'zaidhqdev@gmail\.com'/);
  assert.match(migration, /ai\.account_status = 'active'/);
  assert.match(migration, /ai\.is_system_admin = true/);
  assert.match(migration, /pc\.account_id = p_actor/);
  assert.match(migration, /pc\.login_email_normalized = 'zaidhqdev@gmail\.com'/);
  assert.match(migration, /pc\.credential_status = 'active'/);
  assert.doesNotMatch(migration, /p_target_account_id|p_approver_account_id/);
});

test('owner authority assertion is short-lived, signed, one-use and gateway-principal-only', () => {
  assert.match(migration, /session_user <> 'ghm_actor_gateway'/);
  assert.match(migration, /commercial\.document\.authority\.manage/);
  assert.match(migration, /public\.hmac\(convert_to\(v_payload, 'UTF8'\), v_secret, 'sha256'\)/);
  assert.match(migration, /Commercial authority assertion expired/);
  assert.match(migration, /Commercial authority assertion replay detected/);
  assert.match(migration, /INSERT INTO ghm\.actor_gateway_capability_assertion_nonce/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_manage_commercial_document_approval_authority[\s\S]*TO ghm_actor_gateway/);
  assert.doesNotMatch(migration, /TO ghm_runtime|TO PUBLIC/);
});

test('authority grant and revoke are serialized and append-only', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(migration, /ORDER BY e\.occurred_at DESC, e\.id DESC/);
  assert.match(migration, /already granted/);
  assert.match(migration, /No active commercial approval authority to revoke/);
  assert.match(migration, /INSERT INTO ghm\.commercial_document_approval_authority_event/);
  assert.match(migration, /founder_owner_authority_gateway/);
  assert.match(migration, /NULLS NOT DISTINCT/);
});

test('authority operation binds its HMAC context to action and exact document scope', () => {
  assert.match(migration, /p_context::jsonb IS DISTINCT FROM jsonb_build_object/);
  assert.match(migration, /'action', p_action/);
  assert.match(migration, /'documentType', p_document_type/);
  assert.match(migration, /'documentKey', p_document_key/);
  assert.match(migration, /'jurisdictionCountryId', p_jurisdiction_country_id/);
  assert.match(migration, /'reason', p_reason/);
  assert.match(migration, /p_document_type NOT IN \('trial_terms', 'subscription_terms'\)/);
  assert.match(migration, /p_action NOT IN \('grant', 'revoke'\)/);
});
