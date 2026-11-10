import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { OnboardingProgress, OnboardingProgressRepository } from './contracts';
import { DefaultOnboardingProgressService } from './service';

const context: AuthContext = { userId: 77, role: 'customer' };
const row: OnboardingProgress = {
  id: 1, accountId: 77, journeyId: 'business_setup_v1', stepId: 'profile',
  status: 'pending', firstStartedAt: new Date(1000), completedAt: null, dismissedAt: null,
  createdAt: new Date(1000), updatedAt: new Date(1000),
};

class FakeRepository implements OnboardingProgressRepository {
  calls: unknown[][] = [];
  async getProgress(context: AuthContext, journeyId?: string | null): Promise<OnboardingProgress[]> { this.calls.push([context, journeyId]); return [row]; }
  async start(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress> { this.calls.push([context, journeyId, stepId]); return row; }
  async complete(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress> { this.calls.push([context, journeyId, stepId]); return { ...row, status: 'completed', completedAt: new Date(2000) }; }
  async dismiss(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress> { this.calls.push([context, journeyId, stepId]); return { ...row, status: 'dismissed', dismissedAt: new Date(2000) }; }
}

test('onboarding service validates stable journey and step identifiers before repository access', async () => {
  const repository = new FakeRepository();
  const service = new DefaultOnboardingProgressService(repository);
  await assert.rejects(() => service.start(context, 'Invalid', 'profile'), /Invalid onboarding journey/);
  await assert.rejects(() => service.complete(context, 'business_setup_v1', 'Invalid Step'), /Invalid onboarding step/);
  await service.start(context, 'business_setup_v1', 'profile');
  assert.equal(repository.calls.length, 1);
});

test('onboarding service delegates account-scoped progress operations', async () => {
  const repository = new FakeRepository();
  const service = new DefaultOnboardingProgressService(repository);
  assert.deepEqual(await service.getProgress(context, 'business_setup_v1'), [row]);
  assert.equal((await service.complete(context, 'business_setup_v1', 'profile')).status, 'completed');
  assert.equal((await service.dismiss(context, 'business_setup_v1', 'profile')).status, 'dismissed');
  assert.deepEqual(repository.calls, [
    [context, 'business_setup_v1'],
    [context, 'business_setup_v1', 'profile'],
    [context, 'business_setup_v1', 'profile'],
  ]);
});
