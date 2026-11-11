import assert from 'node:assert/strict';
import type { AuthContext } from '../../auth/authorization';
import test from 'node:test';
import type { DirectoryReviewPresentation, DirectoryReviewRepository } from './contracts';
import { DirectoryReviewServiceImpl } from './service';

const context: AuthContext = { userId: 42, role: 'business' };
const presentation: DirectoryReviewPresentation = {
  business_id: 55,
  verification_status: 'under_review',
  is_verified: false,
  directory_review_submitted_at: new Date('2026-11-05T00:00:00Z'),
  directory_review_last_reason: null,
  directory_review_last_event_type: 'submitted',
};

class FakeRepository implements DirectoryReviewRepository {
  calls: unknown[] = [];
  async getPresentation(receivedContext: AuthContext, id: number) {
    this.calls.push({ userId: receivedContext.userId, id });
    return presentation;
  }
}

test('directory review presentation binds authenticated account and validates canonical Business IDs', async () => {
  const repo = new FakeRepository();
  const service = new DirectoryReviewServiceImpl(repo);
  await service.getPresentation(context, 55);
  assert.deepEqual(repo.calls[0], { userId: 42, id: 55 });
  await assert.rejects(() => service.getPresentation(context, 0), /positive integer/i);
  await assert.rejects(() => service.getPresentation(context, '55' as unknown as number), /positive integer/i);
});

test('directory review presentation requires an authenticated context', async () => {
  const repo = new FakeRepository();
  const service = new DirectoryReviewServiceImpl(repo);
  await assert.rejects(
    () => service.getPresentation({ userId: 0, role: 'business' }, 55),
    /authenticated/i,
  );
  assert.deepEqual(repo.calls, []);
});
