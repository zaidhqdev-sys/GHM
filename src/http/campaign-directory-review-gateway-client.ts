import { assertActorGatewayBaseUrl } from './actor-gateway-url';
import type { Campaign, CreateCampaignInput, UpdateCampaignInput } from '../resources/campaign/contracts';
import type { DirectoryReviewPresentation } from '../resources/directory-review/contracts';

export interface CampaignDirectoryReviewGatewayClient {
  createCampaign(accessToken: string, input: CreateCampaignInput): Promise<Campaign>;
  updateCampaign(accessToken: string, campaignId: number, input: UpdateCampaignInput): Promise<Campaign>;
  getDirectoryReviewPresentation(accessToken: string, businessId: number): Promise<DirectoryReviewPresentation>;
}

export class CampaignDirectoryReviewGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor Gateway request failed');
    this.name = 'CampaignDirectoryReviewGatewayError';
  }
}

export class HttpCampaignDirectoryReviewGatewayClient implements CampaignDirectoryReviewGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  private async request<T>(accessToken: string, path: string, method: string, body?: unknown): Promise<T> {
    if (!accessToken.trim()) throw new Error('Actor Gateway bearer token is required');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        redirect: 'error',
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new CampaignDirectoryReviewGatewayError(response.status);
      const payload: unknown = response.status === 204 ? null : await response.json();
      if (!payload || typeof payload !== 'object') throw new Error('Actor Gateway response is invalid');
      return payload as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async createCampaign(accessToken: string, input: CreateCampaignInput): Promise<Campaign> {
    const result = await this.request<{ campaign: Campaign }>(accessToken, '/v1/campaigns', 'POST', input);
    if (!result.campaign || typeof result.campaign !== 'object') throw new Error('Actor Gateway Campaign response is invalid');
    return result.campaign;
  }

  async updateCampaign(accessToken: string, campaignId: number, input: UpdateCampaignInput): Promise<Campaign> {
    const result = await this.request<{ campaign: Campaign }>(accessToken, `/v1/campaigns/${campaignId}`, 'PATCH', input);
    if (!result.campaign || typeof result.campaign !== 'object') throw new Error('Actor Gateway Campaign response is invalid');
    return result.campaign;
  }

  async getDirectoryReviewPresentation(accessToken: string, businessId: number): Promise<DirectoryReviewPresentation> {
    const result = await this.request<{ review: DirectoryReviewPresentation }>(
      accessToken, `/v1/businesses/${businessId}/directory-review-presentation`, 'GET',
    );
    if (!result.review || typeof result.review !== 'object') throw new Error('Actor Gateway directory review response is invalid');
    return result.review;
  }
}
