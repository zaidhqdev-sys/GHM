import assert from 'node:assert/strict';
import { Client } from 'pg';
import 'dotenv/config';

const url = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!url) throw new Error('GHM_MIGRATOR_DATABASE_URL is required');
const client = new Client({ connectionString: url, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
await client.connect();

const expectedFunctions = [
  ['assert_actor_gateway_commercial_document_authority', 'ghm_actor_gateway'],
  ['gateway_manage_commercial_document_approval_authority', 'ghm_actor_gateway'],
  ['assert_actor_gateway_commercial_document_approval', 'ghm_actor_gateway'],
  ['gateway_approve_commercial_document_version', 'ghm_actor_gateway'],
  ['assert_actor_gateway_commercial_payment_prepare', 'ghm_actor_gateway'],
  ['gateway_prepare_commercial_payment_with_consent', 'ghm_actor_gateway'],
];
const evidenceTables = [
  'commercial_document_version',
  'commercial_document_status_event',
  'commercial_consent_event',
  'commercial_document_approval_authority',
  'commercial_document_approval_authority_event',
];

try {
  await client.query('SET ROLE ghm_schema_owner');

  const functions = await client.query(`
    SELECT p.proname, p.prosecdef, pg_get_userbyid(p.proowner) AS owner,
           p.proconfig, pg_get_functiondef(p.oid) AS definition,
           has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute,
           has_function_privilege('ghm_migrator', p.oid, 'EXECUTE') AS migrator_execute,
           has_function_privilege('ghm_actor_gateway', p.oid, 'EXECUTE') AS gateway_execute,
           EXISTS (
             SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
           ) AS public_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.proname = ANY($1::text[])
     ORDER BY p.proname
  `, [expectedFunctions.map(x => x[0])]);

  assert.equal(functions.rowCount, expectedFunctions.length, 'all six commercial gateway/assertion functions must exist');
  for (const fn of functions.rows) {
    assert.equal(fn.prosecdef, true, fn.proname + ' must be SECURITY DEFINER');
    assert.equal(fn.owner, 'ghm_schema_owner', fn.proname + ' must be schema-owner controlled');
    assert.equal(fn.runtime_execute, false, fn.proname + ' must not be executable by runtime');
    assert.equal(fn.migrator_execute, false, fn.proname + ' must not be executable by migrator');
    assert.equal(fn.gateway_execute, true, fn.proname + ' must be executable by Actor Gateway');
    assert.equal(fn.public_execute, false, fn.proname + ' must not be executable by PUBLIC');
    assert.ok((fn.proconfig ?? []).some(v => v === 'search_path=pg_catalog, ghm, pg_temp'),
      fn.proname + ' must pin search_path');
    if (fn.proname.startsWith('assert_actor_gateway_')) {
      assert.match(fn.definition, /session_user\s*<>\s*'ghm_actor_gateway'/i,
        fn.proname + ' must bind the database session to Actor Gateway');
    } else {
      assert.match(fn.definition, /PERFORM ghm\.assert_actor_gateway_/i,
        fn.proname + ' must delegate to its signed Actor Gateway assertion');
    }
  }

  const tables = await client.query(`
    SELECT c.relname,
           has_table_privilege('ghm_runtime', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS runtime_access,
           has_table_privilege('ghm_actor_gateway', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS gateway_direct_access,
           has_table_privilege('ghm_migrator', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS migrator_access
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'ghm' AND c.relname = ANY($1::text[])
  `, [evidenceTables]);
  assert.equal(tables.rowCount, evidenceTables.length, 'all commercial evidence tables must exist');
  for (const table of tables.rows) {
    assert.equal(table.runtime_access, false, table.relname + ' must deny direct runtime access');
    assert.equal(table.gateway_direct_access, false, table.relname + ' must deny direct Actor Gateway table access');
    assert.equal(table.migrator_access, true, table.relname + ' must retain migrator-owned maintenance access');
  }

  const triggers = await client.query(`
    SELECT c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'ghm'
       AND c.relname = ANY($1::text[])
       AND NOT t.tgisinternal
  `, [evidenceTables]);
  for (const table of evidenceTables) {
    const related = triggers.rows.filter(t => t.relname === table);
    assert.ok(related.some(t => /BEFORE UPDATE OR DELETE/i.test(t.definition)),
      table + ' must reject UPDATE and DELETE');
    assert.ok(related.some(t => /BEFORE TRUNCATE/i.test(t.definition)),
      table + ' must reject TRUNCATE');
    assert.ok(related.every(t => t.tgenabled === 'O'), table + ' immutability triggers must be enabled');
  }

  const payment = functions.rows.find(f => f.proname === 'gateway_prepare_commercial_payment_with_consent').definition;
  assert.match(payment, /p_accepted IS DISTINCT FROM true/i);
  assert.match(payment, /commercial_document_status_event/i);
  assert.match(payment, /commercial_payment_attempt/i);
  assert.match(payment, /commercial_consent_event/i);
  assert.match(payment, /pending_checkout/i);
  assert.doesNotMatch(payment, /https?:\/\/|http\s*\(|fetch\s*\(/i,
    'payment preparation must not make provider/network calls');
  assert.doesNotMatch(payment, /UPDATE\s+ghm\.commercial_subscription\s+SET\s+lifecycle_status\s*=\s*'active'/i,
    'payment preparation must not activate subscriptions');

  // Exercise append-only enforcement in a transaction; rollback removes the
  // fixture. Savepoints keep each expected trigger failure independently testable.
  await client.query('BEGIN');
  try {
    const doc = (await client.query(`
      INSERT INTO ghm.commercial_document_version
        (document_type, document_key, version, title, content_sha256)
      VALUES ('subscription_terms', 'qualification_terms', 'ci-1',
        'CI qualification document', repeat('a', 64))
      RETURNING id
    `)).rows[0];
    await client.query(`
      INSERT INTO ghm.commercial_document_status_event
        (document_version_id, status, source, reason)
      VALUES ($1, 'draft', 'ci_qualification', 'Append-only trigger test')
    `, [doc.id]);

    for (const [label, sql] of [
      ['document version UPDATE', 'UPDATE ghm.commercial_document_version SET title = title WHERE id = $1'],
      ['document version DELETE', 'DELETE FROM ghm.commercial_document_version WHERE id = $1'],
      ['status event UPDATE', 'UPDATE ghm.commercial_document_status_event SET reason = reason WHERE document_version_id = $1'],
      ['status event DELETE', 'DELETE FROM ghm.commercial_document_status_event WHERE document_version_id = $1'],
    ]) {
      await client.query('SAVEPOINT immutability_check');
      await assert.rejects(client.query(sql, [doc.id]), /commercial evidence is append-only/i, label + ' must be rejected');
      await client.query('ROLLBACK TO SAVEPOINT immutability_check');
      await client.query('RELEASE SAVEPOINT immutability_check');
    }
    await client.query('SAVEPOINT immutability_check');
    await assert.rejects(client.query('TRUNCATE ghm.commercial_document_version'), /commercial evidence is append-only/i,
      'document version TRUNCATE must be rejected');
    await client.query('ROLLBACK TO SAVEPOINT immutability_check');
    await client.query('RELEASE SAVEPOINT immutability_check');
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }

  console.log(JSON.stringify({
    qualification: 'commercial document authority, approval and payment-consent schema',
    status: 'PASS',
    functions: functions.rowCount,
    evidenceTables: tables.rowCount,
    immutabilityTriggers: 'UPDATE, DELETE and TRUNCATE verified in rollback-only transaction',
    paymentPreparation: 'explicit consent + exact approved version + pending attempt; no provider call or activation',
    productionDatabaseTouched: false,
  }, null, 2));
} finally {
  await client.end();
}
