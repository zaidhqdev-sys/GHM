import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { assertActorGatewayDatabasePrivileges, readActorGatewayDatabasePrivileges } from '../dist/actor-gateway/database-privileges.js';
import { assertRuntimeDatabaseFunctionPrivileges, readRuntimeDatabaseFunctionPrivileges } from '../dist/db/runtime-database-privileges.js';
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
const fixture = { marker: `ghm-actor-gateway-${randomUUID()}`, accountIds: [], businessIds: [], founderBootstrapCreated: false };
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
const gatewayCallWithAssertion = (accountId,a,sql,args=[]) => {
  const shiftedSql=sql.replace(/\$(\d+)/g,(_match,n)=>'$'+(Number(n)>=4?Number(n)+1:Number(n))).replace(/\(\$1,\$2,\$3,\$5/,()=> '($1,$2,$3,$4,$5');
  return gatewayPool.query(shiftedSql,[accountId,a.issuedAt,a.nonce,a.context,a.signature,...args]);
};
const gatewayCall = (accountId,operation,sql,args=[]) => {
  const a=signAssertion(accountId,operation,assertionContext(operation,args));
  return gatewayCallWithAssertion(accountId,a,sql,args);
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

const createFounderFixtureAccount = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const existing = await client.query(
      "SELECT count(*)::int AS count FROM ghm.founder_system_admin_bootstrap_state WHERE id = true",
    );
    if (existing.rows[0].count !== 0) throw new Error('Founder bootstrap fixture requires an empty singleton');
    const credentials = await client.query(
      "SELECT count(*)::int AS count FROM ghm.account_password_credential WHERE login_email_normalized = 'zaidhqdev@gmail.com'",
    );
    if (credentials.rows[0].count !== 0) throw new Error('Founder bootstrap fixture email is already in use');
    const account = await client.query(
      "INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin) VALUES ('Disposable Founder Fixture', 'admin', 'active', true) RETURNING id",
    );
    const accountId = Number(account.rows[0].id);
    await client.query(
      `INSERT INTO ghm.account_password_credential
         (account_id, login_email, login_email_normalized, password_hash, credential_status)
       VALUES ($1, 'zaidhqdev@gmail.com', 'zaidhqdev@gmail.com', 'disposable-argon2id-fixture', 'active')`,
      [accountId],
    );
    await client.query(
      "INSERT INTO ghm.founder_system_admin_bootstrap_state (id, account_id, founder_login_email) VALUES (true, $1, 'zaidhqdev@gmail.com')",
      [accountId],
    );
    await client.query('COMMIT');
    fixture.accountIds.push(accountId);
    fixture.founderBootstrapCreated = true;
    return accountId;
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
  assertRuntimeDatabaseFunctionPrivileges(await readRuntimeDatabaseFunctionPrivileges(runtimePool));
  console.log('RESOURCE API RUNTIME EXACT FUNCTION EXECUTE ALLOW-LIST: PASS');
  const mappingLookupAcl = await gatewayPool.query(`
    SELECT has_function_privilege('ghm_runtime','ghm.auth_lookup_business_external_mapping(text,text)','EXECUTE') AS runtime_execute,
           has_function_privilege('ghm_migrator','ghm.auth_lookup_business_external_mapping(text,text)','EXECUTE') AS migrator_execute
  `);
  assert.deepEqual(mappingLookupAcl.rows[0], { runtime_execute: true, migrator_execute: false });
  console.log('BUSINESS EXTERNAL MAPPING LOOKUP ACL: runtime=yes migrator=no');

  const gatewayPrivileges = await readActorGatewayDatabasePrivileges(gatewayPool);
  console.log(`GATEWAY ACL DIAGNOSTIC: ${JSON.stringify(gatewayPrivileges)}`);
  assertActorGatewayDatabasePrivileges(gatewayPrivileges);
  console.log('GATEWAY EXACT FUNCTION AND RELATION ACL ALLOW-LIST: PASS');
  const provision=await cleanupPool.connect();
  try { await provision.query('BEGIN'); await provision.query('SET LOCAL ROLE ghm_schema_owner'); await provision.query("INSERT INTO ghm.actor_gateway_capability_assertion_secret(singleton,secret) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET secret=EXCLUDED.secret",[Buffer.from(assertionSecret,'base64')]); await provision.query('COMMIT'); } catch(e) { await provision.query('ROLLBACK').catch(()=>{}); throw e; } finally { provision.release(); }
  console.log('DATABASE PRINCIPAL IDENTITY: PASS');

  const activeAccountId = await createFixtureAccount(`${fixture.marker}-active`);
  const founderAccountId = await createFounderFixtureAccount();
  const authorityClient = await gatewayPool.connect();
  try {
    await authorityClient.query('BEGIN');
    const authorityCall = async (accountId, action, documentType, documentKey, jurisdictionCountryId, reason, assertionOverride) => {
      const context = { action, documentType, documentKey, jurisdictionCountryId, reason };
      const assertion = assertionOverride ?? signAssertion(accountId, 'commercial.document.authority.manage', context);
      return authorityClient.query(
        'SELECT * FROM ghm.gateway_manage_commercial_document_approval_authority($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [accountId, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, action, documentType, documentKey, jurisdictionCountryId, reason],
      );
    };
    const expectAuthoritySqlState = async (work, code, label) => {
      await authorityClient.query('SAVEPOINT authority_expected_failure');
      try {
        await work();
      } catch (error) {
        if (error?.code !== code) {
          throw new Error(`${label}: expected SQLSTATE ${code}; received ${error?.code ?? error?.message}`);
        }
        await authorityClient.query('ROLLBACK TO SAVEPOINT authority_expected_failure');
        await authorityClient.query('RELEASE SAVEPOINT authority_expected_failure');
        console.log(`${label}: PASS`);
        return;
      }
      await authorityClient.query('ROLLBACK TO SAVEPOINT authority_expected_failure');
      await authorityClient.query('RELEASE SAVEPOINT authority_expected_failure');
      throw new Error(`${label}: operation unexpectedly succeeded`);
    };

    const grant = await authorityCall(founderAccountId, 'grant', 'trial_terms', 'zaid-business-pro-trial', null, 'Owner-approved trial terms authority');
    assert.equal(grant.rowCount, 1);
    assert.equal(grant.rows[0].event_type, 'granted');
    console.log('CANONICAL FOUNDER CAN GRANT OWN COMMERCIAL DOCUMENT APPROVAL AUTHORITY: PASS');

    await expectAuthoritySqlState(
      () => authorityCall(founderAccountId, 'grant', 'trial_terms', 'zaid-business-pro-trial', null, 'Duplicate grant'),
      'P0001',
      'DUPLICATE COMMERCIAL AUTHORITY GRANT IS DENIED',
    );

    const revoke = await authorityCall(founderAccountId, 'revoke', 'trial_terms', 'zaid-business-pro-trial', null, 'Owner revokes trial terms authority');
    assert.equal(revoke.rowCount, 1);
    assert.equal(revoke.rows[0].event_type, 'revoked');
    console.log('CANONICAL FOUNDER CAN REVOKE OWN COMMERCIAL DOCUMENT APPROVAL AUTHORITY: PASS');

    await expectAuthoritySqlState(
      () => authorityCall(founderAccountId, 'revoke', 'trial_terms', 'zaid-business-pro-trial', null, 'Duplicate revoke'),
      'P0001',
      'REVOCATION WITHOUT CURRENT GRANT IS DENIED',
    );

    const regrant = await authorityCall(founderAccountId, 'grant', 'trial_terms', 'zaid-business-pro-trial', null, 'Owner re-grants trial terms authority');
    assert.equal(regrant.rows[0].event_type, 'granted');
    console.log('RE-GRANT AFTER REVOCATION APPENDS A NEW GRANT EVENT: PASS');

    await expectAuthoritySqlState(
      () => authorityCall(activeAccountId, 'grant', 'trial_terms', 'unauthorized-scope', null, 'Non-founder attempt'),
      '42501',
      'NON-FOUNDER ADMINISTRATOR CANNOT GRANT COMMERCIAL APPROVAL AUTHORITY',
    );

    const forged = signAssertion(founderAccountId, 'commercial.document.authority.manage', {
      action: 'grant', documentType: 'trial_terms', documentKey: 'forged-scope', jurisdictionCountryId: null, reason: 'Forged signature',
    });
    forged.signature = '0'.repeat(64);
    await expectAuthoritySqlState(
      () => authorityCall(founderAccountId, 'grant', 'trial_terms', 'forged-scope', null, 'Forged signature', forged),
      '42501',
      'FORGED COMMERCIAL AUTHORITY ASSERTION IS DENIED',
    );

    const transplanted = signAssertion(founderAccountId, 'commercial.document.authority.manage', {
      action: 'grant', documentType: 'trial_terms', documentKey: 'signed-scope', jurisdictionCountryId: null, reason: 'Signed reason',
    });
    await expectAuthoritySqlState(
      () => authorityCall(founderAccountId, 'grant', 'trial_terms', 'tampered-scope', null, 'Signed reason', transplanted),
      '42501',
      'SIGNED COMMERCIAL AUTHORITY ASSERTION CANNOT BE TRANSPLANTED TO ANOTHER SCOPE',
    );

    const replay = signAssertion(founderAccountId, 'commercial.document.authority.manage', {
      action: 'grant', documentType: 'subscription_terms', documentKey: 'zaid-business-pro-subscription', jurisdictionCountryId: null, reason: 'Replay check',
    });
    const firstReplayUse = await authorityCall(founderAccountId, 'grant', 'subscription_terms', 'zaid-business-pro-subscription', null, 'Replay check', replay);
    assert.equal(firstReplayUse.rowCount, 1);
    await expectAuthoritySqlState(
      () => authorityCall(founderAccountId, 'grant', 'subscription_terms', 'zaid-business-pro-subscription', null, 'Replay check', replay),
      '42501',
      'REPLAYED COMMERCIAL AUTHORITY ASSERTION IS DENIED',
    );

    const expiry = signAssertion(founderAccountId, 'commercial.document.authority.manage', {
      action: 'grant', documentType: 'subscription_terms', documentKey: 'expired-scope', jurisdictionCountryId: null, reason: 'Expired check',
    }, Math.floor(Date.now() / 1000) - 61);
    await expectAuthoritySqlState(
      () => authorityCall(founderAccountId, 'grant', 'subscription_terms', 'expired-scope', null, 'Expired check', expiry),
      '42501',
      'EXPIRED COMMERCIAL AUTHORITY ASSERTION IS DENIED',
    );

    assert.deepEqual(
      [grant.rows[0].event_type, revoke.rows[0].event_type, regrant.rows[0].event_type, firstReplayUse.rows[0].event_type],
      ['granted', 'revoked', 'granted', 'granted'],
    );
    console.log('COMMERCIAL APPROVAL AUTHORITY GRANT/REVOKE HISTORY QUALIFICATION: PASS');
  } finally {
    await authorityClient.query('ROLLBACK').catch(() => {});
    authorityClient.release();
  }


  const disabledAccountId = await createFixtureAccount(`${fixture.marker}-disabled`, 'disabled');
  const otherOwnerAccountId = await createFixtureAccount(`${fixture.marker}-other-owner`);
  const businessId = await createFixtureBusiness(activeAccountId, 'primary');

  const otherBusinessId = await createFixtureBusiness(otherOwnerAccountId, 'other-owner');
  const externalBusinessId = randomUUID();
  const mappingFixture = await cleanupPool.connect();
  try {
    await mappingFixture.query('BEGIN');
    await mappingFixture.query('SET LOCAL ROLE ghm_schema_owner');
    await mappingFixture.query(
      `INSERT INTO ghm.business_external_mapping(provider,external_business_id,business_id)
       VALUES ('supabase',$1,$2)`,
      [externalBusinessId, businessId],
    );
    await mappingFixture.query('COMMIT');
  } catch (error) {
    await mappingFixture.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { mappingFixture.release(); }
  const resolvedMapping = await runtimePool.query(
    'SELECT * FROM ghm.auth_lookup_business_external_mapping($1,$2)',
    ['supabase', externalBusinessId],
  );
  assert.equal(resolvedMapping.rowCount, 1);
  assert.equal(Number(resolvedMapping.rows[0].business_id), businessId);
  console.log('RUNTIME CONNECT BUSINESS MAPPING LOOKUP: PASS');
  await expectSqlState(
    () => cleanupPool.query('SELECT * FROM ghm.auth_lookup_business_external_mapping($1,$2)', ['supabase', externalBusinessId]),
    '42501',
    'migrator direct mapping lookup is denied',
  );


  const roleState = await gatewayPool.query(`
    SELECT r.rolcanlogin,
           r.rolinherit,
           r.rolsuper,
           r.rolcreatedb,
           r.rolcreaterole,
           r.rolreplication,
           r.rolbypassrls,
           NOT EXISTS (
             SELECT 1
                FROM pg_auth_members m
                JOIN pg_roles member_role ON member_role.oid = m.member
               WHERE m.member = r.oid
                  OR (
                   m.roleid = r.oid
                   AND (
                     member_role.rolname <> 'ghm_db_user'
                     OR m.admin_option IS DISTINCT FROM true
                     OR m.inherit_option IS DISTINCT FROM false
                     OR m.set_option IS DISTINCT FROM false
                   )
                 )
           ) AS no_untrusted_role_memberships,
           EXISTS (
             SELECT 1
               FROM pg_auth_members m
               JOIN pg_roles member_role ON member_role.oid = m.member
              WHERE m.roleid = r.oid
                AND member_role.rolname = 'ghm_db_user'
                AND m.admin_option IS TRUE
                AND m.inherit_option IS FALSE
                AND m.set_option IS FALSE
           ) AS trusted_admin_membership
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
    no_untrusted_role_memberships: true,
    trusted_admin_membership: true,
  });
  console.log('GATEWAY LOGIN LEAST-PRIVILEGE ATTRIBUTES AND TRUSTED ADMIN BOUNDARY: PASS');

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
  assert.equal(functionState.rows[0].gateway_can_execute, false);
  assert.ok(functionState.rows[0].function_config?.includes('search_path=pg_catalog, ghm, pg_temp'));
  console.log('UNUSED UNSIGNED HELPER IS OWNER-ONLY WITH FIXED SEARCH PATH: PASS');

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

  await expectSqlState(
    () => gatewayPool.query('SELECT ghm.assert_actor_gateway($1)', [activeAccountId]),
    '42501',
    'unsigned actor identity helper is denied',
  );

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
  await expectSqlState(
    () => gatewayCallWithAssertion(activeAccountId,boundaryAssertion,
      'SELECT account_id, account_role, full_name FROM ghm.gateway_get_actor_identity($1,$2,$3,$4)'),
    '42501',
    'REPLAYED SIGNED ACTOR ASSERTION IS DENIED',
  );
  const expiredAssertion=signAssertion(activeAccountId,'actor.identity.read',{},Math.floor(Date.now()/1000)-61);
  await expectSqlState(
    () => gatewayCallWithAssertion(activeAccountId,expiredAssertion,
      'SELECT account_id, account_role, full_name FROM ghm.gateway_get_actor_identity($1,$2,$3,$4)'),
    '42501',
    'EXPIRED SIGNED ACTOR ASSERTION IS DENIED',
  );
  const futureAssertion=signAssertion(activeAccountId,'actor.identity.read',{},Math.floor(Date.now()/1000)+65);
  await expectSqlState(
    () => gatewayCallWithAssertion(activeAccountId,futureAssertion,
      'SELECT account_id, account_role, full_name FROM ghm.gateway_get_actor_identity($1,$2,$3,$4)'),
    '42501',
    'FUTURE-DATED SIGNED ACTOR ASSERTION IS DENIED',
  );


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

  const registrationCutoverSql = await readFile(
    fileURLToPath(new URL('../database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql', import.meta.url)),
    'utf8',
  );
  const registrationCutover = await cleanupPool.connect();
  try {
    await registrationCutover.query('SET ROLE ghm_schema_owner');
    await registrationCutover.query(registrationCutoverSql);
    await registrationCutover.query('RESET ROLE');
  } finally {
    registrationCutover.release();
  }
  console.log('MANUAL REGISTRATION IDENTITY CUTOVER SQL APPLIED TO DISPOSABLE DATABASE PASS');

  await expectSqlState(
    () => runtimePool.query('SELECT * FROM ghm.read_business_registration_identity($1,$2)', [activeAccountId,businessId]),
    '42501',
    'ORDINARY RUNTIME CANNOT EXECUTE LEGACY REGISTRATION READ AFTER CUTOVER',
  );
  await expectSqlState(
    () => runtimePool.query('SELECT * FROM ghm.update_business_registration_identity($1,$2,$3,$4,$5)', [activeAccountId,businessId,'registered','REG-RUNTIME-SPOOF','Runtime Spoofed Entity']),
    '42501',
    'ORDINARY RUNTIME CANNOT EXECUTE LEGACY REGISTRATION WRITE AFTER CUTOVER',
  );

  const postCutoverRead = await gatewayCall(activeAccountId,'business.registration.read',
    'SELECT * FROM ghm.gateway_read_business_registration_identity($1,$2,$3,$4,$5)',[businessId]);
  if (postCutoverRead.rowCount !== 1) throw new Error('Gateway registration read failed after legacy RPC revocation');
  console.log('SIGNED GATEWAY REGISTRATION READ REMAINS AVAILABLE AFTER CUTOVER PASS');

  const postCutoverUpdate = await gatewayCall(activeAccountId,'business.registration.update',
    'SELECT * FROM ghm.gateway_update_business_registration_identity($1,$2,$3,$4,$5,$6,$7,$8)',
    [businessId,'registered','REG-GATEWAY-CUTOVER',`${fixture.marker} post-cutover legal entity`]);
  if (postCutoverUpdate.rowCount !== 1 || postCutoverUpdate.rows[0].registration_number !== 'REG-GATEWAY-CUTOVER') {
    throw new Error('Gateway registration write failed after legacy RPC revocation');
  }
  console.log('SIGNED GATEWAY REGISTRATION WRITE REMAINS AVAILABLE AFTER CUTOVER PASS');

  const registrationPrivileges = await runtimePool.query(
    `SELECT
       has_function_privilege('ghm_runtime', 'ghm.read_business_registration_identity(bigint,bigint)', 'EXECUTE') AS runtime_can_legacy_read,
       has_function_privilege('ghm_runtime', 'ghm.update_business_registration_identity(bigint,bigint,text,text,text)', 'EXECUTE') AS runtime_can_legacy_update,
       has_function_privilege('ghm_actor_gateway', 'ghm.read_business_registration_identity(bigint,bigint)', 'EXECUTE') AS gateway_can_legacy_read,
       has_function_privilege('ghm_actor_gateway', 'ghm.update_business_registration_identity(bigint,bigint,text,text,text)', 'EXECUTE') AS gateway_can_legacy_update,
       has_function_privilege('ghm_actor_gateway', 'ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,text,bigint)', 'EXECUTE') AS gateway_can_signed_read,
       has_function_privilege('ghm_actor_gateway', 'ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,text,bigint,text,text,text)', 'EXECUTE') AS gateway_can_signed_update`,
  );
  const registrationPrivilege = registrationPrivileges.rows[0];
  if (registrationPrivilege.runtime_can_legacy_read || registrationPrivilege.runtime_can_legacy_update ||
      registrationPrivilege.gateway_can_legacy_read || registrationPrivilege.gateway_can_legacy_update ||
      !registrationPrivilege.gateway_can_signed_read || !registrationPrivilege.gateway_can_signed_update) {
    throw new Error(`Registration identity privilege boundary failed after cutover: ${JSON.stringify(registrationPrivilege)}`);
  }
  console.log('REGISTRATION IDENTITY LEGACY RPC DENIAL AND SIGNED GATEWAY PRIVILEGE BOUNDARY PASS');

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
    () => runtimePool.query('SELECT ghm.assert_actor_gateway($1)', [activeAccountId]),
    '42501',
    'ORDINARY RUNTIME CANNOT EXECUTE UNSIGNED IDENTITY HELPER',
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
      'DELETE FROM ghm.business_external_mapping WHERE business_id = ANY($1::bigint[])',
      [fixture.businessIds],
    );
    await cleanupPool.query(
      'DELETE FROM ghm.business WHERE id = ANY($1::bigint[])',
      [fixture.businessIds],
    );
    if (fixture.founderBootstrapCreated) {
      await cleanupPool.query('DELETE FROM ghm.founder_system_admin_bootstrap_state WHERE id = true');
    }
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
