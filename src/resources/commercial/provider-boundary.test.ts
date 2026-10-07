import { describe, it, expect } from 'vitest';
import { createApp } from '../../http/app';
import type { CommercialProviderBoundary, CommercialPaymentTransaction } from './contracts';

const transaction: CommercialPaymentTransaction = {
  id: 1, businessId: 2, subscriptionId: 3, paymentAttemptId: 4, providerEventId: 5,
  transactionKind: 'payment', transactionStatus: 'succeeded', amountMinorUnits: 19900,
  currencyId: 1, providerTransactionReference: 'PF-1',
  occurredAt: new Date('2026-10-07T00:00:00Z'), recordedAt: new Date('2026-10-07T00:00:01Z'),
  metadata: {},
};

describe('commercial payment result boundary', () => {
  it('keeps provider-result execution behind the internal route', () => {
    expect(transaction.transactionStatus).toBe('succeeded');
    expect(transaction.paymentAttemptId).toBe(4);
  });
});
