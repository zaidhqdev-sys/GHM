import type {
  ConnectBusinessProvisioningGatewayClient,
  ConnectBusinessProvisioningInput,
  ConnectBusinessProvisioningResult,
} from '../integrations/connect/business-provisioning-contracts';
import { assertActorGatewayBaseUrl } from './actor-gateway-url';

export class ConnectBusinessProvisioningGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'ConnectBusinessProvisioningGatewayError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export class HttpConnectBusinessProvisioningGatewayClient implements ConnectBusinessProvisioningGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  async provisionOrResolve(
    accessToken: string,
    input: ConnectBusinessProvisioningInput,
  ): Promise<ConnectBusinessProvisioningResult> {
    const externalBusinessId = input.externalBusinessId.trim().toLowerCase();
    const name = input.name.trim();
    if (
      !accessToken.trim() ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(externalBusinessId) ||
      !name || name.length > 200
    ) {
      throw new Error('Connect Business gateway request is invalid');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/v1/connect/businesses/provision-or-resolve`,
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ externalBusinessId, name }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new ConnectBusinessProvisioningGatewayError(response.status);
      const payload: unknown = await response.json();
      if (
        !isRecord(payload) ||
        (payload.outcome !== 'resolved' && payload.outcome !== 'provisioned') ||
        !isRecord(payload.business) ||
        !Number.isSafeInteger(payload.business.id) ||
        !isRecord(payload.mapping) ||
        payload.mapping.externalBusinessId !== externalBusinessId ||
        payload.mapping.businessId !== payload.business.id ||
        typeof payload.business.createdAt !== 'string' ||
        typeof payload.business.updatedAt !== 'string' ||
        typeof payload.mapping.createdAt !== 'string' ||
        typeof payload.mapping.updatedAt !== 'string'
      ) {
        throw new Error('Actor gateway response is invalid');
      }
      return {
        outcome: payload.outcome,
        business: {
          ...payload.business,
          createdAt: new Date(payload.business.createdAt),
          updatedAt: new Date(payload.business.updatedAt),
        },
        mapping: {
          ...payload.mapping,
          createdAt: new Date(payload.mapping.createdAt),
          updatedAt: new Date(payload.mapping.updatedAt),
        },
      } as unknown as ConnectBusinessProvisioningResult;
    } finally {
      clearTimeout(timeout);
    }
  }
}
