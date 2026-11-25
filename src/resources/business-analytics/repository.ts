import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import { withTransaction, type TransactionPool } from '../../db/transaction';
import type { BusinessAnalytics, BusinessAnalyticsRepository, BusinessEngagementEvent, RecordBusinessEngagementInput } from './contracts';

const validVisitorId = (value: string | undefined): string | null =>
  value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;

const assertBusinessId = (value: number): void => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('businessId must be a positive integer');
};

const assertPublicBusiness = async (client: PoolClient, businessId: number): Promise<boolean> => {
  const result = await client.query(
    `SELECT 1 FROM ghm.business
     WHERE id = $1 AND is_active = true AND verification_status = 'approved'`,
    [businessId],
  );
  return result.rowCount === 1;
};

export class PostgresBusinessAnalyticsRepository implements BusinessAnalyticsRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async recordEngagementEvent(
    context: AuthContext | null,
    input: RecordBusinessEngagementInput,
  ): Promise<BusinessEngagementEvent | null> {
    assertBusinessId(input.businessId);
    return withTransaction(async client => {
      if (!(await assertPublicBusiness(client, input.businessId))) {
        throw new Error('Public Business not found');
      }

      if (input.eventType === 'profile_view') {
        const visitorId = validVisitorId(input.context.visitor_id)
          ?? (context ? String(context.userId) : null);
        if (visitorId) {
          // Authenticated GHM account IDs are numeric, so use a stable UUID
          // namespace for the dedupe key without accepting an account ID from
          // the request body as actor identity.
          const dedupeId = validVisitorId(visitorId) ?? (
            context ? '00000000-0000-4000-8000-' + String(context.userId).padStart(12, '0') : null
          );
          if (dedupeId) {
            const accepted = await client.query(
              `INSERT INTO ghm.business_profile_view_visitor (business_id, visitor_id, last_viewed_at)
               VALUES ($1, $2::uuid, now())
               ON CONFLICT (business_id, visitor_id) DO UPDATE
                 SET last_viewed_at = now()
                 WHERE ghm.business_profile_view_visitor.last_viewed_at < now() - interval '24 hours'
               RETURNING business_id`,
              [input.businessId, dedupeId],
            );
            if (accepted.rowCount !== 1) return null;
          }
        }
      }

      const result = await client.query(
        `INSERT INTO ghm.business_engagement_event
           (business_id, event_type, actor_account_id, source, context)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, business_id, event_type, occurred_at`,
        [input.businessId, input.eventType, context?.userId ?? null, input.source, JSON.stringify(input.context)],
      );
      const row = result.rows[0];
      return {
        id: Number(row.id),
        businessId: Number(row.business_id),
        eventType: row.event_type,
        occurredAt: row.occurred_at,
      };
    }, this.transactionPool);
  }

  async getDashboard(context: AuthContext, businessId: number, days: 7 | 30 | 90): Promise<BusinessAnalytics | null> {
    assertBusinessId(businessId);
    return withAuthorizedTransaction(context, async client => {
      const membership = await client.query(
        `SELECT 1 FROM ghm.business_membership
         WHERE business_id = $1 AND account_id = $2
           AND membership_status = 'active'
           AND membership_role IN ('owner', 'administrator')
         LIMIT 1`,
        [businessId, context.userId],
      );
      if (membership.rowCount !== 1 && context.role !== 'admin') {
        return null;
      }

      const business = await client.query('SELECT 1 FROM ghm.business WHERE id = $1', [businessId]);
      if (business.rowCount !== 1) return null;

      const since = `now() - ($2::integer * interval '1 day')`;
      const eventCounts = await client.query(
        `SELECT
           count(*) FILTER (WHERE event_type = 'profile_view')::int AS profile_views,
           count(*) FILTER (WHERE event_type = 'call')::int AS calls,
           count(*) FILTER (WHERE event_type = 'whatsapp')::int AS whatsapp_clicks,
           count(*) FILTER (WHERE event_type = 'quote_request')::int AS quote_requests,
           count(*) FILTER (WHERE event_type = 'website_visit')::int AS website_visits,
           count(*) FILTER (WHERE event_type = 'direction_request')::int AS direction_requests,
           count(*) FILTER (WHERE event_type = 'save')::int AS saves,
           count(*) FILTER (WHERE event_type = 'share')::int AS shares
         FROM ghm.business_engagement_event
         WHERE business_id = $1 AND occurred_at >= ${since}`,
        [businessId, days],
      );
      const [leadCount, quoteCounts, recent] = await Promise.all([
        client.query(
          `SELECT count(*)::int AS total FROM ghm.enquiry WHERE business_id = $1 AND created_at >= ${since}`,
          [businessId, days],
        ),
        client.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status = 'accepted')::int AS accepted
           FROM ghm.project_quote WHERE business_id = $1 AND created_at >= ${since}`,
          [businessId, days],
        ),
        client.query(
          `SELECT id, event_type, occurred_at
           FROM ghm.business_engagement_event
           WHERE business_id = $1 AND occurred_at >= ${since}
           ORDER BY occurred_at DESC, id DESC LIMIT 5`,
          [businessId, days],
        ),
      ]);
      const leads = Number(leadCount.rows[0]?.total ?? 0);
      const quotes = Number(quoteCounts.rows[0]?.total ?? 0);
      const won = Number(quoteCounts.rows[0]?.accepted ?? 0);
      return {
        business_id: businessId,
        period_days: days,
        engagement: eventCounts.rows[0] ?? {},
        leads,
        quotes,
        projects_won: won,
        conversion_rate: leads > 0 ? Math.round((won / leads) * 100) : 0,
        recent_activity: recent.rows.map(row => ({
          id: Number(row.id),
          event_type: row.event_type,
          occurred_at: row.occurred_at,
        })),
      };
    }, this.transactionPool);
  }
}
