import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import { BUSINESS_ENGAGEMENT_EVENT_TYPES, type BusinessEngagementService, type BusinessEngagementRepository, type RecordBusinessEngagementInput } from './contracts';

const eventTypes = new Set<string>(BUSINESS_ENGAGEMENT_EVENT_TYPES);
export class BusinessEngagementServiceImpl implements BusinessEngagementService {
  constructor(private readonly repository: BusinessEngagementRepository) {}
  async record(context: AuthContext, input: RecordBusinessEngagementInput) {
    requireAuthenticatedContext(context);
    if (!input || !Number.isSafeInteger(input.businessId) || input.businessId <= 0) throw new Error('businessId must be a positive integer');
    if (!eventTypes.has(input.eventType)) throw new Error('Unsupported engagement event type');
    if (input.source !== undefined && input.source !== 'web' && input.source !== 'mobile') throw new Error('Invalid engagement source');
    const values = input.context ?? {};
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid engagement context');
    const entries = Object.entries(values);
    if (entries.length > 4 || entries.some(([key, value]) =>
      !['visitor_id', 'campaign', 'referrer', 'surface'].includes(key) ||
      typeof value !== 'string' || value.length > 128
    ) || Buffer.byteLength(JSON.stringify(values)) > 4000) throw new Error('Invalid engagement context');
    return this.repository.record(context, {
      businessId: input.businessId,
      eventType: input.eventType,
      context: Object.fromEntries(entries),
      source: input.source ?? 'web',
    });
  }
}
