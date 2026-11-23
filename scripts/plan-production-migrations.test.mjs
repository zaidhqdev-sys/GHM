import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const planner = fs.readFileSync('scripts/plan-production-migrations.mjs', 'utf8');

test('production planner requires a dedicated read-only audit identity and verified TLS', () => {
  assert.match(planner, /GHM_MIGRATION_AUDIT_DATABASE_URL/);
  assert.match(planner, /GHM_MIGRATION_AUDIT_HOST/);
  assert.match(planner, /expectedRole = 'ghm_audit_login'/);
  assert.match(planner, /ssl: \{ rejectUnauthorized: true \}/);
  assert.match(planner, /BEGIN READ ONLY/);
  assert.match(planner, /transaction_read_only !== 'on'/);
  assert.match(planner, /!\^\\d\{14\}\$\/.test\(version\)/);
});

test('production planner rolls back its read-only transaction and never executes migration SQL', () => {
  assert.match(planner, /ROLLBACK/);
  assert.match(planner, /sql_migrations_executed: 0/);
  assert.match(planner, /execution_performed: false/);
  assert.doesNotMatch(planner, /normalizeMigrationSqlForExecution/);
  assert.doesNotMatch(planner, /client\.query\(migration\.sql/);
  assert.doesNotMatch(planner, /SET ROLE/);
  assert.doesNotMatch(planner, /INSERT INTO ghm\.ghm_schema_migrations/);
});

test('production planner reports checksums, retained history, pending allowlist and batch eligibility', () => {
  for (const field of [
    'canonical_match_count', 'legacy_crlf_match_count', 'historical_exception_match_count',
    'retained_verified_count', 'omitted_from_allowlist_count', 'production_execution_authorized',
    'NO_AUTHORIZED_BATCH', 'NOT_SELECTABLE',
  ]) assert.ok(planner.includes(field), 'missing planner report field: ' + field);
});
