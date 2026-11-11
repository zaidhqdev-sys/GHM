import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';
import { createActorGatewayAssertion } from '../dist/actor-gateway/request-assertion.js';
import { PostgresBusinessHoursGatewayReader } from '../dist/actor-gateway/business-hours-reader.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !gatewayUrl || !migratorUrl) throw new Error('Missing disposable PostgreSQL role URLs');
for (const [name, url] of [['runtime', runtimeUrl], ['gateway', gatewayUrl], ['migrator', migratorUrl]]) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || parsed.pathname !== '/ghm_disposable_test') {
    throw new Error(`Refusing Business Hours qualification outside disposable localhost PostgreSQL (${name})`);
  }
}
if (new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) throw new Error('Runtime, gateway and migrator URLs must be distinct');

const secret = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if (!secret) throw new Error('Missing GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET');
const ssl = false;
const runtime = new Pool({ connectionString: runtimeUrl, ssl });
const gateway = new Pool({ connectionString: gatewayUrl, ssl });
const migrator = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-hours-gateway-${randomUUID()}`;
let ids;
try {
  for (const [pool, role] of [[runtime, 'ghm_runtime'], [gateway, 'ghm_actor_gateway'], [migrator, 'ghm_migrator']]) {
    const r = await pool.query('SELECT current_database() db, session_user, current_user');
    if (r.rows[0].db !== 'ghm_disposable_test' || r.rows[0].session_user !== role || r.rows[0].current_user !== role) {
      throw new Error(`Unexpected ${role} identity: ${JSON.stringify(r.rows[0])}`);
    }
    console.log(`${role.toUpperCase()} IDENTITY: PASS`);
  }

  const fixture = await migrator.connect();
  try {
    await fixture.query('BEGIN');
    await fixture.query('SET LOCAL ROLE ghm_schema_owner');
    const a = await fixture.query("INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business') RETURNING id", [marker]);
    const outsider = await fixture.query("INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business') RETURNING id", [marker + '-outsider']);
    const b = await fixture.query("INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'approved',true,true) RETURNING id", [marker, marker]);
    const accountId = Number(a.rows[0].id);
    const businessId = Number(b.rows[0].id);
    await fixture.query("INSERT INTO ghm.business_membership(business_id,account_id,membership_role,membership_status,created_by) VALUES($1,$2,'owner','active',$2)", [businessId, accountId]);
    await fixture.query('COMMIT');
    ids = { accountId, outsiderId: Number(outsider.rows[0].id), businessId };
  } catch (e) { await fixture.query('ROLLBACK').catch(() => {}); throw e; }
  finally { fixture.release(); }

  const cutover = await migrator.connect();
  try {
    await cutover.query('BEGIN');
    await cutover.query('SET LOCAL ROLE ghm_schema_owner');
    await cutover.query('REVOKE ALL ON FUNCTION ghm.replace_business_hours(bigint,bigint,jsonb) FROM PUBLIC,ghm_runtime');
    await cutover.query('COMMIT');
  } catch (e) { await cutover.query('ROLLBACK').catch(() => {}); throw e; }
  finally { cutover.release(); }
  console.log('MANUAL BUSINESS HOURS CUTOVER APPLIED TO DISPOSABLE POSTGRESQL: PASS');

  let denied = false;
  try {
    await runtime.query("SELECT * FROM ghm.replace_business_hours($1,$2,'[]'::jsonb)", [ids.businessId, ids.accountId]);
  } catch { denied = true; }
  if (!denied) throw new Error('Runtime can still execute legacy Business Hours replacement');
  console.log('RUNTIME LEGACY REPLACEMENT EXECUTE DENIED: PASS');

  const reader = new PostgresBusinessHoursGatewayReader(gateway, secret);
  const result = await reader.replace(ids.accountId, ids.businessId, [
    { day_of_week: 1, is_closed: false, open_time: '08:00', close_time: '17:00' },
    { day_of_week: 2, is_closed: true, open_time: null, close_time: null },
  ]);
  if (result.length !== 2 || result.some(row => row.createdBy !== ids.accountId)) throw new Error('Signed Business Hours replacement returned unexpected rows');
  console.log('SIGNED BUSINESS HOURS REPLACEMENT + ACTOR PROVENANCE: PASS');

  const assertion = createActorGatewayAssertion(Buffer.from(secret, 'base64'), ids.accountId, 'business.hours.replace', {
    businessId: ids.businessId + 1,
    hours: [],
  });
  let targetDenied = false;
  try {
    await gateway.query(
      'SELECT * FROM ghm.gateway_replace_business_hours($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [ids.accountId, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, ids.businessId, JSON.stringify([])],
    );
  } catch { targetDenied = true; }
  if (!targetDenied) throw new Error('Signed Business Hours request-target substitution was accepted');
  console.log('SIGNED BUSINESS HOURS TARGET SUBSTITUTION DENIED: PASS');

  const replayAssertion = createActorGatewayAssertion(Buffer.from(secret, 'base64'), ids.accountId, 'business.hours.replace', {
    businessId: ids.businessId,
    hours: [],
  });
  await gateway.query(
    'SELECT * FROM ghm.gateway_replace_business_hours($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [ids.accountId, replayAssertion.issuedAt, replayAssertion.nonce, replayAssertion.context, replayAssertion.signature, ids.businessId, JSON.stringify([])],
  );
  let replayDenied = false;
  try {
    await gateway.query(
      'SELECT * FROM ghm.gateway_replace_business_hours($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [ids.accountId, replayAssertion.issuedAt, replayAssertion.nonce, replayAssertion.context, replayAssertion.signature, ids.businessId, JSON.stringify([])],
    );
  } catch { replayDenied = true; }
  if (!replayDenied) throw new Error('Business Hours assertion replay was accepted');
  console.log('SIGNED BUSINESS HOURS ASSERTION REPLAY DENIED: PASS');

  const actorAssertion = createActorGatewayAssertion(Buffer.from(secret, 'base64'), ids.accountId, 'business.hours.replace', {
    businessId: ids.businessId,
    hours: [],
  });
  let actorDenied = false;
  try {
    await gateway.query(
      'SELECT * FROM ghm.gateway_replace_business_hours($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [ids.outsiderId, actorAssertion.issuedAt, actorAssertion.nonce, actorAssertion.context, actorAssertion.signature, ids.businessId, JSON.stringify([])],
    );
  } catch { actorDenied = true; }
  if (!actorDenied) throw new Error('Business Hours actor substitution was accepted');
  console.log('SIGNED BUSINESS HOURS ACTOR SUBSTITUTION DENIED: PASS');

  let runtimeWrapperDenied = false;
  try {
    await runtime.query(
      'SELECT * FROM ghm.gateway_replace_business_hours($1,0,$2,$3,$4,$5,$6::jsonb)',
      [ids.accountId, randomUUID(), '{}', '0'.repeat(64), ids.businessId, JSON.stringify([])],
    );
  } catch { runtimeWrapperDenied = true; }
  if (!runtimeWrapperDenied) throw new Error('Runtime can execute the Actor Gateway wrapper');
  console.log('RUNTIME GATEWAY WRAPPER EXECUTE DENIED: PASS');

  const privileges = await gateway.query("SELECT has_function_privilege('ghm_runtime','ghm.replace_business_hours(bigint,bigint,jsonb)','EXECUTE') legacy_runtime, has_function_privilege('ghm_actor_gateway','ghm.gateway_replace_business_hours(bigint,bigint,uuid,text,text,bigint,jsonb)','EXECUTE') gateway_wrapper");
  if (privileges.rows[0].legacy_runtime || !privileges.rows[0].gateway_wrapper) throw new Error(`Unexpected Business Hours ACL: ${JSON.stringify(privileges.rows[0])}`);
  console.log('BUSINESS HOURS POST-CUTOVER FUNCTION ACL: PASS');
  console.log('GHM BUSINESS HOURS SIGNED GATEWAY QUALIFICATION: PASS');
} finally {
  if (ids) {
    const cleanup = await migrator.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query('SET LOCAL ROLE ghm_schema_owner');
      await cleanup.query('DELETE FROM ghm.business WHERE id=$1', [ids.businessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id IN ($1,$2)', [ids.accountId, ids.outsiderId]);
      await cleanup.query('COMMIT');
    } catch (e) { await cleanup.query('ROLLBACK').catch(() => {}); throw e; }
    finally { cleanup.release(); }
  }
  await Promise.all([runtime.end(), gateway.end(), migrator.end()]);
}
