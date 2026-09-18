import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { TrustScore, TrustScoreRepository } from './contracts';
import { TrustScoreServiceImpl } from './service';

const owner: AuthContext = { userId: 10, role: 'business' };

const score: TrustScore = {
  id: 1,
  businessId: 20,
  profileComplete: 0,
  phoneVerified: 0,
  emailVerified: 0,
  idVerified: 0,
  cipcVerified: 0,
  vatVerified: 0,
  insuranceVerified: 0,
  reviewsScore: 12,
  completedProjects: 0,
  totalScore: 12,
  trustLevel: 'bronze',
  lastUpdated: new Date('2026-09-18T00:00:00.000Z'),
  createdAt: new Date('2026-09-18T00:00:00.000Z'),
  updatedAt: new Date('2026-09-18T00:00:00.000Z'),
};

const repository = (overrides: Partial<TrustScoreRepository> = {}): TrustScoreRepository => ({
  getPublicTrustScore: async () => score,
  getTrustScore: async () => score,
  listPublicByTrustLevel: async () => [score],
  listByTrustLevel: async () => [score],
  calculateTrustScore: async () => score,
  ...overrides,
});

test('public read does not require authentication', async () => {
  const service = new TrustScoreServiceImpl(repository());
  const result = await service.getPublicTrustScore(20);
  assert.equal(result?.businessId, 20);
});

test('authenticated read requires context', async () => {
  const service = new TrustScoreServiceImpl(repository());
  await assert.rejects(
    () => service.getTrustScore({ userId: 0, role: 'business' }, 20),
    /Authentication required/,
  );
});

test('calculate validates business id and delegates', async () => {
  let received: unknown;
  const service = new TrustScoreServiceImpl(repository({
    calculateTrustScore: async (context, businessId) => {
      received = { context, businessId };
      return score;
    },
  }));
  const result = await service.calculateTrustScore(owner, 20);
  assert.deepEqual(received, { context: owner, businessId: 20 });
  assert.equal(result.totalScore, 12);
});

test('calculate rejects invalid business id', async () => {
  const service = new TrustScoreServiceImpl(repository());
  await assert.rejects(() => service.calculateTrustScore(owner, 0), /businessId must be a positive integer/);
});

test('list by trust level validates level vocabulary', async () => {
  const service = new TrustScoreServiceImpl(repository());
  await assert.rejects(
    () => service.listPublicByTrustLevel('diamond' as any),
    /trustLevel must be bronze, silver, gold, or platinum/,
  );
});
