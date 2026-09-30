import type { AuthContext } from '../../auth/authorization';

export type CampaignId = number;
export type BusinessId = number;
export type AccountId = number;

export type CampaignStatus = 'draft' | 'active' | 'archived';

export interface Campaign {
  readonly id: CampaignId;
  readonly businessId: BusinessId;
  readonly createdByAccountId: AccountId;
  readonly title: string;
  readonly status: CampaignStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCampaignInput {
  readonly businessId: BusinessId;
  readonly title: string;
}

export interface UpdateCampaignInput {
  readonly title?: string;
  readonly status?: CampaignStatus;
}

export interface CampaignRepository {
  createCampaign(context: AuthContext, input: CreateCampaignInput): Promise<Campaign>;
  getCampaign(context: AuthContext, campaignId: CampaignId): Promise<Campaign | null>;
  listCampaigns(context: AuthContext, businessId: BusinessId): Promise<Campaign[]>;
  updateCampaign(context: AuthContext, campaignId: CampaignId, input: UpdateCampaignInput): Promise<Campaign>;
}

export interface CampaignService extends CampaignRepository {}

export const CAMPAIGN_OPERATIONS = Object.freeze({
  read: 'campaign.read',
  create: 'campaign.create',
  update: 'campaign.update',
});

export const CAMPAIGN_STATUS_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = Object.freeze({
  draft: Object.freeze(['active', 'archived'] as const),
  active: Object.freeze(['archived'] as const),
  archived: Object.freeze([] as const),
});
