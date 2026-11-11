import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRuntimeDatabaseIdentity } from './runtime-principal';

test('accepts only the dedicated ghm_runtime database principal', () => {
  assert.doesNotThrow(() => assertRuntimeDatabaseIdentity({
    session_user: 'ghm_runtime',
    current_user: 'ghm_runtime',
  }));
});

test('rejects a generic or over-privileged login principal', () => {
  assert.throws(
    () => assertRuntimeDatabaseIdentity({
      session_user: 'ghm_app_user',
      current_user: 'ghm_db_user',
    }),
    /Runtime database identity mismatch/,
  );
});

test('rejects an unexpected effective role even when the login is ghm_runtime', () => {
  assert.throws(
    () => assertRuntimeDatabaseIdentity({
      session_user: 'ghm_runtime',
      current_user: 'ghm_schema_owner',
    }),
    /Runtime database identity mismatch/,
  );
});
