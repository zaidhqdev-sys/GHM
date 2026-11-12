import assert from 'node:assert/strict';
import test from 'node:test';
import { toLegacyAuthContext } from '../../auth/ghm-auth-context';
import { PostgresCampaignRepository } from './campaign/repository';
import { PostgresDirectoryReviewRepository } from './directory-review/repository';
import type { CampaignDirectoryReviewGatewayClient } from '../../http/campaign-directory-review-gateway-client';
import type { Campaign } from './campaign/contracts';
import type { DirectoryReviewPresentation } from './directory-review/contracts';

const campaign: Campaign = {
  id: 7, businessId: 22, createdByAccountId: 42, title: 'Campaign', status: 'draft',
  createdAt: new Date('2026-11-12T00:00:00Z'), updatedAt: new Date('2026-11-12T00:00:00Z'),
};
const review: DirectoryReviewPresentation = {
  business_id: 22, verification_status: 'unverified', is_verified: false,
  directory_review_submitted_at: null, directory_review_last_reason: null, directory_review_last_event_type: null,
};
const actor = toLegacyAuthContext({ accountId: 42 }, 'business', 'verified-es256-token');

test('Campaign mutations delegate to Actor Gateway with the verified bearer and never use runtime SQL', async () => {
  const calls: unknown[] = [];
  const gateway: CampaignDirectoryReviewGatewayClient = {
    async createCampaign(token, input) { calls.push({ operation: 'create', token, input }); return campaign; },
    async updateCampaign(token, id, input) { calls.push({ operation: 'update', token, id, input }); return campaign; },
    async getDirectoryReviewPresentation(token, businessId) { calls.push({ operation: 'review', token, businessId }); return review; },
  };
  const repository = new PostgresCampaignRepository(undefined, gateway, true);
  assert.deepEqual(await repository.createCampaign(actor, { businessId: 22, title: 'Campaign' }), campaign);
  assert.deepEqual(await repository.updateCampaign(actor, 7, { status: 'archived' }), campaign);
  assert.deepEqual(calls, [
    { operation: 'create', token: 'verified-es256-token', input: { businessId: 22, title: 'Campaign' } },
    { operation: 'update', token: 'verified-es256-token', id: 7, input: { status: 'archived' } },
  ]);
});

test('Campaign mutations fail closed when Actor Gateway is required but no verified bearer is present', async () => {
  const gateway = {} as CampaignDirectoryReviewGatewayClient;
  const repository = new PostgresCampaignRepository(undefined, gateway, true);
  const context = toLegacyAuthContext({ accountId: 42 }, 'business');
  await assert.rejects(() => repository.createCampaign(context, { businessId: 22, title: 'Campaign' }), /Authenticated Actor Gateway bearer token required/);
});

test('Directory-review presentation delegates to Actor Gateway with the verified bearer', async () => {
  let received: unknown;
  const gateway: CampaignDirectoryReviewGatewayClient = {
    async createCampaign() { return campaign; },
    async updateCampaign() { return campaign; },
    async getDirectoryReviewPresentation(token, businessId) { received = { token, businessId }; return review; },
  };
  const repository = new PostgresDirectoryReviewRepository(undefined, gateway, true);
  assert.deepEqual(await repository.getPresentation(actor, 22), review);
  assert.deepEqual(received, { token: 'verified-es256-token', businessId: 22 });
});
