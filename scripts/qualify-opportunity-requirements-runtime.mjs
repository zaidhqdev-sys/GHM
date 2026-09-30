import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const RUNTIME_DATABASE_URL = process.env.GHM_RUNTIME_DATABASE_URL;
const MIGRATOR_DATABASE_URL = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!RUNTIME_DATABASE_URL) {
  throw new Error(
    'Opportunity requirements qualification refused: GHM_RUNTIME_DATABASE_URL is not set.',
  );
}

if (!MIGRATOR_DATABASE_URL) {
  throw new Error(
    'Opportunity requirements qualification refused: GHM_MIGRATOR_DATABASE_URL is not set.',
  );
}

const runtimePool = new Pool({
  connectionString: RUNTIME_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const cleanupPool = new Pool({
  connectionString: MIGRATOR_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const marker = `ghm-opportunity-requirements-${randomUUID()}`;

const cleanupClient = await cleanupPool.connect();

const cleanupIdentity = async () => {
  const { rows } = await cleanupClient.query(`
    SELECT
      current_database() AS database_name,
      session_user,
      current_user,
      current_role
  `);

  const identity = rows[0];

  assert.equal(identity.database_name, 'ghm_db');
  assert.equal(identity.session_user, 'ghm_migrator');
  assert.equal(identity.current_user, 'ghm_migrator');
  assert.equal(identity.current_role, 'ghm_migrator');

  await cleanupClient.query('SET ROLE ghm_schema_owner');

  const { rows: effectiveRows } = await cleanupClient.query(`
    SELECT
      current_database() AS database_name,
      session_user,
      current_user,
      current_role
  `);

  const effectiveIdentity = effectiveRows[0];

  assert.equal(effectiveIdentity.database_name, 'ghm_db');
  assert.equal(effectiveIdentity.session_user, 'ghm_migrator');
  assert.equal(effectiveIdentity.current_user, 'ghm_schema_owner');
  assert.equal(effectiveIdentity.current_role, 'ghm_schema_owner');

  return {
    login: identity,
    effective: effectiveIdentity,
  };
};

const runtimeIdentity = async () => {
  const { rows } = await runtimePool.query(`
    SELECT
      current_database() AS database_name,
      session_user,
      current_user,
      current_role
  `);

  const identity = rows[0];

  assert.equal(identity.database_name, 'ghm_db');
  assert.equal(identity.session_user, 'ghm_runtime');
  assert.equal(identity.current_user, 'ghm_runtime');
  assert.equal(identity.current_role, 'ghm_runtime');

  return identity;
};

const cleanup = async () => {
  await cleanupClient.query(
    `
      DELETE FROM ghm.opportunity_capability_requirement
      WHERE description = $1
    `,
    [marker],
  );

  await cleanupClient.query(
    `
      DELETE FROM ghm.opportunity
      WHERE description = $1
    `,
    [marker],
  );

  await cleanupClient.query(
    `
      DELETE FROM ghm.capability
      WHERE description = $1
    `,
    [marker],
  );

  await cleanupClient.query(
    `
      DELETE FROM ghm.business_membership
      WHERE account_id IN (
        SELECT id
        FROM ghm.account_identity
        WHERE full_name LIKE $1
      )
    `,
    [`${marker}%`],
  );

  await cleanupClient.query(
    `
      DELETE FROM ghm.business
      WHERE name = $1
    `,
    [marker],
  );

  await cleanupClient.query(
    `
      DELETE FROM ghm.account_identity
      WHERE full_name LIKE $1
    `,
    [`${marker}%`],
  );
};

const expectRejected = async (operation, expectedText) => {
  await assert.rejects(operation, (error) => {
    assert.match(String(error?.message ?? error), expectedText);
    return true;
  });
};

try {
  const runtime = await runtimeIdentity();
  const cleanupAuthority = await cleanupIdentity();

  console.log(
    `RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`,
  );
  console.log(
    `CLEANUP AUTHORITY LOGIN PASS: ${cleanupAuthority.login.database_name}/${cleanupAuthority.login.current_user}`,
  );
  console.log(
    `CLEANUP AUTHORITY ROLE PASS: ${cleanupAuthority.effective.database_name}/${cleanupAuthority.effective.current_role}`,
  );

  const tableCheck = await cleanupClient.query(`
    SELECT
      to_regclass('ghm.opportunity_capability_requirement') AS table_name
  `);

  assert.equal(
    tableCheck.rows[0].table_name,
    'ghm.opportunity_capability_requirement',
  );

  console.log('TABLE EXISTENCE PASS');

  const columnCheck = await cleanupClient.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'ghm'
      AND table_name = 'opportunity_capability_requirement'
    ORDER BY ordinal_position
  `);

  assert.deepEqual(
    columnCheck.rows.map((row) => row.column_name),
    [
      'id',
      'opportunity_id',
      'capability_id',
      'importance',
      'minimum_proficiency_level',
      'description',
      'sort_order',
      'created_by',
      'created_at',
      'updated_at',
    ],
  );

  console.log('COLUMN CONTRACT PASS');

  const constraintCheck = await cleanupClient.query(`
    SELECT
      conname,
      pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'ghm.opportunity_capability_requirement'::regclass
    ORDER BY conname
  `);

  const constraints = new Map(
    constraintCheck.rows.map((row) => [row.conname, row.definition]),
  );

  assert.ok(constraints.has('opportunity_capability_requirement_pkey'));
  assert.match(
    constraints.get(
      'opportunity_capability_requirement_importance_valid',
    ) ?? '',
    /required.*preferred/,
  );
  assert.match(
    constraints.get(
      'opportunity_capability_requirement_proficiency_valid',
    ) ?? '',
    /foundational.*proficient.*advanced.*expert/,
  );
  assert.match(
    constraints.get(
      'opportunity_capability_requirement_description_valid',
    ) ?? '',
    /btrim.*1.*1000/i,
  );
  assert.match(
    constraints.get(
      'opportunity_capability_requirement_sort_order_valid',
    ) ?? '',
    /0.*1000/,
  );
  assert.ok(
    constraints.has(
      'opportunity_capability_requirement_unique_capability',
    ),
  );

  console.log('CONSTRAINT CONTRACT PASS');

  const foreignKeyCheck = await cleanupClient.query(`
    SELECT
      conname,
      confrelid::regclass::text AS referenced_table,
      pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'ghm.opportunity_capability_requirement'::regclass
      AND contype = 'f'
    ORDER BY conname
  `);

  assert.equal(foreignKeyCheck.rowCount, 3);

  const foreignKeys = foreignKeyCheck.rows;

  assert.ok(
    foreignKeys.some(
      (row) =>
        row.referenced_table === 'ghm.opportunity' &&
        /ON DELETE CASCADE/i.test(row.definition),
    ),
  );

  assert.ok(
    foreignKeys.some(
      (row) =>
        row.referenced_table === 'ghm.capability' &&
        /ON DELETE RESTRICT/i.test(row.definition),
    ),
  );

  assert.ok(
    foreignKeys.some(
      (row) =>
        row.referenced_table === 'ghm.account_identity' &&
        /ON DELETE RESTRICT/i.test(row.definition),
    ),
  );

  console.log('FOREIGN KEY CONTRACT PASS');

  const indexCheck = await cleanupClient.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'ghm'
      AND tablename = 'opportunity_capability_requirement'
    ORDER BY indexname
  `);

  const indexes = indexCheck.rows.map((row) => row.indexname);

  assert.ok(
    indexes.includes(
      'opportunity_capability_requirement_opportunity_idx',
    ),
  );
  assert.ok(
    indexes.includes(
      'opportunity_capability_requirement_capability_idx',
    ),
  );

  console.log('INDEX CONTRACT PASS');

  const triggerCheck = await cleanupClient.query(`
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid =
      'ghm.opportunity_capability_requirement'::regclass
      AND NOT tgisinternal
  `);

  assert.ok(
    triggerCheck.rows.some(
      (row) =>
        row.tgname ===
        'opportunity_capability_requirement_updated_at',
    ),
  );

  console.log('UPDATED-AT TRIGGER PASS');

  const privilegeCheck = await cleanupClient.query(`
    SELECT
      privilege_type,
      is_grantable
    FROM information_schema.role_table_grants
    WHERE grantee = 'ghm_runtime'
      AND table_schema = 'ghm'
      AND table_name = 'opportunity_capability_requirement'
    ORDER BY privilege_type
  `);

  const privileges = privilegeCheck.rows.map(
    (row) => row.privilege_type,
  );

  assert.ok(privileges.includes('SELECT'));
  assert.ok(privileges.includes('DELETE'));
  assert.ok(!privileges.includes('INSERT'));
  assert.ok(!privileges.includes('UPDATE'));
  assert.ok(!privileges.includes('TRIGGER'));
  assert.ok(!privileges.includes('REFERENCES'));

  const insertColumns = [
    'opportunity_id',
    'capability_id',
    'importance',
    'minimum_proficiency_level',
    'description',
    'sort_order',
    'created_by',
  ];

  const columnPrivilegeCheck = await cleanupClient.query(`
    SELECT column_name, privilege_type
    FROM information_schema.column_privileges
    WHERE grantee = 'ghm_runtime'
      AND table_schema = 'ghm'
      AND table_name = 'opportunity_capability_requirement'
      AND privilege_type = 'INSERT'
    ORDER BY column_name
  `);

  const grantedInsertColumns = columnPrivilegeCheck.rows.map(
    (row) => row.column_name,
  );

  assert.deepEqual(grantedInsertColumns, [...insertColumns].sort());

  console.log('RUNTIME TABLE PRIVILEGE PASS');
  console.log('RUNTIME COLUMN INSERT PRIVILEGE PASS');

  const sequencePrivilegeCheck = await cleanupClient.query(`
    SELECT privilege_type
    FROM information_schema.role_usage_grants
    WHERE grantee = 'ghm_runtime'
      AND object_schema = 'ghm'
      AND object_name =
        'opportunity_capability_requirement_id_seq'
  `);

  assert.ok(
    sequencePrivilegeCheck.rows.some(
      (row) => row.privilege_type === 'USAGE',
    ),
  );

  console.log('RUNTIME SEQUENCE PRIVILEGE PASS');

  const runtimeDirectSelect = await runtimePool.query(`
    SELECT id
    FROM ghm.opportunity_capability_requirement
    LIMIT 1
  `);

  assert.ok(Array.isArray(runtimeDirectSelect.rows));

  console.log('RUNTIME SELECT PASS');

  await expectRejected(
    runtimePool.query(`
      UPDATE ghm.opportunity_capability_requirement
      SET description = description
      WHERE false
    `),
    /permission denied/i,
  );

  console.log('RUNTIME UPDATE DENIAL PASS');

  await cleanup();

  const accountResult = await cleanupClient.query(
    `
      INSERT INTO ghm.account_identity (
        full_name,
        role
      )
      VALUES ($1, $2)
      RETURNING id
    `,
    [marker, 'customer'],
  );

  const accountId = Number(accountResult.rows[0].id);

  const capabilityResult = await cleanupClient.query(
    `
      INSERT INTO ghm.capability (
        id,
        name,
        slug,
        description,
        lifecycle_status,
        taxonomy_version,
        effective_from,
        source_authority,
        source_reference,
        is_selectable
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'active',
        1,
        now(),
        'runtime-qualification',
        $5,
        true
      )
      RETURNING id
    `,
    [
      randomUUID(),
      `${marker} Capability`,
      `${marker.toLowerCase()}-capability`,
      marker,
      marker,
    ],
  );

  const capabilityId = capabilityResult.rows[0].id;

  const inactiveCapabilityResult = await cleanupClient.query(
    `
      INSERT INTO ghm.capability (
        id,
        name,
        slug,
        description,
        lifecycle_status,
        taxonomy_version,
        effective_from,
        source_authority,
        source_reference,
        is_selectable
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'deprecated',
        1,
         now() - interval '1 minute',
        'runtime-qualification',
        $5,
        true
      )
      RETURNING id
    `,
    [
      randomUUID(),
      `${marker} Inactive Capability`,
      `${marker.toLowerCase()}-inactive-capability`,
      `${marker}-inactive`,
      marker,
    ],
  );

  const inactiveCapabilityId = inactiveCapabilityResult.rows[0].id;

  const opportunityResult = await cleanupClient.query(
    `
      INSERT INTO ghm.opportunity (
        opportunity_type_id,
        creator_account_id,
        owner_business_id,
        title,
        description,
        lifecycle_status,
        visibility
      )
      SELECT
        ot.id,
        $1,
        NULL,
        $2,
        $3,
        'draft',
         'private'
      FROM ghm.opportunity_type ot
      ORDER BY ot.id
      LIMIT 1
      RETURNING id
    `,
    [accountId, `${marker} Opportunity`, marker],
  );

  assert.equal(opportunityResult.rowCount, 1);

  const opportunityId = Number(opportunityResult.rows[0].id);

  const businessResult = await cleanupClient.query(
    `
      INSERT INTO ghm.business (
        name,
        slug
      )
      VALUES ($1, $2)
      RETURNING id
    `,
    [`${marker} Business`, `${marker.toLowerCase()}-business`],
  );

  const businessId = Number(businessResult.rows[0].id);

  const ownerResult = await cleanupClient.query(
    `
      INSERT INTO ghm.account_identity (
        full_name,
        role
      )
      VALUES ($1, 'customer')
      RETURNING id
    `,
    [`${marker} Owner`],
  );

  const ownerAccountId = Number(ownerResult.rows[0].id);

  const administratorResult = await cleanupClient.query(
    `
      INSERT INTO ghm.account_identity (
        full_name,
        role
      )
      VALUES ($1, 'customer')
      RETURNING id
    `,
    [`${marker} Administrator`],
  );

  const administratorAccountId = Number(
    administratorResult.rows[0].id,
  );

  const memberResult = await cleanupClient.query(
    `
      INSERT INTO ghm.account_identity (
        full_name,
        role
      )
      VALUES ($1, 'customer')
      RETURNING id
    `,
    [`${marker} Member`],
  );

  const memberAccountId = Number(memberResult.rows[0].id);

  const outsiderResult = await cleanupClient.query(
    `
      INSERT INTO ghm.account_identity (
        full_name,
        role
      )
      VALUES ($1, 'customer')
      RETURNING id
    `,
    [`${marker} Outsider`],
  );

  const outsiderAccountId = Number(outsiderResult.rows[0].id);

  await cleanupClient.query(
    `
      INSERT INTO ghm.business_membership (
        business_id,
        account_id,
        membership_role,
        membership_status
      )
      VALUES
        ($1, $2, 'owner', 'active'),
        ($1, $3, 'administrator', 'active'),
        ($1, $4, 'member', 'active')
    `,
    [
      businessId,
      ownerAccountId,
      administratorAccountId,
      memberAccountId,
    ],
  );

  await cleanupClient.query(
    `
      UPDATE ghm.opportunity
      SET owner_business_id = $1
      WHERE id = $2
    `,
    [businessId, opportunityId],
  );

  const creatorContext = {
    userId: accountId,
    role: 'customer',
  };

  const ownerContext = {
    userId: ownerAccountId,
    role: 'customer',
  };

  const administratorContext = {
    userId: administratorAccountId,
    role: 'customer',
  };

  const memberContext = {
    userId: memberAccountId,
    role: 'customer',
  };

  const outsiderContext = {
    userId: outsiderAccountId,
    role: 'customer',
  };

  const { PgOpportunityRequirementsRepository } =
    await import(
      '../dist/resources/opportunity-requirements/repository.js'
    );

  const repository = new PgOpportunityRequirementsRepository(
    runtimePool,
  );

  const replacement = [
    {
      capabilityId,
      importance: 'required',
      minimumProficiencyLevel: 'proficient',
      description: marker,
      sortOrder: 0,
    },
  ];

  const replaced =
    await repository.replaceOpportunityRequirements(
      creatorContext,
      opportunityId,
      replacement,
    );

  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].opportunityId, opportunityId);
  assert.equal(replaced[0].capabilityId, capabilityId);


  const persisted = await runtimePool.query(
    `
      SELECT
        opportunity_id,
        capability_id,
        importance,
        minimum_proficiency_level,
        description,
        sort_order,
        created_by
      FROM ghm.opportunity_capability_requirement
      WHERE opportunity_id = $1
    `,
    [opportunityId],
  );

  assert.equal(persisted.rowCount, 1);
  assert.equal(Number(persisted.rows[0].created_by), accountId);

  console.log('AUTHORIZED REPLACEMENT PASS');
  console.log('CREATED-BY PROVENANCE PASS');

  const listed =
    await repository.listOpportunityRequirements(
      creatorContext,
      opportunityId,
    );

  assert.equal(listed.length, 1);
  assert.equal(listed[0].capabilityId, capabilityId);

  console.log('CREATOR OPPORTUNITY REQUIREMENTS READ PASS');

  const ownerListed =
    await repository.listOpportunityRequirements(
      ownerContext,
      opportunityId,
    );

  assert.equal(ownerListed.length, 1);
  assert.equal(ownerListed[0].capabilityId, capabilityId);

  console.log('BUSINESS OWNER REQUIREMENTS READ PASS');

  const administratorListed =
    await repository.listOpportunityRequirements(
      administratorContext,
      opportunityId,
    );

  assert.equal(administratorListed.length, 1);
  assert.equal(administratorListed[0].capabilityId, capabilityId);

  console.log('BUSINESS ADMINISTRATOR REQUIREMENTS READ PASS');

  const memberListed =
    await repository.listOpportunityRequirements(
      memberContext,
      opportunityId,
    );

  assert.equal(memberListed.length, 1);
  assert.equal(memberListed[0].capabilityId, capabilityId);

  console.log('ACTIVE BUSINESS MEMBER REQUIREMENTS READ PASS');

  const outsiderListed =
    await repository.listOpportunityRequirements(
      outsiderContext,
      opportunityId,
    );

  assert.equal(outsiderListed.length, 0);

  console.log('UNRELATED OUTSIDER REQUIREMENTS READ DENIAL PASS');

  await repository.replaceOpportunityRequirements(
    ownerContext,
    opportunityId,
    replacement,
  );

  console.log('BUSINESS OWNER REQUIREMENTS REPLACEMENT PASS');

  await repository.replaceOpportunityRequirements(
    administratorContext,
    opportunityId,
    replacement,
  );

  console.log('BUSINESS ADMINISTRATOR REQUIREMENTS REPLACEMENT PASS');

  await expectRejected(
    repository.replaceOpportunityRequirements(
      memberContext,
      opportunityId,
      replacement,
    ),
    /Opportunity requirements access denied/,
  );

  console.log('ACTIVE BUSINESS MEMBER REQUIREMENTS REPLACEMENT DENIAL PASS');

  await expectRejected(
    repository.replaceOpportunityRequirements(
      outsiderContext,
      opportunityId,
      replacement,
    ),
    /Opportunity requirements access denied/,
  );

  console.log('UNRELATED OUTSIDER REQUIREMENTS REPLACEMENT DENIAL PASS');

  await expectRejected(
    repository.replaceOpportunityRequirements(
      {
        userId: accountId + 1000000,
        role: 'customer',
      },
      opportunityId,
      replacement,
    ),
    /Opportunity requirements access denied/,
  );

  console.log('UNAUTHORIZED REPLACEMENT DENIAL PASS');

  await expectRejected(
    repository.replaceOpportunityRequirements(
      creatorContext,
      opportunityId,
      [
        {
          capabilityId: inactiveCapabilityId,
          importance: 'required',
        },
      ],
    ),
    /must be active/,
  );

  console.log('INACTIVE CAPABILITY DENIAL PASS');

  await expectRejected(
    repository.replaceOpportunityRequirements(
      creatorContext,
      opportunityId,
      [
        replacement[0],
        replacement[0],
      ],
    ),
    /Duplicate capabilityId/,
  );

  console.log('DUPLICATE CAPABILITY DENIAL PASS');

  const tooMany = Array.from({ length: 51 }, () => ({
    capabilityId,
  }));

  await expectRejected(
    repository.replaceOpportunityRequirements(
      creatorContext,
      opportunityId,
      tooMany,
    ),
    /cannot exceed 50/,
  );

  console.log('MAXIMUM REQUIREMENTS DENIAL PASS');

  await repository.replaceOpportunityRequirements(
    creatorContext,
    opportunityId,
    [],
  );

  const emptySet = await runtimePool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM ghm.opportunity_capability_requirement
      WHERE opportunity_id = $1
    `,
    [opportunityId],
  );

  assert.equal(emptySet.rows[0].count, 0);

  console.log('EMPTY REPLACEMENT PASS');

  await repository.replaceOpportunityRequirements(
    creatorContext,
    opportunityId,
    replacement,
  );

  const qualificationTriggerName =
    'opportunity_capability_requirement_qualification_failure';
  const qualificationFunctionName =
    'ghm.raise_opportunity_capability_requirement_qualification_failure';

  await cleanupClient.query(
    `DROP TRIGGER IF EXISTS ${qualificationTriggerName}
     ON ghm.opportunity_capability_requirement`,
  );

  await cleanupClient.query(
    `DROP FUNCTION IF EXISTS ${qualificationFunctionName}()`,
  );

  await cleanupClient.query(
    `
      CREATE FUNCTION ${qualificationFunctionName}()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'forced opportunity requirements qualification failure';
      END;
      $$
    `,
  );

  await cleanupClient.query(
    `
      CREATE TRIGGER ${qualificationTriggerName}
      BEFORE INSERT ON ghm.opportunity_capability_requirement
      FOR EACH ROW
      EXECUTE FUNCTION ${qualificationFunctionName}()
    `,
  );

  try {
    await expectRejected(
      repository.replaceOpportunityRequirements(
        creatorContext,
        opportunityId,
        [
          {
            capabilityId,
            importance: 'preferred',
            minimumProficiencyLevel: 'advanced',
            description: `${marker}-replacement`,
            sortOrder: 1,
          },
        ],
      ),
      /forced opportunity requirements qualification failure/,
    );
  } finally {
    await cleanupClient.query(
      `DROP TRIGGER IF EXISTS ${qualificationTriggerName}
       ON ghm.opportunity_capability_requirement`,
    );

    await cleanupClient.query(
      `DROP FUNCTION IF EXISTS ${qualificationFunctionName}()`,
    );
  }

  const atomicityCheck = await runtimePool.query(
    `
      SELECT
        COUNT(*)::int AS count,
        COUNT(*) FILTER (
          WHERE description = $2
        )::int AS original_count
      FROM ghm.opportunity_capability_requirement
      WHERE opportunity_id = $1
    `,
    [opportunityId, marker],
  );

  assert.equal(atomicityCheck.rows[0].count, 1);
  assert.equal(atomicityCheck.rows[0].original_count, 1);

  console.log('REPOSITORY REPLACEMENT ATOMICITY PASS');

  await cleanup();

  console.log('\nOPPORTUNITY REQUIREMENTS RUNTIME QUALIFICATION PASS');
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error(
      'QUALIFICATION CLEANUP FAILED:',
      cleanupError,
    );
    process.exitCode = 1;
  }

  await runtimePool.end();
  cleanupClient.release();
  await cleanupPool.end();
}
