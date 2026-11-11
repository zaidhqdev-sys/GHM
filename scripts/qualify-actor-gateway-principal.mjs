import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const assertionSecret = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if (!assertionSecret || Buffer.from(assertionSecret, 'base64').length !== 32) throw new Error('A 32-byte gateway assertion test key is required');

if (!runtimeUrl || !gatewayUrl || !migratorUrl) {
  throw new Error('GHM runtime, actor-gateway and migrator database URLs are all required');
}
if (new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) {
  throw new Error('Runtime, actor-gateway and migrator database URLs must be distinct');
}

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const gatewayPool = new Pool({ connectionString: gatewayUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const fixture = { marker: `ghm-actor-gateway-${randomUUID()}`, accountIds: [], businessIds: [] };
const signAssertion = (accountId,operation,context={},issuedAtOverride) => {
  const issuedAt=issuedAtOverride ?? Math.floor(Date.now()/1000),nonce=randomUUID(),contextJson=JSON.stringify(context),contextHex=Buffer.from(contextJson,'utf8').toString('hex');
  const payload=`ghm-actor-gateway:v2|${accountId}|${operation}|${issuedAt}|${nonce}|${contextHex}`;
  const signature=createHmac('sha256',Buffer.from(assertionSecret,'base64')).update(payload,'utf8').digest('hex');
  return {issuedAt,nonce,context:contextJson,signature};
};
const assertionContext = (operation,args) => {
  if(operation==='actor.identity.read') return {};
  if(operation==='business.registration.read') return {businessId:args[0]};
  if(operation==='business.registration.update') return {businessId:args[0],registrationStatus:args[1],registrationNumber:args[2],legalName:args[3]};
  throw new Error(`Unsupported qualification operation: ${operation}`);
};
const gatewayCall = (accountId,operation,sql,args=[]) => {
  const a=signAssertion(accountId,operation,assertionContext(operation,args));
  const shiftedSql=sql.replace(/\$(\d+)/g,(_match,n)=>'$'+(Number(n)>=4?Number(n)+1:Number(n))).replace(/\(\$1,\$2,\$3,\$5/,()=> '($1,$2,$3,$4,$5');
  return gatewayPool.query(shiftedSql,[accountId,a.issuedAt,a.nonce,a.context,a.signature,...args]);
};

const identity = async (pool, expectedUser) => {
  const { rows } = await pool.query(`
    SELECT current_database() AS database_name,
           session_user,
           current_user,
           current_role
  `);
  const row = rows[0];
  if (row.database_name !== 'ghm_disposable_test' || row.session_user !== expectedUser || row.current_user !== expectedUser || row.current_role !== expectedUser) {
    throw new Error(`Expected ghm_disposable_test/${expectedUser}; received ${JSON.stringify(row)}`);
  }
  return row;
};

const createFixtureAccount = async (fullName, status = 'active') => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows } = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role, account_status)
       VALUES ($1, 'business', $2)
       RETURNING id`,
      [fullName, status],
    );
    await client.query('COMMIT');
    const id = Number(rows[0].id);
    fixture.accountIds.push(id);
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const createFixtureBusiness = async (accountId, suffix) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows } = await client.query(
      `INSERT INTO ghm.business (name, slug, verification_status, is_active)
       VALUES ($1, $2, 'unverified', true)
       RETURNING id`,
      [`${fixture.marker}-${suffix}`, `${fixture.marker}-${suffix}`],
    );
    const businessId = Number(rows[0].id);
    await client.query(
      `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status)
       VALUES ($1, $2, 'owner', 'active')`,
      [businessId, accountId],
    );
    await client.query(
      `INSERT INTO ghm.business_registration_identity
         (business_id, registration_status, registration_number, legal_name, updated_by_account_id)
       VALUES ($1, 'registered', $2, $3, $4)`,
      [businessId, `REG-${suffix}`, `${fixture.marker} ${suffix} legal entity`, accountId],
    );
    await client.query('COMMIT');
    fixture.businessIds.push(businessId);
    return businessId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const expectSqlState = async (work, code, label) => {
  try {
    await work();
  } catch (error) {
    if (error?.code !== code) {
      throw new Error(`${label}: expected SQLSTATE ${code}; received ${error?.code ?? error?.message}`);
    }
    console.log(`${label}: PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

try {
  await identity(runtimePool, 'ghm_runtime');
  await identity(gatewayPool, 'ghm_actor_gateway');
  await identity(cleanupPool, 'ghm_migrator');
  const provision=await cleanupPool.connect();
  try { await provision.query('BEGIN'); await provision.query('SET LOCAL ROLE ghm_schema_owner'); await provision.query("INSERT INTO ghm.actor_gateway_capability_assertion_secret(singleton,secret) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET secret=EXCLUDED.secret",[Buffer.from(assertionSecret,'base64')]); await provision.query('COMMIT'); } catch(e) { await provision.query('ROLLBACK').catch(()=>{}); throw e; } finally { provision.release(); }
  console.log('DATABASE PRINCIPAL IDENTITY: PASS');

  const activeAccountId = await createFixtureAccount(`${fixture.marker}-active`);
  const disabledAccountId = await createFixtureAccount(`${fixture.marker}-disabled`, 'disabled');
  const otherOwnerAccountId = await createFixtureAccount(`${fixture.marker}-other-owner`);
  const businessId = await createFixtureBusiness(activeAccountId, 'primary');
  const otherBusinessId = await createFixtureBusiness(otherOwnerAccountId, 'other-owner');

  const roleState = await gatewayPool.query(`
    SELECT r.rolcanlogin,
           r.rolinherit,
           r.rolsuper,
           r.rolcreatedb,
           r.rolcreaterole,
           r.rolreplication,
           r.rolbypassrls,
           NOT EXISTS (
             SELECT 1 FROM pg_auth_members m
              WHERE m.member = r.oid OR m.roleid = r.oid
           ) AS no_memberships
      FROM pg_roles r
     WHERE r.rolname = 'ghm_actor_gateway'
  `);
  assert.equal(roleState.rowCount, 1);
  assert.deepEqual(roleState.rows[0], {
    rolcanlogin: true,
    rolinherit: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
    no_memberships: true,
  });
  console.log('GATEWAY LOGIN LEAST-PRIVILEGE ATTRIBUTES: PASS');

  const functionState = await gatewayPool.query(`
    SELECT pg_get_userbyid(p.proowner) AS owner,
           p.prosecdef AS security_definer,
           p.proconfig AS function_config,
           has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_can_execute,
           has_function_privilege('ghm_actor_gateway', p.oid, 'EXECUTE') AS gateway_can_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.proname = 'assert_actor_gateway'
       AND pg_get_function_identity_arguments(p.oid) = 'p_actor_account_id bigint'
  `);
  assert.equal(functionState.rowCount, 1);
  assert.equal(functionState.rows[0].owner, 'ghm_schema_owner');
  assert.equal(functionState.rows[0].security_definer, true);
  assert.equal(functionState.rows[0].runtime_can_execute, false);
  assert.equal(functionState.rows[0].gateway_can_execute, true);
  assert.ok(functionState.rows[0].function_config?.includes('search_path=pg_catalog, ghm'));
  console.log('GATEWAY FUNCTION OWNER, SEARCH PATH AND EXECUTE GRANTS: PASS');

  const tablePrivileges = await gatewayPool.query(`
    SELECT has_table_privilege(current_user, 'ghm.account_identity', 'SELECT') AS can_read_accounts,
           has_table_privilege(current_user, 'ghm.account_identity', 'UPDATE') AS can_update_accounts,
           has_table_privilege(current_user, 'ghm.authentication_session', 'SELECT') AS can_read_sessions,
           has_table_privilege(current_user, 'ghm.account_password_credential', 'SELECT') AS can_read_passwords
  `);
  assert.deepEqual(tablePrivileges.rows[0], {
    can_read_accounts: false,
    can_update_accounts: false,
    can_read_sessions: false,
    can_read_passwords: false,
  });
  console.log('GATEWAY HAS NO DIRECT ACCOUNT/AUTH TABLE ACCESS: PASS');

  const accepted = await gatewayPool.query(
    'SELECT ghm.assert_actor_gateway($1) AS actor_account_id',
    [activeAccountId],
  );
  assert.equal(Number(accepted.rows[0].actor_account_id), activeAccountId);
  console.log('GATEWAY ACCEPTS ACTIVE TOKEN-SUBJECT CANDIDATE: PASS');

  const ownIdentity = await gatewayCall(activeAccountId,'actor.identity.read',
    'SELECT account_id, account_role, full_name FROM ghm.gateway_get_actor_identity($1,$2,$3,$4)');
  assert.equal(ownIdentity.rowCount, 1);
  assert.deepEqual({
    account_id: Number(ownIdentity.rows[0].account_id),
    account_role: ownIdentity.rows[0].account_role,
    full_name: ownIdentity.rows[0].full_name,
  }, {
    account_id: activeAccountId,
    account_role: 'business',
    full_name: `${fixture.marker}-active`,
  });
  console.log('TYPED GATEWAY SELF-IDENTITY READ: PASS');
  const boundaryAssertion=signAssertion(activeAccountId,'actor.identity.read',{},Math.floor(Date.now()/1000)-30);
  await gatewayPool.query('SELECT * FROM ghm.gateway_get_actor_identity($1,$2,$3,$4,$5)',[activeAccountId,boundaryAssertion.issuedAt,boundaryAssertion.nonce,boundaryAssertion.context,boundaryAssertion.signature]);
  const nonceCheck=await cleanupPool.connect();
  try { await nonceCheck.query('BEGIN'); await nonceCheck.query('SET LOCAL ROLE ghm_schema_owner'); const retained=await nonceCheck.query('SELECT expires_at > clock_timestamp() + interval \'58 seconds\' AS retained FROM ghm.actor_gateway_capability_assertion_nonce WHERE nonce=$1',[boundaryAssertion.nonce]); assert.equal(retained.rows[0]?.retained,true); await nonceCheck.query('COMMIT'); } catch(e) { await nonceCheck.query('ROLLBACK').catch(()=>{}); throw e; } finally { nonceCheck.release(); }
  console.log('NONCE RETENTION COVERS FULL ASSERTION ACCEPTANCE WINDOW PASS');

  const forgedSelf=signAssertion(activeAccountId,'actor.identity.read',{});
  await expectSqlState(
    () => gatewayPool.query('SELECT * FROM ghm.gateway_get_actor_identity($1,$2,$3,$4,$5)',[activeAccountId,forgedSelf.issuedAt,forgedSelf.nonce,forgedSelf.context,'0'.repeat(64)]),
    '42501',
    'FORGED ACTOR SELF-IDENTITY ASSERTION DENIED',
  );

  const registrationIdentity = await gatewayCall(activeAccountId,'business.registration.read',
    'SELECT * FROM ghm.gateway_read_business_registration_identity($1,$2,$3,$4,$5)',[businessId]);
  assert.equal(registrationIdentity.rowCount, 1);
  assert.deepEqual({
    business_id: Number(registrationIdentity.rows[0].business_id),
    registration_status: registrationIdentity.rows[0].registration_status,
    registration_number: registrationIdentity.rows[0].registration_number,
    legal_name: registrationIdentity.rows[0].legal_name,
  }, {
    business_id: businessId,
    registration_status: 'registered',
    registration_number: 'REG-primary',
    legal_name: `${fixture.marker} primary legal entity`,
  });
  console.log('TYPED GATEWAY BUSINESS REGISTRATION IDENTITY READ: PASS');
  const boundRead=signAssertion(activeAccountId,'business.registration.read',{businessId});
  await expectSqlState(() => gatewayPool.query('SELECT * FROM ghm.gateway_read_business_registration_identity($1,$2,$3,$4,$5,$6)',[activeAccountId,boundRead.issuedAt,boundRead.nonce,boundRead.context,boundRead.signature,otherBusinessId]),'42501','SIGNED REGISTRATION READ CANNOT BE TRANSPLANTED TO ANOTHER BUSINESS');
  const boundUpdate=signAssertion(activeAccountId,'business.registration.update',{businessId,registrationStatus:'registered',registrationNumber:'REG-primary',legalName:'Authorized legal name'});
  await expectSqlState(() => gatewayPool.query('SELECT * FROM ghm.gateway_update_business_registration_identity($1,$2,$3,$4,$5,$6,$7,$8,$9)',[activeAccountId,boundUpdate.issuedAt,boundUpdate.nonce,boundUpdate.context,boundUpdate.signature,otherBusinessId,'registered','REG-primary','Authorized legal name']),'42501','SIGNED REGISTRATION UPDATE CANNOT BE TRANSPLANTED TO ANOTHER BUSINESS');
  await expectSqlState(() => gatewayPool.query('SELECT * FROM ghm.gateway_update_business_registration_identity($1,$2,$3,$4,$5,$6,$7,$8,$9)',[activeAccountId,boundUpdate.issuedAt,boundUpdate.nonce,boundUpdate.context,boundUpdate.signature,businessId,'registered','REG-primary','Tampered legal name']),'42501','SIGNED REGISTRATION UPDATE CANNOT BE REPLAYED WITH ALTERED PAYLOAD');

  const updatedRegistrationIdentity = await gatewayCall(activeAccountId,'business.registration.update',
    'SELECT * FROM ghm.gateway_update_business_registration_identity($1,$2,$3,$4,$5,$6,$7,$8)',
    [businessId,'registered','REG-primary-updated',`${fixture.marker} updated legal entity`]);
  assert.equal(updatedRegistrationIdentity.rowCount, 1);
  assert.deepEqual({
    business_id: Number(updatedRegistrationIdentity.rows[0].business_id),
    registration_status: updatedRegistrationIdentity.rows[0].registration_status,
    registration_number: updatedRegistrationIdentity.rows[0].registration_number,
    legal_name: updatedRegistrationIdentity.rows[0].legal_name,
  }, {
    business_id: businessId,
    registration_status: 'registered',
    registration_number: 'REG-primary-updated',
    legal_name: `${fixture.marker} updated legal entity`,
  });
  console.log('TYPED GATEWAY BUSINESS REGISTRATION IDENTITY WRITE: PASS');

  await expectSqlState(
    () => gatewayPool.query('SELECT ghm.assert_actor_gateway($1)', [disabledAccountId]),
    '42501',
    'DISABLED ACTOR DENIED',
  );
  await expectSqlState(
    () => gatewayCall(disabledAccountId,'business.registration.read','SELECT * FROM ghm.gateway_read_business_registration_identity($1,$2,$3,$4,$5)',[businessId]),
    '42501',
    'DISABLED ACTOR CANNOT READ REGISTRATION IDENTITY',
  );
  await expectSqlState(
    () => gatewayCall(disabledAccountId,'business.registration.update','SELECT * FROM ghm.gateway_update_business_registration_identity($1,$2,$3,$4,$5,$6,$7,$8)',[businessId,'registered','REG-X','Spoofed Entity']),
    '42501',
    'DISABLED ACTOR CANNOT WRITE REGISTRATION IDENTITY',
  );
  await expectSqlState(
    () => gatewayCall(activeAccountId,'business.registration.read','SELECT * FROM ghm.gateway_read_business_registration_identity($1,$2,$3,$4,$5)',[otherBusinessId]),
    'P0001',
    'CROSS-BUSINESS REGISTRATION IDENTITY READ DENIED',
  );
  await expectSqlState(
    () => gatewayCall(activeAccountId,'business.registration.update','SELECT * FROM ghm.gateway_update_business_registration_identity($1,$2,$3,$4,$5,$6,$7,$8)',[otherBusinessId,'registered','REG-X','Spoofed Entity']),
    'P0001',
    'CROSS-BUSINESS REGISTRATION IDENTITY WRITE DENIED',
  );
  await expectSqlState(
    () => gatewayPool.query('SELECT ghm.assert_actor_gateway(0)'),
    '22023',
    'INVALID ACTOR ID DENIED',
  );
  await expectSqlState(
    () => runtimePool.query('SELECT ghm.assert_actor_gateway($1)', [activeAccountId]),
    '42501',
    'ORDINARY RUNTIME CANNOT EXECUTE GATEWAY FUNCTION',
  );
  await expectSqlState(
    () => runtimePool.query('SELECT * FROM ghm.gateway_get_actor_identity($1,$2,$3,$4,$5)', [activeAccountId,Math.floor(Date.now()/1000),randomUUID(),'{}','0'.repeat(64)]),
    '42501',
    'ORDINARY RUNTIME CANNOT EXECUTE TYPED GATEWAY SELF-READ',
  );
  await expectSqlState(
    () => runtimePool.query('SELECT * FROM ghm.gateway_read_business_registration_identity($1,$2,$3,$4,$5,$6)', [activeAccountId,Math.floor(Date.now()/1000),randomUUID(),JSON.stringify({businessId}),'0'.repeat(64),businessId]),
    '42501',
    'ORDINARY RUNTIME CANNOT EXECUTE REGISTRATION IDENTITY GATEWAY READ',
  );
  await expectSqlState(
    () => runtimePool.query('SELECT * FROM ghm.gateway_update_business_registration_identity($1,$2,$3,$4,$5,$6,$7,$8,$9)', [activeAccountId,Math.floor(Date.now()/1000),randomUUID(),JSON.stringify({businessId,registrationStatus:'registered',registrationNumber:'REG-X',legalName:'Spoofed Entity'}),'0'.repeat(64),businessId,'registered','REG-X','Spoofed Entity']),
    '42501',
    'ORDINARY RUNTIME CANNOT EXECUTE REGISTRATION IDENTITY GATEWAY WRITE',
  );
  await expectSqlState(
    () => runtimePool.query('SET ROLE ghm_actor_gateway'),
    '42501',
    'ORDINARY RUNTIME CANNOT ASSUME GATEWAY ROLE',
  );
  await expectSqlState(
    () => gatewayPool.query('SET ROLE ghm_schema_owner'),
    '42501',
    'GATEWAY CANNOT ASSUME SCHEMA OWNER',
  );
  await expectSqlState(
    () => gatewayPool.query('SELECT id FROM ghm.account_identity LIMIT 1'),
    '42501',
    'GATEWAY CANNOT READ ACCOUNT TABLE DIRECTLY',
  );

  console.log('GHM ACTOR GATEWAY DATABASE PRINCIPAL QUALIFICATION: PASS');
} finally {
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    await cleanupPool.query(
      'DELETE FROM ghm.business WHERE id = ANY($1::bigint[])',
      [fixture.businessIds],
    );
    await cleanupPool.query(
      'DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])',
      [fixture.accountIds],
    );
    await cleanupPool.query('COMMIT');
  } catch (error) {
    await cleanupPool.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await Promise.all([runtimePool.end(), gatewayPool.end(), cleanupPool.end()]);
  }
}
