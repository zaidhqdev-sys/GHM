import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { RelationshipsOutcomesRepository } from './contracts';
import { DefaultRelationshipsOutcomesService } from './service';

const context: AuthContext = { userId: 42, role: 'business' };
class FakeRepository implements RelationshipsOutcomesRepository {
  async getBusinessRelationships(_context: AuthContext, businessId: number, status?: string, limit?: number) {
    return [{ id: 1, businessId, status: status ?? 'active', limit }];
  }
  async getBusinessOutcomes(_context: AuthContext, businessId: number, status?: string, limit?: number) {
    return [{ id: 2, businessId, status: status ?? 'recorded', limit }];
  }
}

test('Relationships and Outcomes service validates scope, filters and bounded limits', async () => {
  const service = new DefaultRelationshipsOutcomesService(new FakeRepository());
  assert.deepEqual(await service.getBusinessRelationships(context, 11, 'active', 25), [{ id: 1, businessId: 11, status: 'active', limit: 25 }]);
  assert.deepEqual(await service.getBusinessOutcomes(context, 11, 'confirmed', 50), [{ id: 2, businessId: 11, status: 'confirmed', limit: 50 }]);
  await assert.rejects(() => service.getBusinessRelationships(context, 0), /businessId must be a positive integer/);
  await assert.rejects(() => service.getBusinessRelationships(context, 11, 'unknown' as never), /Invalid relationship lifecycle status/);
  await assert.rejects(() => service.getBusinessOutcomes(context, 11, 'unknown' as never), /Invalid outcome lifecycle status/);
  await assert.rejects(() => service.getBusinessOutcomes(context, 11, undefined, 101), /limit must be between 1 and 100/);
});
