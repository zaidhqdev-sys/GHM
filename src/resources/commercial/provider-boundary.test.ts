import { describe, it, expect } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresCommercialProviderBoundary } from './provider-boundary';

describe('PostgresCommercialProviderBoundary', () => {
  it('uses the canonical GHM payment-result function inside one transaction', async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        queries.push(sql);
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: null, rows: [] };
        assert.equal(values?.length, 10);
        return {
          rowCount: 1,
          rows: [{
            id: '7', business_id: '11', subscription_id: '13', payment_attempt_id: '17',
            provider_event_id: '19', transaction_kind: 'payment', transaction_status: 'succeeded',
            amount_minor_units: '19900', currency_id: '1', provider_transaction_reference: 'PF-7',
            occurred_at: '2026-10-07T00:00:00.000Z', recorded_at: '2026-10-07T00:00:01.000Z',
            metadata: { source: 'test' },
          }],
        };
      },
      release: () => undefined,
    };
    const boundary = new PostgresCommercialProviderBoundary({ connect: async () => client } as any);
    const result = await boundary.applyCommercialPaymentResult({
      paymentAttemptId: 17,
      providerCode: 'payfast',
      externalProviderEventId: 'ITN-7',
      providerEventType: 'payment_complete',
      providerPayloadHash: 'a'.repeat(64),
      transactionKind: 'payment',
      transactionStatus: 'succeeded',
      providerTransactionReference: 'PF-7',
      occurredAt: new Date('2026-10-07T00:00:00.000Z'),
      metadata: { source: 'test' },
    });

    expect(queries[0]).toBe('BEGIN');
    expect(queries[1]).toContain('ghm.commercial_apply_payment_result');
    expect(queries.at(-1)).toBe('COMMIT');
    expect(result.id).toBe(7);
    expect(result.transactionStatus).toBe('succeeded');
  });
});
