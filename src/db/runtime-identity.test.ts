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

for (const [label, field, value] of [
  ['legacy application login', 'session_user', 'ghm_app_user'],
  ['legacy effective database role', 'current_user', 'ghm_db_user'],
  ['migrator login', 'session_user', 'ghm_migrator'],
  ['schema-owner effective role', 'current_user', 'ghm_schema_owner'],
] as const) {
  test(`rejects the ${label}`, async () => {
    await assert.rejects(
      () => assertRuntimeDatabaseIdentity(async () => ({
        rows: [{ ...validIdentity, [field]: value }],
      })),
      /Runtime database identity verification failed/,
    );
  });
}

test('rejects an empty identity result', async () => {
  await assert.rejects(
    () => assertRuntimeDatabaseIdentity(async () => ({ rows: [] })),
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
