import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';
import { createActorGatewayAssertion } from '../dist/actor-gateway/request-assertion.js';
import { PostgresBusinessLogoGatewayReader } from '../dist/actor-gateway/business-logo-reader.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !gatewayUrl || !migratorUrl) throw new Error('Missing disposable PostgreSQL role URLs');
for (const [name, url] of [['runtime', runtimeUrl], ['gateway', gatewayUrl], ['migrator', migratorUrl]]) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || parsed.pathname !== '/ghm_disposable_test') {
    throw new Error(`Refusing Business Logo qualification outside disposable localhost PostgreSQL (${name})`);
  }
}
if (new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) throw new Error('Runtime, gateway and migrator URLs must be distinct');
const secret = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if (!secret) throw new Error('Missing GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET');
const runtime = new Pool({ connectionString: runtimeUrl, ssl: false });
const gateway = new Pool({ connectionString: gatewayUrl, ssl: false });
const migrator = new Pool({ connectionString: migratorUrl, ssl: false });
const marker = `ghm-logo-gateway-${randomUUID()}`;
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
    const a = await fixture.query("INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'approved',true,true) RETURNING id", [marker, marker]);
    const b = await fixture.query("INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'approved',true,true) RETURNING id", [marker + '-other', marker + '-other']);
    const accountId = Number(owner.rows[0].id);
    const outsiderId = Number(outsider.rows[0].id);
    const businessId = Number(a.rows[0].id);
    const otherBusinessId = Number(b.rows[0].id);
    await fixture.query("INSERT INTO ghm.business_membership(business_id,account_id,membership_role,membership_status,created_by) VALUES($1,$2,'owner','active',$2),($3,$4,'owner','active',$4)", [businessId, accountId, otherBusinessId, outsiderId]);
    const first = await fixture.query(
      "INSERT INTO ghm.storage_object(tenant_business_id,resource_type,resource_id,object_class,provider_key,content_type,byte_size,visibility,status,available_at) VALUES($1,'business',$1,'business_logo',$2,'image/png',1,'public','available',clock_timestamp()) RETURNING id",
      [businessId, marker + '/logo.png'],
    );
    const foreign = await fixture.query(
      "INSERT INTO ghm.storage_object(tenant_business_id,resource_type,resource_id,object_class,provider_key,content_type,byte_size,visibility,status,available_at) VALUES($1,'business',$1,'business_logo',$2,'image/png',1,'public','available',clock_timestamp()) RETURNING id",
      [otherBusinessId, marker + '/other-logo.png'],
    );
    await fixture.query('COMMIT');
    ids = { accountId, outsiderId, businessId, otherBusinessId, objectId: Number(first.rows[0].id), foreignObjectId: Number(foreign.rows[0].id) };
  } catch (e) { await fixture.query('ROLLBACK').catch(() => {}); throw e; }
  finally { fixture.release(); }

  const cutover = await migrator.connect();
  try {
    await cutover.query('BEGIN');
    await cutover.query('SET LOCAL ROLE ghm_schema_owner');
    await cutover.query('REVOKE ALL ON FUNCTION ghm.set_business_logo_object(bigint,bigint,bigint) FROM PUBLIC,ghm_runtime');
    await cutover.query('COMMIT');
  } catch (e) { await cutover.query('ROLLBACK').catch(() => {}); throw e; }
  finally { cutover.release(); }
  console.log('MANUAL BUSINESS LOGO CUTOVER APPLIED TO DISPOSABLE POSTGRESQL: PASS');

  let legacyDenied = false;
  try { await runtime.query('SELECT ghm.set_business_logo_object($1,$2,$3)', [ids.accountId, ids.businessId, ids.objectId]); } catch { legacyDenied = true; }
  if (!legacyDenied) throw new Error('Runtime can still execute legacy Business Logo binding');
  console.log('RUNTIME LEGACY BUSINESS LOGO EXECUTE DENIED: PASS');

  const reader = new PostgresBusinessLogoGatewayReader(gateway, secret);
  const previous = await reader.bind(ids.accountId, ids.businessId, ids.objectId);
  if (previous !== null) throw new Error('First logo bind should have no previous object');
  console.log('SIGNED BUSINESS LOGO BIND + ACTOR PROVENANCE: PASS');

  const publicKey = await runtime.query('SELECT ghm.storage_get_public_business_logo($1) AS provider_key', [ids.businessId]);
  if (publicKey.rows[0].provider_key !== marker + '/logo.png') throw new Error('Public logo getter did not return the canonical provider key');
  console.log('APPROVED PUBLIC BUSINESS LOGO PROJECTION: PASS');

  let foreignObjectDenied = false;
  try { await reader.bind(ids.accountId, ids.businessId, ids.foreignObjectId); } catch { foreignObjectDenied = true; }
  if (!foreignObjectDenied) throw new Error('Cross-business logo object binding was accepted');
  console.log('CROSS-BUSINESS LOGO OBJECT BIND DENIED: PASS');

  const targetAssertion = createActorGatewayAssertion(Buffer.from(secret, 'base64'), ids.accountId, 'business.logo.bind', {
    businessId: ids.otherBusinessId,
    objectId: ids.objectId,
  });
  let targetDenied = false;
  try {
    await gateway.query('SELECT ghm.gateway_set_business_logo_object($1,$2,$3,$4,$5,$6,$7)',
      [ids.accountId, targetAssertion.issuedAt, targetAssertion.nonce, targetAssertion.context, targetAssertion.signature, ids.businessId, ids.objectId]);
  } catch { targetDenied = true; }
  if (!targetDenied) throw new Error('Business Logo target substitution was accepted');
  console.log('SIGNED BUSINESS LOGO TARGET SUBSTITUTION DENIED: PASS');

  const replay = createActorGatewayAssertion(Buffer.from(secret, 'base64'), ids.accountId, 'business.logo.bind', {
    businessId: ids.businessId,
    objectId: ids.objectId,
  });
  await gateway.query('SELECT ghm.gateway_set_business_logo_object($1,$2,$3,$4,$5,$6,$7)',
    [ids.accountId, replay.issuedAt, replay.nonce, replay.context, replay.signature, ids.businessId, ids.objectId]);
  let replayDenied = false;
  try {
    await gateway.query('SELECT ghm.gateway_set_business_logo_object($1,$2,$3,$4,$5,$6,$7)',
      [ids.accountId, replay.issuedAt, replay.nonce, replay.context, replay.signature, ids.businessId, null]);
  } catch { replayDenied = true; }
  if (!replayDenied) throw new Error('Business Logo assertion replay was accepted');
  console.log('SIGNED BUSINESS LOGO ASSERTION REPLAY DENIED: PASS');

  const actorAssertion = createActorGatewayAssertion(Buffer.from(secret, 'base64'), ids.accountId, 'business.logo.bind', {
    businessId: ids.businessId,
    objectId: null,
  });
  let actorDenied = false;
  try {
    await gateway.query('SELECT ghm.gateway_set_business_logo_object($1,$2,$3,$4,$5,$6,$7)',
      [ids.outsiderId, actorAssertion.issuedAt, actorAssertion.nonce, actorAssertion.context, actorAssertion.signature, ids.businessId, null]);
  } catch { actorDenied = true; }
  if (!actorDenied) throw new Error('Business Logo actor substitution was accepted');
  console.log('SIGNED BUSINESS LOGO ACTOR SUBSTITUTION DENIED: PASS');

  const unbound = await reader.bind(ids.accountId, ids.businessId, null);
  if (unbound !== ids.objectId) throw new Error('Logo unbind did not return previous object ID');
  const cleared = await runtime.query('SELECT ghm.storage_get_public_business_logo($1) AS provider_key', [ids.businessId]);
  if (cleared.rows[0].provider_key !== null) throw new Error('Public logo projection remained after unbind');
  console.log('SIGNED BUSINESS LOGO UNBIND + PUBLIC REFERENCE CLEAR: PASS');

  let runtimeWrapperDenied = false;
  try { await runtime.query('SELECT ghm.gateway_set_business_logo_object($1,0,$2,$3,$4,$5,$6)', [ids.accountId, randomUUID(), '{}', '0'.repeat(64), ids.businessId, null]); } catch { runtimeWrapperDenied = true; }
  if (!runtimeWrapperDenied) throw new Error('Runtime can execute Business Logo gateway wrapper');
  console.log('RUNTIME BUSINESS LOGO GATEWAY EXECUTE DENIED: PASS');

  const acl = await gateway.query("SELECT has_function_privilege('ghm_runtime','ghm.set_business_logo_object(bigint,bigint,bigint)','EXECUTE') legacy_runtime, has_function_privilege('ghm_actor_gateway','ghm.gateway_set_business_logo_object(bigint,bigint,uuid,text,text,bigint,bigint)','EXECUTE') gateway_wrapper, has_function_privilege('ghm_runtime','ghm.storage_get_public_business_logo(bigint)','EXECUTE') public_getter");
  if (acl.rows[0].legacy_runtime || !acl.rows[0].gateway_wrapper || !acl.rows[0].public_getter) throw new Error(`Unexpected Business Logo ACL: ${JSON.stringify(acl.rows[0])}`);
  console.log('BUSINESS LOGO POST-CUTOVER FUNCTION ACL: PASS');
  console.log('GHM BUSINESS LOGO SIGNED GATEWAY QUALIFICATION: PASS');
} finally {
  if (ids) {
    const cleanup = await migrator.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query('SET LOCAL ROLE ghm_schema_owner');
      await cleanup.query('DELETE FROM ghm.business WHERE id IN ($1,$2)', [ids.businessId, ids.otherBusinessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id IN ($1,$2)', [ids.accountId, ids.outsiderId]);
      await cleanup.query('COMMIT');
    } catch (e) { await cleanup.query('ROLLBACK').catch(() => {}); throw e; }
    finally { cleanup.release(); }
  }
  await Promise.all([runtime.end(), gateway.end(), migrator.end()]);
}
