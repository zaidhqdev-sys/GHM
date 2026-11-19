import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// STATIC checks on SQL text only. NOTHING here executes the migration: it has not been run on any
// PostgreSQL database (blocker B5). These pin intent; they do not prove the SQL works.
const file = 'database/migrations/20261119100000_create_tender_analysis_and_extend_audit.sql';
const sql = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
const tracking = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261118100000_create_tender_tracking_and_audit.sql'), 'utf8');
const allowlist = fs.readFileSync(path.resolve(process.cwd(), 'src/db/production-pending-migration-allowlist.ts'), 'utf8');
const fnBody = (name: string): string => {
  const m = sql.match(new RegExp(`FUNCTION ghm\\.${name}\\([\\s\\S]*?\\n\\$[a-z]+\\$;`));
  assert.ok(m, `function ${name} not found`);
  return m[0];
};
const gatewayFns = ['create', 'list', 'get', 'delete'].map(o => `gateway_${o}_tender_analysis`);

test('migration is ordered after the tracking migration and both security migrations, and is not allow-listed', () => {
  const names = fs.readdirSync(path.resolve(process.cwd(), 'database/migrations')).sort();
  const mine = path.basename(file);
  for (const prior of ['20261117010000_revoke_runtime_business_registration_identity_write.sql', '20261117020000_revoke_runtime_capability_governance.sql', '20261118100000_create_tender_tracking_and_audit.sql']) {
    assert.ok(names.includes(prior));
    assert.ok(names.indexOf(prior) < names.indexOf(mine));
  }
  assert.ok(!allowlist.includes('tender_analysis'));
});

test('table: owned by the schema owner, RLS on, no grant to any application role, no cascade from business or actor', () => {
  assert.match(sql, /ALTER TABLE ghm\.tender_analysis OWNER TO ghm_schema_owner/);
  assert.match(sql, /ALTER TABLE ghm\.tender_analysis ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE ghm\.tender_analysis FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway/);
  assert.doesNotMatch(sql, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON (TABLE )?ghm\.tender_analysis/);
  const table = sql.slice(sql.indexOf('CREATE TABLE ghm.tender_analysis'), sql.indexOf('CREATE INDEX tender_analysis_business_idx'));
  assert.match(table, /business_id bigint NOT NULL REFERENCES ghm\.business\(id\) ON DELETE RESTRICT/);
  assert.match(table, /created_by bigint NOT NULL REFERENCES ghm\.account_identity\(id\) ON DELETE RESTRICT/);
  assert.match(table, /tender_tracking_id bigint REFERENCES ghm\.tender_tracking\(id\) ON DELETE SET NULL/);
  assert.doesNotMatch(table, /ON DELETE CASCADE/);
});

test('the version-2 shape is pinned: version 2, ai_extracted, hash only, no document text column, unsupported unrepresentable', () => {
  assert.match(sql, /CHECK \(projection_version = 2\)/);
  assert.match(sql, /CHECK \(source = 'ai_extracted'\)/);
  assert.match(sql, /document_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql, /coverage_status IN \('complete', 'incomplete'\)/);
  assert.doesNotMatch(sql, /unsupported'\)/);
  const table = sql.slice(sql.indexOf('CREATE TABLE ghm.tender_analysis'), sql.indexOf('CREATE INDEX tender_analysis_business_idx'));
  assert.doesNotMatch(table, /document_text|raw_text|\bcontent\b|\bbody\b/);
});

test('complete/incomplete status, counts and truncation are tied to the stored payload and never converted', () => {
  assert.match(sql, /CHECK \(\(coverage_status = 'complete'\) = \(chunks_processed = chunks_total\)\)/);
  assert.match(sql, /coverage_status = result#>>'\{coverage,status\}'/);
  assert.match(sql, /chunks_total = \(result#>>'\{coverage,chunksTotal\}'\)::integer/);
  assert.match(sql, /chunks_processed = \(result#>>'\{coverage,chunksProcessed\}'\)::integer/);
  assert.match(sql, /truncated_for_storage = \(result->>'truncatedForStorage'\)::boolean/);
  const problem = fnBody('tender_analysis_result_problem');
  for (const code of ['complete_but_unprocessed_parts', 'incomplete_inconsistent', 'processed_count_mismatch', 'chunk_list_does_not_match_total', 'truncation_flag_contradicts_counts', 'unexpected_keys']) {
    assert.ok(problem.includes(code), code);
  }
  // The create function derives the denormalised columns FROM the payload; it never takes them as input.
  const create = fnBody('gateway_create_tender_analysis');
  assert.match(create, /p_result#>>'\{coverage,status\}'/);
  assert.doesNotMatch(create, /p_coverage_status|p_chunks_total|p_chunks_processed|p_truncated/);
});

test('saved analyses are immutable; the only allowed change is the tracking unlink', () => {
  const guard = fnBody('guard_tender_analysis_update');
  assert.match(guard, /NEW\.tender_tracking_id IS NOT NULL/);
  assert.match(guard, /to_jsonb\(NEW\) - 'tender_tracking_id'/);
  assert.match(guard, /ERRCODE = '55000'/);
  assert.match(sql, /BEFORE UPDATE ON ghm\.tender_analysis\s+FOR EACH ROW/);
  for (const name of gatewayFns) assert.doesNotMatch(fnBody(name), /UPDATE ghm\.tender_analysis/);
});

test('audit: both analysis mutations have separate event types; the audit table gains no weaker rules', () => {
  assert.match(sql, /'tender\.analysis\.create', 'tender\.analysis\.delete'/);
  assert.match(sql, /resource_type IN \('tracking', 'analysis'\)/);
  assert.match(sql, /DROP CONSTRAINT tender_audit_operation_valid/);
  assert.doesNotMatch(sql, /DISABLE TRIGGER|DROP TRIGGER|ALTER TABLE ghm\.tender_audit_event (DISABLE|NO FORCE)|DELETE FROM ghm\.tender_audit_event|TRUNCATE/);
  assert.doesNotMatch(sql, /ghm\.tender_audit_event\s+(ADD|DROP) COLUMN/);
  // The audit table keeps no foreign key to the analysis, so deleting one cannot touch its history.
  assert.doesNotMatch(tracking.slice(tracking.indexOf('CREATE TABLE ghm.tender_audit_event')), /REFERENCES ghm\.tender_analysis/);
  const create = fnBody('gateway_create_tender_analysis');
  const del = fnBody('gateway_delete_tender_analysis');
  assert.match(create, /record_tender_audit_event\([\s\S]*'tender\.analysis\.create', 'analysis'/);
  assert.match(del, /record_tender_audit_event\([\s\S]*'tender\.analysis\.delete', 'analysis'/);
  assert.ok(del.indexOf('DELETE FROM ghm.tender_analysis') < del.indexOf('record_tender_audit_event'));
  assert.doesNotMatch(del, /ghm\.tender_audit_event/);
  for (const name of ['gateway_list_tender_analysis', 'gateway_get_tender_analysis']) {
    assert.doesNotMatch(fnBody(name), /record_tender_audit_event|INSERT|DELETE FROM|UPDATE ghm/, name);
  }
});

test('audit metadata carries only status, counts, flags, the document hash and a linked flag: no tender text', () => {
  const create = fnBody('gateway_create_tender_analysis');
  const meta = create.slice(create.indexOf("'tender.analysis.create', 'analysis'"));
  for (const allowed of ['coverageStatus', 'chunksTotal', 'chunksProcessed', 'truncatedForStorage', 'documentSha256', 'trackingLinked']) {
    assert.ok(meta.includes(`'${allowed}'`), allowed);
  }
  assert.doesNotMatch(meta, /summary|quote|requirements|p_result\s*[,)]/i);
});

test('every gateway function binds its context, verifies the one-use assertion, then authorizes server-side', () => {
  for (const name of gatewayFns) {
    const body = fnBody(name);
    assert.ok(body.indexOf('IS DISTINCT FROM jsonb_build_object') > 0, name);
    assert.ok(body.indexOf('IS DISTINCT FROM jsonb_build_object') < body.indexOf('verify_tender_gateway_assertion'), name);
    assert.ok(body.indexOf('verify_tender_gateway_assertion') < body.indexOf('require_tender_business_membership'), name);
    assert.match(body, /'businessId', p_business_id/, name);
    assert.match(body, /SECURITY DEFINER/, name);
    assert.match(body, /SET search_path = pg_catalog, ghm, pg_temp/, name);
  }
  const create = fnBody('gateway_create_tender_analysis');
  for (const k of ['trackingId', 'model', 'promptVersion', 'documentSha256', 'result', 'requestId', 'clientCorrelationId']) {
    assert.match(create, new RegExp(`'${k}', p_`), k);
  }
  assert.match(create, /'documentHashVersion', 1/);
  assert.match(fnBody('gateway_delete_tender_analysis'), /'requestId', p_request_id::text/);
});

test('roles: members create/list/get; only owner or administrator deletes', () => {
  for (const name of ['gateway_create_tender_analysis', 'gateway_list_tender_analysis', 'gateway_get_tender_analysis']) {
    assert.match(fnBody(name), /require_tender_business_membership\(p_actor, p_business_id, false\)/, name);
  }
  assert.match(fnBody('gateway_delete_tender_analysis'), /require_tender_business_membership\(p_actor, p_business_id, true\)/);
});

test('tenant isolation: every lookup and write carries the signed business id; foreign tracking ids look missing', () => {
  assert.match(fnBody('gateway_get_tender_analysis'), /AND a\.business_id = p_business_id/);
  assert.match(fnBody('gateway_delete_tender_analysis'), /AND a\.business_id = p_business_id/);
  assert.match(fnBody('gateway_list_tender_analysis'), /x\.business_id = p_business_id/);
  const create = fnBody('gateway_create_tender_analysis');
  assert.match(create, /t\.id = p_tracking_id AND t\.business_id = p_business_id/);
  assert.ok(create.indexOf('t.business_id = p_business_id') < create.indexOf("ERRCODE = 'P0002'"));
});

test('cap of 100 per business under an advisory lock; list is metadata-only and bounded', () => {
  const create = fnBody('gateway_create_tender_analysis');
  assert.match(create, /pg_advisory_xact_lock\(hashtextextended\('tender-analysis:'/);
  assert.match(create, /v_count >= 100 THEN/);
  assert.ok(create.indexOf('pg_advisory_xact_lock') < create.indexOf('INSERT INTO ghm.tender_analysis'));
  const list = fnBody('gateway_list_tender_analysis');
  assert.match(list, /p_limit NOT BETWEEN 1 AND 50/);
  assert.match(list, /tender_analysis_json\(t\.r, false\)/);
  assert.match(fnBody('gateway_get_tender_analysis'), /tender_analysis_json\(v_row, true\)/);
});

test('assertion verifier is widened to exactly the four analysis operations and keeps the same checks', () => {
  const verify = fnBody('verify_tender_gateway_assertion');
  for (const op of ['create', 'list', 'get', 'delete']) assert.ok(verify.includes(`'tender.analysis.${op}'`), op);
  assert.doesNotMatch(verify, /tender\.analysis\.(update|archive)/);
  for (const op of ['create', 'list', 'get', 'update', 'archive', 'delete']) assert.ok(verify.includes(`'tender.tracking.${op}'`), op);
  assert.match(verify, /session_user <> 'ghm_actor_gateway'/);
  assert.match(verify, /public\.hmac\(convert_to\(v_payload, 'UTF8'\), v_secret, 'sha256'\)/);
  assert.match(verify, /assertion replay detected/);
  assert.match(verify, /> 60/);
  assert.match(sql, /REVOKE ALL ON FUNCTION ghm\.verify_tender_gateway_assertion\([^)]*\)\s+FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway/);
});

test('gateway functions: owner, no PUBLIC/runtime/migrator access, gateway-only execute; helpers have no execute grant', () => {
  for (const name of gatewayFns) {
    assert.match(sql, new RegExp(`ALTER FUNCTION ghm\\.${name}\\([^)]*\\)\\s+OWNER TO ghm_schema_owner`), name);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION ghm\\.${name}\\([^)]*\\)\\s+FROM PUBLIC, ghm_runtime, ghm_migrator;`), name);
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ghm\\.${name}\\([^)]*\\)\\s+TO ghm_actor_gateway;`), name);
  }
  for (const helper of ['tender_analysis_result_problem', 'tender_analysis_json', 'guard_tender_analysis_update']) {
    assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ghm\\.${helper}`), helper);
  }
  assert.doesNotMatch(sql, /WITH GRANT OPTION/);
});

test('deleting a tracking record unlinks analyses; it cannot delete or alter them', () => {
  assert.match(sql, /ON DELETE SET NULL/);
  assert.doesNotMatch(tracking, /DELETE FROM ghm\.tender_analysis/);
});
