import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { BusinessEngagementEvent, BusinessEngagementRepository, RecordBusinessEngagementInput } from './contracts';

export class PostgresBusinessEngagementRepository implements BusinessEngagementRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}
  async record(context: AuthContext, input: RecordBusinessEngagementInput): Promise<BusinessEngagementEvent> {
    return withAuthorizedTransaction(context, async client => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1::text || \':\' || $2::text, 0))',
        [input.businessId, context.userId],
      );
      const rate = await client.query(
        `SELECT count(*)::int AS total
           FROM ghm.business_engagement_event
          WHERE account_id = $1 AND created_at >= now() - interval '1 minute'`,
        [context.userId],
      );
      if (Number(rate.rows[0]?.total ?? 0) >= 60) throw new Error('Engagement rate limit exceeded');
      const result = await client.query(
        `INSERT INTO ghm.business_engagement_event
          (business_id, account_id, event_type, event_context, source)
         SELECT b.id, $2, $3, $4::jsonb, $5
           FROM ghm.business b
          WHERE b.id = $1 AND b.is_active = true
            AND b.is_verified = true AND b.verification_status = 'approved'
            AND NOT EXISTS (
              SELECT 1 FROM ghm.business_membership bm
              WHERE bm.business_id = b.id AND bm.account_id = $2
                AND bm.membership_status = 'active'
            )
         RETURNING id, business_id, account_id, event_type, event_context, source, created_at`,
        [input.businessId, context.userId, input.eventType, JSON.stringify(input.context ?? {}), input.source ?? 'web'],
      );
      if (result.rowCount !== 1) throw new Error('Business not found');
      const row = result.rows[0];
      return {
        id: Number(row.id), businessId: Number(row.business_id), accountId: Number(row.account_id),
        eventType: row.event_type, context: row.event_context ?? {}, source: row.source, createdAt: row.created_at,
      };
    }, this.transactionPool);
  }
}
