import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { BusinessAnalyticsDashboard, BusinessAnalyticsRepository } from './contracts';

export class PostgresBusinessAnalyticsRepository implements BusinessAnalyticsRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}
  async getDashboard(context: AuthContext, businessId: number, days: 7 | 30 | 90): Promise<BusinessAnalyticsDashboard> {
    return withAuthorizedTransaction(context, async client => {
      const access = await client.query(
        `SELECT 1
           FROM ghm.business_membership bm
           JOIN ghm.commercial_subscription cs
             ON cs.business_id = bm.business_id
            AND cs.lifecycle_status IN ('trialing', 'active', 'grace_period', 'cancel_at_period_end')
            AND (cs.current_period_end IS NULL OR cs.current_period_end > now())
           JOIN ghm.commercial_plan_entitlement cpe
             ON cpe.plan_version_id = cs.plan_version_id
            AND cpe.entitlement_code = 'business.analytics'
            AND cpe.access_level = 'enabled'
          WHERE bm.business_id = $1
            AND bm.account_id = $2
            AND bm.membership_status = 'active'
            AND bm.membership_role IN ('owner', 'administrator')
          LIMIT 1`,
        [businessId, context.userId],
      );
      if (access.rowCount !== 1) throw new Error('Business analytics access required');

      const result = await client.query(
        `WITH engagement AS (
           SELECT
             count(*) FILTER (WHERE event_type = 'profile_view')::int AS profile_views,
             count(*) FILTER (WHERE event_type = 'call')::int AS calls,
             count(*) FILTER (WHERE event_type = 'whatsapp')::int AS whatsapp_clicks,
             count(*) FILTER (WHERE event_type = 'quote_request')::int AS quote_requests,
             count(*) FILTER (WHERE event_type = 'website_visit')::int AS website_visits,
             count(*) FILTER (WHERE event_type = 'direction_request')::int AS direction_requests,
             count(*) FILTER (WHERE event_type = 'save')::int AS saves,
             count(*) FILTER (WHERE event_type = 'share')::int AS shares
           FROM ghm.business_engagement_event
           WHERE business_id = $1 AND created_at >= now() - make_interval(days => $3::int)
         ), activity AS (
           SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'event_type', event_type, 'occurred_at', created_at
           ) ORDER BY created_at DESC, id DESC), '[]'::jsonb) AS items
           FROM (
             SELECT id, event_type, created_at
             FROM ghm.business_engagement_event
             WHERE business_id = $1 AND created_at >= now() - make_interval(days => $3::int)
             ORDER BY created_at DESC, id DESC LIMIT 5
           ) recent
         ), leads AS (
           SELECT count(*)::int AS total FROM ghm.enquiry
           WHERE business_id = $1 AND created_at >= now() - make_interval(days => $3::int)
         ), quotes AS (
           SELECT count(*)::int AS total,
             count(*) FILTER (WHERE status = 'accepted')::int AS accepted
           FROM ghm.project_quote
           WHERE business_id = $1 AND created_at >= now() - make_interval(days => $3::int)
         )
         SELECT jsonb_build_object(
           'version', 1, 'business_id', $1, 'period_days', $3, 'generated_at', now(),
           'engagement', to_jsonb(engagement),
           'leads', leads.total, 'quotes', quotes.total, 'projects_won', quotes.accepted,
           'conversion_rate', CASE WHEN leads.total > 0
             THEN round((quotes.accepted::numeric / leads.total::numeric) * 100)::int ELSE 0 END,
           'recent_activity', activity.items
         ) AS dashboard
         FROM engagement, activity, leads, quotes`,
        [businessId, context.userId, days],
      );
      return result.rows[0].dashboard as BusinessAnalyticsDashboard;
    }, this.transactionPool);
  }
}
