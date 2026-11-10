import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type { BusinessAnalyticsDashboard, BusinessAnalyticsRepository, BusinessAnalyticsService } from './contracts';

export class BusinessAnalyticsServiceImpl implements BusinessAnalyticsService {
  constructor(private readonly repository: BusinessAnalyticsRepository) {}
  async getDashboard(context: AuthContext, businessId: number, days: 7 | 30 | 90): Promise<BusinessAnalyticsDashboard> {
    requireAuthenticatedContext(context);
    if (!Number.isSafeInteger(businessId) || businessId <= 0) throw new Error('businessId must be a positive integer');
    if (![7, 30, 90].includes(days)) throw new Error('Analytics period must be 7, 30, or 90 days');
    return this.repository.getDashboard(context, businessId, days);
  }
}
