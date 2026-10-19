import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import { BUSINESS_ENGAGEMENT_EVENT_TYPES, type BusinessEngagementService, type BusinessEngagementRepository, type RecordBusinessEngagementInput, type BusinessEngagementEventType } from './contracts';

const eventTypes = new Set<string>(BUSINESS_ENGAGEMENT_EVENT_TYPES);

const validate = (context: AuthContext, input: RecordBusinessEngagementInput): RecordBusinessEngagementInput => {
  requireAuthenticatedContext(context);
  if (!input || typeof input !== 'object') throw new Error('Engagement input is required');
  if (!Number.isSafeInteger(input.businessId) || input.businessId <= 0) throw new Error('businessId must be a positive integer');
  if (!eventTypes.has(input.eventType)) throw new Error('Unsupported engagement event type');
  if (input.source !== undefined && input.source !== 'web' && input.source !== 'mobile') throw new Error('Invalid engagement source');
  const contextData = input.context ?? {};
  if (!contextData || typeof contextData !== 'object' || Array.isArray(contextData)) throw new Error('Invalid engagement context');
  const entries = Object.entries(contextData);
  if (entries.length > 4 || entries.some(([key, value]) =>
    !['visitor_id', 'campaign', 'referrer', 'surface'].includes(key) ||
    typeof value !== 'string' || value.length > 128
  )) throw new Error('Invalid engagement context');
  return {
    businessId: input.businessId,
    eventType: input.eventType as BusinessEngagementEventType,
    context: Object.fromEntries(entries),
    source: input.source ?? 'web',
  };
};

export class BusinessEngagementServiceImpl implements BusinessEngagementService {
  constructor(private readonly repository: BusinessEngagementRepository) {}
  record(context: AuthContext, input: RecordBusinessEngagementInput) {
    return this.repository.record(context, validate(context, input));
  }
}
