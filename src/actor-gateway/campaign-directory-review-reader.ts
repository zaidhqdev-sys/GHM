import type { Pool, PoolClient } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';
import type { Campaign, CreateCampaignInput, UpdateCampaignInput } from '../resources/campaign/contracts';
import type { DirectoryReviewPresentation } from '../resources/directory-review/contracts';

type ConnectablePool = Pick<Pool, 'connect'>;

export interface CampaignDirectoryReviewGatewayReader {
  createCampaign(actor: number, input: CreateCampaignInput): Promise<Campaign>;
  updateCampaign(actor: number, campaignId: number, input: UpdateCampaignInput): Promise<Campaign>;
  getDirectoryReviewPresentation(actor: number, businessId: number): Promise<DirectoryReviewPresentation>;
}

const mapCampaign = (row: any): Campaign => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  createdByAccountId: Number(row.created_by_account_id),
  title: String(row.title),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPresentation = (row: any): DirectoryReviewPresentation => ({
  business_id: Number(row.business_id),
  verification_status: row.verification_status,
  is_verified: row.is_verified === true,
  directory_review_submitted_at: row.directory_review_submitted_at ?? null,
  directory_review_last_reason: row.directory_review_last_reason ?? null,
  directory_review_last_event_type: row.directory_review_last_event_type ?? null,
});

export class PostgresCampaignDirectoryReviewGatewayReader implements CampaignDirectoryReviewGatewayReader {
  private readonly key: Buffer;

  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  private async withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createCampaign(actor: number, input: CreateCampaignInput): Promise<Campaign> {
    return this.withClient(async client => {
      const context = { businessId: input.businessId, title: input.title };
      const assertion = createActorGatewayAssertion(this.key, actor, 'campaign.create', context);
      const result = await client.query(
        'SELECT * FROM ghm.gateway_create_campaign($1,$2,$3,$4,$5,$6,$7)',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, input.businessId, input.title],
      );
      if (result.rowCount !== 1) throw Object.assign(new Error('Campaign creation denied'), { code: '42501' });
      return mapCampaign(result.rows[0]);
    });
  }

  async updateCampaign(actor: number, campaignId: number, input: UpdateCampaignInput): Promise<Campaign> {
    return this.withClient(async client => {
      const title = Object.hasOwn(input, 'title') ? input.title ?? null : null;
      const status = Object.hasOwn(input, 'status') ? input.status ?? null : null;
      const context = { campaignId, title, status };
      const assertion = createActorGatewayAssertion(this.key, actor, 'campaign.update', context);
      const result = await client.query(
        'SELECT * FROM ghm.gateway_update_campaign($1,$2,$3,$4,$5,$6,$7,$8)',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, campaignId, title, status],
      );
      if (result.rowCount !== 1) throw Object.assign(new Error('Campaign update denied'), { code: '42501' });
      return mapCampaign(result.rows[0]);
    });
  }

  async getDirectoryReviewPresentation(actor: number, businessId: number): Promise<DirectoryReviewPresentation> {
    return this.withClient(async client => {
      const context = { businessId };
      const assertion = createActorGatewayAssertion(this.key, actor, 'directory_review.presentation.read', context);
      const result = await client.query(
        'SELECT * FROM ghm.gateway_get_business_directory_review_presentation($1,$2,$3,$4,$5,$6)',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, businessId],
      );
      if (result.rowCount !== 1) throw Object.assign(new Error('Directory review presentation not found'), { code: '42501' });
      return mapPresentation(result.rows[0]);
    });
  }
}
