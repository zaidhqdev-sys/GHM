import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  BusinessId,
  CommercialAccess,
  CommercialEntitlement,
  CommercialRepository,
  CommercialSubscription,
  CommercialTrial,
  ActivateCommercialTrialInput,
} from './contracts';
import { COMMERCIAL_EVENT_SOURCE } from './contracts';

const requireBusinessId = (businessId: BusinessId): void => {
  if (!Number.isSafeInteger(businessId) || businessId <= 0) {
    throw new Error('businessId must be a positive integer');
  }
};

const requirePlanCode = (planCode: string): string => {
  const normalized = planCode.trim();
  if (!normalized) {
    throw new Error('planCode is required');
  }
  return normalized;
};

const assertBusinessReadAccess = async (
  client: PoolClient,
  context: AuthContext,
  businessId: BusinessId,
): Promise<void> => {
  const result = await client.query(
    `SELECT 1
     FROM ghm.business_membership
     WHERE business_id = $1
       AND account_id = $2
       AND membership_status = 'active'
     LIMIT 1`,
    [businessId, context.userId],
  );

  if (result.rowCount !== 1) {
    throw new Error('Business read permission required');
  }
};

const assertBusinessManagementAccess = async (
  client: PoolClient,
  context: AuthContext,
  businessId: BusinessId,
): Promise<void> => {
  const result = await client.query(
    `SELECT 1
     FROM ghm.business_membership
     WHERE business_id = $1
       AND account_id = $2
       AND membership_status = 'active'
       AND membership_role IN ('owner', 'administrator')
     LIMIT 1`,
    [businessId, context.userId],
  );

  if (result.rowCount !== 1) {
    throw new Error('Business management permission required');
  }
};

const mapTrial = (row: any): CommercialTrial => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  planVersionId: Number(row.plan_version_id),
  activatedByAccountId: Number(row.activated_by),
  activatedAt: row.activated_at,
  expiresAt: row.expires_at,
  lifecycleStatus: row.lifecycle_status,
  endedAt: row.ended_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSubscription = (row: any): CommercialSubscription => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  planVersionId: Number(row.plan_version_id),
  priceId: row.price_id === null ? null : Number(row.price_id),
  trialId: row.trial_id === null ? null : Number(row.trial_id),
  lifecycleStatus: row.lifecycle_status,
  currentPeriodStart: row.current_period_start,
  currentPeriodEnd: row.current_period_end,
  cancelAtPeriodEnd: row.cancel_at_period_end,
  cancelledAt: row.cancelled_at,
  foundingSequence:
    row.founding_sequence === null ? null : Number(row.founding_sequence),
  foundingProtectedUntil: row.founding_protected_until,
  providerReference: row.provider_reference,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getCurrentSubscription = async (
  client: PoolClient,
  businessId: BusinessId,
): Promise<CommercialSubscription | null> => {
  const result = await client.query(
    `SELECT
       id,
       business_id,
       plan_version_id,
       price_id,
       trial_id,
       lifecycle_status,
       current_period_start,
       current_period_end,
       cancel_at_period_end,
       cancelled_at,
       founding_sequence,
       founding_protected_until,
       provider_reference,
       created_at,
       updated_at
     FROM ghm.commercial_subscription
     WHERE business_id = $1
       AND lifecycle_status IN (
         'trialing',
         'active',
         'past_due',
         'grace_period',
         'cancel_at_period_end',
         'suspended'
       )
     ORDER BY id DESC
     LIMIT 1`,
    [businessId],
  );

  return result.rowCount === 1
    ? mapSubscription(result.rows[0])
    : null;
};

const getEntitlements = async (
  client: PoolClient,
  planVersionId: number,
): Promise<readonly CommercialEntitlement[]> => {
  const result = await client.query(
    `SELECT entitlement_code, access_level, metadata
     FROM ghm.commercial_plan_entitlement
     WHERE plan_version_id = $1
     ORDER BY id`,
    [planVersionId],
  );

  return result.rows.map(
    (row): CommercialEntitlement => ({
      code: row.entitlement_code,
      accessLevel: row.access_level,
      metadata: row.metadata ?? {},
    }),
  );
};

const readCommercialAccess = async (
  client: PoolClient,
  businessId: BusinessId,
): Promise<CommercialAccess> => {
  const subscription = await getCurrentSubscription(client, businessId);

  if (!subscription) {
    return {
      businessId,
      subscriptionId: null,
      status: 'basic',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      foundingProtectedUntil: null,
      entitlements: [],
      evaluatedAt: new Date(),
    };
  }

  const effectiveEntitlementStatuses = new Set([
    'trialing',
    'active',
    'grace_period',
    'cancel_at_period_end',
  ]);

  return {
    businessId,
    subscriptionId: subscription.id,
    status: subscription.lifecycleStatus,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    foundingProtectedUntil: subscription.foundingProtectedUntil,
    entitlements: effectiveEntitlementStatuses.has(subscription.lifecycleStatus)
      ? await getEntitlements(client, subscription.planVersionId)
      : [],
    evaluatedAt: new Date(),
  };
};

const activateTrial = async (
  client: PoolClient,
  context: AuthContext,
  input: ActivateCommercialTrialInput,
): Promise<CommercialTrial> => {
  const planCode = requirePlanCode(input.planCode);
  await assertBusinessManagementAccess(client, context, input.businessId);

  const timestampResult = await client.query(
    'SELECT now() AS activated_at',
  );
  const activatedAt = timestampResult.rows[0].activated_at;

  const planResult = await client.query(
    `SELECT
       version_row.id,
       version_row.trial_days
     FROM ghm.commercial_plan_version AS version_row
     JOIN ghm.commercial_plan AS plan
       ON plan.id = version_row.plan_id
     WHERE plan.code = $1
       AND plan.lifecycle_status = 'active'
       AND version_row.lifecycle_status = 'active'
       AND version_row.trial_days > 0
       AND version_row.effective_from <= $2
       AND (
         version_row.effective_until IS NULL
         OR version_row.effective_until > $2
       )
     ORDER BY version_row.version DESC
     LIMIT 1`,
    [planCode, activatedAt],
  );

  if (planResult.rowCount !== 1) {
    throw new Error('Eligible commercial plan not found');
  }

  const planVersionId = Number(planResult.rows[0].id);
  const trialDays = Number(planResult.rows[0].trial_days);

  const trialResult = await client.query(
    `INSERT INTO ghm.commercial_trial (
       business_id,
       plan_version_id,
       activated_by,
       activated_at,
       expires_at,
       lifecycle_status
     ) VALUES (
       $1,
       $2,
       $3,
       $4,
       $4 + make_interval(days => $5),
       'active'
     )
     RETURNING
       id,
       business_id,
       plan_version_id,
       activated_by,
       activated_at,
       expires_at,
       lifecycle_status,
       ended_at,
       created_at,
       updated_at`,
    [input.businessId, planVersionId, context.userId, activatedAt, trialDays],
  );

  const trial = mapTrial(trialResult.rows[0]);

  const subscriptionResult = await client.query(
    `INSERT INTO ghm.commercial_subscription (
       business_id,
       plan_version_id,
       price_id,
       trial_id,
       lifecycle_status,
       current_period_start,
       current_period_end
     ) VALUES (
       $1,
       $2,
       NULL,
       $3,
       'trialing',
       $4,
       $5
     )
     RETURNING id`,
    [input.businessId, planVersionId, trial.id, trial.activatedAt, trial.expiresAt],
  );

  const subscriptionId = Number(subscriptionResult.rows[0].id);

  await client.query(
    `INSERT INTO ghm.commercial_event (
       business_id,
       subscription_id,
       event_type,
       actor_account_id,
       source,
       idempotency_key,
       payload,
       occurred_at
     ) VALUES (
       $1,
       $2,
       'trial_activated',
       $3,
       $4,
       NULL,
       $5::jsonb,
       $6
     )`,
    [
      input.businessId,
      subscriptionId,
      context.userId,
      COMMERCIAL_EVENT_SOURCE,
      JSON.stringify({
        plan_version_id: planVersionId,
        trial_id: trial.id,
        expires_at: trial.expiresAt,
      }),
      trial.activatedAt,
    ],
  );

  return trial;
};

export class PostgresCommercialRepository implements CommercialRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async getCommercialAccess(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<CommercialAccess> {
    requireBusinessId(businessId);

    return withAuthorizedTransaction(
      context,
      async (client) => {
        await assertBusinessReadAccess(client, context, businessId);
        return readCommercialAccess(client, businessId);
      },
      this.transactionPool,
    );
  }

  async getCommercialSubscription(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<CommercialSubscription | null> {
    requireBusinessId(businessId);

    return withAuthorizedTransaction(
      context,
      async (client) => {
        await assertBusinessReadAccess(client, context, businessId);
        return getCurrentSubscription(client, businessId);
      },
      this.transactionPool,
    );
  }

  async activateCommercialTrial(
    context: AuthContext,
    input: ActivateCommercialTrialInput,
  ): Promise<CommercialTrial> {
    requireBusinessId(input.businessId);
    requirePlanCode(input.planCode);

    return withAuthorizedTransaction(
      context,
      (client) => activateTrial(client, context, input),
      this.transactionPool,
    );
  }

  async prepareCommercialPayment(): Promise<never> {
    throw new Error('Commercial payment preparation is not implemented');
  }

  async scheduleCommercialCancellation(): Promise<never> {
    throw new Error('Commercial cancellation is not implemented');
  }
}
