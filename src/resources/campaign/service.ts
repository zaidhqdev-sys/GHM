import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  CampaignService,
  CampaignStatus,
  CreateCampaignInput,
  UpdateCampaignInput,
} from './contracts';
import { CAMPAIGN_STATUS_TRANSITIONS } from './contracts';

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const normalizeTitle = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Campaign title must be between 1 and 200 characters');
  const title = value.trim();
  if (title.length < 1 || title.length > 200) throw new Error('Campaign title must be between 1 and 200 characters');
  return title;
};

const isCampaignStatus = (value: unknown): value is CampaignStatus =>
  value === 'draft' || value === 'active' || value === 'archived';

const validateCreate = (context: AuthContext, input: CreateCampaignInput): CreateCampaignInput => {
  requireAuthenticatedContext(context);
  if (!input || typeof input !== 'object') throw new Error('Campaign input is required');
  return {
    businessId: requirePositiveId(input.businessId, 'businessId'),
    title: normalizeTitle(input.title),
  };
};

const validateUpdate = (context: AuthContext, campaignId: CampaignId, input: UpdateCampaignInput): UpdateCampaignInput => {
  requireAuthenticatedContext(context);
  requirePositiveId(campaignId, 'campaignId');
  if (!input || typeof input !== 'object') throw new Error('Campaign update input is required');

  const hasTitle = Object.hasOwn(input, 'title');
  const hasStatus = Object.hasOwn(input, 'status');
  if (!hasTitle && !hasStatus) throw new Error('Campaign update requires at least one field');

  const next: { title?: string; status?: CampaignStatus } = {};
  if (hasTitle) next.title = normalizeTitle(input.title);
  if (hasStatus) {
    if (!isCampaignStatus(input.status)) throw new Error('Invalid campaign status');
    next.status = input.status;
  }
  return next;
};

export class CampaignServiceImpl implements CampaignService {
  constructor(private readonly repository: CampaignRepository) {}

  async createCampaign(context: AuthContext, input: CreateCampaignInput): Promise<Campaign> {
    return this.repository.createCampaign(context, validateCreate(context, input));
  }

  async getCampaign(context: AuthContext, campaignId: CampaignId): Promise<Campaign | null> {
    requireAuthenticatedContext(context);
    requirePositiveId(campaignId, 'campaignId');
    return this.repository.getCampaign(context, campaignId);
  }

  async listCampaigns(context: AuthContext, businessId: number): Promise<Campaign[]> {
    requireAuthenticatedContext(context);
    requirePositiveId(businessId, 'businessId');
    return this.repository.listCampaigns(context, businessId);
  }

  async updateCampaign(context: AuthContext, campaignId: CampaignId, input: UpdateCampaignInput): Promise<Campaign> {
    const validated = validateUpdate(context, campaignId, input);
    if (validated.status) {
      // Transition legality is enforced in the repository/function against persisted status.
      // Service rejects unknown status values above; graph checked at persistence boundary.
      void CAMPAIGN_STATUS_TRANSITIONS;
    }
    return this.repository.updateCampaign(context, campaignId, validated);
  }
}
