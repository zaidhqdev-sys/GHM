import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type { RelationshipsOutcomesRepository, RelationshipsOutcomesService, RelationshipLifecycleStatus, OutcomeLifecycleStatus } from './contracts';

const requireBusinessId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('businessId must be a positive integer');
  return value as number;
};
const requireLimit = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) throw new Error('limit must be between 1 and 100');
  return value as number;
};

const relationshipStatuses = new Set<RelationshipLifecycleStatus>(['proposed', 'active', 'suspended', 'ended', 'rejected']);
const outcomeStatuses = new Set<OutcomeLifecycleStatus>(['recorded', 'confirmed', 'disputed', 'superseded', 'voided']);

export class DefaultRelationshipsOutcomesService implements RelationshipsOutcomesService {
  constructor(private readonly repository: RelationshipsOutcomesRepository) {}

  async getBusinessRelationships(context: AuthContext, businessId: number, status?: RelationshipLifecycleStatus, limit = 100): Promise<Record<string, unknown>[]> {
    requireAuthenticatedContext(context);
    requireBusinessId(businessId);
    requireLimit(limit);
    if (status !== undefined && !relationshipStatuses.has(status)) throw new Error('Invalid relationship lifecycle status');
    return this.repository.getBusinessRelationships(context, businessId, status, limit);
  }

  async getBusinessOutcomes(context: AuthContext, businessId: number, status?: OutcomeLifecycleStatus, limit = 100): Promise<Record<string, unknown>[]> {
    requireAuthenticatedContext(context);
    requireBusinessId(businessId);
    requireLimit(limit);
    if (status !== undefined && !outcomeStatuses.has(status)) throw new Error('Invalid outcome lifecycle status');
    return this.repository.getBusinessOutcomes(context, businessId, status, limit);
  }
}
