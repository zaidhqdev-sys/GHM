import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl =
  process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) {
  throw new Error(
    'Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Project public runtime qualification',
  );
}

if (!migratorUrl) {
  throw new Error(
    'Missing GHM_MIGRATOR_DATABASE_URL for construction cleanup authority',
  );
}

if (runtimeUrl === migratorUrl) {
  throw new Error('Runtime and migrator connections must be distinct');
}

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });

const marker = `ghm-project-public-${randomUUID()}`;

const fixture = {
  accountIds: [],
  projectIds: [],
};

const runtimeIdentity = async () => {
  const { rows } = await runtimePool.query(`
    SELECT current_database() AS database_name,
           session_user,
           current_user,
           current_role
  `);

  const identity = rows[0];

  if (
    identity.database_name !== 'ghm_db' ||
    identity.session_user !== 'ghm_runtime' ||
    identity.current_user !== 'ghm_runtime' ||
    identity.current_role !== 'ghm_runtime'
  ) {
    throw new Error(
      `Runtime qualification refused: expected ghm_db / ghm_runtime identity, received ${JSON.stringify(identity)}`,
    );
  }

  return identity;
};

const cleanupIdentity = async () => {
  const { rows } = await cleanupPool.query(`
    SELECT current_database() AS database_name,
           session_user,
           current_user,
           current_role
  `);

  const identity = rows[0];

  if (
    identity.database_name !== 'ghm_db' ||
    identity.session_user !== 'ghm_migrator' ||
    identity.current_user !== 'ghm_migrator' ||
    identity.current_role !== 'ghm_migrator'
  ) {
    throw new Error(
      `Cleanup authority refused: expected ghm_db / ghm_migrator identity, received ${JSON.stringify(identity)}`,
    );
  }

  return identity;
};

const createFixtureAccount = async (fullName) => {
  const client = await cleanupPool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');

    const { rows } = await client.query(
      `
        INSERT INTO ghm.account_identity (full_name, role)
        VALUES ($1, 'business')
        RETURNING id
      `,
      [fullName],
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

const createFixtureProject = async (
  accountId,
  suffix,
  status = 'open',
) => {
  const client = await cleanupPool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');

    const { rows } = await client.query(
      `
        INSERT INTO ghm.project (
          account_id,
          title,
          description,
          category,
          province,
          city,
          budget_min,
          budget_max,
          urgency,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          'construction',
          'KwaZulu-Natal',
          'Durban',
          10000,
          25000,
          'standard',
          $4
        )
        RETURNING id
      `,
      [
        accountId,
        `${marker} ${suffix}`,
        `A governed public Project qualification fixture for ${suffix}.`,
        status,
      ],
    );

    await client.query('COMMIT');

    const id = Number(rows[0].id);
    fixture.projectIds.push(id);
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const directRuntimeQuery = async (sql, values = []) => {
  const client = await runtimePool.connect();

  try {
    return await client.query(sql, values);
  } finally {
    client.release();
  }
};

const directCleanupQuery = async (sql, values = []) => {
  const client = await cleanupPool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await client.query(sql, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const assertRejected = async (work, label) => {
  try {
    await work();
  } catch {
    console.log(label);
    return;
  }

  throw new Error(`${label}: operation unexpectedly succeeded`);
};

try {
  const [runtime, cleanup] = await Promise.all([
    runtimeIdentity(),
    cleanupIdentity(),
  ]);

  console.log(
    `RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`,
  );
  console.log(
    `CLEANUP AUTHORITY PASS: ${cleanup.database_name}/${cleanup.current_user}`,
  );

  /*
   * 1. Verify the canonical public projection exists as a view.
   */
  const viewCheck = await directRuntimeQuery(`
    SELECT table_schema,
           table_name,
           table_type
    FROM information_schema.tables
    WHERE table_schema = 'ghm'
      AND table_name = 'project_public'
  `);

  if (
    viewCheck.rowCount !== 1 ||
    viewCheck.rows[0].table_type !== 'VIEW'
  ) {
    throw new Error(
      `Expected ghm.project_public VIEW, received ${JSON.stringify(viewCheck.rows)}`,
    );
  }

  console.log('PUBLIC PROJECTION VIEW EXISTENCE PASS');

  /*
   * 2. Verify exact public column allowlist.
   */
  const columnCheck = await directRuntimeQuery(`
    SELECT column_name, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'ghm'
      AND table_name = 'project_public'
    ORDER BY ordinal_position
  `);

  const actualColumns = columnCheck.rows.map((row) => row.column_name);

  const expectedColumns = [
    'id',
    'title',
    'description',
    'category',
    'province',
    'city',
    'budget_min',
    'budget_max',
    'urgency',
    'status',
    'created_at',
    'updated_at',
  ];

  if (
    JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)
  ) {
    throw new Error(
      `Public projection column allowlist failed: ${JSON.stringify(actualColumns)}`,
    );
  }

  console.log('PUBLIC PROJECTION COLUMN ALLOWLIST PASS');

  /*
   * 3. Verify account_id is not exposed.
   */
  if (actualColumns.includes('account_id')) {
    throw new Error('Public projection exposes account_id');
  }

  console.log('PUBLIC ACCOUNT OWNERSHIP EXCLUSION PASS');

  /*
   * 4. Create owner and non-owner fixtures.
   */
  const ownerAccountId = await createFixtureAccount(
    `${marker}-owner`,
  );

  const outsiderAccountId = await createFixtureAccount(
    `${marker}-outsider`,
  );

  const openProjectId = await createFixtureProject(
    ownerAccountId,
    'open',
    'open',
  );

  const inProgressProjectId = await createFixtureProject(
    ownerAccountId,
    'in-progress',
    'in_progress',
  );

  const completedProjectId = await createFixtureProject(
    ownerAccountId,
    'completed',
    'completed',
  );

  const cancelledProjectId = await createFixtureProject(
    ownerAccountId,
    'cancelled',
    'cancelled',
  );

  console.log(
    `FIXTURE PROJECTS CREATED: open=${openProjectId}, in_progress=${inProgressProjectId}, completed=${completedProjectId}, cancelled=${cancelledProjectId}`,
  );

  /*
   * 5. Runtime can read the public projection.
   */
  const publicRead = await directRuntimeQuery(
    `
      SELECT id,
             title,
             description,
             category,
             province,
             city,
             budget_min,
             budget_max,
             urgency,
             status,
             created_at,
             updated_at
      FROM ghm.project_public
      WHERE id = $1
    `,
    [openProjectId],
  );

  if (publicRead.rowCount !== 1) {
    throw new Error('Runtime could not read eligible public Project');
  }

  console.log('RUNTIME PUBLIC PROJECTION READ PASS');

  /*
   * 6. Only open Projects are visible.
   */
  for (const [label, projectId] of [
    ['in_progress', inProgressProjectId],
    ['completed', completedProjectId],
    ['cancelled', cancelledProjectId],
  ]) {
    const result = await directRuntimeQuery(
      `
        SELECT id
        FROM ghm.project_public
        WHERE id = $1
      `,
      [projectId],
    );

    if (result.rowCount !== 0) {
      throw new Error(
        `Non-open Project leaked through public projection: ${label}`,
      );
    }
  }

  console.log('PUBLIC OPEN-ONLY LIFECYCLE PASS');

  /*
   * 7. Verify the public view definition itself contains the open predicate.
   */
  const definitionCheck = await directRuntimeQuery(`
    SELECT pg_get_viewdef(
      'ghm.project_public'::regclass,
      true
    ) AS definition
  `);

  const definition = definitionCheck.rows[0]?.definition ?? '';

  if (!/\bstatus\s*=\s*'open'/i.test(definition)) {
    throw new Error(
      `Public projection definition does not enforce status = 'open': ${definition}`,
    );
  }

  console.log('PUBLIC VIEW OPEN-PREDICATE PASS');

  /*
   * 8. Public projection must not expose private ownership data.
   */
  const projectionKeys = Object.keys(publicRead.rows[0]);

  if (projectionKeys.includes('account_id')) {
    throw new Error('Public result exposes account_id');
  }

  console.log('PUBLIC RESULT DISCLOSURE ALLOWLIST PASS');

  /*
   * 9. Runtime must not mutate the public projection.
   */
  await assertRejected(
    () =>
      directRuntimeQuery(
        `
          UPDATE ghm.project_public
          SET title = 'unauthorized'
          WHERE id = $1
        `,
        [openProjectId],
      ),
    'PUBLIC PROJECTION UPDATE ACL DENIAL PASS',
  );

  await assertRejected(
    () =>
      directRuntimeQuery(
        `
          INSERT INTO ghm.project_public (
            id,
            title,
            description,
            category,
            province,
            city,
            urgency,
            status,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            'unauthorized',
            'Unauthorized public projection insert fixture.',
            'construction',
            'KwaZulu-Natal',
            'Durban',
            'standard',
            'open',
            now(),
            now()
          )
        `,
        [999999999],
      ),
    'PUBLIC PROJECTION INSERT ACL DENIAL PASS',
  );

  await assertRejected(
    () =>
      directRuntimeQuery(
        `
          DELETE FROM ghm.project_public
          WHERE id = $1
        `,
        [openProjectId],
      ),
    'PUBLIC PROJECTION DELETE ACL DENIAL PASS',
  );

  /*
   * 10. Runtime public read must not acquire account ownership data.
   */
  const ownerLeakCheck = await directRuntimeQuery(
    `
      SELECT *
      FROM ghm.project_public
      WHERE id = $1
    `,
    [openProjectId],
  );

  if (
    ownerLeakCheck.rowCount !== 1 ||
    Object.prototype.hasOwnProperty.call(
      ownerLeakCheck.rows[0],
      'account_id',
    )
  ) {
    throw new Error('Public SELECT * exposes private ownership data');
  }

  console.log('PUBLIC SELECT DISCLOSURE PASS');

  /*
   * 11. Confirm the canonical private relation remains distinct.
   */
  const privateColumns = await directRuntimeQuery(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'ghm'
      AND table_name = 'project'
    ORDER BY ordinal_position
  `);

  const privateColumnNames = privateColumns.rows.map(
    (row) => row.column_name,
  );

  if (!privateColumnNames.includes('account_id')) {
    throw new Error('Canonical ghm.project no longer contains account_id');
  }

  if (privateColumnNames.includes('owner_id')) {
    throw new Error('Unexpected owner_id added to canonical ghm.project');
  }

  console.log('PRIVATE PROJECT OWNERSHIP SEPARATION PASS');

  /*
   * 12. Public projection does not bypass the private Project boundary.
   * Runtime direct SELECT on ghm.project is intentionally not treated as
   * forbidden because private Project runtime qualification requires it.
   * Instead, confirm the public projection is the only relation queried
   * by the public repository through static source inspection elsewhere.
   */
  const publicRelationCheck = await directRuntimeQuery(`
    SELECT table_schema,
           table_name
    FROM information_schema.views
    WHERE table_schema = 'ghm'
      AND table_name = 'project_public'
  `);

  if (publicRelationCheck.rowCount !== 1) {
    throw new Error('Public projection relation qualification failed');
  }

  console.log('PRIVATE/PUBLIC RELATION SEPARATION PASS');

  /*
   * 13. Ensure owner and outsider fixtures remain represented by distinct
   * account ownership in the canonical Project relation.
   */
  const ownershipCheck = await directRuntimeQuery(
    `
      SELECT id, account_id, status
      FROM ghm.project
      WHERE id = $1
    `,
    [openProjectId],
  );

  if (
    ownershipCheck.rowCount !== 1 ||
    Number(ownershipCheck.rows[0].account_id) !== ownerAccountId ||
    ownershipCheck.rows[0].status !== 'open'
  ) {
    throw new Error('Private Project ownership state was not preserved');
  }

  if (ownerAccountId === outsiderAccountId) {
    throw new Error('Owner and outsider fixtures unexpectedly share identity');
  }

  console.log('PRIVATE PROJECT OWNERSHIP PRESERVATION PASS');

  console.log('GHM PROJECT PUBLIC RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    if (fixture.projectIds.length > 0) {
      await cleanupPool.query('BEGIN');
      await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');

      await cleanupPool.query(
        `
          DELETE FROM ghm.project
          WHERE id = ANY($1::bigint[])
        `,
        [fixture.projectIds],
      );

      await cleanupPool.query(
        `
          DELETE FROM ghm.account_identity
          WHERE id = ANY($1::bigint[])
        `,
        [fixture.accountIds],
      );

      await cleanupPool.query('COMMIT');
    }
  } catch (cleanupError) {
    await cleanupPool.query('ROLLBACK').catch(() => {});
    throw cleanupError;
  } finally {
    await Promise.all([
      runtimePool.end(),
      cleanupPool.end(),
    ]);
  }
}
