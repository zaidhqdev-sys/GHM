import { assertActorGatewayBaseUrl } from './actor-gateway-url';

export class SupplierClassificationGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'SupplierClassificationGatewayError';
  }
}

export interface SupplierClassificationGatewayClient {
  update(accessToken: string, businessId: number, isSupplier: boolean): Promise<{ businessId: number; isSupplier: boolean }>;
}

export class HttpSupplierClassificationGatewayClient implements SupplierClassificationGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  async update(accessToken: string, businessId: number, isSupplier: boolean): Promise<{ businessId: number; isSupplier: boolean }> {
    if (!accessToken.trim() || !Number.isSafeInteger(businessId) || businessId <= 0 || typeof isSupplier !== 'boolean') {
      throw new Error('Supplier classification gateway request is invalid');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/v1/businesses/${businessId}/supplier-classification`,
        {
          method: 'PUT',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ isSupplier }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new SupplierClassificationGatewayError(response.status);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('supplierClassification' in payload)) {
        throw new Error('Actor gateway response is invalid');
      }
      const value = payload.supplierClassification;
      if (!value || typeof value !== 'object') throw new Error('Actor gateway response is invalid');
      const row = value as Record<string, unknown>;
      if (row.businessId !== businessId || row.isSupplier !== isSupplier) {
        throw new Error('Actor gateway response is invalid');
      }
      return { businessId, isSupplier };
    } finally {
      clearTimeout(timeout);
    }
  }
}
