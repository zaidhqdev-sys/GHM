// Disposable-PostgreSQL qualification of the two ZAID Tender AI Phase 1 migrations
// (20261118100000 tracking + audit, 20261119100000 saved analyses + audit extension).
//
// STATUS: WRITTEN, NOT YET EXECUTED. No database has run this. Static SQL tests and fakes are not
// PostgreSQL qualification; only a PASS from this module against a disposable database counts.
//
// It is invoked from scripts/qualify-actor-gateway-principal.mjs (which already enforces that the
// database is `ghm_disposable_test` and that the gateway/runtime/migrator identities are the
// expected ones) and only when the tender functions exist. It uses its OWN fixture accounts and
// Businesses and deliberately does NOT register them for that script's cleanup: the audit table is
// append-only and its foreign keys are RESTRICT, so a Business or account that has a tender audit
// event can never be deleted. That is itself asserted below. Run only against a throw-away database.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const summaryFixtures = JSON.parse(readFileSync(join(here, '..', 'src', 'tender', 'fixtures', 'summary-v2.json'), 'utf8'));
const validBody = name => structuredClone(summaryFixtures.create.find(c => c.name === name).input);

export const TENDER_TRACKING_FUNCTIONS = ['create', 'list', 'get', 'update', 'archive', 'delete'];
export const TENDER_ANALYSIS_FUNCTIONS = ['create', 'list', 'get', 'delete'];

const step = label => console.log(`TENDER ${label}: PASS`);

export const tenderMigrationsPresent = async pool => {
  const { rows } = await pool.query(`
    SELECT to_regprocedure('ghm.gateway_create_tender_tracking(bigint,bigint,uuid,text,text,bigint,text,text,text,text,text,uuid,uuid)') IS NOT NULL AS tracking,
           to_regprocedure('ghm.gateway_create_tender_analysis(bigint,bigint,uuid,text,text,bigint,bigint,text,text,text,jsonb,uuid,uuid)') IS NOT NULL AS analysis`);
  return rows[0];
};

export const qualifyTenderGateway = async ({ gatewayPool, runtimePool, migratorPool, signAssertion, expectSqlState }) => {
  const marker = `tender-qual-${randomUUID()}`;

  // ---- fixtures (owned by this module; never deleted: see header) ---------------------------
  const owner = migratorPool; // connects as ghm_migrator; fixtures are inserted via SET LOCAL ROLE ghm_schema_owner
  const asSchemaOwner = async work => {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      const out = await work(client);
      await client.query('COMMIT');
      return out;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  const account = (name, status = 'active') => asSchemaOwner(async c => Number((await c.query(
    "INSERT INTO ghm.account_identity (full_name, role, account_status) VALUES ($1, 'business', $2) RETURNING id", [`${marker} ${name}`, status])).rows[0].id));
  const business = name => asSchemaOwner(async c => Number((await c.query(
    "INSERT INTO ghm.business (name, slug, verification_status, is_active) VALUES ($1, $1, 'unverified', true) RETURNING id", [`${marker}-${name}`])).rows[0].id));
  const member = (businessId, accountId, role, status = 'active') => asSchemaOwner(c => c.query(
    'INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status) VALUES ($1,$2,$3,$4)', [businessId, accountId, role, status]));

  const [ownerA, adminA, memberA, outsider, inactiveA, ownerB, suspended] = await Promise.all(
    ['owner-a', 'admin-a', 'member-a', 'outsider', 'inactive-a', 'owner-b', 'suspended'].map(n => account(n, n === 'suspended' ? 'disabled' : 'active')));
  const [bizA, bizB] = [await business('a'), await business('b')];
  await member(bizA, ownerA, 'owner');
  await member(bizA, adminA, 'administrator');
  await member(bizA, memberA, 'member');
  await member(bizA, inactiveA, 'member', 'inactive');
  await member(bizA, suspended, 'owner');
  await member(bizB, ownerB, 'owner');
  step('FIXTURES CREATED (separate from the principal script cleanup)');

  // ---- helpers -------------------------------------------------------------------------------
  const ids = () => ({ requestId: randomUUID(), clientCorrelationId: randomUUID() });
  const call = (actor, operation, context, fn, args, { assertion } = {}) => {
    const a = assertion ?? signAssertion(actor, operation, context);
    const marks = args.map((_, i) => `$${i + 6}`).join(',');
    return gatewayPool.query(`SELECT ghm.${fn}($1,$2,$3::uuid,$4,$5${marks ? ',' + marks : ''}) AS r`,
      [actor, a.issuedAt, a.nonce, a.context, a.signature, ...args]);
  };
  const ok = async promise => (await promise).rows[0].r;
  const auditRows = async (where = 'true', params = []) => asSchemaOwner(async c => (await c.query(
    `SELECT * FROM ghm.tender_audit_event WHERE ${where} ORDER BY id`, params)).rows);

  // Wrappers that build the exact context the SQL function recomputes.
  const trackingCreate = (actor, businessId, f = {}, extra = ids()) => {
    const v = { title: 'Qualification tender', referenceNumber: null, issuerName: null, sourceUrl: null, closingAt: null, ...f };
    const context = { businessId, title: v.title, referenceNumber: v.referenceNumber, issuerName: v.issuerName, sourceUrl: v.sourceUrl,
      closingAt: v.closingAt, requestId: extra.requestId, clientCorrelationId: extra.clientCorrelationId };
    return call(actor, 'tender.tracking.create', context, 'gateway_create_tender_tracking',
      [businessId, v.title, v.referenceNumber, v.issuerName, v.sourceUrl, v.closingAt, extra.requestId, extra.clientCorrelationId]);
  };
  const trackingGet = (actor, businessId, trackingId) => call(actor, 'tender.tracking.get', { businessId, trackingId },
    'gateway_get_tender_tracking', [businessId, trackingId]);
  const trackingList = (actor, businessId, stage = null, limit = 50, after = null) => call(actor, 'tender.tracking.list',
    { businessId, stage, limit, after }, 'gateway_list_tender_tracking', [businessId, stage, limit, after]);
  const trackingUpdate = (actor, businessId, trackingId, patch, extra = ids()) => call(actor, 'tender.tracking.update',
    { businessId, trackingId, patch, requestId: extra.requestId, clientCorrelationId: extra.clientCorrelationId },
    'gateway_update_tender_tracking', [businessId, trackingId, JSON.stringify(patch), extra.requestId, extra.clientCorrelationId]);
  const trackingArchive = (actor, businessId, trackingId, extra = ids()) => call(actor, 'tender.tracking.archive',
    { businessId, trackingId, requestId: extra.requestId, clientCorrelationId: extra.clientCorrelationId },
    'gateway_archive_tender_tracking', [businessId, trackingId, extra.requestId, extra.clientCorrelationId]);
  const trackingDelete = (actor, businessId, trackingId, extra = ids()) => call(actor, 'tender.tracking.delete',
    { businessId, trackingId, requestId: extra.requestId, clientCorrelationId: extra.clientCorrelationId },
    'gateway_delete_tender_tracking', [businessId, trackingId, extra.requestId, extra.clientCorrelationId]);

  const analysisCreate = (actor, businessId, body, trackingId = null, extra = ids(), { assertion } = {}) => {
    const context = { businessId, trackingId, model: body.model, promptVersion: body.promptVersion, documentSha256: body.documentSha256,
      documentHashVersion: 1, result: body.result, requestId: extra.requestId, clientCorrelationId: extra.clientCorrelationId };
    return call(actor, 'tender.analysis.create', context, 'gateway_create_tender_analysis',
      [businessId, trackingId, body.model, body.promptVersion, body.documentSha256, JSON.stringify(body.result), extra.requestId, extra.clientCorrelationId],
      { assertion });
  };
  const analysisGet = (actor, businessId, analysisId) => call(actor, 'tender.analysis.get', { businessId, analysisId },
    'gateway_get_tender_analysis', [businessId, analysisId]);
  const analysisList = (actor, businessId, limit = 50, after = null) => call(actor, 'tender.analysis.list',
    { businessId, limit, after }, 'gateway_list_tender_analysis', [businessId, limit, after]);
  const analysisDelete = (actor, businessId, analysisId, extra = ids()) => call(actor, 'tender.analysis.delete',
    { businessId, analysisId, requestId: extra.requestId, clientCorrelationId: extra.clientCorrelationId },
    'gateway_delete_tender_analysis', [businessId, analysisId, extra.requestId, extra.clientCorrelationId]);

  // ---- 2/12: PL/pgSQL executes with real binding; privileges, owner, RLS ----------------------
  const created = await ok(trackingCreate(memberA, bizA, { title: '  Padded title  ', referenceNumber: 'REF-1', sourceUrl: 'https://example.org/t/1', closingAt: '2027-01-31T10:00:00.000Z' }));
  assert.equal(created.title, 'Padded title');
  assert.equal(created.stage, 'saved');
  assert.equal(created.createdBy, memberA);
  assert.equal(created.sourceUrlVerified, false);
  assert.equal(created.businessId, bizA);
  step('TRACKING CREATE EXECUTES WITH REAL PARAMETER BINDING (trim, stage, creator derived by SQL)');

  const fnRows = (await migratorPool.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, pg_get_userbyid(p.proowner) AS owner,
           has_function_privilege('ghm_actor_gateway', p.oid, 'EXECUTE') AS gateway,
           has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime,
           has_function_privilege('ghm_migrator', p.oid, 'EXECUTE') AS migrator,
           has_function_privilege('public', p.oid, 'EXECUTE') AS pub,
           coalesce(array_to_string(p.proconfig, ','), '') AS config
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm' AND (p.proname LIKE '%tender%')`)).rows;
  const gatewayFns = fnRows.filter(r => r.proname.startsWith('gateway_') && r.proname.includes('tender'));
  assert.deepEqual(gatewayFns.map(r => r.proname).sort(), [
    ...TENDER_TRACKING_FUNCTIONS.map(x => `gateway_${x}_tender_tracking`),
    ...TENDER_ANALYSIS_FUNCTIONS.map(x => `gateway_${x}_tender_analysis`),
  ].sort(), 'exactly six tracking and four analysis gateway functions');
  for (const r of gatewayFns) {
    assert.equal(r.gateway, true, `${r.proname} executable by gateway`);
    assert.deepEqual([r.runtime, r.migrator, r.pub], [false, false, false], `${r.proname} not executable by runtime/migrator/PUBLIC`);
    assert.equal(r.prosecdef, true);
    assert.equal(r.owner, 'ghm_schema_owner');
    assert.match(r.config, /search_path=pg_catalog, ghm, pg_temp/);
  }
  for (const r of fnRows.filter(x => !gatewayFns.includes(x))) {
    assert.deepEqual([r.gateway, r.runtime, r.migrator, r.pub], [false, false, false, false], `internal helper ${r.proname} executable by nobody but its owner`);
    assert.equal(r.owner, 'ghm_schema_owner');
  }
  const tables = (await migratorPool.query(`
    SELECT c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) AS owner,
           (SELECT count(*) FROM unnest(ARRAY['ghm_runtime','ghm_migrator','ghm_actor_gateway','public']) r,
                   unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
             WHERE has_table_privilege(r, c.oid, p)) AS direct_grants
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='ghm' AND c.relname IN ('tender_tracking','tender_audit_event','tender_analysis') ORDER BY 1`)).rows;
  assert.equal(tables.length, 3);
  for (const t of tables) {
    assert.equal(t.relrowsecurity, true, `${t.relname} RLS`);
    assert.equal(t.owner, 'ghm_schema_owner');
    assert.equal(Number(t.direct_grants), 0, `${t.relname} has no direct grants`);
  }
  for (const [pool, label] of [[gatewayPool, 'GATEWAY'], [runtimePool, 'RUNTIME']]) {
    for (const t of ['tender_tracking', 'tender_audit_event', 'tender_analysis']) {
      await expectSqlState(() => pool.query(`SELECT 1 FROM ghm.${t} LIMIT 1`), '42501', `${label} CANNOT READ ${t} DIRECTLY`);
      await expectSqlState(() => pool.query(`DELETE FROM ghm.${t}`), '42501', `${label} CANNOT DELETE FROM ${t} DIRECTLY`);
    }
  }
  await expectSqlState(() => runtimePool.query('SELECT ghm.gateway_get_tender_tracking($1,$2,$3,$4,$5,$6,$7)',
    [memberA, Math.floor(Date.now() / 1000), randomUUID(), '{}', '0'.repeat(64), bizA, 1]), '42501', 'RUNTIME CANNOT EXECUTE A TENDER GATEWAY FUNCTION');
  await expectSqlState(() => gatewayPool.query('SELECT ghm.verify_tender_gateway_assertion($1,$2,$3,$4,$5,$6)',
    [memberA, Math.floor(Date.now() / 1000), randomUUID(), 'tender.tracking.get', '{}', '0'.repeat(64)]), '42501', 'GATEWAY CANNOT CALL THE INTERNAL ASSERTION VERIFIER');
  step('PRIVILEGES: exact 6 + 4 gateway functions, helpers unreachable, owner, RLS, zero direct table grants');

  // ---- 3: assertion validation: tamper, binding, expiry, replay --------------------------------
  const good = signAssertion(memberA, 'tender.tracking.get', { businessId: bizA, trackingId: created.id });
  await ok(call(memberA, null, null, 'gateway_get_tender_tracking', [bizA, created.id], { assertion: good }));
  await expectSqlState(() => call(memberA, null, null, 'gateway_get_tender_tracking', [bizA, created.id], { assertion: good }), '42501', 'NONCE REPLAY IS REJECTED');
  await expectSqlState(() => call(memberA, null, null, 'gateway_get_tender_tracking', [bizA, created.id],
    { assertion: { ...signAssertion(memberA, 'tender.tracking.get', { businessId: bizA, trackingId: created.id }), signature: '0'.repeat(64) } }), '42501', 'BAD SIGNATURE REJECTED');
  await expectSqlState(() => call(memberA, null, null, 'gateway_get_tender_tracking', [bizA, created.id + 999],
    { assertion: signAssertion(memberA, 'tender.tracking.get', { businessId: bizA, trackingId: created.id }) }), '42501', 'CONTEXT BOUND TO TARGET (id substitution rejected)');
  await expectSqlState(() => call(memberA, null, null, 'gateway_get_tender_tracking', [bizB, created.id],
    { assertion: signAssertion(memberA, 'tender.tracking.get', { businessId: bizA, trackingId: created.id }) }), '42501', 'CONTEXT BOUND TO BUSINESS (business substitution rejected)');
  await expectSqlState(() => call(memberA, null, null, 'gateway_get_tender_tracking', [bizA, created.id],
    { assertion: signAssertion(memberA, 'tender.tracking.list', { businessId: bizA, trackingId: created.id }) }), '42501', 'OPERATION BOUND (a list assertion cannot authorise a get)');
  await expectSqlState(() => call(ownerA, null, null, 'gateway_get_tender_tracking', [bizA, created.id],
    { assertion: signAssertion(memberA, 'tender.tracking.get', { businessId: bizA, trackingId: created.id }) }), '42501', 'ACTOR BOUND (assertion for another actor rejected)');
  const now = Math.floor(Date.now() / 1000);
  await expectSqlState(() => call(memberA, null, null, 'gateway_get_tender_tracking', [bizA, created.id],
    { assertion: signAssertion(memberA, 'tender.tracking.get', { businessId: bizA, trackingId: created.id }, now - 120) }), '42501', 'EXPIRED ASSERTION (120 s old) REJECTED');
  await expectSqlState(() => call(memberA, null, null, 'gateway_get_tender_tracking', [bizA, created.id],
    { assertion: signAssertion(memberA, 'tender.tracking.get', { businessId: bizA, trackingId: created.id }, now + 120) }), '42501', 'FUTURE-DATED ASSERTION REJECTED');
  await expectSqlState(() => call(memberA, 'tender.tracking.get', { businessId: bizA, trackingId: created.id }, 'gateway_get_tender_tracking', [bizA, created.id],
    { assertion: signAssertion(memberA, 'tender.analysis.get', { businessId: bizA, trackingId: created.id }) }), '42501', 'ANALYSIS OPERATION NAME CANNOT AUTHORISE A TRACKING CALL');
  await expectSqlState(() => trackingGet(suspended, bizA, created.id), '42501', 'DISABLED ACCOUNT REJECTED');
  step('ASSERTIONS: replay, signature, target/business/operation/actor binding, expiry, disabled account');

  // ---- 4/5: membership, roles, tenant isolation ------------------------------------------------
  await expectSqlState(() => trackingGet(outsider, bizA, created.id), '42501', 'NON-MEMBER CANNOT READ');
  await expectSqlState(() => trackingCreate(outsider, bizA), '42501', 'NON-MEMBER CANNOT CREATE');
  await expectSqlState(() => trackingGet(inactiveA, bizA, created.id), '42501', 'INACTIVE MEMBERSHIP CANNOT READ');
  await expectSqlState(() => trackingGet(ownerB, bizA, created.id), '42501', 'OWNER OF ANOTHER BUSINESS CANNOT READ');
  await expectSqlState(() => trackingGet(ownerA, bizB, created.id), '42501', 'OWNER OF A CANNOT USE BUSINESS B');
  await expectSqlState(() => trackingGet(ownerA, 987654321, created.id), '42501', 'NONEXISTENT BUSINESS LOOKS LIKE A NON-MEMBER (42501)');
  await expectSqlState(() => trackingArchive(memberA, bizA, created.id), '42501', 'MEMBER CANNOT ARCHIVE (Q1)');
  await expectSqlState(() => trackingDelete(memberA, bizA, created.id), '42501', 'MEMBER CANNOT DELETE (Q1)');
  const trackedB = await ok(trackingCreate(ownerB, bizB, { title: 'Business B tender' }));
  await expectSqlState(() => trackingGet(ownerA, bizA, trackedB.id), 'P0002', 'B RECORD ID UNDER BUSINESS A IS NOT FOUND (no existence leak)');
  await expectSqlState(() => trackingUpdate(ownerA, bizA, trackedB.id, { title: 'hijack' }), 'P0002', 'CANNOT UPDATE ANOTHER BUSINESS RECORD');
  const listA = await ok(trackingList(adminA, bizA));
  assert.ok(listA.items.every(i => i.businessId === bizA) && listA.items.some(i => i.id === created.id) && !listA.items.some(i => i.id === trackedB.id));
  await ok(trackingUpdate(memberA, bizA, created.id, { stage: 'evaluating' }));
  await ok(trackingUpdate(memberA, bizA, created.id, { referenceNumber: null }));
  await expectSqlState(() => trackingUpdate(memberA, bizA, created.id, { stage: 'archived' }), '22023', 'UPDATE CANNOT SET stage=archived (separate archive operation)');
  await expectSqlState(() => trackingUpdate(memberA, bizA, created.id, { title: null }), '22023', 'TITLE CANNOT BE CLEARED');
  await expectSqlState(() => trackingUpdate(memberA, bizA, created.id, { owner: 'x' }), '22023', 'UNKNOWN PATCH KEY REJECTED');
  step('MEMBERSHIP, ROLES AND CROSS-BUSINESS ISOLATION (positive and negative)');

  // ---- 11: archive and delete semantics, tracking caps ----------------------------------------
  const archived = await ok(trackingArchive(adminA, bizA, created.id));
  assert.equal(archived.stage, 'archived');
  assert.ok(archived.archivedAt);
  assert.ok(!(await ok(trackingList(adminA, bizA))).items.some(i => i.id === created.id), 'archived hidden from default list');
  assert.ok((await ok(trackingList(adminA, bizA, 'archived'))).items.some(i => i.id === created.id), 'archived listed on request');
  await expectSqlState(() => trackingUpdate(memberA, bizA, created.id, { title: 'edit archived' }), 'P0001', 'ARCHIVED RECORD CANNOT BE EDITED');
  step('ARCHIVE SEMANTICS');

  // ---- 6: audit immutability ------------------------------------------------------------------
  const trackingEvents = await auditRows("business_id = $1 AND resource_type = 'tracking'", [bizA]);
  assert.ok(trackingEvents.length >= 4, 'create, 2 updates and archive recorded');
  assert.deepEqual(trackingEvents.map(e => e.operation).slice(0, 2), ['tender.tracking.create', 'tender.tracking.update']);
  assert.ok(trackingEvents.every(e => e.outcome === 'success' && e.actor_account_id > 0));
  const eventId = trackingEvents[0].id;
  for (const sql of [
    `UPDATE ghm.tender_audit_event SET outcome = 'success' WHERE id = ${eventId}`,
    `DELETE FROM ghm.tender_audit_event WHERE id = ${eventId}`,
    'TRUNCATE ghm.tender_audit_event',
  ]) {
    await expectSqlState(() => asSchemaOwner(c => c.query(sql)), '55000', `AUDIT IMMUTABLE EVEN FOR THE OWNER: ${sql.split(' ').slice(0, 2).join(' ')}`);
  }
  await expectSqlState(() => asSchemaOwner(c => c.query('TRUNCATE ghm.tender_audit_event CASCADE')), '55000', 'AUDIT TRUNCATE CASCADE REJECTED');
  step('AUDIT UPDATE, DELETE AND TRUNCATE REJECTED');

  // ---- 7: foreign-key deletion restrictions (Q12 ON DELETE RESTRICT) -------------------------------
  const fk = (await migratorPool.query(`
    SELECT conrelid::regclass::text AS tbl, confrelid::regclass::text AS ref, confdeltype
      FROM pg_constraint WHERE contype = 'f' AND conrelid IN ('ghm.tender_audit_event'::regclass, 'ghm.tender_analysis'::regclass, 'ghm.tender_tracking'::regclass)`)).rows;
  const deltype = (tbl, ref) => fk.filter(r => r.tbl === tbl && r.ref === ref).map(r => r.confdeltype);
  assert.deepEqual(deltype('ghm.tender_audit_event', 'ghm.account_identity'), ['r'], 'audit actor FK is RESTRICT (Q12)');
  assert.deepEqual(deltype('ghm.tender_audit_event', 'ghm.business'), ['r'], 'audit business FK is RESTRICT (Q12)');
  assert.deepEqual(fk.filter(r => r.tbl === 'ghm.tender_audit_event').length, 2, 'audit table has NO other foreign key (resource_id has none)');
  assert.deepEqual(deltype('ghm.tender_analysis', 'ghm.tender_tracking'), ['n'], 'analysis -> tracking is SET NULL (analysis link only, not audit)');
  await expectSqlState(() => asSchemaOwner(c => c.query('DELETE FROM ghm.account_identity WHERE id = $1', [memberA])), '23503', 'ACCOUNT WITH AUDIT EVENTS CANNOT BE DELETED (RESTRICT)');
  await expectSqlState(() => asSchemaOwner(c => c.query('DELETE FROM ghm.business WHERE id = $1', [bizA])), '23503', 'BUSINESS WITH AUDIT EVENTS CANNOT BE DELETED (RESTRICT)');
  step('FOREIGN KEYS: audit actor/business RESTRICT confirmed in the catalog and by attempted deletion');

  // ---- 8/9: audit in the same transaction; rollback when audit insertion fails ------------------
  const before = (await auditRows('true')).length;
  const one = ids();
  const t2 = await ok(trackingCreate(memberA, bizA, { title: 'Audit pairing' }, one));
  const pair = await auditRows('request_id = $1', [one.requestId]);
  assert.equal(pair.length, 1);
  assert.equal(pair[0].client_correlation_id, one.clientCorrelationId);
  assert.equal(Number(pair[0].resource_id), t2.id);
  assert.equal(pair[0].actor_account_id, memberA);
  assert.equal(pair[0].business_id, bizA);
  assert.equal((await auditRows('true')).length, before + 1);
  // Denied and failed operations leave NO audit row (Q13: logs only).
  const denied = (await auditRows('true')).length;
  await trackingCreate(outsider, bizA).catch(() => {});
  await trackingUpdate(memberA, bizA, t2.id, { title: null }).catch(() => {});
  assert.equal((await auditRows('true')).length, denied, 'denials and invalid requests write no audit event');
  // Forced audit failure: make the audit INSERT fail and prove the data change rolls back with it.
  await asSchemaOwner(c => c.query('ALTER TABLE ghm.tender_audit_event DROP CONSTRAINT tender_audit_outcome_valid'));
  await asSchemaOwner(c => c.query("ALTER TABLE ghm.tender_audit_event ADD CONSTRAINT tender_audit_outcome_valid CHECK (outcome = 'qualification-forced-failure') NOT VALID"));
  try {
    const countBefore = Number((await asSchemaOwner(c => c.query('SELECT count(*) AS n FROM ghm.tender_tracking WHERE business_id = $1', [bizA]))).rows[0].n);
    await expectSqlState(() => trackingCreate(memberA, bizA, { title: 'Must roll back' }), '23514', 'AUDIT INSERT FAILURE RAISES');
    const countAfter = Number((await asSchemaOwner(c => c.query('SELECT count(*) AS n FROM ghm.tender_tracking WHERE business_id = $1', [bizA]))).rows[0].n);
    assert.equal(countAfter, countBefore, 'the tracking row was rolled back with the failed audit insert');
    await expectSqlState(() => analysisCreate(memberA, bizA, validBody('valid complete, three chunks')), '23514', 'ANALYSIS: AUDIT INSERT FAILURE RAISES');
    const analysesAfter = Number((await asSchemaOwner(c => c.query('SELECT count(*) AS n FROM ghm.tender_analysis WHERE business_id = $1', [bizA]))).rows[0].n);
    assert.equal(analysesAfter, 0, 'the analysis row was rolled back with the failed audit insert');
  } finally {
    await asSchemaOwner(c => c.query('ALTER TABLE ghm.tender_audit_event DROP CONSTRAINT tender_audit_outcome_valid'));
    await asSchemaOwner(c => c.query("ALTER TABLE ghm.tender_audit_event ADD CONSTRAINT tender_audit_outcome_valid CHECK (outcome = 'success')"));
  }
  step('AUDIT SAME-TRANSACTION PAIRING, NO AUDIT ON DENIAL, AND ROLLBACK WHEN THE AUDIT INSERT FAILS');

  // ---- analyses: valid, incomplete, truncated, stored == submitted -----------------------------------
  const complete = validBody('valid complete, three chunks');
  const savedComplete = await ok(analysisCreate(memberA, bizA, complete));
  assert.equal(savedComplete.coverageStatus, 'complete');
  assert.equal(savedComplete.createdBy, memberA);
  assert.deepEqual(savedComplete.result, complete.result, 'stored payload equals the submitted payload (jsonb round trip)');
  const fetched = await ok(analysisGet(adminA, bizA, savedComplete.id));
  assert.deepEqual(fetched.result, complete.result);
  assert.deepEqual(fetched, savedComplete);
  const incomplete = validBody('valid incomplete, middle part unavailable');
  const savedIncomplete = await ok(analysisCreate(memberA, bizA, incomplete));
  assert.equal(savedIncomplete.coverageStatus, 'incomplete');
  assert.equal(savedIncomplete.chunksProcessed, incomplete.result.coverage.chunksProcessed);
  assert.deepEqual((await ok(analysisGet(memberA, bizA, savedIncomplete.id))).result.coverage, incomplete.result.coverage, 'chunk coverage preserved exactly');
  for (const fixture of summaryFixtures.create.filter(c => c.tenderAi.ok)) {
    const saved = await ok(analysisCreate(memberA, bizA, structuredClone(fixture.input)));
    assert.deepEqual(saved.result, fixture.input.result, `fixture round trip: ${fixture.name}`);
    assert.equal(saved.truncatedForStorage, fixture.input.result.truncatedForStorage, `truncation flag: ${fixture.name}`);
    await ok(analysisDelete(ownerA, bizA, saved.id));
  }
  const list = await ok(analysisList(memberA, bizA, 50));
  assert.ok(list.items.every(i => !('result' in i)), 'list is metadata only');
  step('ANALYSES: every accepted committed fixture round-trips; incomplete/truncated flags and coverage preserved');

  // ---- 13: size boundary ----------------------------------------------------------------------------------
  const { parseCreateAnalysis } = await import('../dist/tender/analysis-contract.js');
  const dense = structuredClone(complete);
  const chunks = Array.from({ length: 16 }, (_, i) => ({ index: i + 1, start: i * 100, end: i * 100 + 100, outcome: 'processed' }));
  let widest = null;
  for (let n = 0; n <= 200; n++) {
    const r = {
      projectionVersion: 2, source: 'ai_extracted', summary: 's',
      requirements: Array.from({ length: n }, (_, i) => ({ id: `req-${i + 1}`, category: 'risk', text: 't', quote: 'xxxxxxxxxx', start: 0, end: 10 })),
      importantDates: Array.from({ length: 10 }, () => ({ label: 'l', isoDate: '2026-01-01', quote: 'xxxxxxxxxx', start: 0, end: 10 })),
      missingInformation: Array.from({ length: 8 }, () => 'm'),
      coverage: { status: 'complete', charsTotal: 1600, charsProcessed: 1600, chunksTotal: 16, chunksProcessed: 16, chunks },
      truncatedForStorage: false, summaryTruncated: false, omitted: { requirements: 0, importantDates: 0, missingInformation: 0 },
    };
    dense.result = r;
    if (!parseCreateAnalysis(dense).ok) break;
    widest = structuredClone(dense);
  }
  assert.ok(widest, 'a payload near the 12 KiB limit was built');
  const compact = Buffer.byteLength(JSON.stringify(widest.result), 'utf8');
  const stored = await ok(analysisCreate(adminA, bizA, widest));
  const storedText = (await asSchemaOwner(c => c.query('SELECT octet_length(result::text) AS n FROM ghm.tender_analysis WHERE id = $1', [stored.id]))).rows[0].n;
  console.log(`TENDER SIZE BOUNDARY: compact=${compact} bytes, PostgreSQL jsonb text=${storedText} bytes, SQL ceiling=20000`);
  assert.ok(compact <= 12 * 1024 && compact > 12 * 1024 - 300);
  assert.ok(storedText < 20000, 'the densest accepted 12 KiB payload fits the 20,000-byte jsonb text ceiling');
  assert.deepEqual((await ok(analysisGet(adminA, bizA, stored.id))).result, widest.result);
  await ok(analysisDelete(ownerA, bizA, stored.id));
  // The SQL ceiling itself: a payload that passes the structural checks but exceeds 20,000 bytes of jsonb text is refused (22023).
  const oversizedForSql = structuredClone(complete);
  oversizedForSql.result.summary = 's'.repeat(20500);
  await expectSqlState(() => analysisCreate(memberA, bizA, oversizedForSql), '22023', 'SQL CEILING REFUSES > 20000 BYTES OF jsonb TEXT');
  step('12 KiB PROJECTION FITS THE 20,000-BYTE STORAGE LIMIT; the SQL ceiling refuses larger text');

  // ---- second-line structural checks: nothing is repaired -----------------------------------------------------
  const tampered = (mutate, code, label) => {
    const b = structuredClone(complete);
    mutate(b.result);
    return expectSqlState(() => analysisCreate(memberA, bizA, b), code, label);
  };
  await tampered(r => { r.coverage.status = 'incomplete'; }, '22023', 'STATUS CONTRADICTING COUNTS REFUSED (not repaired)');
  await tampered(r => { r.coverage.chunksProcessed = 1; }, '22023', 'PROCESSED COUNT CONTRADICTING CHUNKS REFUSED');
  await tampered(r => { r.coverage.chunks.pop(); }, '22023', 'CHUNK LIST NOT MATCHING TOTAL REFUSED');
  await tampered(r => { r.truncatedForStorage = true; }, '22023', 'LYING TRUNCATION FLAG REFUSED');
  await tampered(r => { r.coverage.status = 'unsupported'; }, '22023', 'UNSUPPORTED STATUS HAS NO STORED FORM');
  await tampered(r => { r.unexpected = 1; }, '22023', 'UNEXPECTED KEY REFUSED');
  await tampered(r => { r.projectionVersion = 1; }, '22023', 'WRONG PROJECTION VERSION REFUSED');
  await expectSqlState(() => analysisCreate(memberA, bizA, complete, 999999999), 'P0002', 'UNKNOWN TRACKING LINK IS NOT FOUND');
  await expectSqlState(() => analysisCreate(memberA, bizA, complete, trackedB.id), 'P0002', 'TRACKING LINK FROM ANOTHER BUSINESS LOOKS MISSING');
  await expectSqlState(() => asSchemaOwner(c => c.query(
    `INSERT INTO ghm.tender_analysis (business_id, model, prompt_version, document_sha256, coverage_status, chunks_total, chunks_processed, truncated_for_storage, result, created_by)
     VALUES ($1, 'm', 'p', $2, 'complete', 3, 3, false, '{}'::jsonb, $3)`, [bizA, 'a'.repeat(64), memberA])), '23514', 'TABLE CHECK REFUSES A MALFORMED RESULT EVEN FOR THE OWNER');
  await expectSqlState(() => asSchemaOwner(c => c.query(
    `INSERT INTO ghm.tender_analysis (business_id, model, prompt_version, document_sha256, coverage_status, chunks_total, chunks_processed, truncated_for_storage, result, created_by)
     VALUES ($1, 'm', 'p', $2, 'incomplete', 3, 3, false, $4::jsonb, $3)`, [bizA, 'a'.repeat(64), memberA, JSON.stringify(complete.result)])), '23514', 'TABLE CHECK REFUSES COLUMNS THAT CONTRADICT THE PAYLOAD');
  step('MALFORMED AND CONTRADICTORY ANALYSES REFUSED WITH NO REPAIR');

  // ---- analysis immutability and the ON DELETE SET NULL interplay ------------------------------------------------
  await expectSqlState(() => asSchemaOwner(c => c.query("UPDATE ghm.tender_analysis SET coverage_status = 'incomplete' WHERE id = $1", [savedComplete.id])), '55000', 'SAVED ANALYSIS IS IMMUTABLE EVEN FOR THE OWNER');
  const linkTarget = await ok(trackingCreate(memberA, bizA, { title: 'Link target' }));
  const linked = await ok(analysisCreate(memberA, bizA, complete, linkTarget.id));
  assert.equal(linked.trackingId, linkTarget.id);
  await expectSqlState(() => asSchemaOwner(c => c.query('UPDATE ghm.tender_analysis SET tender_tracking_id = $2 WHERE id = $1', [linked.id, t2.id])), '55000', 'RELINKING AN ANALYSIS IS REFUSED (only the FK unlink is allowed)');
  const eventsBeforeUnlink = (await auditRows("resource_type = 'analysis'")).length;
  await ok(trackingArchive(adminA, bizA, linkTarget.id));
  await ok(trackingDelete(ownerA, bizA, linkTarget.id));
  const afterUnlink = await ok(analysisGet(memberA, bizA, linked.id));
  assert.equal(afterUnlink.trackingId, null, 'deleting the tracking record unlinks, never deletes, the analysis');
  assert.deepEqual(afterUnlink.result, complete.result, 'the stored payload is untouched by the unlink');
  const deleteEvent = (await auditRows("operation = 'tender.tracking.delete' AND resource_id = $1", [linkTarget.id]));
  assert.equal(deleteEvent.length, 1, 'the tracking delete has exactly one audit event');
  assert.equal((await auditRows("resource_type = 'analysis'")).length, eventsBeforeUnlink, 'the FK unlink itself writes no separate audit event (documented; see design section 10)');
  step('ON DELETE SET NULL (analysis -> tracking): unlink allowed through the immutability trigger, payload untouched, audit history intact');

  // ---- deletion keeps audit history ---------------------------------------------------------------------------------------
  const delIds = ids();
  const gone = await ok(analysisDelete(adminA, bizA, savedIncomplete.id, delIds));
  assert.deepEqual(gone, { id: savedIncomplete.id, businessId: bizA, deleted: true });
  await expectSqlState(() => analysisGet(memberA, bizA, savedIncomplete.id), 'P0002', 'DELETED ANALYSIS IS NOT FOUND');
  await expectSqlState(() => analysisDelete(memberA, bizA, savedComplete.id), '42501', 'MEMBER CANNOT DELETE AN ANALYSIS (Q1)');
  await expectSqlState(() => analysisGet(ownerB, bizA, savedComplete.id), '42501', 'OTHER BUSINESS CANNOT READ AN ANALYSIS');
  await expectSqlState(() => analysisGet(ownerB, bizB, savedComplete.id), 'P0002', 'ANALYSIS OF BUSINESS A IS NOT FOUND UNDER BUSINESS B');
  const history = await auditRows("resource_type = 'analysis' AND resource_id = $1", [savedIncomplete.id]);
  assert.deepEqual(history.map(e => e.operation), ['tender.analysis.create', 'tender.analysis.delete'], 'audit history survives deletion of the analysis');
  assert.ok(history.every(e => !JSON.stringify(e.metadata).includes('requirement') && !JSON.stringify(e.metadata).includes(incomplete.result.summary)), 'audit metadata carries no summary text');
  const forbiddenKeys = history.flatMap(e => Object.keys(e.metadata)).filter(k => !['coverageStatus', 'chunksTotal', 'chunksProcessed', 'truncatedForStorage', 'documentSha256', 'trackingLinked'].includes(k));
  assert.deepEqual(forbiddenKeys, [], 'audit metadata keys are allow-listed');
  step('ANALYSIS DELETE: owner/admin only, audit history independent of the deleted row');

  // ---- 10/11: advisory-lock concurrency and caps ----------------------------------------------------------------------------
  const capBiz = await business('cap');
  const capOwner = await account('cap-owner');
  await member(capBiz, capOwner, 'owner');
  const small = validBody('valid complete, three chunks');
  // Seed 99 analyses directly (as owner) so the race is for the 100th slot only.
  await asSchemaOwner(c => c.query(
    `INSERT INTO ghm.tender_analysis (business_id, model, prompt_version, document_sha256, coverage_status, chunks_total, chunks_processed, truncated_for_storage, result, created_by)
     SELECT $1::bigint, 'seed', 'seed', $2::text, $4::jsonb #>> '{coverage,status}', ($4::jsonb #>> '{coverage,chunksTotal}')::smallint,
            ($4::jsonb #>> '{coverage,chunksProcessed}')::smallint, ($4::jsonb ->> 'truncatedForStorage')::boolean, $4::jsonb, $3::bigint
       FROM generate_series(1, 99)`, [capBiz, createHash('sha256').update('seed').digest('hex'), capOwner, JSON.stringify(small.result)]));
  const race = await Promise.allSettled(Array.from({ length: 12 }, () => analysisCreate(capOwner, capBiz, small)));
  const won = race.filter(r => r.status === 'fulfilled').length;
  const lost = race.filter(r => r.status === 'rejected' && r.reason?.code === 'P0001').length;
  assert.equal(won, 1, 'exactly one concurrent create wins the 100th slot');
  assert.equal(lost, 11, 'all others get the cap error (P0001)');
  const total = Number((await asSchemaOwner(c => c.query('SELECT count(*) AS n FROM ghm.tender_analysis WHERE business_id = $1', [capBiz]))).rows[0].n);
  assert.equal(total, 100, 'the cap is never exceeded');
  await expectSqlState(() => analysisCreate(capOwner, capBiz, small), 'P0001', 'THE 101st ANALYSIS IS REFUSED');
  step('ADVISORY-LOCK CONCURRENCY: 12 racing creates, exactly one wins the last of 100 slots');

  const trackCap = await business('trackcap');
  const trackOwner = await account('trackcap-owner');
  await member(trackCap, trackOwner, 'owner');
  await asSchemaOwner(c => c.query(
    `INSERT INTO ghm.tender_tracking (business_id, title, stage, created_by, updated_by)
     SELECT $1::bigint, 'seed ' || g, 'saved', $2::bigint, $2::bigint FROM generate_series(1, 499) g`, [trackCap, trackOwner]));
  const raceTracking = await Promise.allSettled(Array.from({ length: 8 }, () => trackingCreate(trackOwner, trackCap)));
  assert.equal(raceTracking.filter(r => r.status === 'fulfilled').length, 1, 'exactly one create wins the 500th active slot');
  assert.equal(raceTracking.filter(r => r.status === 'rejected' && r.reason?.code === 'P0001').length, 7);
  step('TRACKING ACTIVE CAP (500) HOLDS UNDER CONCURRENCY');

  // ---- 1: reapplication is not supported for these migrations; document the actual behaviour -----------------------------------
  // The migrations are plain CREATE TABLE (not IF NOT EXISTS): re-running them must FAIL, never half-apply.
  for (const file of ['20261118100000_create_tender_tracking_and_audit.sql', '20261119100000_create_tender_analysis_and_extend_audit.sql']) {
    const sql = readFileSync(join(here, '..', 'database', 'migrations', file), 'utf8');
    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      let code = null;
      try { await client.query(sql); } catch (error) { code = error.code; await client.query('ROLLBACK').catch(() => {}); }
      assert.ok(code === '42P07' || code === '42710', `re-applying ${file} must fail on an existing object (got ${code})`);
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  }
  step('RE-APPLICATION FAILS CLEANLY (not idempotent by design; the migration ledger prevents a second run)');

  return { marker, businesses: [bizA, bizB, capBiz, trackCap], accounts: [ownerA, adminA, memberA, outsider, inactiveA, ownerB, suspended, capOwner, trackOwner] };
};
