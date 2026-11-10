import type { AuthContext } from '../../auth/authorization';

export type RelationshipLifecycleStatus = 'proposed' | 'active' | 'suspended' | 'ended' | 'rejected';
export type OutcomeLifecycleStatus = 'recorded' | 'confirmed' | 'disputed' | 'superseded' | 'voided';

export interface RelationshipsOutcomesRepository {
  getBusinessRelationships(context: AuthContext, businessId: number, status?: RelationshipLifecycleStatus, limit?: number): Promise<Record<string, unknown>[]>;
  getBusinessOutcomes(context: AuthContext, businessId: number, status?: OutcomeLifecycleStatus, limit?: number): Promise<Record<string, unknown>[]>;
}

export interface RelationshipsOutcomesService extends RelationshipsOutcomesRepository {}
