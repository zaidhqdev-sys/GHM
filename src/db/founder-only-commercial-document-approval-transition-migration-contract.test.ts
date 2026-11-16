import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'database/migrations/20261116180000_add_founder_only_commercial_document_approval_transition.sql'),
  'utf8',
);

test('document approval uses a distinct short-lived one-use founder assertion operation', () => {
  assert.match(migration, /session_user <> 'ghm_actor_gateway'/);
  assert.match(migration, /commercial\.document\.status\.approve/);
  assert.match(migration, /public\.hmac\(convert_to\(v_payload, 'UTF8'\), v_secret, 'sha256'\)/);
  assert.match(migration, /Commercial approval assertion expired/);
  assert.match(migration, /Commercial approval assertion replay detected/);
  assert.match(migration, /FROM ghm\.founder_system_admin_bootstrap_state/);
  assert.match(migration, /v_founder_account_id IS DISTINCT FROM p_actor/);
  assert.match(migration, /ai\.account_status = 'active'/);
  assert.match(migration, /pc\.credential_status = 'active'/);
});

test('approval context binds the exact immutable document version and reason', () => {
  assert.match(migration, /p_context::jsonb IS DISTINCT FROM jsonb_build_object/);
  assert.match(migration, /'documentVersionId', p_document_version_id/);
  assert.match(migration, /'reason', p_reason/);
  assert.match(migration, /commercial_document_version d[\s\S]*WHERE d\.id = p_document_version_id/);
  assert.match(migration, /FOR UPDATE/);
});

test('approval requires the latest still-granted scope authority and latest draft status', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(migration, /a\.authority_account_id = p_actor/);
  assert.match(migration, /a\.document_type = v_document_type/);
  assert.match(migration, /a\.document_key = v_document_key/);
  assert.match(migration, /a\.jurisdiction_country_id IS NOT DISTINCT FROM v_jurisdiction_country_id/);
  assert.match(migration, /ORDER BY e\.occurred_at DESC, e\.id DESC/);
  assert.match(migration, /v_authority_event_type IS DISTINCT FROM 'granted'/);
  assert.match(migration, /v_latest_status IS DISTINCT FROM 'draft'/);
});

test('approval and immutable evidence are appended atomically with exact grant reference', () => {
  assert.match(migration, /INSERT INTO ghm\.commercial_document_status_event/);
  assert.match(migration, /'approved',[\s\S]*p_actor,[\s\S]*v_authority_event_id,[\s\S]*'granted'/);
  assert.match(migration, /founder_owner_approval_gateway/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_approve_commercial_document_version[\s\S]*TO ghm_actor_gateway/);
  assert.doesNotMatch(migration, /TO ghm_runtime|TO PUBLIC/);
});

test('approval SECURITY DEFINER functions use pinned safe search paths and schema owner', () => {
  assert.match(migration, /SET search_path = pg_catalog, ghm, pg_temp/g);
  assert.match(migration, /OWNER TO ghm_schema_owner/g);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.gateway_approve_commercial_document_version[\s\S]*FROM PUBLIC, ghm_runtime, ghm_migrator/);
});
