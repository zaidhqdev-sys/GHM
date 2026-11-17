import test from 'node:test';
import assert from 'node:assert/strict';
import {
  provisionVerifierSecretInsertOnly,
  validateVerifierSecretProvisioningConfig,
} from './lib/database-verifier-secret-provisioning.mjs';

const secret = Buffer.alloc(32, 7).toString('base64');
const envFor = (overrides = {}) => ({
  GHM_DATABASE_VERIFIER_SECRET_KIND: 'actor',
  GHM_SECRET_PROVISIONING_TARGET: 'disposable',
  GHM_MIGRATOR_DATABASE_URL: 'postgresql://ghm_migrator:qualification@localhost:5433/ghm_disposable_test',
  GHM_QUALIFICATION_DATABASE_NAME: 'ghm_disposable_test',
  GHM_DATABASE_VERIFIER_SECRET_ALLOW_DISPOSABLE_MUTATION: 'true',
  GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET: secret,
  ...overrides,
});

test('accepts only explicit local disposable qualification configuration', () => {
  const config = validateVerifierSecretProvisioningConfig(envFor());
  assert.equal(config.database, 'ghm_disposable_test');
  assert.equal(config.ssl, false);
  assert.equal(config.definition.table, 'actor_gateway_capability_assertion_secret');
});

test('selects the separate storage-provider verifier table and secret', () => {
  const config = validateVerifierSecretProvisioningConfig(envFor({
    GHM_DATABASE_VERIFIER_SECRET_KIND: 'storage',
    GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET: secret,
  }));
  assert.equal(config.definition.table, 'storage_provider_workflow_attestation_secret');
  assert.equal(config.definition.envName, 'GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET');
});

test('rejects production without the exact explicit confirmation', () => {
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_SECRET_PROVISIONING_TARGET: 'production',
    GHM_MIGRATOR_DATABASE_URL: 'postgresql://ghm_migrator:secret@db.example/ghm_db',
    DATABASE_SSL: 'true',
    GHM_SECRET_PROVISIONING_EXPECTED_HOST: 'db.example',
  })), /exact explicit confirmation/);
});

test('production requires exact ghm_db, explicit confirmation and strict TLS', () => {
  const config = validateVerifierSecretProvisioningConfig(envFor({
    GHM_SECRET_PROVISIONING_TARGET: 'production',
    GHM_SECRET_PROVISIONING_CONFIRMATION: 'PROVISION ghm_db actor',
    GHM_SECRET_PROVISIONING_EXPECTED_HOST: 'db.example',
    GHM_MIGRATOR_DATABASE_URL: 'postgresql://ghm_migrator:secret@db.example/ghm_db',
    DATABASE_SSL: 'true',
  }));
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(config.database, 'ghm_db');
});

test('rejects production without strict TLS or when targeting another database', () => {
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_SECRET_PROVISIONING_TARGET: 'production',
    GHM_SECRET_PROVISIONING_CONFIRMATION: 'PROVISION ghm_db actor',
    GHM_SECRET_PROVISIONING_EXPECTED_HOST: 'db.example',
    GHM_MIGRATOR_DATABASE_URL: 'postgresql://ghm_migrator:secret@db.example/ghm_db',
  })), /DATABASE_SSL=true/);
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_SECRET_PROVISIONING_TARGET: 'production',
    GHM_SECRET_PROVISIONING_CONFIRMATION: 'PROVISION ghm_db actor',
    GHM_SECRET_PROVISIONING_EXPECTED_HOST: 'db.example',
    GHM_MIGRATOR_DATABASE_URL: 'postgresql://ghm_migrator:secret@db.example/other',
    DATABASE_SSL: 'true',
  })), /ghm_db/);
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_SECRET_PROVISIONING_TARGET: 'production',
    GHM_SECRET_PROVISIONING_CONFIRMATION: 'PROVISION ghm_db actor',
    GHM_SECRET_PROVISIONING_EXPECTED_HOST: 'another.example',
    GHM_MIGRATOR_DATABASE_URL: 'postgresql://ghm_migrator:secret@db.example/ghm_db',
    DATABASE_SSL: 'true',
  })), /expected host/);
});

test('rejects generic users, URL parameters, wrong hosts, and unapproved disposable mutations', () => {
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_MIGRATOR_DATABASE_URL: 'postgresql://postgres:secret@localhost:5433/ghm_disposable_test',
  })), /ghm_migrator/);
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_MIGRATOR_DATABASE_URL: 'postgresql://ghm_migrator:secret@localhost:5433/ghm_disposable_test?sslmode=require',
  })), /query parameters/);
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_MIGRATOR_DATABASE_URL: 'postgresql://ghm_migrator:secret@remote.example/ghm_disposable_test',
  })), /local qualification database/);
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_DATABASE_VERIFIER_SECRET_ALLOW_DISPOSABLE_MUTATION: 'false',
  })), /ALLOW_DISPOSABLE_MUTATION/);
});

test('rejects absent, malformed, and non-32-byte secrets', () => {
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET: '',
  })), /is required/);
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET: 'not-base64',
  })), /canonical base64/);
  assert.throws(() => validateVerifierSecretProvisioningConfig(envFor({
    GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET: Buffer.alloc(31).toString('base64'),
  })), /exactly 32 bytes/);
});

test('provisions with verified migrator/schema-owner identities and never overwrites an existing row', async () => {
  const calls = [];
  const client = {
    async connect() { calls.push('connect'); },
    async query(sql) {
      calls.push(sql);
      if (sql === 'SELECT session_user,current_user,current_database()') {
        return { rows: [{ session_user: 'ghm_migrator', current_user: calls.filter((x) => x === sql).length === 1 ? 'ghm_migrator' : 'ghm_schema_owner', current_database: 'ghm_disposable_test' }] };
      }
      if (sql.startsWith('INSERT INTO')) return { rowCount: 1 };
      return { rowCount: 0 };
    },
    async end() { calls.push('end'); },
  };
  const config = validateVerifierSecretProvisioningConfig(envFor());
  const result = await provisionVerifierSecretInsertOnly(client, config);
  assert.equal(result.status, 'PROVISIONED');
  assert.equal(result.secret_value_logged, false);
  assert.equal(result.rotation, 'NOT_SUPPORTED_BY_THIS_COMMAND');
  assert.ok(calls.includes('SET LOCAL ROLE ghm_schema_owner'));
  assert.ok(calls.includes('COMMIT'));

  const conflictClient = {
    async connect() {},
    async query(sql) {
      if (sql === 'SELECT session_user,current_user,current_database()') {
        const count = this.identityCount = (this.identityCount ?? 0) + 1;
        return { rows: [{ session_user: 'ghm_migrator', current_user: count === 1 ? 'ghm_migrator' : 'ghm_schema_owner', current_database: 'ghm_disposable_test' }] };
      }
      if (sql.startsWith('INSERT INTO')) return { rowCount: 0 };
      return { rowCount: 0 };
    },
    async end() {},
  };
  await assert.rejects(() => provisionVerifierSecretInsertOnly(conflictClient, config), /already exists/);
});

test('rolls back when SET ROLE identity does not match', async () => {
  const statements = [];
  const client = {
    async connect() {},
    async query(sql) {
      statements.push(sql);
      if (sql === 'SELECT session_user,current_user,current_database()') {
        return { rows: [{ session_user: 'ghm_migrator', current_user: statements.filter((x) => x === sql).length === 1 ? 'ghm_migrator' : 'ghm_runtime', current_database: 'ghm_disposable_test' }] };
      }
      return { rowCount: 0 };
    },
    async end() {},
  };
  await assert.rejects(() => provisionVerifierSecretInsertOnly(client, validateVerifierSecretProvisioningConfig(envFor())), /identity verification failed/);
  assert.ok(statements.includes('ROLLBACK'));
});
