import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPostgresTargetConfiguration } from './postgres-target-guard';

const expectation = {
  databaseName: 'ghm_db',
  host: 'dpg-dag0sdtbedkc7389vi2g-a.frankfurt-postgres.render.com',
  label: 'test migration target',
};

test('requires explicit approved database name and host', () => {
  assert.throws(
    () => assertPostgresTargetConfiguration('postgres://user:pass@host/ghm_db', {
      ...expectation,
      databaseName: undefined,
    }),
    /explicit approved database name is required/,
  );
  assert.throws(
    () => assertPostgresTargetConfiguration('postgres://user:pass@host/ghm_db', {
      ...expectation,
      host: undefined,
    }),
    /explicit approved PostgreSQL host is required/,
  );
});

test('accepts only the configured database and host', () => {
  const url = 'postgresql://user:pass@dpg-dag0sdtbedkc7389vi2g-a.frankfurt-postgres.render.com/ghm_db';
  assert.deepEqual(assertPostgresTargetConfiguration(url, expectation), {
    databaseName: 'ghm_db',
    host: 'dpg-dag0sdtbedkc7389vi2g-a',
  });
  assert.throws(
    () => assertPostgresTargetConfiguration(url, { ...expectation, databaseName: 'ghm_payfast_sandbox_db' }),
    /does not match the explicitly approved database name/,
  );
  assert.throws(
    () => assertPostgresTargetConfiguration(url, { ...expectation, host: 'other-host' }),
    /does not match the explicitly approved PostgreSQL host/,
  );
});

test('rejects malformed and non-PostgreSQL URLs', () => {
  assert.throws(() => assertPostgresTargetConfiguration('not a url', expectation), /URL is invalid/);
  assert.throws(
    () => assertPostgresTargetConfiguration('https://host/ghm_db', expectation),
    /only PostgreSQL connection URLs are allowed/,
  );
});
