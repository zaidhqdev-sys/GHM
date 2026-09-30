import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) {
  throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Review runtime qualification');
}

if (!migratorUrl) {
  throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for Review qualification cleanup authority');
}

if (runtimeUrl === migratorUrl) {
  throw new Error('Runtime and migrator connections must be distinct');
}

process.env.CORS_ORIGINS ??= 'http://localhost';

const { ReviewServiceImpl } = await import('../dist/resources/review/service.js');
const { PostgresReviewRepository } = await import('../dist/resources/review/repository.js');

const ssl = { rejectUnauthorized: false };

const runtimePool = new Pool({
  connectionString: runtimeUrl,
  ssl,
});

const cleanupPool = new Pool({
  connectionString: migratorUrl,
  ssl,
});

const fixture = {
  marker: `ghm-review-runtime-${randomUUID()}`,
  accountIds: [],
  businessIds: [],
  reviewIds: [],
};

const assertRejected = async (operation, expectedMessage, label) => {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (expectedMessage && message !== expectedMessage) {
      throw new Error(`${label}: expected "${expectedMessage}", received "${message}"`);
    }

    console.log(`${label}`);
    return;
  }

  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const assertNull = async (operation, label) => {
  const result = await operation();

  if (result !== null) {
    throw new Error(`${label}: expected null, received a Review`);
  }

  console.log(`${label}`);
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
    SELECT
      current_database() AS database_name,
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

const createFixtureAccount = async (fullName, role) => {
  const client = await cleanupPool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');

    const { rows } = await client.query(
      `
        INSERT INTO ghm.account_identity (full_name, role)
        VALUES ($1, $2)
        RETURNING id
      `,
      [fullName, role],
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

const createBusinessFixture = async (accountId, name) => {
  const context = {
    userId: accountId,
    role: 'business',
  };

  const repository = new (await import('../dist/resources/business-identity/repository.js'))
    .PostgresBusinessIdentityRepository(runtimePool);

  const service = new (await import('../dist/resources/business-identity/service.js'))
    .BusinessIdentityServiceImpl(repository);

  const created = await service.createBusiness(context, { name });

  if (
    !created.activeBusiness ||
    created.activeMembership?.role !== 'owner' ||
    created.activeMembership?.status !== 'active'
  ) {
    throw new Error('Business fixture did not establish an active owner membership');
  }

  fixture.businessIds.push(created.activeBusiness.id);

  return created.activeBusiness.id;
};


const setBusinessState = async (businessId, {
  verificationStatus,
  isVerified,
  isActive,
}) => {
  const client = await cleanupPool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');

    await client.query(
      `
        UPDATE ghm.business
        SET
          verification_status = $2,
          is_verified = $3,
          is_active = $4,
          updated_at = now()
        WHERE id = $1
      `,
      [businessId, verificationStatus, isVerified, isActive],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const readBusinessAggregate = async (businessId) => {
  const { rows } = await runtimePool.query(
    `
      SELECT
        rating::text AS rating,
        review_count
      FROM ghm.business
      WHERE id = $1
    `,
    [businessId],
  );

  if (rows.length !== 1) {
    throw new Error(`Business aggregate row not found: ${businessId}`);
  }

  return {
    rating: Number(rows[0].rating),
    reviewCount: Number(rows[0].review_count),
  };
};

const directRuntimeQuery = async (sql, params = []) => {
  return runtimePool.query(sql, params);
};

const repository = new PostgresReviewRepository(runtimePool);
const service = new ReviewServiceImpl(repository);

try {
  const [runtime, cleanup] = await Promise.all([
    runtimeIdentity(),
    cleanupIdentity(),
  ]);

  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanup.database_name}/${cleanup.current_user}`);

  const customerId = await createFixtureAccount(
    `${fixture.marker} customer`,
    'customer',
  );

  const secondCustomerId = await createFixtureAccount(
    `${fixture.marker} second customer`,
    'customer',
  );

  const adminId = await createFixtureAccount(
    `${fixture.marker} admin`,
    'admin',
  );

  const ownerId = await createFixtureAccount(
    `${fixture.marker} owner`,
    'business',
  );

  const approvedBusinessId = await createBusinessFixture(
    ownerId,
    `${fixture.marker} approved`,
  );

  await setBusinessState(approvedBusinessId, {
    verificationStatus: 'approved',
    isVerified: true,
    isActive: true,
  });


  console.log(`APPROVED BUSINESS FIXTURE PASS: business=${approvedBusinessId}`);

  const unverifiedBusinessId = await createBusinessFixture(
    ownerId,
    `${fixture.marker} unverified`,
  );

  await setBusinessState(unverifiedBusinessId, {
    verificationStatus: 'unverified',
    isVerified: false,
    isActive: true,
  });

  const inactiveBusinessId = await createBusinessFixture(
    ownerId,
    `${fixture.marker} inactive`,
  );

  await setBusinessState(inactiveBusinessId, {
    verificationStatus: 'approved',
    isVerified: true,
    isActive: false,
  });

  console.log('INELIGIBLE BUSINESS FIXTURES PASS');

  const customerContext = {
    userId: customerId,
    role: 'customer',
  };

  const secondCustomerContext = {
    userId: secondCustomerId,
    role: 'customer',
  };

  const adminContext = {
    userId: adminId,
    role: 'admin',
  };

  const ownerContext = {
    userId: ownerId,
    role: 'business',
  };

  const customerOwnerContext = {
    userId: ownerId,
    role: 'customer',
  };

  const initialAggregate = await readBusinessAggregate(approvedBusinessId);

  if (
    initialAggregate.rating !== 0 ||
    initialAggregate.reviewCount !== 0
  ) {
    throw new Error(
      `Approved fixture aggregate was not empty: ${JSON.stringify(initialAggregate)}`,
    );
  }

  console.log('INITIAL AGGREGATE PASS');

  const created = await service.createReview(customerContext, {
    businessId: approvedBusinessId,
    rating: 5,
    title: 'Excellent service',
    body: 'The business handled the work professionally and clearly.',
  });

  fixture.reviewIds.push(created.id);

  if (
    created.businessId !== approvedBusinessId ||
    created.reviewerId !== customerId ||
    created.reviewerName !== `${fixture.marker} customer` ||
    created.rating !== 5 ||
    created.moderationStatus !== 'pending' ||
    created.moderationReason !== null ||
    created.moderatedBy !== null ||
    created.moderatedAt !== null
  ) {
    throw new Error(`Unexpected created Review state: ${JSON.stringify(created)}`);
  }

  console.log(`REVIEW CREATE + SNAPSHOT + PENDING PASS: review=${created.id}`);

  const pendingAggregate = await readBusinessAggregate(approvedBusinessId);

  if (
    pendingAggregate.rating !== 0 ||
    pendingAggregate.reviewCount !== 0
  ) {
    throw new Error(
      `Pending Review changed aggregate: ${JSON.stringify(pendingAggregate)}`,
    );
  }

  console.log('PENDING DOES NOT AFFECT AGGREGATE PASS');

  const ownReview = await service.getOwnReview(customerContext, created.id);

  if (!ownReview || ownReview.id !== created.id) {
    throw new Error('Own Review read qualification failed');
  }

  console.log('CUSTOMER OWN REVIEW READ PASS');

  await assertNull(
    () => service.getOwnReview(secondCustomerContext, created.id),
    'CROSS-CUSTOMER REVIEW READ DENIAL PASS',
  );

  await assertRejected(
    () => service.createReview(customerOwnerContext, {
      businessId: approvedBusinessId,
      rating: 5,
      title: 'Owner review',
      body: 'This customer owner must not be able to review their own Business.',
    }),
    'Review target Business is not eligible',
    'BUSINESS OWNER SELF-REVIEW DENIAL PASS',
  );

  await assertRejected(
    () => service.createReview(customerContext, {
      businessId: unverifiedBusinessId,
      rating: 5,
      title: 'Unverified target',
      body: 'This Business has not completed verification.',
    }),
    'Review target Business is not eligible',
    'UNVERIFIED BUSINESS DENIAL PASS',
  );

  await assertRejected(
    () => service.createReview(customerContext, {
      businessId: inactiveBusinessId,
      rating: 5,
      title: 'Inactive target',
      body: 'This Business is inactive and cannot receive Reviews.',
    }),
    'Review target Business is not eligible',
    'INACTIVE BUSINESS DENIAL PASS',
  );

  await assertRejected(
    () => service.createReview(customerContext, {
      businessId: approvedBusinessId,
      rating: 4,
      title: 'Duplicate review',
      body: 'The same reviewer cannot create another Review.',
    }),
    undefined,
    'DUPLICATE REVIEW DENIAL PASS',
  );

  const concurrentResults = await Promise.allSettled([
    service.createReview(secondCustomerContext, {
      businessId: approvedBusinessId,
      rating: 4,
      title: 'Concurrent review A',
      body: 'Concurrent duplicate qualification fixture review.',
    }),
    service.createReview(secondCustomerContext, {
      businessId: approvedBusinessId,
      rating: 3,
      title: 'Concurrent review B',
      body: 'Concurrent duplicate qualification fixture review.',
    }),
  ]);

  const concurrentSuccesses = concurrentResults.filter(
    (result) => result.status === 'fulfilled',
  );

  const concurrentFailures = concurrentResults.filter(
    (result) => result.status === 'rejected',
  );

  if (concurrentSuccesses.length !== 1 || concurrentFailures.length !== 1) {
    throw new Error(
      `Concurrent duplicate qualification expected 1 success / 1 failure; received ${concurrentSuccesses.length}/${concurrentFailures.length}`,
    );
  }

  const concurrentCreated = concurrentSuccesses[0].value;
  fixture.reviewIds.push(concurrentCreated.id);

  console.log(
    `CONCURRENT DUPLICATE REVIEW PASS: success=${concurrentCreated.id}`,
  );

  const pendingReviews = await service.getPendingReviews(adminContext, 100);

  const pendingIds = pendingReviews.map((review) => review.id);

  if (!pendingIds.includes(created.id) || !pendingIds.includes(concurrentCreated.id)) {
    throw new Error('Admin pending queue did not expose expected pending Reviews');
  }

  console.log('ADMIN PENDING QUEUE PASS');

  await assertRejected(
    () => service.getPendingReviews(customerContext, 100),
    'Insufficient role',
    'CUSTOMER PENDING QUEUE DENIAL PASS',
  );

  const aggregateBeforeApproval = await readBusinessAggregate(approvedBusinessId);

  if (
    aggregateBeforeApproval.rating !== 0 ||
    aggregateBeforeApproval.reviewCount !== 0
  ) {
    throw new Error(
      `Aggregate changed before approval: ${JSON.stringify(aggregateBeforeApproval)}`,
    );
  }

  const approved = await service.moderateReview(
    adminContext,
    created.id,
    {
      decision: 'approved',
    },
  );

  if (
    approved.moderationStatus !== 'approved' ||
    approved.moderatedBy !== adminId ||
    approved.moderatedAt === null ||
    approved.moderationReason !== null
  ) {
    throw new Error(`Approval state qualification failed: ${JSON.stringify(approved)}`);
  }

  console.log('ADMIN APPROVAL PASS');

  const aggregateAfterApproval = await readBusinessAggregate(approvedBusinessId);

  if (
    aggregateAfterApproval.rating !== 5 ||
    aggregateAfterApproval.reviewCount !== 1
  ) {
    throw new Error(
      `Approved Review aggregate mismatch: ${JSON.stringify(aggregateAfterApproval)}`,
    );
  }

  console.log('APPROVAL AGGREGATE ATOMICITY PASS');

  const publicReviews = await service.getPublicReviews(approvedBusinessId, 100);

  if (
    publicReviews.length !== 1 ||
    publicReviews[0].id !== created.id ||
    publicReviews[0].moderationStatus !== 'approved'
  ) {
    throw new Error(
      `Public Review projection qualification failed: ${JSON.stringify(publicReviews)}`,
    );
  }

  console.log('PUBLIC APPROVED REVIEW READ PASS');

  await assertRejected(
    () => service.moderateReview(
      adminContext,
      created.id,
      { decision: 'rejected', rejectionReason: 'Too late' },
    ),
    'Pending Review was not found',
    'ALREADY-MODERATED REVIEW DENIAL PASS',
  );

  const rejection = await service.moderateReview(
    adminContext,
    concurrentCreated.id,
    {
      decision: 'rejected',
      rejectionReason: 'Qualification rejection fixture',
    },
  );

  if (
    rejection.moderationStatus !== 'rejected' ||
    rejection.moderationReason !== 'Qualification rejection fixture' ||
    rejection.moderatedBy !== adminId ||
    rejection.moderatedAt === null
  ) {
    throw new Error(`Rejection state qualification failed: ${JSON.stringify(rejection)}`);
  }

  console.log('ADMIN REJECTION + REASON PASS');

  const aggregateAfterRejection = await readBusinessAggregate(approvedBusinessId);

  if (
    aggregateAfterRejection.rating !== 5 ||
    aggregateAfterRejection.reviewCount !== 1
  ) {
    throw new Error(
      `Rejected Review changed aggregate: ${JSON.stringify(aggregateAfterRejection)}`,
    );
  }

  console.log('REJECTION DOES NOT AFFECT AGGREGATE PASS');

  const rollbackReview = await createFixtureAccount(
    `${fixture.marker} rollback reviewer`,
    'customer',
  );

  const rollbackBusinessId = await createBusinessFixture(
    ownerId,
    `${fixture.marker} rollback business`,
  );

  await setBusinessState(rollbackBusinessId, {
    verificationStatus: 'approved',
    isVerified: true,
    isActive: true,
  });

  const rollbackClient = await runtimePool.connect();

  try {
    await rollbackClient.query('BEGIN');

    await rollbackClient.query(
      `
        INSERT INTO ghm.review (
          business_id,
          reviewer_id,
          reviewer_name,
          rating,
          title,
          body,
          moderation_status,
          moderation_reason,
          moderated_by,
          moderated_at
        )
        VALUES ($1, $2, $3, 5, 'Rollback fixture', 'Rollback transaction fixture body.', 'pending', NULL, NULL, NULL)
      `,
      [
        rollbackBusinessId,
        rollbackReview,
        `${fixture.marker} rollback reviewer`,
      ],
    );

    await rollbackClient.query(
      `
        INSERT INTO ghm.review (
          business_id,
          reviewer_id,
          reviewer_name,
          rating,
          title,
          body,
          moderation_status,
          moderation_reason,
          moderated_by,
          moderated_at
        )
        VALUES ($1, $2, $3, 4, 'Rollback duplicate', 'Rollback duplicate fixture body.', 'pending', NULL, NULL, NULL)
      `,
      [
        rollbackBusinessId,
        rollbackReview,
        `${fixture.marker} rollback reviewer`,
      ],
    );

    throw new Error('Rollback fixture unexpectedly allowed duplicate insert');
  } catch (error) {
    await rollbackClient.query('ROLLBACK').catch(() => {});

    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes('duplicate key')) {
      throw new Error(`Rollback qualification failed with unexpected error: ${message}`);
    }
  } finally {
    rollbackClient.release();
  }

  const rollbackCheck = await runtimePool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM ghm.review
      WHERE business_id = $1
        AND reviewer_id = $2
    `,
    [rollbackBusinessId, rollbackReview],
  );

  if (Number(rollbackCheck.rows[0].count) !== 0) {
    throw new Error('Rollback transaction left a partial Review behind');
  }

  console.log('TRANSACTION ROLLBACK PASS');

  await assertRejected(
    () => directRuntimeQuery(
      `DELETE FROM ghm.review WHERE id = $1`,
      [created.id],
    ),
    undefined,
    'DIRECT RUNTIME DELETE DENIAL PASS',
  );

  await assertRejected(
    () => directRuntimeQuery(
      `UPDATE ghm.review SET reviewer_id = $2 WHERE id = $1`,
      [created.id, secondCustomerId],
    ),
    undefined,
    'DIRECT RUNTIME REVIEWER-BINDING UPDATE DENIAL PASS',
  );

  await assertRejected(
    () => directRuntimeQuery(
      `UPDATE ghm.review SET business_id = $2 WHERE id = $1`,
      [created.id, inactiveBusinessId],
    ),
    undefined,
    'DIRECT RUNTIME BUSINESS-BINDING UPDATE DENIAL PASS',
  );

  console.log('ALL REVIEW RUNTIME QUALIFICATION CHECKS PASSED');
} finally {
  const cleanupClient = await cleanupPool.connect();

  try {
    await cleanupClient.query('BEGIN');
    await cleanupClient.query('SET LOCAL ROLE ghm_schema_owner');

    if (fixture.reviewIds.length > 0) {
      await cleanupClient.query(
        `DELETE FROM ghm.review WHERE id = ANY($1::bigint[])`,
        [fixture.reviewIds],
      );
    }

    if (fixture.businessIds.length > 0) {
      await cleanupClient.query(
        `DELETE FROM ghm.business WHERE id = ANY($1::bigint[])`,
        [fixture.businessIds],
      );
    }

    if (fixture.accountIds.length > 0) {
      await cleanupClient.query(
        `DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`,
        [fixture.accountIds],
      );
    }

    await cleanupClient.query('COMMIT');

    console.log(
      `CLEANUP PASS: reviews=${fixture.reviewIds.length}, businesses=${fixture.businessIds.length}, accounts=${fixture.accountIds.length}`,
    );
  } catch (error) {
    await cleanupClient.query('ROLLBACK').catch(() => {});
    console.error('CLEANUP FAILED:', error);
    throw error;
  } finally {
    cleanupClient.release();
    await Promise.all([
      runtimePool.end(),
      cleanupPool.end(),
    ]);
  }
}
