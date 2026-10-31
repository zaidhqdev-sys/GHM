import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postgresSslConfig } from './postgres-ssl';

test('disables TLS only when explicitly disabled', () => {
  assert.equal(postgresSslConfig(false), false);
});

test('requires certificate validation whenever PostgreSQL TLS is enabled', () => {
  assert.deepEqual(postgresSslConfig(true), { rejectUnauthorized: true });
});
