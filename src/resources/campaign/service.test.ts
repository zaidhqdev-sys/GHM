import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { Campaign, CampaignRepository } from './contracts';
import { CampaignServiceImpl } from './service';

const actor: AuthContext = { userId: 10, role: 'business' };

const campaign: Campaign = {
  id: 1,
  businessId: 20,
  createdByAccountId: 10,
  title: 'Launch',
  status: 'draft',
  createdAt: new Date('2026-09-18T00:00:00.000Z'),
  updatedAt: new Date('2026-09-18T00:00:00.000Z'),
};

const repository = (overrides: Partial<CampaignRepository> = {}): CampaignRepository => ({
  createCampaign: async () => campaign,
  getCampaign: async () => campaign,
  listCampaigns: async () => [campaign],
  updateCampaign: async () => campaign,
  ...overrides,
});

test('create delegates authenticated context and validated input', async () => {
  let received: unknown;
  const service = new CampaignServiceImpl(repository({
    createCampaign: async (context, input) => {
      received = { context, input };
      return campaign;
    },
  }));

  const result = await service.createCampaign(actor, { businessId: 20, title: '  Launch  ' });
  assert.deepEqual(received, { context: actor, input: { businessId: 20, title: 'Launch' } });
  assert.equal(result.id, 1);
});

test('create rejects empty title', async () => {
  const service = new CampaignServiceImpl(repository());
  await assert.rejects(() => service.createCampaign(actor, { businessId: 20, title: '   ' }), /Campaign title must be between 1 and 200 characters/);
});

test('create rejects title over 200 characters', async () => {
  const service = new CampaignServiceImpl(repository());
  await assert.rejects(() => service.createCampaign(actor, { businessId: 20, title: 'x'.repeat(201) }), /Campaign title must be between 1 and 200 characters/);
});

test('create rejects invalid business id', async () => {
  const service = new CampaignServiceImpl(repository());
  await assert.rejects(() => service.createCampaign(actor, { businessId: 0, title: 'Launch' }), /businessId must be a positive integer/);
});

test('read requires authenticated context', async () => {
  const service = new CampaignServiceImpl(repository());
  await assert.rejects(() => service.getCampaign({ userId: 0, role: 'business' }, 1), /Authentication required/);
});

test('list requires authenticated context and business id', async () => {
  const service = new CampaignServiceImpl(repository());
  await assert.rejects(() => service.listCampaigns({ userId: 0, role: 'business' }, 20), /Authentication required/);
  await assert.rejects(() => service.listCampaigns(actor, 0), /businessId must be a positive integer/);
});

test('update rejects empty patch', async () => {
  const service = new CampaignServiceImpl(repository());
  await assert.rejects(() => service.updateCampaign(actor, 1, {}), /Campaign update requires at least one field/);
});

test('update rejects invalid status', async () => {
  const service = new CampaignServiceImpl(repository());
  await assert.rejects(() => service.updateCampaign(actor, 1, { status: 'open' as any }), /Invalid campaign status/);
});

test('update trims title and delegates', async () => {
  let received: unknown;
  const service = new CampaignServiceImpl(repository({
    updateCampaign: async (context, id, input) => {
      received = { context, id, input };
      return campaign;
    },
  }));
  await service.updateCampaign(actor, 1, { title: '  Next  ' });
  assert.deepEqual(received, { context: actor, id: 1, input: { title: 'Next' } });
});
