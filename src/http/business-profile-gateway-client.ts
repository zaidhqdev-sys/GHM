import { assertActorGatewayBaseUrl } from './actor-gateway-url';

export interface BusinessProfileGatewayClient {
  update(accessToken: string, businessId: number, patch: Record<string, unknown>): Promise<void>;
}

export class BusinessProfileGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'BusinessProfileGatewayError';
  }
}

export class HttpBusinessProfileGatewayClient implements BusinessProfileGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  async update(accessToken: string, businessId: number, patch: Record<string, unknown>): Promise<void> {
    if (!accessToken.trim() || !Number.isSafeInteger(businessId) || businessId <= 0 ||
        !patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0) {
      throw new Error('Business profile gateway request is invalid');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/v1/businesses/${businessId}/profile`,
        {
          method: 'PATCH',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify(patch),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new BusinessProfileGatewayError(response.status);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('businessProfile' in payload)) {
        throw new Error('Actor gateway response is invalid');
      }
      const profile = payload.businessProfile;
      if (!profile || typeof profile !== 'object' || (profile as Record<string, unknown>).businessId !== businessId) {
        throw new Error('Actor gateway response is invalid');
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
