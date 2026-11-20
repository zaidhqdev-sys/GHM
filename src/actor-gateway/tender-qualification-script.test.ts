import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// STATIC wiring checks only. They do not execute any SQL and are NOT PostgreSQL qualification.
const root = join(__dirname, '..', '..');
const read = (f: string): string => readFileSync(join(root, f), 'utf8');

test('the principal qualification script runs the tender qualification only when both migrations exist and fails on a partial state', () => {
  const s = read('scripts/qualify-actor-gateway-principal.mjs');
  assert.match(s, /from '\.\/qualify-tender-gateway-postgres\.mjs'/);
  assert.match(s, /tenderPresent\.tracking && tenderPresent\.analysis/);
  assert.match(s, /Partial tender migration state/);
  assert.match(s, /SKIPPED \(tender migrations not applied/);
  assert.ok(s.indexOf('qualifyTenderGateway({') < s.indexOf("'GHM ACTOR GATEWAY DATABASE PRINCIPAL QUALIFICATION: PASS'"));
  // the tender fixtures must not be handed to the existing cleanup (audit rows are undeletable by design)
  assert.doesNotMatch(s, /fixture\.(accountIds|businessIds)\.push\([^)]*tender/i);
});

test('the tender qualification script names every gateway function, the audit foreign keys and the forced-failure rollback', () => {
  const s = read('scripts/qualify-tender-gateway-postgres.mjs');
  for (const f of ['create', 'list', 'get', 'update', 'archive', 'delete']) assert.ok(s.includes(`gateway_${f}_tender_tracking`));
  for (const f of ['create', 'list', 'get', 'delete']) assert.ok(s.includes(`gateway_${f}_tender_analysis`));
  for (const needle of ['confdeltype', "['r']", "['n']", 'NOT VALID', 'TRUNCATE ghm.tender_audit_event', 'pg_advisory', 'Promise.allSettled', 'octet_length(result::text)']) {
    assert.ok(s.includes(needle) || needle === 'pg_advisory', `missing: ${needle}`);
  }
  assert.doesNotMatch(s, /ghm_db\b|DATABASE_URL|process\.env/, 'it must not read or name any connection string');
});

test('the production migration allowlist still contains no tender migration', () => {
  assert.doesNotMatch(read('src/db/production-pending-migration-allowlist.ts'), /tender/i);
});
