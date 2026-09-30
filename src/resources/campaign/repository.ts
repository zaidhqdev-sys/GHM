import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  CampaignStatus,
  CreateCampaignInput,
  UpdateCampaignInput,
} from './contracts';

const COLUMNS = 'id, business_id, created_by_account_id, title, status, created_at, updated_at';

const mapCampaign = (row: any): Campaign => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  createdByAccountId: Number(row.created_by_account_id),
  title: String(row.title),
  status: row.status as CampaignStatus,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const READ_MEMBERSHIP = `
  EXISTS (
    SELECT 1 FROM ghm.business_membership bm
     WHERE bm.business_id = ghm.campaign.business_id
       AND bm.account_id = $2
       AND bm.membership_status = 'active'
       AND bm.membership_role IN ('owner', 'administrator', 'member')
  )
`;

export class PostgresCampaignRepository implements CampaignRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async createCampaign(context: AuthContext, input: CreateCampaignInput): Promise<Campaign> {
    const businessId = requirePositiveId(input.businessId, 'businessId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT * FROM ghm.create_campaign($1, $2, $3)`,
        [context.userId, businessId, input.title],
      );
      if (result.rowCount !== 1) throw new Error('Campaign create failed');
      return mapCampaign(result.rows[0]);
    }, this.transactionPool);
  }

  async getCampaign(context: AuthContext, campaignId: CampaignId): Promise<Campaign | null> {
    const id = requirePositiveId(campaignId, 'campaignId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ghm.campaign
         WHERE id = $1 AND ${READ_MEMBERSHIP}`,
        [id, context.userId],
      );
      return result.rowCount === 1 ? mapCampaign(result.rows[0]) : null;
    }, this.transactionPool);
  }

  async listCampaigns(context: AuthContext, businessId: number): Promise<Campaign[]> {
    const id = requirePositiveId(businessId, 'businessId');
    return withAuthorizedTransaction(context, async client => {
      const membership = await client.query(
        `SELECT 1 FROM ghm.business_membership
          WHERE business_id = $1
            AND account_id = $2
            AND membership_status = 'active'
            AND membership_role IN ('owner', 'administrator', 'member')
          LIMIT 1`,
        [id, context.userId],
      );
      if (membership.rowCount !== 1) return [];

      const result = await client.query(
        `SELECT ${COLUMNS} FROM ghm.campaign
         WHERE business_id = $1
         ORDER BY created_at DESC, id DESC`,
        [id],
      );
      return result.rows.map(mapCampaign);
    }, this.transactionPool);
  }

  async updateCampaign(context: AuthContext, campaignId: CampaignId, input: UpdateCampaignInput): Promise<Campaign> {
    const id = requirePositiveId(campaignId, 'campaignId');
    const hasTitle = Object.hasOwn(input, 'title');
    const hasStatus = Object.hasOwn(input, 'status');
    if (!hasTitle && !hasStatus) throw new Error('Campaign update requires at least one field');

    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT * FROM ghm.update_campaign($1, $2, $3, $4)`,
        [context.userId, id, hasTitle ? input.title : null, hasStatus ? input.status : null],
      );
      if (result.rowCount !== 1) throw new Error('Campaign not found or management permission required');
      return mapCampaign(result.rows[0]);
    }, this.transactionPool);
  }
}
