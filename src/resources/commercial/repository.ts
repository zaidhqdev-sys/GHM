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
} from './contracts';

const requireBusinessId = (businessId: BusinessId): void => {
  if (!Number.isSafeInteger(businessId) || businessId <= 0) {
    throw new Error('businessId must be a positive integer');
  }
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
    entitlements: effectiveEntitlementStatuses.has(
      subscription.lifecycleStatus,
    )
      ? await getEntitlements(client, subscription.planVersionId)
      : [],
    evaluatedAt: new Date(),
  };
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

  async activateCommercialTrial(): Promise<never> {
    throw new Error('Commercial trial activation is not implemented');
  }

  async prepareCommercialPayment(): Promise<never> {
    throw new Error('Commercial payment preparation is not implemented');
  }

  async scheduleCommercialCancellation(): Promise<never> {
    throw new Error('Commercial cancellation is not implemented');
  }
}
