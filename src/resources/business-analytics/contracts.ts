import type { AuthContext } from '../../auth/authorization';

export type BusinessEngagementEventType =
  | 'profile_view' | 'call' | 'whatsapp' | 'quote_request'
  | 'website_visit' | 'direction_request' | 'save' | 'share';

export interface RecordBusinessEngagementInput {
  readonly businessId: number;
  readonly eventType: BusinessEngagementEventType;
  readonly context: Readonly<Record<string, string>>;
  readonly source: 'web' | 'mobile';
}

export interface BusinessEngagementEvent {
  readonly id: number;
  readonly businessId: number;
  readonly eventType: BusinessEngagementEventType;
  readonly occurredAt: Date;
}

export interface BusinessAnalytics {
  readonly business_id: number;
  readonly period_days: 7 | 30 | 90;
  readonly engagement: Readonly<Record<string, number>>;
  readonly leads: number;
  readonly quotes: number;
  readonly projects_won: number;
  readonly conversion_rate: number;
  readonly recent_activity: readonly {
    readonly id: number;
    readonly event_type: BusinessEngagementEventType;
    readonly occurred_at: Date;
  }[];
}

export interface BusinessAnalyticsRepository {
  recordEngagementEvent(context: AuthContext | null, input: RecordBusinessEngagementInput): Promise<BusinessEngagementEvent | null>;
  getDashboard(context: AuthContext, businessId: number, days: 7 | 30 | 90): Promise<BusinessAnalytics | null>;
}
