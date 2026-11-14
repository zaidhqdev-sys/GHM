import { assertActorGatewayBaseUrl } from './actor-gateway-url';

export interface BusinessLogoGatewayClient {
  bind(accessToken: string, businessId: number, objectId: number | null): Promise<number | null>;
}

export class BusinessLogoGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'BusinessLogoGatewayError';
  }
}

export class HttpBusinessLogoGatewayClient implements BusinessLogoGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  async bind(accessToken: string, businessId: number, objectId: number | null): Promise<number | null> {
    if (!accessToken.trim()) throw new Error('Actor gateway bearer token is required');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/v1/businesses/${businessId}/logo`,
        {
          method: 'PUT',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ objectId }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new BusinessLogoGatewayError(response.status);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('previousObjectId' in payload)) {
        throw new Error('Actor gateway response is invalid');
      }
      const previous = (payload as { previousObjectId: unknown }).previousObjectId;
      if (previous !== null && (!Number.isSafeInteger(previous) || Number(previous) <= 0)) {
        throw new Error('Actor gateway response is invalid');
      }
      return previous as number | null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
