import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';
import { createActorGatewayAssertion } from '../dist/actor-gateway/request-assertion.js';
import { PostgresTrustScoreGatewayReader } from '../dist/actor-gateway/trust-score-reader.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !gatewayUrl || !migratorUrl) throw new Error('Missing disposable PostgreSQL role URLs');
for (const [name, url] of [['runtime', runtimeUrl], ['gateway', gatewayUrl], ['migrator', migratorUrl]]) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || parsed.pathname !== '/ghm_disposable_test') {
    throw new Error(`Refusing Trust Score qualification outside disposable localhost PostgreSQL (${name})`);
  }
}
if (new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) throw new Error('Runtime, gateway and migrator URLs must be distinct');
const secret = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if (!secret) throw new Error('Missing GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET');
const runtime = new Pool({ connectionString: runtimeUrl, ssl: false });
const gateway = new Pool({ connectionString: gatewayUrl, ssl: false });
const migrator = new Pool({ connectionString: migratorUrl, ssl: false });
const marker = `ghm-trust-gateway-${randomUUID()}`;
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
    const owner = await fixture.query("INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business') RETURNING id", [marker]);
    const outsider = await fixture.query("INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business') RETURNING id", [marker + '-outsider']);
    const business = await fixture.query("INSERT INTO ghm.business(name,slug,rating,verification_status,is_verified,is_active) VALUES($1,$2,4.5,'approved',true,true) RETURNING id", [marker, marker]);
    const privateBusiness = await fixture.query("INSERT INTO ghm.business(name,slug,rating,verification_status,is_verified,is_active) VALUES($1,$2,4.5,'pending',false,true) RETURNING id", [marker + '-private', marker + '-private']);
    const accountId = Number(owner.rows[0].id);
    const businessId = Number(business.rows[0].id);
    const privateBusinessId = Number(privateBusiness.rows[0].id);
    const outsiderId = Number(outsider.rows[0].id);
    await fixture.query("INSERT INTO ghm.business_membership(business_id,account_id,membership_role,membership_status,created_by) VALUES($1,$2,'owner','active',$2),($3,$2,'owner','active',$2)", [businessId, accountId, privateBusinessId]);
    await fixture.query('COMMIT');
    ids = { accountId, outsiderId, businessId, privateBusinessId };
  } catch (e) { await fixture.query('ROLLBACK').catch(() => {}); throw e; }
  finally { fixture.release(); }

  const cutover = await migrator.connect();
  try {
    await cutover.query('BEGIN');
    await cutover.query('SET LOCAL ROLE ghm_schema_owner');
    await cutover.query('REVOKE ALL ON FUNCTION ghm.calculate_business_trust_score(bigint,bigint) FROM PUBLIC,ghm_runtime');
    await cutover.query('REVOKE SELECT ON TABLE ghm.trust_score FROM PUBLIC,ghm_runtime');
    await cutover.query('REVOKE ALL ON SEQUENCE ghm.trust_score_id_seq FROM PUBLIC,ghm_runtime');
    await cutover.query('COMMIT');
  } catch (e) { await cutover.query('ROLLBACK').catch(() => {}); throw e; }
  finally { cutover.release(); }
  console.log('MANUAL TRUST SCORE CUTOVER APPLIED TO DISPOSABLE POSTGRESQL: PASS');

  let legacyDenied = false;
  try { await runtime.query('SELECT * FROM ghm.calculate_business_trust_score($1,$2)', [ids.accountId, ids.businessId]); } catch { legacyDenied = true; }
  if (!legacyDenied) throw new Error('Runtime can still execute legacy Trust Score calculation');
  console.log('RUNTIME LEGACY TRUST SCORE EXECUTE DENIED: PASS');
  let directReadDenied = false;
  try { await runtime.query('SELECT * FROM ghm.trust_score LIMIT 1'); } catch { directReadDenied = true; }
  if (!directReadDenied) throw new Error('Runtime can directly read Trust Score table');
  console.log('RUNTIME DIRECT TRUST SCORE SELECT DENIED: PASS');
  let sequenceDenied = false;
  try { await runtime.query(\"SELECT nextval('ghm.trust_score_id_seq')\"); } catch { sequenceDenied = true; }
  if (!sequenceDenied) throw new Error('Runtime can access Trust Score sequence');
  console.log('RUNTIME TRUST SCORE SEQUENCE ACCESS DENIED: PASS');

  const reader = new PostgresTrustScoreGatewayReader(gateway, secret);
  const score = await reader.calculate(ids.accountId, ids.businessId);
  const privateScore = await reader.calculate(ids.accountId, ids.privateBusinessId);
  if (score.businessId !== ids.businessId || score.trustLevel !== 'bronze' || score.reviewsScore !== 14
    || privateScore.businessId !== ids.privateBusinessId) {
    throw new Error(`Unexpected Trust Score result: ${JSON.stringify({ score, privateScore })}`);
  }
  console.log('SIGNED TRUST SCORE CALCULATION + ACTOR PROVENANCE: PASS');

  const memberGet = await reader.get(ids.accountId, ids.privateBusinessId);
  if (!memberGet || memberGet.businessId !== ids.privateBusinessId) throw new Error('Owner cannot read private Trust Score');
  const unrelatedGet = await reader.get(ids.outsiderId, ids.privateBusinessId);
  if (unrelatedGet !== null) throw new Error('Unrelated account can read private Trust Score');
  console.log('SIGNED TRUST SCORE MEMBER GET + CROSS-ACCOUNT DENIAL: PASS');

  const memberList = await reader.list(ids.accountId, 'bronze');
  const unrelatedList = await reader.list(ids.outsiderId, 'bronze');
  if (memberList.length !== 2 || unrelatedList.length !== 1 || unrelatedList[0].businessId !== ids.businessId) {
    throw new Error('Trust Score member list did not preserve public/private visibility');
  }
  console.log('SIGNED TRUST SCORE MEMBER LIST VISIBILITY: PASS');

  const publicPrivate = await runtime.query('SELECT * FROM ghm.get_public_trust_score($1)', [ids.privateBusinessId]);
  const publicScore = await runtime.query('SELECT * FROM ghm.get_public_trust_score($1)', [ids.businessId]);
  const publicList = await runtime.query(\"SELECT * FROM ghm.list_public_trust_scores('bronze')\");
  if (publicPrivate.rowCount !== 0 || publicScore.rowCount !== 1 || publicList.rowCount !== 1) {
    throw new Error('Trust Score public projection leaked private or omitted public score');
  }
  console.log('RUNTIME PUBLIC TRUST SCORE GET/LIST PROJECTIONS: PASS');

  const targetAssertion = createActorGatewayAssertion(Buffer.from(secret, 'base64'), ids.accountId, 'trust.score.calculate', { businessId: ids.businessId + 1 });
  let targetDenied = false;
  try {
    await gateway.query('SELECT * FROM ghm.gateway_calculate_business_trust_score($1,$2,$3,$4,$5,$6)',
      [ids.accountId, targetAssertion.issuedAt, targetAssertion.nonce, targetAssertion.context, targetAssertion.signature, ids.businessId]);
  } catch { targetDenied = true; }
  if (!targetDenied) throw new Error('Trust Score target substitution was accepted');
  console.log('SIGNED TRUST SCORE TARGET SUBSTITUTION DENIED: PASS');

  const replay = createActorGatewayAssertion(Buffer.from(secret, 'base64'), ids.accountId, 'trust.score.calculate', { businessId: ids.businessId });
  await gateway.query('SELECT * FROM ghm.gateway_calculate_business_trust_score($1,$2,$3,$4,$5,$6)',
    [ids.accountId, replay.issuedAt, replay.nonce, replay.context, replay.signature, ids.businessId]);
  let replayDenied = false;
  try {
    await gateway.query('SELECT * FROM ghm.gateway_calculate_business_trust_score($1,$2,$3,$4,$5,$6)',
      [ids.accountId, replay.issuedAt, replay.nonce, replay.context, replay.signature, ids.businessId]);
  } catch { replayDenied = true; }
  if (!replayDenied) throw new Error('Trust Score assertion replay was accepted');
  console.log('SIGNED TRUST SCORE ASSERTION REPLAY DENIED: PASS');

  const actorAssertion = createActorGatewayAssertion(Buffer.from(secret, 'base64'), ids.accountId, 'trust.score.calculate', { businessId: ids.businessId });
  let actorDenied = false;
  try {
    await gateway.query('SELECT * FROM ghm.gateway_calculate_business_trust_score($1,$2,$3,$4,$5,$6)',
      [ids.outsiderId, actorAssertion.issuedAt, actorAssertion.nonce, actorAssertion.context, actorAssertion.signature, ids.businessId]);
  } catch { actorDenied = true; }
  if (!actorDenied) throw new Error('Trust Score actor substitution was accepted');
  console.log('SIGNED TRUST SCORE ACTOR SUBSTITUTION DENIED: PASS');

  let runtimeWrapperDenied = false;
  try {
    await runtime.query('SELECT * FROM ghm.gateway_calculate_business_trust_score($1,0,$2,$3,$4,$5)',
      [ids.accountId, randomUUID(), '{}', '0'.repeat(64), ids.businessId]);
  } catch { runtimeWrapperDenied = true; }
  if (!runtimeWrapperDenied) throw new Error('Runtime can execute Trust Score gateway wrapper');
  console.log('RUNTIME TRUST SCORE GATEWAY EXECUTE DENIED: PASS');

  const acl = await gateway.query("SELECT has_function_privilege('ghm_runtime','ghm.calculate_business_trust_score(bigint,bigint)','EXECUTE') legacy_runtime, has_table_privilege('ghm_runtime','ghm.trust_score','SELECT') direct_select, has_sequence_privilege('ghm_runtime','ghm.trust_score_id_seq','USAGE') sequence_usage, has_function_privilege('ghm_actor_gateway','ghm.gateway_calculate_business_trust_score(bigint,bigint,uuid,text,text,bigint)','EXECUTE') gateway_wrapper, has_function_privilege('ghm_actor_gateway','ghm.gateway_get_trust_score(bigint,bigint,uuid,text,text,bigint)','EXECUTE') read_get, has_function_privilege('ghm_actor_gateway','ghm.gateway_list_trust_scores(bigint,bigint,uuid,text,text,text)','EXECUTE') read_list, has_function_privilege('ghm_runtime','ghm.get_public_trust_score(bigint)','EXECUTE') public_get, has_function_privilege('ghm_runtime','ghm.list_public_trust_scores(text)','EXECUTE') public_list");
  if (acl.rows[0].legacy_runtime || acl.rows[0].direct_select || acl.rows[0].sequence_usage || !acl.rows[0].gateway_wrapper || !acl.rows[0].read_get || !acl.rows[0].read_list || !acl.rows[0].public_get || !acl.rows[0].public_list) throw new Error(`Unexpected Trust Score ACL: ${JSON.stringify(acl.rows[0])}`);
  console.log('TRUST SCORE POST-CUTOVER FUNCTION ACL: PASS');
  console.log('GHM TRUST SCORE SIGNED GATEWAY QUALIFICATION: PASS');
} finally {
  if (ids) {
    const cleanup = await migrator.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query('SET LOCAL ROLE ghm_schema_owner');
      await cleanup.query('DELETE FROM ghm.business WHERE id IN ($1,$2)', [ids.businessId, ids.privateBusinessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id IN ($1,$2)', [ids.accountId, ids.outsiderId]);
      await cleanup.query('COMMIT');
    } catch (e) { await cleanup.query('ROLLBACK').catch(() => {}); throw e; }
    finally { cleanup.release(); }
  }
  await Promise.all([runtime.end(), gateway.end(), migrator.end()]);
}
