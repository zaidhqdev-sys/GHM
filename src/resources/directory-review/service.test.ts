import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectoryReviewBusiness, DirectoryReviewDecision, DirectoryReviewPresentation, DirectoryReviewRepository, DirectoryReviewStatus } from './contracts';
import { DirectoryReviewServiceImpl } from './service';

const context: AuthContext = { userId: 42, role: 'business' };
const presentation: DirectoryReviewPresentation = {
  business_id: 55, verification_status: 'under_review', is_verified: false,
  directory_review_submitted_at: new Date('2026-11-05T00:00:00Z'),
  directory_review_last_reason: null, directory_review_last_event_type: 'submitted',
};
class FakeRepository implements DirectoryReviewRepository {
  calls: unknown[] = [];
  async submit(c: AuthContext, id: number) { this.calls.push({ method: 'submit', userId: c.userId, id }); return presentation; }
  async list(c: AuthContext, options: {status: DirectoryReviewStatus|null;limit:number;offset:number}) { this.calls.push({method:'list',userId:c.userId,options}); return [] as DirectoryReviewBusiness[]; }
  async review(c: AuthContext, id: number, decision: DirectoryReviewDecision, reason: string|null) { this.calls.push({method:'review',userId:c.userId,id,decision,reason}); return presentation; }
  async getPresentation(c: AuthContext, id: number) { this.calls.push({method:'presentation',userId:c.userId,id}); return presentation; }
}

test('directory review binds authenticated account and validates canonical business IDs', async () => {
  const repo = new FakeRepository();
  const service = new DirectoryReviewServiceImpl(repo);
  await service.submit(context, 55);
  assert.deepEqual(repo.calls[0], {method:'submit',userId:42,id:55});
  await assert.rejects(() => service.submit(context, 0), /positive integer/i);
  await assert.rejects(() => service.getPresentation(context, '55' as unknown as number), /positive integer/i);
});

test('directory review queue validates status, limit and offset', async () => {
  const repo = new FakeRepository();
  const service = new DirectoryReviewServiceImpl(repo);
  await service.list(context, {status:'under_review',limit:20,offset:0});
  await assert.rejects(() => service.list(context,{status:'unknown' as DirectoryReviewStatus,limit:20,offset:0}), /status/i);
  await assert.rejects(() => service.list(context,{status:null,limit:101,offset:0}), /limit/i);
  await assert.rejects(() => service.list(context,{status:null,limit:20,offset:-1}), /offset/i);
});

test('directory review decisions require bounded reasons except approval', async () => {
  const repo = new FakeRepository();
  const service = new DirectoryReviewServiceImpl(repo);
  await service.review(context,55,'approve',null);
  await service.review(context,55,'reject','  Missing details  ');
  assert.deepEqual(repo.calls, [
    {method:'review',userId:42,id:55,decision:'approve',reason:null},
    {method:'review',userId:42,id:55,decision:'reject',reason:'Missing details'},
  ]);
  await assert.rejects(() => service.review(context,55,'reject','  '), /reason/i);
  await assert.rejects(() => service.review(context,55,'request_information','x'.repeat(1001)), /reason/i);
  await assert.rejects(() => service.review(context,55,'delete' as DirectoryReviewDecision,null), /decision/i);
});
