import { assertActorGatewayBaseUrl } from './actor-gateway-url';
import type { BusinessHours } from '../resources/business-hours/contracts';
import type { ReplaceBusinessHoursInput } from '../resources/business-hours/contracts';

export interface BusinessHoursGatewayClient {
  list(accessToken: string, businessId: number): Promise<BusinessHours[]>;
  replace(accessToken: string, input: ReplaceBusinessHoursInput): Promise<BusinessHours[]>;
}

export class BusinessHoursGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'BusinessHoursGatewayError';
  }
}

export class HttpBusinessHoursGatewayClient implements BusinessHoursGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  async list(accessToken: string, businessId: number): Promise<BusinessHours[]> {
    if (!accessToken.trim()) throw new Error('Actor gateway bearer token is required');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/v1/businesses/${businessId}/hours`,
        {
          method: 'GET',
          redirect: 'error',
          headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new BusinessHoursGatewayError(response.status);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { hours?: unknown }).hours)) {
        throw new Error('Actor gateway response is invalid');
      }
      return (payload as { hours: BusinessHours[] }).hours;
    } finally {
      clearTimeout(timeout);
    }
  }

  async replace(accessToken: string, input: ReplaceBusinessHoursInput): Promise<BusinessHours[]> {
    if (!accessToken.trim()) throw new Error('Actor gateway bearer token is required');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, '')}/v1/businesses/${input.businessId}/hours`,
        {
          method: 'PUT',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            hours: input.hours.map(hour => ({
              day_of_week: hour.dayOfWeek,
              is_closed: hour.isClosed,
              open_time: hour.openTime ?? null,
              close_time: hour.closeTime ?? null,
            })),
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new BusinessHoursGatewayError(response.status);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { hours?: unknown }).hours)) {
        throw new Error('Actor gateway response is invalid');
      }
      return (payload as { hours: BusinessHours[] }).hours;
    } finally {
      clearTimeout(timeout);
    }
  }
}
