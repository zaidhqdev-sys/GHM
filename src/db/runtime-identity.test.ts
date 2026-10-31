import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRuntimeDatabaseIdentity } from './runtime-identity';

const validIdentity = {
  session_user: 'ghm_runtime',
  current_user: 'ghm_runtime',
  current_database: 'ghm_db',
};

test('accepts the dedicated runtime login and effective role', async () => {
  await assertRuntimeDatabaseIdentity(async () => ({
    rows: [validIdentity],
  }));
});

test('rejects the legacy application login', async () => {
  await assert.rejects(
    () => assertRuntimeDatabaseIdentity(async () => ({
      rows: [{
        ...validIdentity,
        session_user: 'ghm_app_user',
      }],
    })),
    /Runtime database identity verification failed/,
  );
});

test('rejects the legacy effective database role', async () => {
  await assert.rejects(
    () => assertRuntimeDatabaseIdentity(async () => ({
      rows: [{
        ...validIdentity,
        current_user: 'ghm_db_user',
      }],
    })),
    /Runtime database identity verification failed/,
  );
});

test('rejects a migrator login', async () => {
  await assert.rejects(
    () => assertRuntimeDatabaseIdentity(async () => ({
      rows: [{
        ...validIdentity,
        session_user: 'ghm_migrator',
      }],
    })),
    /Runtime database identity verification failed/,
  );
});

test('rejects an owner effective role', async () => {
  await assert.rejects(
    () => assertRuntimeDatabaseIdentity(async () => ({
      rows: [{
        ...validIdentity,
        current_user: 'ghm_schema_owner',
      }],
    })),
    /Runtime database identity verification failed/,
  );
});

test('rejects an empty identity result', async () => {
  await assert.rejects(
    () => assertRuntimeDatabaseIdentity(async () => ({
      rows: [],
    })),
    /Runtime database identity verification failed/,
  );
});

test('propagates database connection failures', async () => {
  await assert.rejects(
    () => assertRuntimeDatabaseIdentity(async () => {
      throw new Error('connection failed');
    }),
    /connection failed/,
  );
});
