import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { BusinessIdentityServiceImpl } = await import('../dist/resources/business-identity/service.js');
const { PostgresBusinessIdentityRepository } = await import('../dist/resources/business-identity/repository.js');
const { TrustScoreServiceImpl } = await import('../dist/resources/trust-score/service.js');
const { PostgresTrustScoreRepository } = await import('../dist/resources/trust-score/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const cleanupClient = await cleanupPool.connect();
const marker = `ghm-business-profile-${randomUUID()}`;
let fixture = null;

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query(
    'SELECT current_database() AS database_name, session_user, current_user, current_role',
  );
  const row = rows[0];
  if (
    row.database_name !== 'ghm_db'
    || row.session_user !== expectedUser
    || row.current_user !== expectedUser
    || row.current_role !== expectedUser
  ) {
    throw new Error(`${label} identity mismatch: ${JSON.stringify(row)}`);
  }
  console.log(`${label} PASS: ${row.database_name}/${row.current_user}`);
};

const cleanupQuery = async (text, params = []) => cleanupClient.query(text, params);

const expectReject = async (work, label) => {
  try {
    await work();
  } catch {
    console.log(`${label} PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

try {
  await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'RUNTIME IDENTITY'),
    identity(cleanupPool, 'ghm_migrator', 'CLEANUP AUTHORITY'),
  ]);

  await cleanupQuery('SET ROLE ghm_schema_owner');
  console.log('FIXTURE SCHEMA-OWNER SESSION PASS');

  const columns = await cleanupQuery(`
    SELECT a.attname
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'ghm' AND c.relname = 'business'
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname = ANY($1::text[])
    ORDER BY a.attname
  `, [['description', 'phone', 'email', 'insurance_verified', 'jobs_completed']]);
  if (columns.rowCount !== 5) {
    throw new Error(`Missing Business Profile columns: ${JSON.stringify(columns.rows)}`);
  }
  console.log('BUSINESS PROFILE SCHEMA PRESENCE PASS');

  const revoked = await cleanupQuery(`
    SELECT a.attname AS column_name
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(a.attacl, c.relacl)) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'business'
      AND a.attname = ANY($1::text[])
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type = 'UPDATE'
    ORDER BY a.attname
  `, [['description', 'phone', 'email', 'insurance_verified', 'jobs_completed', 'name', 'slug', 'verification_status', 'is_verified', 'is_active']]);
  if (revoked.rowCount !== 0) {
    throw new Error(`Unexpected runtime UPDATE grants on protected/profile columns: ${JSON.stringify(revoked.rows)}`);
  }

  const fnOk = await cleanupQuery(`
    SELECT has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS execute_ok
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ghm' AND p.proname = 'update_business_profile'
  `);
  if (fnOk.rowCount !== 1 || fnOk.rows[0].execute_ok !== true) {
    throw new Error('update_business_profile EXECUTE grant missing');
  }
  console.log('RUNTIME PRIVILEGE BOUNDARY PASS: profile UPDATE revoked; function EXECUTE yes');

  const ddlDenied = await runtimePool.query(`
    SELECT has_schema_privilege(current_user, 'ghm', 'CREATE') AS create_ok
  `);
  if (ddlDenied.rows[0].create_ok) throw new Error('Runtime unexpectedly has schema CREATE');
  console.log('RUNTIME CANNOT ALTER SCHEMA PASS');

  const owner = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
    [`${marker} owner`],
  );
  const administrator = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
    [`${marker} administrator`],
  );
  const member = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
    [`${marker} member`],
  );
  const customer = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'customer') RETURNING id`,
    [`${marker} customer`],
  );
  const otherOwner = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
    [`${marker} other-owner`],
  );
  const ownerId = Number(owner.rows[0].id);
  const administratorId = Number(administrator.rows[0].id);
  const memberId = Number(member.rows[0].id);
  const customerId = Number(customer.rows[0].id);
  const otherOwnerId = Number(otherOwner.rows[0].id);

  const businessA = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active, rating)
     VALUES ($1, $2, 'approved', true, true, 4.00) RETURNING id`,
    [`${marker} A`, `${marker}-a`],
  );
  const businessB = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
     VALUES ($1, $2, 'approved', true, true) RETURNING id`,
    [`${marker} B`, `${marker}-b`],
  );
  const businessAId = Number(businessA.rows[0].id);
  const businessBId = Number(businessB.rows[0].id);

  await cleanupQuery(
    `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
     VALUES ($1, $2, 'owner', 'active', $2),
            ($1, $3, 'administrator', 'active', $2),
            ($1, $4, 'member', 'active', $2),
            ($5, $6, 'owner', 'active', $6)`,
    [businessAId, ownerId, administratorId, memberId, businessBId, otherOwnerId],
  );

  fixture = { ownerId, administratorId, memberId, customerId, otherOwnerId, businessAId, businessBId };

  const businessRepo = new PostgresBusinessIdentityRepository(runtimePool);
  const businessService = new BusinessIdentityServiceImpl(businessRepo);
  const trustService = new TrustScoreServiceImpl(new PostgresTrustScoreRepository(runtimePool));

  const ownerContext = { userId: ownerId, role: 'business' };
  const administratorContext = { userId: administratorId, role: 'business' };
  const memberContext = { userId: memberId, role: 'business' };
  const customerContext = { userId: customerId, role: 'customer' };
  const otherOwnerContext = { userId: otherOwnerId, role: 'business' };
  const anonymousContext = { userId: 0, role: 'business' };

  await expectReject(
    () => businessService.updateBusiness(anonymousContext, businessAId, { description: 'x' }),
    'UNAUTHENTICATED UPDATE DENIAL',
  );
  await expectReject(
    () => businessService.updateBusiness(customerContext, businessAId, { description: 'x' }),
    'CUSTOMER UPDATE DENIAL',
  );
  await expectReject(
    () => businessService.updateBusiness(memberContext, businessAId, { description: 'x' }),
    'MEMBER WITHOUT BUSINESS.MANAGE DENIAL',
  );
  await expectReject(
    () => businessService.updateBusiness(otherOwnerContext, businessAId, { description: 'x' }),
    'CROSS-BUSINESS UPDATE DENIAL',
  );

  const updatedDescription = await businessService.updateBusiness(ownerContext, businessAId, {
    description: 'Qualified Trust profile description',
  });
  if (updatedDescription.description !== 'Qualified Trust profile description') {
    throw new Error(`Owner description update failed: ${JSON.stringify(updatedDescription)}`);
  }
  console.log('OWNER DESCRIPTION UPDATE PASS');

  const updatedPhone = await businessService.updateBusiness(ownerContext, businessAId, {
    phone: '0115551234',
  });
  if (updatedPhone.phone !== '0115551234') throw new Error('Owner phone update failed');
  console.log('OWNER PHONE UPDATE PASS');

  const updatedEmail = await businessService.updateBusiness(ownerContext, businessAId, {
    email: 'owner@example.com',
  });
  if (updatedEmail.email !== 'owner@example.com') throw new Error('Owner email update failed');
  console.log('OWNER EMAIL UPDATE PASS');

  const adminUpdated = await businessService.updateBusiness(administratorContext, businessAId, {
    description: 'Administrator updated description',
    phone: '0215559999',
    email: 'admin@example.com',
  });
  if (
    adminUpdated.description !== 'Administrator updated description'
    || adminUpdated.phone !== '0215559999'
    || adminUpdated.email !== 'admin@example.com'
  ) {
    throw new Error(`Administrator profile update failed: ${JSON.stringify(adminUpdated)}`);
  }
  console.log('ADMINISTRATOR PROFILE UPDATE PASS');

  const persisted = await cleanupQuery(
    `SELECT description, phone, email, insurance_verified, jobs_completed
     FROM ghm.business WHERE id = $1`,
    [businessAId],
  );
  const row = persisted.rows[0];
  if (
    row.description !== 'Administrator updated description'
    || row.phone !== '0215559999'
    || row.email !== 'admin@example.com'
    || row.insurance_verified !== false
    || Number(row.jobs_completed) !== 0
  ) {
    throw new Error(`Persisted profile reconciliation failed: ${JSON.stringify(row)}`);
  }
  console.log('PERSISTED PROFILE RECONCILIATION PASS');

  const trust = await trustService.calculateTrustScore(ownerContext, businessAId);
  if (
    trust.profileComplete !== 15
    || trust.phoneVerified !== 10
    || trust.emailVerified !== 10
    || trust.insuranceVerified !== 0
    || trust.completedProjects !== 0
    || trust.reviewsScore !== 12
    || trust.totalScore !== 47
    || trust.trustLevel !== 'silver'
  ) {
    throw new Error(`Trust calculation did not consume profile inputs: ${JSON.stringify(trust)}`);
  }
  console.log('TRUST CALCULATION CONSUMES PROFILE INPUTS PASS');

  for (const field of [
    'insuranceVerified',
    'jobsCompleted',
    'rating',
    'reviewCount',
    'profileViews',
    'verificationStatus',
    'isVerified',
    'isActive',
    'tier',
    'isFeatured',
    'logoUrl',
  ]) {
    await expectReject(
      () => businessService.updateBusiness(ownerContext, businessAId, { [field]: true }),
      `OWNER ${field.toUpperCase()} UPDATE DENIAL`,
    );
  }

  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.business SET description = 'bypass' WHERE id = $1`,
      [businessAId],
    ),
    'RUNTIME DIRECT DESCRIPTION UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.business SET insurance_verified = true WHERE id = $1`,
      [businessAId],
    ),
    'RUNTIME DIRECT INSURANCE_VERIFIED UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.business SET jobs_completed = 50 WHERE id = $1`,
      [businessAId],
    ),
    'RUNTIME DIRECT JOBS_COMPLETED UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.business SET verification_status = 'approved' WHERE id = $1`,
      [businessAId],
    ),
    'RUNTIME DIRECT VERIFICATION_STATUS UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.business SET is_verified = true, is_active = false WHERE id = $1`,
      [businessAId],
    ),
    'RUNTIME DIRECT IS_VERIFIED/IS_ACTIVE UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.business SET name = 'hijack', slug = 'hijack' WHERE id = $1`,
      [businessAId],
    ),
    'RUNTIME DIRECT NAME/SLUG UPDATE DENIAL',
  );

  const concurrent = await Promise.allSettled([
    businessService.updateBusiness(ownerContext, businessAId, { description: 'Concurrent A' }),
    businessService.updateBusiness(administratorContext, businessAId, { phone: '0315550000' }),
    businessService.updateBusiness(ownerContext, businessAId, { email: 'concurrent@example.com' }),
  ]);
  const successes = concurrent.filter((result) => result.status === 'fulfilled');
  if (successes.length !== 3) {
    throw new Error(`Concurrent profile updates expected 3 successes; got ${successes.length}`);
  }
  const afterConcurrent = await cleanupQuery(
    `SELECT description, phone, email FROM ghm.business WHERE id = $1`,
    [businessAId],
  );
  const concurrentRow = afterConcurrent.rows[0];
  if (!concurrentRow.description || !concurrentRow.phone || !concurrentRow.email) {
    throw new Error(`Concurrent updates left malformed state: ${JSON.stringify(concurrentRow)}`);
  }
  console.log('CONCURRENT PROFILE UPDATE PASS');

  const grants = await runtimePool.query(`
    SELECT has_table_privilege(current_user, 'ghm.business', 'SELECT') AS select_ok,
           has_column_privilege(current_user, 'ghm.business', 'description', 'UPDATE') AS description_update,
           has_column_privilege(current_user, 'ghm.business', 'insurance_verified', 'UPDATE') AS insurance_update,
           has_column_privilege(current_user, 'ghm.business', 'jobs_completed', 'UPDATE') AS jobs_update,
           has_column_privilege(current_user, 'ghm.business', 'rating', 'UPDATE') AS rating_update,
           has_function_privilege(current_user, 'ghm.update_business_profile(bigint,bigint,jsonb)', 'EXECUTE') AS profile_fn_ok
  `);
  const grant = grants.rows[0];
  if (
    !grant.select_ok
    || grant.description_update
    || grant.insurance_update
    || grant.jobs_update
    || !grant.rating_update
    || !grant.profile_fn_ok
  ) {
    throw new Error(`Unexpected Business effective ACL: ${JSON.stringify(grant)}`);
  }
  console.log('RUNTIME EFFECTIVE ACL PASS');

  console.log('GHM BUSINESS PROFILE RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupQuery('SET ROLE ghm_schema_owner');
    if (fixture) {
      await cleanupQuery('DELETE FROM ghm.trust_score WHERE business_id = ANY($1::bigint[])', [[fixture.businessAId, fixture.businessBId]]);
      await cleanupQuery('DELETE FROM ghm.business_membership WHERE business_id = ANY($1::bigint[])', [[fixture.businessAId, fixture.businessBId]]);
      await cleanupQuery('DELETE FROM ghm.business WHERE id = ANY($1::bigint[])', [[fixture.businessAId, fixture.businessBId]]);
      await cleanupQuery(
        'DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])',
        [[fixture.ownerId, fixture.administratorId, fixture.memberId, fixture.customerId, fixture.otherOwnerId]],
      );
    }
    console.log('GOVERNED CLEANUP PASS');
  } catch (error) {
    console.error(`Qualification cleanup failed: ${error.message}`);
    process.exitCode = 1;
  }
  cleanupClient.release();
  await Promise.all([runtimePool.end(), cleanupPool.end()]);
}
