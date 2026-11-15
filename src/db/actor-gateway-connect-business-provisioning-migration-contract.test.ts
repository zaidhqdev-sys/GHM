import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/migrations/20261112080000_signed_connect_business_provisioning_gateway.sql',
), 'utf8');

test('Connect Business provisioning is one signed, owner-executed atomic gateway operation', () => {
  assert.match(migration, /'business\.connect\.provision'/);
  assert.match(migration, /CREATE FUNCTION ghm\.gateway_provision_connect_business/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, ghm/);
  assert.match(migration, /ALTER FUNCTION ghm\.gateway_provision_connect_business[\s\S]*OWNER TO ghm_schema_owner/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_provision_connect_business[\s\S]*TO ghm_actor_gateway/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /INSERT INTO ghm\.business_membership/);
  assert.match(migration, /ghm\.auth_link_business_external_mapping\('supabase'/);
  assert.match(migration, /Business membership required/);
  assert.match(migration, /'resolved'::text/);
  assert.match(migration, /'provisioned'::text/);
});

test('legacy business mapping helper is no longer callable by application roles', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.auth_link_business_external_mapping[\s\S]*FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway/);
});
