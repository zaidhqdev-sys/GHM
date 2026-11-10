import type { AuthContext } from '../../auth/authorization';

export interface BusinessAnalyticsEngagement {
  readonly profile_views: number;
  readonly calls: number;
  readonly whatsapp_clicks: number;
  readonly quote_requests: number;
  readonly website_visits: number;
  readonly direction_requests: number;
  readonly saves: number;
  readonly shares: number;
}
export interface BusinessAnalyticsActivity {
  readonly id: number;
  readonly event_type: string;
  readonly occurred_at: Date;
}
export interface BusinessAnalyticsDashboard {
  readonly version: 1;
  readonly business_id: number;
  readonly period_days: 7 | 30 | 90;
  readonly generated_at: Date;
  readonly engagement: BusinessAnalyticsEngagement;
  readonly leads: number;
  readonly quotes: number;
  readonly projects_won: number;
  readonly conversion_rate: number;
  readonly recent_activity: readonly BusinessAnalyticsActivity[];
}
export interface BusinessAnalyticsRepository {
  getDashboard(context: AuthContext, businessId: number, days: 7 | 30 | 90): Promise<BusinessAnalyticsDashboard>;
}
export interface BusinessAnalyticsService {
  getDashboard(context: AuthContext, businessId: number, days: 7 | 30 | 90): Promise<BusinessAnalyticsDashboard>;
}
