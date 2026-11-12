import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261112150000_add_storage_provider_workflow_attestation.sql', 'utf8');

test('provider attestation uses a separate domain, protected secret and replay table', () => {
  assert.ok(migration.includes('ghm-storage-provider:v1|'));
  assert.ok(migration.includes('storage_provider_workflow_attestation_secret'));
  assert.ok(migration.includes('storage_provider_workflow_attestation_nonce'));
  assert.ok(migration.includes("session_user<>'ghm_actor_gateway'"));
  assert.ok(migration.includes("p_operation NOT IN ('storage.provider.mark_available','storage.provider.mark_deleted')"));
  assert.ok(migration.includes('Storage provider attestation replay detected'));
  assert.ok(migration.includes('FOR v_i IN 0..31 LOOP'));
  assert.ok(migration.includes('FROM PUBLIC,ghm_runtime,ghm_actor_gateway,ghm_migrator'));
});

test('mark available requires actor and provider proofs bound to stored provider metadata', () => {
  assert.ok(migration.includes("'storage.metadata.mark_available'"));
  assert.ok(migration.includes("'storage.provider.mark_available'"));
  assert.ok(migration.includes("'businessId',v_row.tenant_business_id"));
  assert.ok(migration.includes("'providerKey',v_row.provider_key"));
  assert.ok(migration.includes("'contentType',v_row.content_type"));
  assert.ok(migration.includes("'byteSize',v_row.byte_size"));
  assert.ok(migration.includes("v_row.status<>'pending'"));
  assert.ok(migration.includes("bm.membership_role IN ('owner','administrator')"));
  assert.ok(migration.includes('ghm.storage_mark_available(p_object_id,p_checksum)'));
});

test('mark deleted requires actor and provider proofs and only completes deletion-pending rows', () => {
  assert.ok(migration.includes("'storage.metadata.mark_deleted'"));
  assert.ok(migration.includes("'storage.provider.mark_deleted'"));
  assert.ok(migration.includes("v_row.status<>'deletion_pending'"));
  assert.ok(migration.includes("'businessId',v_row.tenant_business_id"));
  assert.ok(migration.includes('ghm.storage_mark_deleted(p_object_id)'));
});

test('provider transition wrappers are executable only by Actor Gateway', () => {
  for (const prefix of ['gateway_storage_mark_available(', 'gateway_storage_mark_deleted(']) {
    const start = migration.indexOf('REVOKE ALL ON FUNCTION ghm.' + prefix);
    assert.ok(start >= 0);
    const grant = migration.indexOf('GRANT EXECUTE ON FUNCTION ghm.' + prefix);
    assert.ok(grant > start);
  }
});
