import type { AuthContext } from '../../auth/authorization';

export const BUSINESS_ENGAGEMENT_EVENT_TYPES = [
  'profile_view',
  'save',
  'whatsapp',
  'call',
  'website_visit',
  'direction_request',
  'share',
] as const;

export type BusinessEngagementEventType = typeof BUSINESS_ENGAGEMENT_EVENT_TYPES[number];

export interface RecordBusinessEngagementInput {
  readonly businessId: number;
  readonly eventType: BusinessEngagementEventType;
  readonly context?: Readonly<Record<string, string>>;
  readonly source?: 'web' | 'mobile';
}

export interface BusinessEngagementEvent {
  readonly id: number;
  readonly businessId: number;
  readonly accountId: number;
  readonly eventType: BusinessEngagementEventType;
  readonly context: Readonly<Record<string, string>>;
  readonly source: 'web' | 'mobile';
  readonly createdAt: Date;
}

export interface BusinessEngagementRepository {
  record(context: AuthContext, input: RecordBusinessEngagementInput): Promise<BusinessEngagementEvent>;
}

export interface BusinessEngagementService {
  record(context: AuthContext, input: RecordBusinessEngagementInput): Promise<BusinessEngagementEvent>;
}
