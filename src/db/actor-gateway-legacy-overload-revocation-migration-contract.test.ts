import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/migrations/20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql',
), 'utf8');

const legacySignatures = [
  'ghm.assert_actor_gateway(bigint)',
  'ghm.gateway_get_actor_identity(bigint)',
  'ghm.gateway_read_business_registration_identity(bigint, bigint)',
  'ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text)',
  'ghm.gateway_list_capabilities(bigint)',
  'ghm.gateway_create_capability_draft(bigint, text, text, text, uuid, integer, text, integer)',
  'ghm.gateway_update_capability_draft(bigint, uuid, text, text, text, uuid, integer, text, integer)',
  'ghm.gateway_transition_capability_lifecycle(bigint, uuid, text, uuid, integer)',
  'ghm.gateway_update_business_supplier_classification(bigint, bigint, boolean)',
  'ghm.gateway_update_business_profile(bigint, bigint, jsonb)',
];

test('all unsigned legacy Actor Gateway overloads lose application and PUBLIC execution', () => {
  for (const signature of legacySignatures) {
    assert.ok(migration.includes(`REVOKE ALL ON FUNCTION ${signature}`), `missing revocation for ${signature}`);
  }
  assert.equal((migration.match(/FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway/g) ?? []).length, legacySignatures.length);
});
