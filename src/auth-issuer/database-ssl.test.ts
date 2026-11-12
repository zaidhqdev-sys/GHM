import assert from 'node:assert/strict';
import test from 'node:test';
import { authIssuerDatabaseSslConfig } from './database-ssl';

test('allows internal and external issuer database modes', () => {
  assert.equal(authIssuerDatabaseSslConfig('internal', true), false);
  assert.deepEqual(authIssuerDatabaseSslConfig('external', true), { rejectUnauthorized: false });
});

test('defaults to no TLS only outside production', () => {
  assert.equal(authIssuerDatabaseSslConfig(undefined, false), false);
});

test('requires an explicit network mode in production', () => {
  assert.throws(() => authIssuerDatabaseSslConfig(undefined, true), /must be explicitly set/);
  assert.throws(() => authIssuerDatabaseSslConfig('unknown', true), /must be explicitly set/);
});
