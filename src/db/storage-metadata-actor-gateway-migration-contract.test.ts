import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261112140000_add_signed_storage_metadata_actor_gateway.sql', 'utf8');

test('storage actor operations are allow-listed by the shared v2 assertion verifier', () => {
  for (const operation of ['storage.metadata.create','storage.metadata.read','storage.metadata.mark_deletion_pending']) {
    assert.ok(migration.includes(`'${operation}'`));
  }
  assert.ok(migration.includes('ghm-actor-gateway:v2|'));
  assert.match(migration, /Actor assertion replay detected/);
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
});

test('storage create binds every metadata argument to the signed context', () => {
  assert.match(migration, /jsonb_build_object\([\s\S]*?'businessId',p_business[\s\S]*?'originalFilename',p_original_filename[\s\S]*?\)/);
  assert.match(migration, /p_resource_type<>'business'/);
  assert.match(migration, /p_resource_id IS DISTINCT FROM p_business/);
  assert.match(migration, /p_object_class<>'business_logo'/);
  assert.match(migration, /media\/logos\/'\|\|p_business::text/);
  assert.match(migration, /p_byte_size>2097152/);
  assert.match(migration, /bm\.membership_role IN \('owner','administrator'\)/);
});

test('object read derives tenant from stored object and preserves public logo access', () => {
  assert.match(migration, /jsonb_build_object\('objectId',p_object_id\)/);
  assert.match(migration, /so\.tenant_business_id/);
  assert.match(migration, /so\.visibility='public'[\s\S]*?so\.object_class='business_logo'/);
  assert.match(migration, /bm\.account_id=v_actor/);
});

test('deletion request requires an active manager of the object tenant', () => {
  assert.match(migration, /storage\.metadata\.mark_deletion_pending/);
  assert.match(migration, /SELECT tenant_business_id INTO v_business FROM ghm\.storage_object WHERE id=p_object_id/);
  assert.match(migration, /bm\.membership_role IN \('owner','administrator'\)/);
  assert.match(migration, /ghm\.storage_mark_deletion_pending\(p_object_id\)/);
});

test('new storage gateway wrappers are executable only by the Actor Gateway', () => {
  for (const signature of [
    'gateway_storage_create_pending(bigint,bigint,uuid,text,text,bigint,text,bigint,text,text,text,bigint,text,text)',
    'gateway_storage_get_object(bigint,bigint,uuid,text,text,bigint)',
    'gateway_storage_mark_deletion_pending(bigint,bigint,uuid,text,text,bigint)',
  ]) {
    assert.ok(migration.includes(`REVOKE ALL ON FUNCTION ghm.${signature} FROM PUBLIC,ghm_runtime,ghm_migrator`));
    assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION ghm.${signature} TO ghm_actor_gateway`));
  }
  assert.doesNotMatch(migration, /storage\.metadata\.mark_available|storage\.metadata\.mark_deleted/);
});
