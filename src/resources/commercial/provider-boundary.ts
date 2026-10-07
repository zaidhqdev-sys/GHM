import type { CommercialPaymentTransaction, CommercialProviderBoundary, ApplyCommercialPaymentResultInput } from './contracts';
import { pool } from '../../db/pool';

const mapTransaction = (row: any): CommercialPaymentTransaction => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  subscriptionId: Number(row.subscription_id),
  paymentAttemptId: row.payment_attempt_id === null ? null : Number(row.payment_attempt_id),
  providerEventId: row.provider_event_id === null ? null : Number(row.provider_event_id),
  transactionKind: row.transaction_kind,
  transactionStatus: row.transaction_status,
  amountMinorUnits: Number(row.amount_minor_units),
  currencyId: Number(row.currency_id),
  providerTransactionReference: row.provider_transaction_reference,
  occurredAt: new Date(row.occurred_at),
  recordedAt: new Date(row.recorded_at),
  metadata: row.metadata ?? {},
});

export class PostgresCommercialProviderBoundary implements CommercialProviderBoundary {
  constructor(private readonly transactionPool = pool) {}

  async applyCommercialPaymentResult(input: ApplyCommercialPaymentResultInput): Promise<CommercialPaymentTransaction> {
    const client = await this.transactionPool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT * FROM ghm.commercial_apply_payment_result(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
        )`,
        [
          input.paymentAttemptId,
          input.providerCode,
          input.externalProviderEventId,
          input.providerEventType,
          input.providerPayloadHash,
          input.transactionKind,
          input.transactionStatus,
          input.providerTransactionReference ?? null,
          input.occurredAt,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      await client.query('COMMIT');
      if (result.rowCount !== 1) throw new Error('Commercial payment result boundary returned no transaction');
      return mapTransaction(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
