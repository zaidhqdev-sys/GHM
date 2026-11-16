import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'database/migrations/20261116190000_add_commercial_consent_payment_prepare_gateway.sql'),
  'utf8',
);
const privileges = fs.readFileSync(
  path.resolve(process.cwd(), 'src/actor-gateway/database-privileges.ts'),
  'utf8',
);

test('payment preparation requires a one-use Actor Gateway assertion and active GHM account', () => {
  assert.match(migration, /session_user <> 'ghm_actor_gateway'/);
  assert.match(migration, /commercial\.payment\.prepare_with_consent/);
  assert.match(migration, /public\.hmac\(convert_to\(v_payload, 'UTF8'\), v_secret, 'sha256'\)/);
  assert.match(migration, /Commercial payment preparation assertion expired/);
  assert.match(migration, /Commercial payment preparation assertion replay detected/);
  assert.match(migration, /ai\.account_status = 'active'/);
});

test('payment preparation binds every acceptance, provider, business, document and idempotency input', () => {
  assert.match(migration, /p_context::jsonb IS DISTINCT FROM jsonb_build_object/);
  for (const field of ['businessId', 'documentVersionId', 'countryId', 'idempotencyKey', 'providerCode', 'accepted', 'expiresAt', 'requestId']) {
    assert.ok(migration.includes(`'${field}'`), `missing signed context field ${field}`);
  }
  assert.match(migration, /p_accepted IS DISTINCT FROM true/);
  assert.match(migration, /p_provider_code !~ '\^\[a-z\]\[a-z0-9_\]\{1,49\}\$'/);
});

test('payment preparation requires active owner/admin membership and a current subscription price', () => {
  assert.match(migration, /m\.membership_status = 'active'/);
  assert.match(migration, /m\.membership_role IN \('owner', 'administrator'\)/);
  assert.match(migration, /FOR SHARE/);
  assert.match(migration, /commercial_subscription s[\s\S]*s\.business_id = p_business_id/);
  assert.match(migration, /commercial_plan_price price[\s\S]*price\.lifecycle_status = 'active'/);
  assert.match(migration, /price\.country_id IS NOT DISTINCT FROM p_country_id/);
});

test('payment preparation requires the exact currently approved subscription document version', () => {
  assert.match(migration, /commercial_document_version d[\s\S]*d\.id = p_document_version_id/);
  assert.match(migration, /v_document_type IS DISTINCT FROM 'subscription_terms'/);
  assert.match(migration, /v_document_plan_code IS DISTINCT FROM v_plan_code/);
  assert.match(migration, /v_document_country_id IS DISTINCT FROM p_country_id/);
  assert.match(migration, /commercial_document_status_event e[\s\S]*e\.document_version_id = p_document_version_id/);
  assert.match(migration, /v_document_status IS DISTINCT FROM 'approved'/);
});

test('consent evidence, payment attempt and commercial event are committed by one database transaction', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('commercial-payment:'/);
  assert.match(migration, /INSERT INTO ghm\.commercial_payment_attempt/);
  assert.match(migration, /INSERT INTO ghm\.commercial_consent_event/);
  assert.match(migration, /INSERT INTO ghm\.commercial_event/);
  assert.match(migration, /'subscription_payment_prepared'/);
  assert.match(migration, /consentEventId/);
  assert.match(migration, /RETURN QUERY SELECT[\s\S]*v_attempt\.id[\s\S]*v_consent_id/);
});

test('idempotent retry returns only a matching attempt with its exact consent evidence', () => {
  assert.match(migration, /commercial_payment_attempt a[\s\S]*a\.idempotency_key = p_idempotency_key/);
  assert.match(migration, /commercial_consent_event c[\s\S]*c\.idempotency_key = p_idempotency_key/);
  assert.match(migration, /v_existing_consent\.document_version_id IS DISTINCT FROM p_document_version_id/);
  assert.match(migration, /Commercial payment preparation idempotency conflict/);
});

test('only Actor Gateway can execute the SECURITY DEFINER write boundary', () => {
  assert.match(migration, /SET search_path = pg_catalog, ghm, pg_temp/g);
  assert.match(migration, /OWNER TO ghm_schema_owner/g);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.gateway_prepare_commercial_payment_with_consent[\s\S]*FROM PUBLIC, ghm_runtime, ghm_migrator/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_prepare_commercial_payment_with_consent[\s\S]*TO ghm_actor_gateway/);
  assert.ok(privileges.includes('ghm.assert_actor_gateway_commercial_payment_prepare('));
  assert.ok(privileges.includes('ghm.gateway_prepare_commercial_payment_with_consent('));
});
