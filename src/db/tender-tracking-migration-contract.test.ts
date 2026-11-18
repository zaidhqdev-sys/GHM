import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// STATIC checks on the SQL text only. NOTHING here executes the migration: it has not
// been run on any PostgreSQL database (blocker B5). These tests pin intent so a
// regression in the text is caught; they do not prove the SQL works.
const file = 'database/migrations/20261118100000_create_tender_tracking_and_audit.sql';
const sql = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
const allowlist = fs.readFileSync(path.resolve(process.cwd(), 'src/db/production-pending-migration-allowlist.ts'), 'utf8');
const fnBody = (name: string): string => {
  const m = sql.match(new RegExp(`FUNCTION ghm\\.${name}\\([\\s\\S]*?\\n\\$[a-z]+\\$;`));
  assert.ok(m, `function ${name} not found`);
  return m[0];
};
const gatewayFns = ['create', 'list', 'get', 'update', 'archive', 'delete'].map(o => `gateway_${o}_tender_tracking`);

test('migration is timestamped after both newer security migrations and is not in the production allowlist', () => {
  const names = fs.readdirSync(path.resolve(process.cwd(), 'database/migrations')).sort();
  const mine = path.basename(file);
  for (const prior of ['20261117010000_revoke_runtime_business_registration_identity_write.sql', '20261117020000_revoke_runtime_capability_governance.sql']) {
    assert.ok(names.includes(prior), `${prior} must remain present`);
    assert.ok(names.indexOf(prior) < names.indexOf(mine));
  }
  assert.ok(!allowlist.includes('create_tender_tracking_and_audit'));
});

test('tables are owned by the schema owner, RLS-enabled and granted to nobody', () => {
  for (const t of ['tender_tracking', 'tender_audit_event']) {
    assert.match(sql, new RegExp(`ALTER TABLE ghm\\.${t} OWNER TO ghm_schema_owner`));
    assert.match(sql, new RegExp(`ALTER TABLE ghm\\.${t} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /REVOKE ALL ON TABLE ghm\.tender_tracking, ghm\.tender_audit_event\s+FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway/);
  assert.doesNotMatch(sql, /GRANT (SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON (TABLE )?ghm\.tender_/);
});

test('audit table is append-only: UPDATE, DELETE and TRUNCATE are all rejected with 55000', () => {
  assert.match(sql, /BEFORE UPDATE OR DELETE ON ghm\.tender_audit_event\s+FOR EACH ROW/);
  assert.match(sql, /BEFORE TRUNCATE ON ghm\.tender_audit_event\s+FOR EACH STATEMENT/);
  assert.match(fnBody('reject_tender_audit_mutation'), /ERRCODE = '55000'/);
});

test('audit rows restrict actor and business deletion and do not cascade from the resource', () => {
  const audit = sql.slice(sql.indexOf('CREATE TABLE ghm.tender_audit_event'), sql.indexOf('CREATE INDEX tender_audit_event_business_idx'));
  assert.match(audit, /actor_account_id bigint NOT NULL REFERENCES ghm\.account_identity\(id\) ON DELETE RESTRICT/);
  assert.match(audit, /business_id bigint NOT NULL REFERENCES ghm\.business\(id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(audit, /ON DELETE (CASCADE|SET NULL)/);
  assert.doesNotMatch(audit, /resource_id bigint NOT NULL REFERENCES/);
  assert.match(audit, /request_id uuid NOT NULL/);
  assert.match(audit, /client_correlation_id uuid,/);
  assert.match(audit, /CHECK \(outcome = 'success'\)/);
  assert.match(audit, /octet_length\(metadata::text\) <= 2048/);
  const tracking = sql.slice(sql.indexOf('CREATE TABLE ghm.tender_tracking'), sql.indexOf('CREATE INDEX tender_tracking_business_stage_idx'));
  assert.doesNotMatch(tracking, /ON DELETE (CASCADE|SET NULL)/);
  assert.doesNotMatch(sql, /DELETE FROM ghm\.tender_audit_event|TRUNCATE\s+(TABLE\s+)?ghm\.tender_audit_event;/);
});

test('archive and permanent delete are separate operations with separate audit types', () => {
  for (const op of ['create', 'update', 'archive', 'delete']) assert.ok(sql.includes(`'tender.tracking.${op}'`));
  assert.match(fnBody('gateway_archive_tender_tracking'), /'tender\.tracking\.archive'/);
  assert.doesNotMatch(fnBody('gateway_archive_tender_tracking'), /DELETE FROM ghm\.tender_tracking/);
  const del = fnBody('gateway_delete_tender_tracking');
  assert.match(del, /DELETE FROM ghm\.tender_tracking/);
  assert.match(del, /'tender\.tracking\.delete'/);
  assert.doesNotMatch(del, /ghm\.tender_audit_event/);
  // The delete function records its audit event AFTER the row is gone, in the same function.
  assert.ok(del.indexOf('DELETE FROM ghm.tender_tracking') < del.indexOf('record_tender_audit_event'));
});

test('update cannot reach the archived stage and archived records cannot be edited', () => {
  const upd = fnBody('gateway_update_tender_tracking');
  assert.match(upd, /NOT IN \('saved', 'evaluating', 'preparing', 'submitted'\)/);
  assert.match(upd, /Archived tender tracking records cannot be edited/);
});

test('every gateway function verifies the assertion, binds its context, then authorizes server-side', () => {
  for (const name of gatewayFns) {
    const body = fnBody(name);
    assert.match(body, /p_context::jsonb IS DISTINCT FROM jsonb_build_object/, name);
    assert.match(body, /verify_tender_gateway_assertion\(/, name);
    assert.match(body, /require_tender_business_membership\(/, name);
    assert.ok(body.indexOf('IS DISTINCT FROM jsonb_build_object') < body.indexOf('verify_tender_gateway_assertion'), name);
    assert.ok(body.indexOf('verify_tender_gateway_assertion') < body.indexOf('require_tender_business_membership'), name);
    assert.match(body, /businessId/, name);
    assert.match(body, /SECURITY DEFINER/, name);
    assert.match(body, /SET search_path = pg_catalog, ghm, pg_temp/, name);
  }
  const verify = fnBody('verify_tender_gateway_assertion');
  assert.match(verify, /session_user <> 'ghm_actor_gateway'/);
  assert.match(verify, /public\.hmac\(convert_to\(v_payload, 'UTF8'\), v_secret, 'sha256'\)/);
  assert.match(verify, /ghm-actor-gateway:v2\|/);
  assert.match(verify, /> 60/);
  assert.match(verify, /assertion replay detected/);
  assert.match(verify, /ai\.account_status = 'active'/);
});

test('mutations that change a record sign the request ids; archive/delete require owner or administrator', () => {
  for (const name of ['gateway_create_tender_tracking', 'gateway_update_tender_tracking', 'gateway_archive_tender_tracking', 'gateway_delete_tender_tracking']) {
    const body = fnBody(name);
    assert.match(body, /'requestId', p_request_id::text/, name);
    assert.match(body, /'clientCorrelationId', p_client_correlation_id::text/, name);
    assert.match(body, /record_tender_audit_event\(/, name);
  }
  for (const name of ['gateway_archive_tender_tracking', 'gateway_delete_tender_tracking']) {
    assert.match(fnBody(name), /require_tender_business_membership\(p_actor, p_business_id, true\)/);
  }
  for (const name of ['gateway_create_tender_tracking', 'gateway_update_tender_tracking', 'gateway_get_tender_tracking', 'gateway_list_tender_tracking']) {
    assert.match(fnBody(name), /require_tender_business_membership\(p_actor, p_business_id, false\)/);
  }
  const member = fnBody('require_tender_business_membership');
  assert.match(member, /m\.membership_status = 'active'/);
  assert.match(member, /membership_role IN \('owner', 'administrator'\)/);
  assert.match(member, /\bFOR SHARE\b/);
  assert.match(member, /ERRCODE = '42501'/);
});

test('read functions write no audit event and a missing row is distinct only after authorization', () => {
  for (const name of ['gateway_list_tender_tracking', 'gateway_get_tender_tracking']) {
    assert.doesNotMatch(fnBody(name), /record_tender_audit_event|INSERT|UPDATE|DELETE FROM/, name);
  }
  const get = fnBody('gateway_get_tender_tracking');
  assert.match(get, /t\.business_id = p_business_id/);
  assert.ok(get.indexOf('require_tender_business_membership') < get.indexOf("ERRCODE = 'P0002'"));
});

test('every row lookup and write is scoped by the signed business id (tenant isolation)', () => {
  // Row lookups AND the write itself must each carry the business predicate.
  const expected: Record<string, number> = {
    gateway_get_tender_tracking: 1, gateway_update_tender_tracking: 2, gateway_archive_tender_tracking: 2, gateway_delete_tender_tracking: 1,
  };
  for (const [name, count] of Object.entries(expected)) {
    assert.equal((fnBody(name).match(/AND t\.business_id = p_business_id/g) ?? []).length, count, name);
  }
  assert.match(fnBody('gateway_list_tender_tracking'), /x\.business_id = p_business_id/);
});

test('caps are enforced inside the database under a per-business advisory lock', () => {
  const create = fnBody('gateway_create_tender_tracking');
  assert.match(create, /pg_advisory_xact_lock\(hashtextextended\('tender-tracking:'/);
  assert.match(create, /v_active >= 500 OR v_total >= 2000/);
  assert.ok(create.indexOf('pg_advisory_xact_lock') < create.indexOf('INSERT INTO ghm.tender_tracking'));
  assert.match(fnBody('gateway_list_tender_tracking'), /p_limit NOT BETWEEN 1 AND 50/);
});

test('field limits and https-only URLs are repeated as CHECK constraints', () => {
  assert.match(sql, /BETWEEN 1 AND 300/);
  assert.match(sql, /BETWEEN 1 AND 120/);
  assert.match(sql, /BETWEEN 1 AND 200/);
  assert.match(sql, /source_url ~\* '\^https:\/\/\[\^\[:space:\]\]\+\$'/);
  assert.match(sql, /CHECK \(\(stage = 'archived'\) = \(archived_at IS NOT NULL\)\)/);
  assert.match(sql, /'sourceUrlVerified', false/);
});

test('gateway functions: owner, no PUBLIC/runtime/migrator access, gateway-only execute; helpers have no grants', () => {
  for (const name of gatewayFns) {
    assert.match(sql, new RegExp(`ALTER FUNCTION ghm\\.${name}\\([^)]*\\)\\s+OWNER TO ghm_schema_owner`), name);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION ghm\\.${name}\\([^)]*\\)\\s+FROM PUBLIC, ghm_runtime, ghm_migrator;`), name);
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ghm\\.${name}\\([^)]*\\)\\s+TO ghm_actor_gateway;`), name);
  }
  for (const helper of ['verify_tender_gateway_assertion', 'require_tender_business_membership', 'record_tender_audit_event', 'tender_tracking_json']) {
    assert.doesNotMatch(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ghm\\.${helper}`), helper);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION ghm\\.${helper}\\([^)]*\\)\\s+FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway`), helper);
  }
  assert.doesNotMatch(sql, /WITH GRANT OPTION/);
});

test('privilege checker lists exactly the six tender gateway signatures (and no helper)', () => {
  const ts = fs.readFileSync(path.resolve(process.cwd(), 'src/actor-gateway/database-privileges.ts'), 'utf8');
  for (const name of gatewayFns) assert.ok(ts.includes(`ghm.${name}(`), name);
  for (const helper of ['verify_tender_gateway_assertion', 'require_tender_business_membership', 'record_tender_audit_event']) {
    assert.ok(!ts.includes(helper), helper);
  }
});

test('audit metadata never carries tender text: only field names, stages and flags', () => {
  const upd = fnBody('gateway_update_tender_tracking');
  assert.match(upd, /'fields', to_jsonb\(v_keys\)/);
  const metadataCalls = sql.match(/jsonb_build_object\('(?:stage|fromStage|fields)'[^;]*\)/g) ?? [];
  for (const m of metadataCalls) assert.doesNotMatch(m, /title|source_url|issuer|reference/i);
});
