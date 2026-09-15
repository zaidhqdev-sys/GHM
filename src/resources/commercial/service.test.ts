import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  CommercialAccess,
  CommercialPaymentAttempt,
  CommercialRepository,
  CommercialSubscription,
  CommercialTrial,
  ActivateCommercialTrialInput,
  PrepareCommercialPaymentInput,
  ScheduleCommercialCancellationInput,
} from './contracts';
import { DefaultCommercialService } from './service';

const context: AuthContext = {
  userId: 7,
  role: 'business',
};

const access = (): CommercialAccess => ({
  businessId: 11,
  subscriptionId: 21,
  status: 'active',
  currentPeriodStart: new Date(1000),
  currentPeriodEnd: new Date(2000),
  cancelAtPeriodEnd: false,
  foundingProtectedUntil: null,
  entitlements: [
    {
      code: 'quote_management',
      accessLevel: 'enabled',
      metadata: {},
    },
  ],
  evaluatedAt: new Date(3000),
});

const subscription = (): CommercialSubscription => ({
  id: 21,
  businessId: 11,
  planVersionId: 31,
  priceId: 41,
  trialId: null,
  lifecycleStatus: 'active',
  currentPeriodStart: new Date(1000),
  currentPeriodEnd: new Date(2000),
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  foundingSequence: null,
  foundingProtectedUntil: null,
  providerReference: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

class FakeRepository implements CommercialRepository {
  accessCalls: Array<{ context: AuthContext; businessId: number }> = [];
  subscriptionCalls: Array<{ context: AuthContext; businessId: number }> = [];
  trialCalls: Array<{
    context: AuthContext;
    input: ActivateCommercialTrialInput;
  }> = [];
  paymentCalls: Array<{
    context: AuthContext;
    input: PrepareCommercialPaymentInput;
  }> = [];
  cancellationCalls: Array<{
    context: AuthContext;
    input: ScheduleCommercialCancellationInput;
  }> = [];

  async getCommercialAccess(
    context: AuthContext,
    businessId: number,
  ): Promise<CommercialAccess> {
    this.accessCalls.push({ context, businessId });
    return access();
  }

  async getCommercialSubscription(
    context: AuthContext,
    businessId: number,
  ): Promise<CommercialSubscription | null> {
    this.subscriptionCalls.push({ context, businessId });
    return subscription();
  }

  async activateCommercialTrial(
    context: AuthContext,
    input: ActivateCommercialTrialInput,
  ): Promise<CommercialTrial> {
    this.trialCalls.push({ context, input });

    return {
      id: 51,
      businessId: input.businessId,
      planVersionId: 31,
      activatedByAccountId: context.userId,
      activatedAt: new Date(1000),
      expiresAt: new Date(2000),
      lifecycleStatus: 'active',
      endedAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  async prepareCommercialPayment(
    context: AuthContext,
    input: PrepareCommercialPaymentInput,
  ): Promise<CommercialPaymentAttempt> {
    this.paymentCalls.push({ context, input });

    return {
      id: 61,
      businessId: input.businessId,
      subscriptionId: 21,
      priceId: 41,
      initiatedByAccountId: context.userId,
      lifecycleStatus: 'pending_checkout',
      amountMinorUnits: 19900,
      currencyId: 1,
      billingInterval: 'month',
      checkoutReference: null,
      idempotencyKey: input.idempotencyKey,
      expiresAt: input.expiresAt ?? null,
            failureCode: null,
      failureMessage: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  async scheduleCommercialCancellation(
    context: AuthContext,
    input: ScheduleCommercialCancellationInput,
  ): Promise<CommercialSubscription> {
    this.cancellationCalls.push({ context, input });

    return subscription();
  }
}

test('Commercial service delegates Business-scoped access reads', async () => {
  const repository = new FakeRepository();
  const service = new DefaultCommercialService(repository);

  const result = await service.getCommercialAccess(context, 11);

  assert.deepEqual(result, access());
  assert.deepEqual(repository.accessCalls, [
    { context, businessId: 11 },
  ]);
});

test('Commercial service delegates trial activation', async () => {
  const repository = new FakeRepository();
  const service = new DefaultCommercialService(repository);

  const input: ActivateCommercialTrialInput = {
    businessId: 11,
  };

  const result = await service.activateCommercialTrial(context, input);

  assert.equal(result.id, 51);
  assert.equal(result.businessId, 11);
  assert.deepEqual(repository.trialCalls, [
    { context, input },
  ]);
});

test('Commercial service delegates payment preparation', async () => {
  const repository = new FakeRepository();
  const service = new DefaultCommercialService(repository);

  const input: PrepareCommercialPaymentInput = {
    businessId: 11,
    idempotencyKey: 'test-idempotency-key',
    expiresAt: new Date(5000),
  };

  const result = await service.prepareCommercialPayment(context, input);

  assert.equal(result.id, 61);
  assert.equal(result.businessId, 11);
  assert.deepEqual(repository.paymentCalls, [
    { context, input },
  ]);
});

test('Commercial service delegates subscription cancellation', async () => {
  const repository = new FakeRepository();
  const service = new DefaultCommercialService(repository);

  const input: ScheduleCommercialCancellationInput = {
    businessId: 11,
    subscriptionId: 21,
    reason: 'Customer requested cancellation',
  };

  const result = await service.scheduleCommercialCancellation(context, input);

  assert.equal(result.id, 21);
  assert.equal(result.businessId, 11);
  assert.deepEqual(repository.cancellationCalls, [
    { context, input },
  ]);
});
test('Commercial service delegates Business-scoped subscription reads', async () => {
  const repository = new FakeRepository();
  const service = new DefaultCommercialService(repository);

  const result = await service.getCommercialSubscription(context, 11);

  assert.deepEqual(result, subscription());
  assert.deepEqual(repository.subscriptionCalls, [
    { context, businessId: 11 },
  ]);
});
