import { assertActorGatewayBaseUrl } from './actor-gateway-url';
import type { SavedBusiness } from '../resources/saved-business/contracts';

export interface SavedBusinessGatewayClient {
  list(accessToken: string): Promise<SavedBusiness[]>;
  get(accessToken: string, savedBusinessId: number): Promise<SavedBusiness | null>;
  create(accessToken: string, businessId: number): Promise<SavedBusiness>;
  delete(accessToken: string, savedBusinessId: number): Promise<void>;
}

export class SavedBusinessGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'SavedBusinessGatewayError';
  }
}

export class HttpSavedBusinessGatewayClient implements SavedBusinessGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  private async request<T>(
    accessToken: string,
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    body?: unknown,
    expectBody = true,
  ): Promise<T> {
    if (!accessToken.trim()) throw new Error('Actor gateway bearer token is required');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}${path}`,
        {
          method,
          redirect: 'error',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new SavedBusinessGatewayError(response.status);
      if (!expectBody) return undefined as T;
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object') throw new Error('Actor gateway response is invalid');
      return payload as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async list(token: string): Promise<SavedBusiness[]> {
    const payload = await this.request<{ savedBusinesses: SavedBusiness[] }>(token, '/v1/saved-businesses', 'GET');
    if (!Array.isArray(payload.savedBusinesses)) throw new Error('Actor gateway response is invalid');
    return payload.savedBusinesses;
  }

  async get(token: string, id: number): Promise<SavedBusiness | null> {
    try {
      const payload = await this.request<{ savedBusiness: SavedBusiness }>(token, `/v1/saved-businesses/${id}`, 'GET');
      if (!payload.savedBusiness || typeof payload.savedBusiness !== 'object') throw new Error('Actor gateway response is invalid');
      return payload.savedBusiness;
    } catch (error) {
      if (error instanceof SavedBusinessGatewayError && error.status === 404) return null;
      throw error;
    }
  }

  async create(token: string, businessId: number): Promise<SavedBusiness> {
    const payload = await this.request<{ savedBusiness: SavedBusiness }>(
      token, '/v1/saved-businesses', 'POST', { businessId },
    );
    if (!payload.savedBusiness || typeof payload.savedBusiness !== 'object') throw new Error('Actor gateway response is invalid');
    return payload.savedBusiness;
  }

  async delete(token: string, id: number): Promise<void> {
    await this.request<void>(token, `/v1/saved-businesses/${id}`, 'DELETE', undefined, false);
  }
}
