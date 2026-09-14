import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) {
  throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Project Quote runtime qualification');
}

if (!migratorUrl) {
  throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for Project Quote qualification cleanup');
}

if (runtimeUrl === migratorUrl) {
  throw new Error('Runtime and migrator connections must be distinct');
}

const {
  PostgresProjectQuoteRepository,
} = await import('../dist/resources/project-quote/repository.js');
const {
  ProjectQuoteServiceImpl,
} = await import('../dist/resources/project-quote/service.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });

const marker = `ghm-project-quote-runtime-${randomUUID()}`;

const fixture = {
  accountIds: [],
  businessIds: [],
  projectIds: [],
  quoteIds: [],
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

const createAccount = async (fullName) => {
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

const createBusiness = async (
  accountId,
  name,
  slug,
  verificationStatus = 'approved',
  isVerified = true,
  isActive = true,
  membershipRole = 'owner',
) => {
  const client = await cleanupPool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');

    const businessResult = await client.query(
      `
        INSERT INTO ghm.business (
          name,
          slug,
          verification_status,
          is_verified,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [name, slug, verificationStatus, isVerified, isActive],
    );

    const businessId = Number(businessResult.rows[0].id);

    await client.query(
      `
        INSERT INTO ghm.business_membership (
          business_id,
          account_id,
          membership_role,
          membership_status,
          created_by
        )
        VALUES ($1, $2, $3, 'active', $2)
      `,
      [businessId, accountId, membershipRole],
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

const createProject = async (accountId, titleSuffix) => {
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
          'open'
        )
        RETURNING id
      `,
      [
        accountId,
        `${marker} ${titleSuffix}`,
        `${marker} project description for runtime qualification.`,
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

const createQuote = async (
  projectId,
  businessId,
  amount = 15000,
  status = 'submitted',
) => {
  const client = await cleanupPool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');

    const { rows } = await client.query(
      `
        INSERT INTO ghm.project_quote (
          project_id,
          business_id,
          amount,
          labour_min,
          labour_max,
          materials_min,
          materials_max,
          total_min,
          total_max,
          duration_days,
          description,
          status
        )
        VALUES (
          $1, $2, $3,
          5000, 7000,
          7000, 9000,
          12000, 16000,
          30,
          $4,
          $5
        )
        RETURNING id
      `,
      [
        projectId,
        businessId,
        amount,
        `${marker} quote description for runtime qualification.`,
        status,
      ],
    );

    await client.query('COMMIT');

    const id = Number(rows[0].id);
    fixture.quoteIds.push(id);
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const readQuote = async (quoteId) => {
  const { rows } = await runtimePool.query(
    `
      SELECT
        id,
        project_id,
        business_id,
        amount,
        status
      FROM ghm.project_quote
      WHERE id = $1
    `,
    [quoteId],
  );

  return rows[0] ?? null;
};

const readProject = async (projectId) => {
  const { rows } = await runtimePool.query(
    `
      SELECT id, account_id, status
      FROM ghm.project
      WHERE id = $1
    `,
    [projectId],
  );

  return rows[0] ?? null;
};

const assertRejected = async (work, expectedMessage, label) => {
  try {
    await work();
  } catch (error) {
    if (expectedMessage && error?.message !== expectedMessage) {
      throw new Error(
        `${label}: expected "${expectedMessage}", received "${error?.message}"`,
      );
    }

    console.log(`${label} PASS`);
    return;
  }

  throw new Error(`${label}: expected rejection`);
};

const privilege = async (sql, params = []) => {
  const { rows } = await runtimePool.query(sql, params);
  return rows[0];
};

const ownerContext = accountId => ({
  userId: accountId,
  role: 'business',
});

let ownerAccountId;
let customerAccountId;
let outsiderAccountId;
let administratorAccountId;
let ownerBusinessId;
let secondBusinessId;
let inactiveBusinessId;
let unverifiedBusinessId;
let primaryProjectId;
let secondaryProjectId;
let primaryQuoteId;
let competingQuoteId;
let secondaryQuoteId;

try {
  await runtimeIdentity();
  console.log('RUNTIME IDENTITY PASS');

  await cleanupIdentity();
  console.log('CLEANUP IDENTITY PASS');

  const requiredTables = await privilege(`
    SELECT
      to_regclass('ghm.project') IS NOT NULL AS project_exists,
      to_regclass('ghm.project_quote') IS NOT NULL AS project_quote_exists,
      to_regclass('ghm.business') IS NOT NULL AS business_exists,
      to_regclass('ghm.business_membership') IS NOT NULL AS membership_exists,
      to_regclass('ghm.account_identity') IS NOT NULL AS account_exists
  `);

  if (
    !requiredTables.project_exists ||
    !requiredTables.project_quote_exists ||
    !requiredTables.business_exists ||
    !requiredTables.membership_exists ||
    !requiredTables.account_exists
  ) {
    throw new Error(`Required schema objects missing: ${JSON.stringify(requiredTables)}`);
  }
  console.log('DEPENDENCY SCHEMA PRESENCE PASS');

  ownerAccountId = await createAccount(`${marker} customer owner`);
  customerAccountId = ownerAccountId;
  outsiderAccountId = await createAccount(`${marker} outsider`);
  administratorAccountId = await createAccount(`${marker} administrator`);

  const businessAccountId = await createAccount(`${marker} business owner`);
  const secondBusinessAccountId = await createAccount(`${marker} second business owner`);
  const inactiveBusinessAccountId = await createAccount(`${marker} inactive business owner`);
  const unverifiedBusinessAccountId = await createAccount(`${marker} unverified business owner`);

  ownerBusinessId = await createBusiness(
    businessAccountId,
    `${marker} Primary Business`,
    `${marker}-primary`,
    'approved',
    true,
    true,
    'owner',
  );

  secondBusinessId = await createBusiness(
    secondBusinessAccountId,
    `${marker} Second Business`,
    `${marker}-second`,
    'approved',
    true,
    true,
    'owner',
  );

  inactiveBusinessId = await createBusiness(
    inactiveBusinessAccountId,
    `${marker} Inactive Business`,
    `${marker}-inactive`,
    'approved',
    true,
    false,
    'owner',
  );

  unverifiedBusinessId = await createBusiness(
    unverifiedBusinessAccountId,
    `${marker} Unverified Business`,
    `${marker}-unverified`,
    'under_review',
    false,
    true,
    'owner',
  );

  await createBusiness(
    administratorAccountId,
    `${marker} Administrator Business`,
    `${marker}-administrator`,
    'approved',
    true,
    true,
    'administrator',
  );

  primaryProjectId = await createProject(customerAccountId, 'primary');
  secondaryProjectId = await createProject(outsiderAccountId, 'secondary');

  const runtimeRepo = new PostgresProjectQuoteRepository(runtimePool);
  const service = new ProjectQuoteServiceImpl(runtimeRepo);

  const businessContext = ownerContext(businessAccountId);
  const secondBusinessContext = ownerContext(secondBusinessAccountId);
  const inactiveBusinessContext = ownerContext(inactiveBusinessAccountId);
  const unverifiedBusinessContext = ownerContext(unverifiedBusinessAccountId);
  const customerContext = ownerContext(customerAccountId);
  const outsiderContext = ownerContext(outsiderAccountId);
  const administratorContext = ownerContext(administratorAccountId);

  await assertRejected(
    () => service.readReceived(outsiderContext, primaryProjectId),
    'Project Quote access denied',
    'CROSS-CUSTOMER READ DENIAL PASS',
  );

  primaryQuoteId = await service.create(businessContext, {
    projectId: primaryProjectId,
    businessId: ownerBusinessId,
    amount: 15000,
    labourMin: 5000,
    labourMax: 7000,
    materialsMin: 7000,
    materialsMax: 9000,
    totalMin: 12000,
    totalMax: 16000,
    durationDays: 30,
    description: `${marker} primary quote`,
  }).then(quote => {
    fixture.quoteIds.push(quote.id);
    return quote.id;
  });

  console.log('ELIGIBLE QUOTE CREATE PASS');

  await assertRejected(
    () => service.create(businessContext, {
      projectId: primaryProjectId,
      businessId: secondBusinessId,
      amount: 16000,
      labourMin: 5000,
      labourMax: 7000,
      materialsMin: 7000,
      materialsMax: 9000,
      totalMin: 12000,
      totalMax: 17000,
      durationDays: 30,
      description: `${marker} wrong business`,
    }),
    'Project Quote Business ownership denied',
    'CROSS-BUSINESS CREATE DENIAL PASS',
  );

  await assertRejected(
    () => service.create(inactiveBusinessContext, {
      projectId: primaryProjectId,
      businessId: inactiveBusinessId,
      amount: 16000,
      labourMin: 5000,
      labourMax: 7000,
      materialsMin: 7000,
      materialsMax: 9000,
      totalMin: 12000,
      totalMax: 17000,
      durationDays: 30,
      description: `${marker} inactive`,
    }),
    'Project Quote Business is not eligible',
    'INACTIVE BUSINESS DENIAL PASS',
  );

  await assertRejected(
    () => service.create(unverifiedBusinessContext, {
      projectId: primaryProjectId,
      businessId: unverifiedBusinessId,
      amount: 16000,
      labourMin: 5000,
      labourMax: 7000,
      materialsMin: 7000,
      materialsMax: 9000,
      totalMin: 12000,
      totalMax: 17000,
      durationDays: 30,
      description: `${marker} unverified`,
    }),
    'Project Quote Business is not eligible',
    'UNVERIFIED BUSINESS DENIAL PASS',
  );

  await assertRejected(
    () => service.create(businessContext, {
      projectId: primaryProjectId,
      businessId: ownerBusinessId,
      amount: 15000,
      labourMin: 5000,
      labourMax: 7000,
      materialsMin: 7000,
      materialsMax: 9000,
      totalMin: 12000,
      totalMax: 16000,
      durationDays: 30,
      description: `${marker} duplicate`,
    }),
    undefined,
    'DUPLICATE QUOTE DENIAL PASS',
  );

  const received = await service.readReceived(customerContext, primaryProjectId);

  if (received.length !== 1 || received[0].id !== primaryQuoteId) {
    throw new Error(`Received quote ownership failed: ${JSON.stringify(received)}`);
  }
  console.log('RECEIVED QUOTE OWNERSHIP PASS');

  const own = await service.readOwn(businessContext, ownerBusinessId);

  if (own.length !== 1 || own[0].id !== primaryQuoteId) {
    throw new Error(`Own quote ownership failed: ${JSON.stringify(own)}`);
  }
  console.log('OWN QUOTE OWNERSHIP PASS');

  await assertRejected(
    () => service.readOwn(secondBusinessContext, ownerBusinessId),
    'Project Quote Business ownership denied',
    'OTHER-BUSINESS READ DENIAL PASS',
  );

  await assertRejected(
    () => service.readOwn(administratorContext, ownerBusinessId),
    'Project Quote Business ownership denied',
    'ADMINISTRATOR QUOTE AUTHORITY DENIAL PASS',
  );

  await assertRejected(
    () => service.readReceived(outsiderContext, primaryProjectId),
    'Project Quote access denied',
    'NON-OWNER PROJECT READ DENIAL PASS',
  );

  const updated = await service.update(businessContext, primaryQuoteId, {
    amount: 15500,
    totalMax: 16500,
    description: `${marker} updated quote`,
  });

  if (
    updated.amount !== 15500 ||
    updated.totalMax !== 16500 ||
    updated.status !== 'submitted'
  ) {
    throw new Error(`Quote update failed: ${JSON.stringify(updated)}`);
  }
  console.log('QUOTE UPDATE PASS');

  await assertRejected(
    () => service.update(secondBusinessContext, primaryQuoteId, {
      amount: 16000,
    }),
    'Project Quote not found, not owned, not editable, or Project is not open',
    'QUOTE UPDATE OWNER DENIAL PASS',
  );

  await assertRejected(
    () => service.create(businessContext, {
      projectId: primaryProjectId,
      businessId: ownerBusinessId,
      amount: -1,
      description: `${marker} invalid amount`,
    }),
    'Invalid amount',
    'VALIDATION BOUNDARY PASS',
  );

  await assertRejected(
    () => service.create(businessContext, {
      projectId: primaryProjectId,
      businessId: ownerBusinessId,
      amount: 16000,
      totalMin: 20000,
      totalMax: 10000,
      description: `${marker} invalid range`,
    }),
    'Invalid total range',
    'FINANCIAL RANGE VALIDATION PASS',
  );

  competingQuoteId = await createQuote(
    primaryProjectId,
    secondBusinessId,
    17000,
  );

  const accepted = await service.accept(customerContext, primaryQuoteId);

  if (accepted.status !== 'accepted') {
    throw new Error(`Selected quote was not accepted: ${JSON.stringify(accepted)}`);
  }

  const projectAfterAccept = await readProject(primaryProjectId);
  const competingAfterAccept = await readQuote(competingQuoteId);

  if (
    projectAfterAccept?.status !== 'in_progress' ||
    competingAfterAccept?.status !== 'rejected'
  ) {
    throw new Error(
      `Acceptance compound state failed: project=${JSON.stringify(projectAfterAccept)} competing=${JSON.stringify(competingAfterAccept)}`,
    );
  }

  console.log('ACCEPT + COMPETING REJECTION + PROJECT TRANSITION PASS');

  const acceptedCount = await privilege(
    `
      SELECT count(*)::int AS count
      FROM ghm.project_quote
      WHERE project_id = $1
        AND status = 'accepted'
    `,
    [primaryProjectId],
  );

  if (acceptedCount.count !== 1) {
    throw new Error(`Accepted quote invariant failed: ${acceptedCount.count}`);
  }
  console.log('ONE-ACCEPTED INVARIANT PASS');

  secondaryProjectId = await createProject(customerAccountId, 'reject-project');

  secondaryQuoteId = await createQuote(
    secondaryProjectId,
    secondBusinessId,
    18000,
  );

  const rejected = await service.reject(customerContext, secondaryQuoteId);

  if (rejected.status !== 'rejected') {
    throw new Error(`Quote rejection failed: ${JSON.stringify(rejected)}`);
  }

  const projectAfterReject = await readProject(secondaryProjectId);

  if (projectAfterReject?.status !== 'open') {
    throw new Error(
      `Rejected quote changed Project lifecycle unexpectedly: ${JSON.stringify(projectAfterReject)}`,
    );
  }

  console.log('REJECT WITHOUT PROJECT TRANSITION PASS');

  await assertRejected(
    () => service.update(secondBusinessContext, secondaryQuoteId, {
      amount: 18500,
    }),
    'Project Quote not found, not owned, not editable, or Project is not open',
    'REJECTED QUOTE UPDATE DENIAL PASS',
  );

  const closedProjectId = await createProject(
    customerAccountId,
    'closed-quote-project',
  );

  const closedQuoteId = await createQuote(
    closedProjectId,
    secondBusinessId,
    18500,
  );

  const closeQuoteClient = await cleanupPool.connect();

  try {
    await closeQuoteClient.query('BEGIN');
    await closeQuoteClient.query('SET LOCAL ROLE ghm_schema_owner');
    await closeQuoteClient.query(
      `
        UPDATE ghm.project
        SET status = 'completed',
            updated_at = now()
        WHERE id = $1
      `,
      [closedProjectId],
    );
    await closeQuoteClient.query('COMMIT');
  } catch (error) {
    await closeQuoteClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    closeQuoteClient.release();
  }

  await assertRejected(
    () => service.update(secondBusinessContext, closedQuoteId, {
      amount: 19000,
    }),
    'Project Quote not found, not owned, not editable, or Project is not open',
    'CLOSED PROJECT QUOTE UPDATE DENIAL PASS',
  );

  await assertRejected(
    () => service.accept(outsiderContext, secondaryQuoteId),
    'Project ownership required',
    'NON-OWNER DECISION DENIAL PASS',
  );

  await assertRejected(
    () => service.reject(administratorContext, secondaryQuoteId),
    'Project ownership required',
    'ADMINISTRATOR DECISION DENIAL PASS',
  );

  await assertRejected(
    () => service.accept(customerContext, secondaryQuoteId),
    'Submitted Project Quote was not found',
    'ALREADY-REJECTED DECISION DENIAL PASS',
  );

  const rollbackProjectId = await createProject(customerAccountId, 'rollback-project');
  const rollbackQuoteId = await createQuote(
    rollbackProjectId,
    secondBusinessId,
    19000,
  );

  const rollbackCompetingQuoteId = await createQuote(
    rollbackProjectId,
    ownerBusinessId,
    19500,
  );

  const rollbackClient = await runtimePool.connect();

  try {
    await rollbackClient.query('BEGIN');

    await rollbackClient.query(
      `
        SELECT id
        FROM ghm.project_quote
        WHERE id = $1
          AND status = 'submitted'
        FOR UPDATE
      `,
      [rollbackQuoteId],
    );

    await rollbackClient.query(
      `
        SELECT id
        FROM ghm.project
        WHERE id = $1
          AND status = 'open'
        FOR UPDATE
      `,
      [rollbackProjectId],
    );

    await rollbackClient.query(
      `
        UPDATE ghm.project_quote
        SET status = 'rejected',
            updated_at = now()
        WHERE project_id = $1
          AND status = 'submitted'
          AND id <> $2
      `,
      [rollbackProjectId, rollbackQuoteId],
    );

    await rollbackClient.query(
      `
        UPDATE ghm.project_quote
        SET status = 'accepted',
            updated_at = now()
        WHERE id = $1
          AND status = 'submitted'
      `,
      [rollbackQuoteId],
    );

    await rollbackClient.query(
      `
        UPDATE ghm.project
        SET status = 'not-a-valid-project-status'
        WHERE id = $1
      `,
      [rollbackProjectId],
    );

    throw new Error('Rollback failure was not triggered');
  } catch (error) {
    if (error?.message === 'Rollback failure was not triggered') {
      throw error;
    }

    await rollbackClient.query('ROLLBACK').catch(() => {});
  } finally {
    rollbackClient.release();
  }

  const rollbackQuote = await readQuote(rollbackQuoteId);
  const rollbackCompetingQuote = await readQuote(rollbackCompetingQuoteId);
  const rollbackProject = await readProject(rollbackProjectId);

  if (
    rollbackQuote?.status !== 'submitted' ||
    rollbackCompetingQuote?.status !== 'submitted' ||
    rollbackProject?.status !== 'open'
  ) {
    throw new Error(
      `Decision rollback failed: selected=${JSON.stringify(rollbackQuote)} competing=${JSON.stringify(rollbackCompetingQuote)} project=${JSON.stringify(rollbackProject)}`,
    );
  }

  console.log('DECISION ROLLBACK PRESERVATION PASS');

  const concurrencyProjectId = await createProject(
    customerAccountId,
    'concurrency-project',
  );

  const concurrencyQuoteOneId = await createQuote(
    concurrencyProjectId,
    ownerBusinessId,
    20000,
  );

  const concurrencyQuoteTwoId = await createQuote(
    concurrencyProjectId,
    secondBusinessId,
    21000,
  );

  const concurrencyResults = await Promise.allSettled([
    service.accept(customerContext, concurrencyQuoteOneId),
    service.accept(customerContext, concurrencyQuoteTwoId),
  ]);

  const concurrencyQuoteOne = await readQuote(concurrencyQuoteOneId);
  const concurrencyQuoteTwo = await readQuote(concurrencyQuoteTwoId);
  const concurrencyProject = await readProject(concurrencyProjectId);

  const concurrencyAcceptedCount = [
    concurrencyQuoteOne,
    concurrencyQuoteTwo,
  ].filter(quote => quote?.status === 'accepted').length;

  const concurrencyRejectedCount = [
    concurrencyQuoteOne,
    concurrencyQuoteTwo,
  ].filter(quote => quote?.status === 'rejected').length;

  const concurrencyFulfilledCount = concurrencyResults.filter(
    result => result.status === 'fulfilled',
  ).length;

  const concurrencyExpectedRejectionCount = concurrencyResults.filter(
    result =>
      result.status === 'rejected' &&
      result.reason?.message === 'Only open Projects may receive a quote decision',
  ).length;

  if (
    concurrencyAcceptedCount !== 1 ||
    concurrencyRejectedCount !== 1 ||
    concurrencyProject?.status !== 'in_progress' ||
    concurrencyFulfilledCount !== 1 ||
    concurrencyExpectedRejectionCount !== 1
  ) {
    throw new Error(
      `Concurrency qualification failed: results=${JSON.stringify(concurrencyResults)} quoteOne=${JSON.stringify(concurrencyQuoteOne)} quoteTwo=${JSON.stringify(concurrencyQuoteTwo)} project=${JSON.stringify(concurrencyProject)}`,
    );
  }

  console.log('CONCURRENT ACCEPTANCE ONE-WINNER PASS');

  const privilegeChecks = await privilege(`
    SELECT
      has_schema_privilege(current_user, 'ghm', 'USAGE') AS schema_usage,
      has_column_privilege(current_user, 'ghm.project_quote', 'project_id', 'SELECT') AS select_project_id,
      has_column_privilege(current_user, 'ghm.project_quote', 'project_id', 'INSERT') AS insert_project_id,
      has_column_privilege(current_user, 'ghm.project_quote', 'business_id', 'INSERT') AS insert_business_id,
      has_column_privilege(current_user, 'ghm.project_quote', 'amount', 'INSERT') AS insert_amount,
      has_column_privilege(current_user, 'ghm.project_quote', 'status', 'INSERT') AS insert_status,
      has_column_privilege(current_user, 'ghm.project_quote', 'amount', 'UPDATE') AS update_amount,
      has_column_privilege(current_user, 'ghm.project_quote', 'total_max', 'UPDATE') AS update_total_max,
      has_column_privilege(current_user, 'ghm.project_quote', 'status', 'UPDATE') AS update_status,
      has_column_privilege(current_user, 'ghm.project_quote', 'project_id', 'UPDATE') AS update_project_id,
      has_column_privilege(current_user, 'ghm.project_quote', 'business_id', 'UPDATE') AS update_business_id,
      has_column_privilege(current_user, 'ghm.project_quote', 'id', 'UPDATE') AS update_id,
      has_table_privilege(current_user, 'ghm.project_quote', 'DELETE') AS delete_quote,
      has_column_privilege(current_user, 'ghm.project', 'status', 'UPDATE') AS project_status_update,
      has_table_privilege(current_user, 'ghm.project', 'DELETE') AS project_delete
  `);

  const expectedPrivilegeResults = {
    schema_usage: true,
    select_project_id: true,
    insert_project_id: true,
    insert_business_id: true,
    insert_amount: true,
    insert_status: false,
    update_amount: true,
    update_total_max: true,
    update_status: true,
    update_project_id: false,
    update_business_id: false,
    update_id: false,
    delete_quote: false,
    project_status_update: true,
    project_delete: false,
  };

  for (const [key, expected] of Object.entries(expectedPrivilegeResults)) {
    if (privilegeChecks[key] !== expected) {
      throw new Error(
        `Privilege qualification failed for ${key}: expected ${expected}, received ${privilegeChecks[key]}`,
      );
    }
  }

  console.log('LEAST PRIVILEGE PROBES PASS');

  await assertRejected(
    () =>
      service.create(businessContext, {
        projectId: primaryProjectId,
        businessId: ownerBusinessId,
        amount: 16000,
        description: `${marker} project already in progress`,
      }),
    'Project Quote Business is not eligible',
    'PROJECT LIFECYCLE CREATE GATE PASS',
  );

  await assertRejected(
    () => service.update(businessContext, primaryQuoteId, {
      amount: 20000,
    }),
    'Project Quote not found, not owned, not editable, or Project is not open',
    'ACCEPTED QUOTE UPDATE DENIAL PASS',
  );

  console.log('PROJECT QUOTE RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');

    if (fixture.quoteIds.length > 0) {
      await cleanupPool.query(
        `
          DELETE FROM ghm.project_quote
          WHERE id = ANY($1::bigint[])
        `,
        [fixture.quoteIds],
      );
    }

    if (fixture.projectIds.length > 0) {
      await cleanupPool.query(
        `
          DELETE FROM ghm.project
          WHERE id = ANY($1::bigint[])
        `,
        [fixture.projectIds],
      );
    }

    if (fixture.businessIds.length > 0) {
      await cleanupPool.query(
        `
          DELETE FROM ghm.business
          WHERE id = ANY($1::bigint[])
        `,
        [fixture.businessIds],
      );
    }

    if (fixture.accountIds.length > 0) {
      await cleanupPool.query(
        `
          DELETE FROM ghm.account_identity
          WHERE id = ANY($1::bigint[])
        `,
        [fixture.accountIds],
      );
    }

    await cleanupPool.query('COMMIT');
  } catch (cleanupError) {
    await cleanupPool.query('ROLLBACK').catch(() => {});
    console.error('QUALIFICATION CLEANUP FAILED:', cleanupError);
  }

  await runtimePool.end();
  await cleanupPool.end();
}
