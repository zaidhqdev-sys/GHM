import type {
import { assertActorGatewayBaseUrl } from './actor-gateway-url';
  BusinessRegistrationIdentity,
  UpdateBusinessRegistrationIdentityInput,
} from '../resources/business-registration-identity/contracts';

export interface BusinessRegistrationIdentityGatewayClient {
  readRegistrationIdentity(accessToken: string, businessId: number): Promise<BusinessRegistrationIdentity>;
  updateRegistrationIdentity(accessToken: string, input: UpdateBusinessRegistrationIdentityInput): Promise<BusinessRegistrationIdentity>;
}

export class BusinessRegistrationIdentityGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'BusinessRegistrationIdentityGatewayError';
  }
}

export class HttpBusinessRegistrationIdentityGatewayClient implements BusinessRegistrationIdentityGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly requestTimeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  async readRegistrationIdentity(accessToken: string, businessId: number): Promise<BusinessRegistrationIdentity> {
    return this.request(accessToken, businessId, 'GET');
  }

  async updateRegistrationIdentity(accessToken: string, input: UpdateBusinessRegistrationIdentityInput): Promise<BusinessRegistrationIdentity> {
    return this.request(accessToken, input.businessId, 'PUT', {
      registrationStatus: input.registrationStatus,
      registrationNumber: input.registrationNumber,
      legalName: input.legalName,
    });
  }

  private async request(
    accessToken: string,
    businessId: number,
    method: 'GET' | 'PUT',
    body?: { registrationStatus: 'registered' | 'unregistered' | null; registrationNumber: string | null; legalName: string | null },
  ): Promise<BusinessRegistrationIdentity> {
    if (!accessToken.trim() || !Number.isSafeInteger(businessId) || businessId <= 0) {
      throw new Error('Actor gateway request is invalid');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/v1/businesses/${businessId}/registration-identity`,
        {
          method,
          redirect: 'error',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new BusinessRegistrationIdentityGatewayError(response.status);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('registrationIdentity' in payload)) {
        throw new Error('Actor gateway response is invalid');
      }
      const value = payload.registrationIdentity;
      if (!value || typeof value !== 'object') throw new Error('Actor gateway response is invalid');
      const row = value as Record<string, unknown>;
      if (
        row.businessId !== businessId ||
        (row.registrationStatus !== null && row.registrationStatus !== 'registered' && row.registrationStatus !== 'unregistered') ||
        (row.registrationNumber !== null && typeof row.registrationNumber !== 'string') ||
        (row.legalName !== null && typeof row.legalName !== 'string') ||
        (row.updatedAt !== null && (typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))))
      ) throw new Error('Actor gateway response is invalid');
      return {
        businessId,
        registrationStatus: row.registrationStatus as BusinessRegistrationIdentity['registrationStatus'],
        registrationNumber: row.registrationNumber as string | null,
        legalName: row.legalName as string | null,
        updatedAt: row.updatedAt === null ? null : new Date(row.updatedAt as string),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
