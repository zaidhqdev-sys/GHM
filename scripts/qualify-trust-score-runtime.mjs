import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { TrustScoreServiceImpl } = await import('../dist/resources/trust-score/service.js');
const { PostgresTrustScoreRepository } = await import('../dist/resources/trust-score/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const cleanupClient = await cleanupPool.connect();
const marker = `ghm-trust-score-${randomUUID()}`;
let fixture = null;
const trustScoreIds = [];

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

const track = (score) => {
  trustScoreIds.push(score.id);
  return score;
};

const expectedReviewsScore = (rating) => Math.min(Math.max(Math.round(Number(rating) * 3), 0), 15);

try {
  await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'RUNTIME IDENTITY'),
    identity(cleanupPool, 'ghm_migrator', 'CLEANUP AUTHORITY'),
  ]);

  await cleanupQuery('SET ROLE ghm_schema_owner');
  const elevated = await cleanupQuery(`
    SELECT current_database() AS database_name,
           current_user AS current_user,
           session_user AS session_user
  `);
  if (
    elevated.rows[0].database_name !== 'ghm_db'
    || elevated.rows[0].current_user !== 'ghm_schema_owner'
    || elevated.rows[0].session_user !== 'ghm_migrator'
  ) {
    throw new Error(`Unexpected fixture identity: ${JSON.stringify(elevated.rows[0])}`);
  }
  console.log('FIXTURE SCHEMA-OWNER SESSION PASS: ghm_schema_owner/ghm_migrator');

  const schemaPresence = await cleanupQuery(`
    SELECT c.relname AS table_name, pg_catalog.pg_get_userbyid(c.relowner) AS owner_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'ghm'
      AND c.relkind IN ('r', 'p')
      AND c.relname = 'trust_score'
  `);
  if (schemaPresence.rowCount !== 1) throw new Error('Trust Score table is missing');
  if (schemaPresence.rows[0].owner_name !== 'ghm_schema_owner') {
    throw new Error(`Unexpected Trust Score owner: ${schemaPresence.rows[0].owner_name}`);
  }
  console.log('TRUST SCORE SCHEMA PRESENCE PASS');

  const columns = await cleanupQuery(`
    SELECT a.attname AS column_name,
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
           a.attnotnull AS not_null,
           a.attidentity AS identity
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'ghm'
      AND c.relname = 'trust_score'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `);
  const expectedColumns = [
    { column_name: 'id', data_type: 'bigint', not_null: true, identity: 'd' },
    { column_name: 'business_id', data_type: 'bigint', not_null: true, identity: '' },
    { column_name: 'profile_complete', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'phone_verified', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'email_verified', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'id_verified', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'cipc_verified', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'vat_verified', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'insurance_verified', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'reviews_score', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'completed_projects', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'total_score', data_type: 'smallint', not_null: true, identity: '' },
    { column_name: 'trust_level', data_type: 'text', not_null: true, identity: '' },
    { column_name: 'last_updated', data_type: 'timestamp with time zone', not_null: true, identity: '' },
    { column_name: 'created_at', data_type: 'timestamp with time zone', not_null: true, identity: '' },
    { column_name: 'updated_at', data_type: 'timestamp with time zone', not_null: true, identity: '' },
  ];
  if (columns.rowCount !== expectedColumns.length) {
    throw new Error(`Unexpected Trust Score column count: ${JSON.stringify(columns.rows)}`);
  }
  for (let i = 0; i < expectedColumns.length; i += 1) {
    const actual = columns.rows[i];
    const expected = expectedColumns[i];
    if (
      actual.column_name !== expected.column_name
      || actual.data_type !== expected.data_type
      || actual.not_null !== expected.not_null
      || actual.identity !== expected.identity
    ) {
      throw new Error(`Unexpected Trust Score column: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    }
  }
  console.log('TRUST SCORE EXACT SCHEMA PASS');

  const uniqueConstraint = await cleanupQuery(`
    SELECT c.conname,
           pg_catalog.pg_get_constraintdef(c.oid) AS definition
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'ghm'
      AND rel.relname = 'trust_score'
      AND c.contype = 'u'
  `);
  if (
    uniqueConstraint.rowCount !== 1
    || uniqueConstraint.rows[0].conname !== 'trust_score_business_unique'
    || !String(uniqueConstraint.rows[0].definition).includes('(business_id)')
  ) {
    throw new Error(`Unexpected Trust Score unique constraint: ${JSON.stringify(uniqueConstraint.rows)}`);
  }

  const foreignKeys = await cleanupQuery(`
    SELECT c.conname,
           pg_catalog.pg_get_constraintdef(c.oid) AS definition
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'ghm'
      AND rel.relname = 'trust_score'
      AND c.contype = 'f'
  `);
  if (
    foreignKeys.rowCount !== 1
    || !foreignKeys.rows[0].definition.includes('business_id')
    || !foreignKeys.rows[0].definition.includes('business(id)')
    || !foreignKeys.rows[0].definition.includes('ON DELETE CASCADE')
  ) {
    throw new Error(`Unexpected Trust Score foreign keys: ${JSON.stringify(foreignKeys.rows)}`);
  }
  console.log('TRUST SCORE INTEGRITY BOUNDARY PASS');

  const tablePrivileges = await cleanupQuery(`
    SELECT x.privilege_type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'trust_score'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
    ORDER BY x.privilege_type
  `);
  const tableGrantSet = tablePrivileges.rows.map(row => row.privilege_type);
  if (JSON.stringify(tableGrantSet) !== JSON.stringify(['SELECT'])) {
    throw new Error(`Unexpected Trust Score table grants: ${JSON.stringify(tableGrantSet)}`);
  }

  const columnPrivileges = await cleanupQuery(`
    SELECT x.privilege_type, a.attname AS column_name
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'trust_score'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type IN ('INSERT', 'UPDATE')
    ORDER BY x.privilege_type, a.attname
  `);
  if (columnPrivileges.rowCount !== 0) {
    throw new Error(`Unexpected Trust Score column DML grants: ${JSON.stringify(columnPrivileges.rows)}`);
  }

  const unexpectedDelete = await cleanupQuery(`
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'trust_score'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type = 'DELETE'
  `);
  if (unexpectedDelete.rowCount !== 0) throw new Error('Unexpected Trust Score DELETE privilege');

  const sequencePrivileges = await cleanupQuery(`
    SELECT x.privilege_type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'trust_score_id_seq'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type = 'USAGE'
  `);
  if (sequencePrivileges.rowCount !== 1) {
    throw new Error('Trust Score sequence USAGE grant missing for runtime');
  }

  const functionPrivileges = await cleanupQuery(`
    SELECT p.proname,
           has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS execute_ok
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ghm'
      AND p.proname = 'calculate_business_trust_score'
  `);
  if (functionPrivileges.rowCount !== 1 || functionPrivileges.rows[0].execute_ok !== true) {
    throw new Error(`Unexpected Trust Score function EXECUTE grants: ${JSON.stringify(functionPrivileges.rows)}`);
  }
  console.log('TRUST SCORE RUNTIME PRIVILEGE BOUNDARY PASS: SELECT=yes INSERT=no UPDATE=no DELETE=no CALCULATE=execute-only');

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
  const outsider = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'customer') RETURNING id`,
    [`${marker} outsider`],
  );
  const ownerId = Number(owner.rows[0].id);
  const administratorId = Number(administrator.rows[0].id);
  const memberId = Number(member.rows[0].id);
  const outsiderId = Number(outsider.rows[0].id);

  const publicBusiness = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active, rating)
     VALUES ($1, $2, 'approved', true, true, 4.00) RETURNING id, rating`,
    [`${marker} public`, `${marker}-public`],
  );
  const publicBusinessId = Number(publicBusiness.rows[0].id);
  const publicRating = Number(publicBusiness.rows[0].rating);

  const privateBusiness = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active, rating)
     VALUES ($1, $2, 'unverified', false, true, 5.00) RETURNING id, rating`,
    [`${marker} private`, `${marker}-private`],
  );
  const privateBusinessId = Number(privateBusiness.rows[0].id);
  const privateRating = Number(privateBusiness.rows[0].rating);

  await cleanupQuery(
    `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
     VALUES ($1, $2, 'owner', 'active', $2),
            ($1, $3, 'administrator', 'active', $2),
            ($1, $4, 'member', 'active', $2),
            ($5, $2, 'owner', 'active', $2)`,
    [publicBusinessId, ownerId, administratorId, memberId, privateBusinessId],
  );

  fixture = {
    ownerId,
    administratorId,
    memberId,
    outsiderId,
    publicBusinessId,
    privateBusinessId,
  };

  const repository = new PostgresTrustScoreRepository(runtimePool);
  const service = new TrustScoreServiceImpl(repository);
  const ownerContext = { userId: ownerId, role: 'business' };
  const administratorContext = { userId: administratorId, role: 'business' };
  const memberContext = { userId: memberId, role: 'business' };
  const outsiderContext = { userId: outsiderId, role: 'customer' };
  const anonymousContext = { userId: 0, role: 'customer' };

  await expectReject(
    () => service.calculateTrustScore(anonymousContext, publicBusinessId),
    'ANONYMOUS CALCULATE DENIAL',
  );
  await expectReject(
    () => service.getTrustScore(anonymousContext, publicBusinessId),
    'ANONYMOUS AUTHENTICATED-READ DENIAL',
  );
  await expectReject(
    () => service.calculateTrustScore(memberContext, publicBusinessId),
    'MEMBER CALCULATE DENIAL',
  );
  await expectReject(
    () => service.calculateTrustScore(outsiderContext, publicBusinessId),
    'OUTSIDER CALCULATE DENIAL',
  );

  const calculated = track(await service.calculateTrustScore(ownerContext, publicBusinessId));
  const expectedPublicReviews = expectedReviewsScore(publicRating);
  if (
    calculated.businessId !== publicBusinessId
    || calculated.reviewsScore !== expectedPublicReviews
    || calculated.profileComplete !== 0
    || calculated.phoneVerified !== 0
    || calculated.emailVerified !== 0
    || calculated.idVerified !== 0
    || calculated.cipcVerified !== 0
    || calculated.vatVerified !== 0
    || calculated.insuranceVerified !== 0
    || calculated.completedProjects !== 0
    || calculated.totalScore !== expectedPublicReviews
    || calculated.trustLevel !== 'bronze'
  ) {
    throw new Error(`Unexpected calculate result: ${JSON.stringify(calculated)}`);
  }
  console.log('OWNER CALCULATE + RESULT RECONCILIATION PASS');

  const adminCalculated = track(await service.calculateTrustScore(administratorContext, publicBusinessId));
  if (adminCalculated.id !== calculated.id || adminCalculated.totalScore !== calculated.totalScore) {
    throw new Error('Administrator recalculate did not upsert the same Trust Score row');
  }
  console.log('ADMINISTRATOR CALCULATE / UPSERT PASS');

  const persisted = await cleanupQuery(
    `SELECT id, business_id, reviews_score, total_score, trust_level
     FROM ghm.trust_score WHERE business_id = $1`,
    [publicBusinessId],
  );
  if (
    persisted.rowCount !== 1
    || Number(persisted.rows[0].reviews_score) !== expectedPublicReviews
    || Number(persisted.rows[0].total_score) !== expectedPublicReviews
  ) {
    throw new Error(`Persisted Trust Score reconciliation failed: ${JSON.stringify(persisted.rows[0])}`);
  }
  console.log('PERSISTED TRUST SCORE RECONCILIATION PASS');

  const publicRead = await service.getPublicTrustScore(publicBusinessId);
  if (!publicRead || publicRead.id !== calculated.id) throw new Error('Public read failed for approved business');
  console.log('PUBLIC READ BOUNDARY PASS');

  const privateCalculated = track(await service.calculateTrustScore(ownerContext, privateBusinessId));
  const expectedPrivateReviews = expectedReviewsScore(privateRating);
  if (privateCalculated.reviewsScore !== expectedPrivateReviews) {
    throw new Error(`Private calculate reviews_score mismatch: ${privateCalculated.reviewsScore}`);
  }

  const publicReadPrivate = await service.getPublicTrustScore(privateBusinessId);
  if (publicReadPrivate !== null) throw new Error('Public read leaked non-approved business Trust Score');
  console.log('PUBLIC READ DENIAL FOR NON-APPROVED BUSINESS PASS');

  const ownerPrivateRead = await service.getTrustScore(ownerContext, privateBusinessId);
  if (!ownerPrivateRead || ownerPrivateRead.id !== privateCalculated.id) {
    throw new Error('Owner trust.read private read failed');
  }
  const outsiderPrivateRead = await service.getTrustScore(outsiderContext, privateBusinessId);
  if (outsiderPrivateRead !== null) throw new Error('Outsider read leaked private Trust Score');
  const memberPrivateRead = await service.getTrustScore(memberContext, privateBusinessId);
  if (memberPrivateRead !== null) throw new Error('Member without trust.read leaked private Trust Score');
  console.log('AUTHENTICATED READ / CROSS-ACCOUNT ISOLATION PASS');

  const listed = await service.listPublicByTrustLevel('bronze');
  if (!listed.some(row => row.id === calculated.id)) throw new Error('Public list missing calculated score');
  if (listed.some(row => row.id === privateCalculated.id)) {
    throw new Error('Public list leaked private business Trust Score');
  }
  console.log('LIST BY TRUST LEVEL PUBLIC BOUNDARY PASS');

  const ownerListed = await service.listByTrustLevel(ownerContext, 'bronze');
  if (!ownerListed.some(row => row.id === privateCalculated.id)) {
    throw new Error('Authenticated list missing trust.read private score');
  }
  console.log('LIST BY TRUST LEVEL TRUST.READ BOUNDARY PASS');

  const concurrent = await Promise.allSettled(
    Array.from({ length: 10 }, () => service.calculateTrustScore(ownerContext, publicBusinessId)),
  );
  const concurrentSuccesses = concurrent.filter(result => result.status === 'fulfilled');
  if (concurrentSuccesses.length !== 10) {
    throw new Error(`Concurrent calculate expected 10 successes; received ${concurrentSuccesses.length}`);
  }
  const concurrentRows = await cleanupQuery(
    'SELECT count(*)::int AS count FROM ghm.trust_score WHERE business_id = $1',
    [publicBusinessId],
  );
  if (concurrentRows.rows[0].count !== 1) {
    throw new Error(`Concurrent calculate left ${concurrentRows.rows[0].count} rows`);
  }
  console.log('CONCURRENT CALCULATE / UNIQUE BUSINESS PASS');

  await expectReject(
    () => runtimePool.query(
      `INSERT INTO ghm.trust_score (business_id, total_score, trust_level)
       VALUES ($1, 99, 'platinum')`,
      [publicBusinessId],
    ),
    'RUNTIME DIRECT INSERT DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.trust_score SET total_score = 99 WHERE business_id = $1`,
      [publicBusinessId],
    ),
    'RUNTIME ARBITRARY UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `DELETE FROM ghm.trust_score WHERE business_id = $1`,
      [publicBusinessId],
    ),
    'RUNTIME DIRECT DELETE DENIAL',
  );

  const grants = await runtimePool.query(`
    SELECT has_table_privilege(current_user, 'ghm.trust_score', 'SELECT') AS select_ok,
           has_table_privilege(current_user, 'ghm.trust_score', 'INSERT') AS insert_ok,
           has_table_privilege(current_user, 'ghm.trust_score', 'UPDATE') AS update_ok,
           has_table_privilege(current_user, 'ghm.trust_score', 'DELETE') AS delete_ok,
           has_function_privilege(current_user, 'ghm.calculate_business_trust_score(bigint,bigint)', 'EXECUTE') AS calculate_fn_ok
  `);
  const grant = grants.rows[0];
  if (!grant.select_ok || grant.insert_ok || grant.update_ok || grant.delete_ok || !grant.calculate_fn_ok) {
    throw new Error(`Unexpected Trust Score effective ACL: ${JSON.stringify(grant)}`);
  }
  console.log('RUNTIME EFFECTIVE PRIVILEGE PASS: SELECT=yes INSERT=no UPDATE=no DELETE=no CALCULATE=execute-only');

  console.log('GHM TRUST SCORE RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupQuery('SET ROLE ghm_schema_owner');
    if (fixture) {
      await cleanupQuery(
        'DELETE FROM ghm.trust_score WHERE business_id = ANY($1::bigint[])',
        [[fixture.publicBusinessId, fixture.privateBusinessId]],
      );
      await cleanupQuery(
        'DELETE FROM ghm.business_membership WHERE business_id = ANY($1::bigint[])',
        [[fixture.publicBusinessId, fixture.privateBusinessId]],
      );
      await cleanupQuery(
        'DELETE FROM ghm.business WHERE id = ANY($1::bigint[])',
        [[fixture.publicBusinessId, fixture.privateBusinessId]],
      );
      await cleanupQuery(
        'DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])',
        [[fixture.ownerId, fixture.administratorId, fixture.memberId, fixture.outsiderId]],
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
