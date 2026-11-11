import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql', 'utf8');

test('registration identity and actor self-read wrappers require operation-bound HMAC assertions', () => {
  for (const operation of ['actor.identity.read','business.registration.read','business.registration.update']) assert.ok(migration.includes(`'${operation}'`));
  assert.match(migration, /DROP FUNCTION ghm\.gateway_get_actor_identity\(bigint\)/);
  assert.match(migration, /gateway_get_actor_identity\(bigint,bigint,uuid,text\)/);
  assert.match(migration, /gateway_read_business_registration_identity\(bigint,bigint,uuid,text,bigint\)/);
  assert.match(migration, /gateway_update_business_registration_identity\(bigint,bigint,uuid,text,bigint,text,text,text\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.gateway_update_business_registration_identity\(bigint,bigint,uuid,text,bigint,text,text,text\) FROM PUBLIC,ghm_runtime,ghm_migrator/);
});
