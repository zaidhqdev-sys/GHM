import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { BusinessEngagementEvent, BusinessEngagementRepository, RecordBusinessEngagementInput } from './contracts';

export class PostgresBusinessEngagementRepository implements BusinessEngagementRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async record(context: AuthContext, input: RecordBusinessEngagementInput): Promise<BusinessEngagementEvent> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `INSERT INTO ghm.business_engagement_event
          (business_id, account_id, event_type, event_context, source)
         SELECT b.id, $2, $3, $4::jsonb, $5
           FROM ghm.business b
          WHERE b.id = $1 AND b.is_active = true
            AND b.is_verified = true AND b.verification_status = 'approved'
         RETURNING id, business_id, account_id, event_type, event_context, source, created_at`,
        [input.businessId, context.userId, input.eventType, JSON.stringify(input.context ?? {}), input.source ?? 'web'],
      );
      if (result.rowCount !== 1) throw new Error('Business not found');
      const row = result.rows[0];
      return {
        id: Number(row.id),
        businessId: Number(row.business_id),
        accountId: Number(row.account_id),
        eventType: row.event_type,
        context: row.event_context ?? {},
        source: row.source,
        createdAt: row.created_at,
      };
    }, this.transactionPool);
  }
}
