import type { AuthContext } from '../../auth/authorization';

export type BusinessId = number;
export type AccountId = number;
export type CommercialPlanId = number;
export type CommercialPlanVersionId = number;
export type CommercialPlanEntitlementId = number;
export type CommercialPlanPriceId = number;
export type CommercialTrialId = number;
export type CommercialSubscriptionId = number;
export type CommercialProviderEventId = number;
export type CommercialPaymentAttemptId = number;
export type CommercialPaymentTransactionId = number;
export type CommercialEventId = number;
export type CommercialFoundingAllocationId = number;
export type CountryId = number;
export type CurrencyId = number;

export type CommercialPlanLifecycle =
  | 'draft'
  | 'active'
  | 'retired';

export type CommercialTrialLifecycle =
  | 'active'
  | 'expired'
  | 'converted'
  | 'cancelled';

export type CommercialSubscriptionLifecycle =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'grace_period'
  | 'cancel_at_period_end'
  | 'cancelled'
  | 'expired'
  | 'suspended';

export type CommercialPaymentAttemptLifecycle =
  | 'pending_checkout'
  | 'pending_payment'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type CommercialPaymentTransactionKind =
  | 'payment'
  | 'refund'
  | 'reversal'
  | 'chargeback';

export type CommercialPaymentTransactionStatus =
  | 'pending'
  | 'succeeded'
  | 'failed';

export type CommercialEventType =
  | 'trial_activated'
  | 'subscription_payment_prepared'
  | 'subscription_activated'
  | 'subscription_payment_failed'
  | 'subscription_cancel_scheduled'
  | 'subscription_expired'
  | 'founding_allocation_granted';

export interface CommercialPlan {
  readonly id: CommercialPlanId;
  readonly code: string;
  readonly name: string;
  readonly audience: string;
  readonly lifecycleStatus: CommercialPlanLifecycle;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommercialPlanVersion {
  readonly id: CommercialPlanVersionId;
  readonly planId: CommercialPlanId;
  readonly version: number;
  readonly trialDays: number;
  readonly foundingAllocationLimit: number | null;
  readonly foundingProtectionMonths: number | null;
  readonly effectiveFrom: Date;
  readonly effectiveUntil: Date | null;
  readonly lifecycleStatus: CommercialPlanLifecycle;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommercialPlanEntitlement {
  readonly id: CommercialPlanEntitlementId;
  readonly planVersionId: CommercialPlanVersionId;
  readonly entitlementCode: string;
  readonly accessLevel: 'enabled';
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommercialPlanPrice {
  readonly id: CommercialPlanPriceId;
  readonly planVersionId: CommercialPlanVersionId;
  readonly countryId: CountryId | null;
  readonly currencyId: CurrencyId;
  readonly priceKind: 'founding' | 'standard';
  readonly amountMinorUnits: number;
  readonly billingInterval: 'month';
  readonly effectiveFrom: Date;
  readonly effectiveUntil: Date | null;
  readonly lifecycleStatus: CommercialPlanLifecycle;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommercialTrial {
  readonly id: CommercialTrialId;
  readonly businessId: BusinessId;
  readonly planVersionId: CommercialPlanVersionId;
  readonly activatedByAccountId: AccountId;
  readonly activatedAt: Date;
  readonly expiresAt: Date;
  readonly lifecycleStatus: CommercialTrialLifecycle;
  readonly endedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommercialSubscription {
  readonly id: CommercialSubscriptionId;
  readonly businessId: BusinessId;
  readonly planVersionId: CommercialPlanVersionId;
  readonly priceId: CommercialPlanPriceId | null;
  readonly trialId: CommercialTrialId | null;
  readonly lifecycleStatus: CommercialSubscriptionLifecycle;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly cancelledAt: Date | null;
  readonly foundingSequence: number | null;
  readonly foundingProtectedUntil: Date | null;
  readonly providerReference: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommercialEntitlement {
  readonly code: string;
  readonly accessLevel: 'enabled';
  readonly metadata: Record<string, unknown>;
}

export interface CommercialAccess {
  readonly businessId: BusinessId;
  readonly subscriptionId: CommercialSubscriptionId | null;
  readonly status: CommercialSubscriptionLifecycle | 'basic';
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly foundingProtectedUntil: Date | null;
  readonly entitlements: readonly CommercialEntitlement[];
  readonly evaluatedAt: Date;
}

export interface CommercialPaymentAttempt {
  readonly id: CommercialPaymentAttemptId;
  readonly businessId: BusinessId;
  readonly subscriptionId: CommercialSubscriptionId | null;
  readonly priceId: CommercialPlanPriceId;
  readonly initiatedByAccountId: AccountId;
  readonly amountMinorUnits: number;
  readonly currencyId: CurrencyId;
  readonly billingInterval: 'month';
  readonly lifecycleStatus: CommercialPaymentAttemptLifecycle;
  readonly idempotencyKey: string;
  readonly checkoutReference: string | null;
  readonly expiresAt: Date | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommercialPaymentTransaction {
  readonly id: CommercialPaymentTransactionId;
  readonly businessId: BusinessId;
  readonly subscriptionId: CommercialSubscriptionId;
  readonly paymentAttemptId: CommercialPaymentAttemptId | null;
  readonly providerEventId: CommercialProviderEventId | null;
  readonly transactionKind: CommercialPaymentTransactionKind;
  readonly transactionStatus: CommercialPaymentTransactionStatus;
  readonly amountMinorUnits: number;
  readonly currencyId: CurrencyId;
  readonly providerTransactionReference: string | null;
  readonly occurredAt: Date;
  readonly recordedAt: Date;
  readonly metadata: Record<string, unknown>;
}

export interface CommercialProviderEvent {
  readonly id: CommercialProviderEventId;
  readonly providerCode: string;
  readonly providerEventId: string;
  readonly eventType: string;
  readonly payloadHash: string;
  readonly receivedAt: Date;
  readonly occurredAt: Date | null;
  readonly processingStatus: string;
  readonly processedAt: Date | null;
  readonly failureReason: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface CommercialEvent {
  readonly id: CommercialEventId;
  readonly businessId: BusinessId | null;
  readonly subscriptionId: CommercialSubscriptionId | null;
  readonly eventType: CommercialEventType;
  readonly actorAccountId: AccountId | null;
  readonly source: string;
  readonly idempotencyKey: string | null;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

export interface CommercialFoundingAllocation {
  readonly id: CommercialFoundingAllocationId;
  readonly businessId: BusinessId;
  readonly subscriptionId: CommercialSubscriptionId;
  readonly paymentTransactionId: CommercialPaymentTransactionId;
  readonly planVersionId: CommercialPlanVersionId;
  readonly foundingSequence: number;
  readonly protectedUntil: Date;
  readonly allocatedAt: Date;
  readonly createdAt: Date;
}

export interface ActivateCommercialTrialInput {
  readonly businessId: BusinessId;
}

export interface PrepareCommercialPaymentInput {
  readonly businessId: BusinessId;
  readonly idempotencyKey: string;
  readonly expiresAt?: Date | null;
}

export interface ScheduleCommercialCancellationInput {
  readonly businessId: BusinessId;
  readonly subscriptionId: CommercialSubscriptionId;
  readonly reason: string;
}

export interface ApplyCommercialPaymentResultInput {
  readonly paymentAttemptId: CommercialPaymentAttemptId;
  readonly providerCode: string;
  readonly externalProviderEventId: string;
  readonly providerEventType: string;
  readonly providerPayloadHash: string;
  readonly transactionKind: CommercialPaymentTransactionKind;
  readonly transactionStatus: CommercialPaymentTransactionStatus;
  readonly providerTransactionReference?: string | null;
  readonly occurredAt: Date;
  readonly metadata?: Record<string, unknown>;
}

export interface CommercialRepository {
  getCommercialAccess(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<CommercialAccess>;

  getCommercialSubscription(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<CommercialSubscription | null>;

  activateCommercialTrial(
    context: AuthContext,
    input: ActivateCommercialTrialInput,
  ): Promise<CommercialTrial>;

  prepareCommercialPayment(
    context: AuthContext,
    input: PrepareCommercialPaymentInput,
  ): Promise<CommercialPaymentAttempt>;

  scheduleCommercialCancellation(
    context: AuthContext,
    input: ScheduleCommercialCancellationInput,
  ): Promise<CommercialSubscription>;
}

export interface CommercialService {
  getCommercialAccess(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<CommercialAccess>;

  getCommercialSubscription(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<CommercialSubscription | null>;

  activateCommercialTrial(
    context: AuthContext,
    input: ActivateCommercialTrialInput,
  ): Promise<CommercialTrial>;

  prepareCommercialPayment(
    context: AuthContext,
    input: PrepareCommercialPaymentInput,
  ): Promise<CommercialPaymentAttempt>;

  scheduleCommercialCancellation(
    context: AuthContext,
    input: ScheduleCommercialCancellationInput,
  ): Promise<CommercialSubscription>;
}

export interface CommercialProviderBoundary {
  applyCommercialPaymentResult(
    input: ApplyCommercialPaymentResultInput,
  ): Promise<CommercialPaymentTransaction>;
}

export interface CommercialLifecycleBoundary {
  expireCommercialAccess(): Promise<number>;
}

export const COMMERCIAL_OPERATIONS = Object.freeze({
  readAccess: 'commercial.readAccess',
  readSubscription: 'commercial.readSubscription',
  activateTrial: 'commercial.activateTrial',
  preparePayment: 'commercial.preparePayment',
  scheduleCancellation: 'commercial.scheduleCancellation',
});

export const COMMERCIAL_INTERNAL_OPERATIONS = Object.freeze({
  applyPaymentResult: 'commercial.internal.applyPaymentResult',
  expireAccess: 'commercial.internal.expireAccess',
});
