import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) {
  throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Project runtime qualification');
}

if (!migratorUrl) {
  throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for construction cleanup authority');
}

if (runtimeUrl === migratorUrl) {
  throw new Error('Runtime and migrator connections must be distinct');
}

const { ProjectServiceImpl } = await import('../dist/resources/project/service.js');
const { PostgresProjectRepository } = await import('../dist/resources/project/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });

const marker = `ghm-project-runtime-${randomUUID()}`;

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

const directRuntimeQuery = async (sql, values = []) => {
  const client = await runtimePool.connect();

  try {
    return await client.query(sql, values);
  } finally {
    client.release();
  }
};

const assertRejected = async (work, expectedMessage, label) => {
  try {
    await work();
  } catch (error) {
    if (expectedMessage && error?.message !== expectedMessage) {
      throw new Error(
        `${label}: expected ${expectedMessage}; received ${error?.message}`,
      );
    }

    console.log(label);
    return;
  }

  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const createInput = (suffix) => ({
  title: `${marker} ${suffix}`,
  description: `A governed Project qualification fixture for ${suffix}.`,
  category: 'construction',
  province: 'KwaZulu-Natal',
  city: 'Durban',
  budgetMin: 10000,
  budgetMax: 25000,
  urgency: 'standard',
});

try {
  const [runtime, cleanup] = await Promise.all([
    runtimeIdentity(),
    cleanupIdentity(),
  ]);

  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanup.database_name}/${cleanup.current_user}`);

  const ownerAccountId = await createFixtureAccount(`${marker}-owner`);
  const outsiderAccountId = await createFixtureAccount(`${marker}-outsider`);

  const ownerContext = {
    userId: ownerAccountId,
    role: 'business',
  };

  const outsiderContext = {
    userId: outsiderAccountId,
    role: 'business',
  };

  const repository = new PostgresProjectRepository(runtimePool);
  const service = new ProjectServiceImpl(repository);

  const created = await service.createProject(
    ownerContext,
    createInput('primary'),
  );

  if (
    created.accountId !== ownerAccountId ||
    created.status !== 'open' ||
    created.urgency !== 'standard' ||
    created.title !== `${marker} primary`
  ) {
    throw new Error(
      `Project creation owner binding failed: ${JSON.stringify(created)}`,
    );
  }

  fixture.projectIds.push(created.id);

  console.log(
    `PROJECT CREATE + OWNER BINDING PASS: project=${created.id}, account=${created.accountId}`,
  );

  const ownerRead = await service.getOwnedProject(
    ownerContext,
    created.id,
  );

  if (!ownerRead || ownerRead.id !== created.id || ownerRead.accountId !== ownerAccountId) {
    throw new Error('Project owner read qualification failed');
  }

  console.log('PROJECT OWNER READ PASS');

  const outsiderRead = await service.getOwnedProject(
    outsiderContext,
    created.id,
  );

  if (outsiderRead !== null) {
    throw new Error(
      `Non-owner Project read unexpectedly exposed Project: ${JSON.stringify(outsiderRead)}`,
    );
  }

  console.log('PROJECT NON-OWNER READ DENIAL PASS');

  const updated = await service.updateOwnedProject(
    ownerContext,
    created.id,
    {
      title: `${marker} primary updated`,
      urgency: 'urgent',
    },
  );

  if (
    updated.id !== created.id ||
    updated.accountId !== ownerAccountId ||
    updated.title !== `${marker} primary updated` ||
    updated.urgency !== 'urgent' ||
    updated.status !== 'open'
  ) {
    throw new Error(
      `Project owner update qualification failed: ${JSON.stringify(updated)}`,
    );
  }

  console.log('PROJECT OWNER UPDATE PASS');

  await assertRejected(
    () =>
      service.updateOwnedProject(
        outsiderContext,
        created.id,
        { title: `${marker} outsider attempt` },
      ),
    'Project not found or ownership required',
    'PROJECT NON-OWNER UPDATE DENIAL PASS',
  );

  await assertRejected(
    () =>
      service.updateOwnedProject(
        ownerContext,
        created.id,
        { status: 'completed' },
      ),
    'Unsupported Project update field: status',
    'PROJECT STATUS IMMUTABILITY PASS',
  );

  await assertRejected(
    () =>
      service.updateOwnedProject(
        ownerContext,
        created.id,
        { accountId: outsiderAccountId },
      ),
    'Unsupported Project update field: accountId',
    'PROJECT OWNER IMMUTABILITY PASS',
  );

  await assertRejected(
    () =>
      service.updateOwnedProject(
        ownerContext,
        created.id,
        { title: 'bad' },
      ),
    'title must be between 5 and 160 characters',
    'PROJECT INVALID TITLE REJECTION PASS',
  );

  await assertRejected(
    () =>
      service.createProject(
        ownerContext,
        {
          ...createInput('negative-budget'),
          budgetMin: -1,
        },
      ),
    'budgetMin must be null or a non-negative number',
    'PROJECT NEGATIVE BUDGET REJECTION PASS',
  );

  await assertRejected(
    () =>
      service.createProject(
        ownerContext,
        {
          ...createInput('invalid-range'),
          budgetMin: 30000,
          budgetMax: 10000,
        },
      ),
    'budgetMax must be greater than or equal to budgetMin',
    'PROJECT BUDGET RANGE REJECTION PASS',
  );

  await assertRejected(
    () =>
      service.createProject(
        ownerContext,
        {
          ...createInput('invalid-urgency'),
          urgency: 'immediate',
        },
      ),
    'Invalid Project urgency',
    'PROJECT INVALID URGENCY REJECTION PASS',
  );

  console.log('PROJECT INPUT VALIDATION PASS');

  const second = await service.createProject(
    ownerContext,
    createInput('secondary'),
  );

  fixture.projectIds.push(second.id);

  if (
    second.accountId !== ownerAccountId ||
    second.id === created.id
  ) {
    throw new Error('Multiple Project ownership qualification failed');
  }

  const firstAfterSecond = await service.getOwnedProject(
    ownerContext,
    created.id,
  );

  const secondAfterSecond = await service.getOwnedProject(
    ownerContext,
    second.id,
  );

  if (
    !firstAfterSecond ||
    !secondAfterSecond ||
    firstAfterSecond.accountId !== ownerAccountId ||
    secondAfterSecond.accountId !== ownerAccountId
  ) {
    throw new Error(
      'Multiple Projects did not preserve account ownership',
    );
  }

  console.log(
    `MULTI-PROJECT OWNERSHIP PRESERVATION PASS: projects=${created.id},${second.id}`,
  );

  const closedProject = await service.createProject(
    ownerContext,
    createInput('closed'),
  );

  fixture.projectIds.push(closedProject.id);

  const closeClient = await cleanupPool.connect();

  try {
    await closeClient.query('BEGIN');
    await closeClient.query('SET LOCAL ROLE ghm_schema_owner');

    await closeClient.query(
      `
        UPDATE ghm.project
        SET status = 'completed',
            updated_at = now()
        WHERE id = $1
      `,
      [closedProject.id],
    );

    await closeClient.query('COMMIT');
  } catch (error) {
    await closeClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    closeClient.release();
  }

  await assertRejected(
    () =>
      service.updateOwnedProject(
        ownerContext,
        closedProject.id,
        { title: `${marker} closed update` },
      ),
    'Only open Projects may be updated',
    'PROJECT CLOSED UPDATE DENIAL PASS',
  );

  const closedRead = await service.getOwnedProject(
    ownerContext,
    closedProject.id,
  );

  if (!closedRead || closedRead.status !== 'completed') {
    throw new Error('Closed Project lifecycle state was not preserved');
  }

  console.log('PROJECT CLOSED STATE PRESERVATION PASS');

  await assertRejected(
    () =>
      directRuntimeQuery(
        `
          UPDATE ghm.project
          SET status = 'completed'
          WHERE id = $1
        `,
        [created.id],
      ),
    undefined,
    'PROJECT RUNTIME STATUS ACL DENIAL PASS',
  );

  await assertRejected(
    () =>
      directRuntimeQuery(
        `
          DELETE FROM ghm.project
          WHERE id = $1
        `,
        [created.id],
      ),
    undefined,
    'PROJECT RUNTIME DELETE ACL DENIAL PASS',
  );

  console.log('GHM PROJECT RUNTIME QUALIFICATION: PASS');
} finally {
  try {
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
