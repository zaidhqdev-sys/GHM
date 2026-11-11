import { assertActorGatewayBaseUrl } from './actor-gateway-url';
import type { BusinessId, TrustScore } from '../resources/trust-score/contracts';

export interface TrustScoreGatewayClient {
  calculate(accessToken: string, businessId: BusinessId): Promise<TrustScore>;
}

export class TrustScoreGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'TrustScoreGatewayError';
  }
}

export class HttpTrustScoreGatewayClient implements TrustScoreGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  async calculate(accessToken: string, businessId: BusinessId): Promise<TrustScore> {
    if (!accessToken.trim()) throw new Error('Actor gateway bearer token is required');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/v1/trust-scores/${businessId}/calculate`,
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new TrustScoreGatewayError(response.status);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('trustScore' in payload)
        || !(payload as { trustScore?: unknown }).trustScore
        || typeof (payload as { trustScore: unknown }).trustScore !== 'object') {
        throw new Error('Actor gateway response is invalid');
      }
      return (payload as { trustScore: TrustScore }).trustScore;
    } finally {
      clearTimeout(timeout);
    }
  }
}
