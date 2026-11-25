import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type { BusinessAnalytics, BusinessAnalyticsRepository, BusinessEngagementEvent, BusinessEngagementEventType, RecordBusinessEngagementInput } from './contracts';

const EVENT_TYPES = new Set<BusinessEngagementEventType>([
  'profile_view', 'call', 'whatsapp', 'quote_request',
  'website_visit', 'direction_request', 'save', 'share',
]);

const validateInput = (input: RecordBusinessEngagementInput): RecordBusinessEngagementInput => {
  if (!Number.isSafeInteger(input.businessId) || input.businessId <= 0) throw new Error('businessId must be a positive integer');
  if (!EVENT_TYPES.has(input.eventType)) throw new Error('Invalid engagement event type');
  if (input.source !== 'web' && input.source !== 'mobile') throw new Error('Invalid engagement event source');
  if (!input.context || typeof input.context !== 'object' || Array.isArray(input.context)) throw new Error('Invalid engagement event context');
  const allowed = new Set(['visitor_id', 'campaign', 'referrer', 'surface']);
  const entries = Object.entries(input.context);
  if (entries.length > 4 || entries.some(([key, value]) => !allowed.has(key) || typeof value !== 'string' || value.length > 128)) {
    throw new Error('Invalid engagement event context');
  }
  return input;
};

export class BusinessAnalyticsService {
  constructor(private readonly repository: BusinessAnalyticsRepository) {}

  async recordEngagementEvent(context: AuthContext | null, input: RecordBusinessEngagementInput): Promise<BusinessEngagementEvent | null> {
    return this.repository.recordEngagementEvent(context, validateInput(input));
  }

  async getDashboard(context: AuthContext, businessId: number, days: number): Promise<BusinessAnalytics | null> {
    requireAuthenticatedContext(context);
    if (![7, 30, 90].includes(days)) throw new Error('Analytics period must be 7, 30, or 90 days');
    return this.repository.getDashboard(context, businessId, days as 7 | 30 | 90);
  }
}
