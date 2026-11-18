import { assertActorGatewayBaseUrl } from './actor-gateway-url';
import {
  parseDeleteResult, parseTrackingList, parseTrackingRecord,
  type CreateTrackingInput, type ListQuery, type TrackingRecord, type UpdatePatch,
} from '../tender/tracking-contract';

export class TenderTrackingGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'TenderTrackingGatewayError';
  }
}

export interface TenderTrackingGatewayClient {
  create(token: string, businessId: number, input: CreateTrackingInput, correlationId: string | null): Promise<TrackingRecord>;
  list(token: string, businessId: number, query: ListQuery, correlationId: string | null): Promise<{ items: TrackingRecord[]; nextAfter: number | null }>;
  get(token: string, businessId: number, id: number, correlationId: string | null): Promise<TrackingRecord>;
  update(token: string, businessId: number, id: number, patch: UpdatePatch, correlationId: string | null): Promise<TrackingRecord>;
  archive(token: string, businessId: number, id: number, correlationId: string | null): Promise<TrackingRecord>;
  remove(token: string, businessId: number, id: number, correlationId: string | null): Promise<{ id: number; businessId: number; deleted: true }>;
}

export class HttpTenderTrackingGatewayClient implements TenderTrackingGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  private async call(
    token: string,
    method: string,
    path: string,
    body: unknown,
    correlationId: string | null,
  ): Promise<unknown> {
    if (!token.trim()) throw new Error('Actor gateway bearer token is required');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (correlationId) headers['x-request-id'] = correlationId;
      const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        redirect: 'error',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new TenderTrackingGatewayError(response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private static record(v: unknown): TrackingRecord {
    const wrapper = v as { tracking?: unknown } | null;
    const r = parseTrackingRecord(wrapper && typeof wrapper === 'object' ? wrapper.tracking : undefined);
    if (!r.ok) throw new Error('Actor gateway response is invalid');
    return r.value;
  }

  private base(businessId: number): string {
    return `/v1/businesses/${businessId}/tenders/tracking`;
  }

  async create(t: string, b: number, input: CreateTrackingInput, c: string | null) {
    const body: Record<string, unknown> = { title: input.title };
    for (const k of ['referenceNumber', 'issuerName', 'sourceUrl', 'closingAt'] as const) if (input[k] !== null) body[k] = input[k];
    return HttpTenderTrackingGatewayClient.record(await this.call(t, 'POST', this.base(b), body, c));
  }

  async list(t: string, b: number, q: ListQuery, c: string | null) {
    const params = new URLSearchParams({ limit: String(q.limit) });
    if (q.stage) params.set('stage', q.stage);
    if (q.after !== null) params.set('after', String(q.after));
    const r = parseTrackingList(await this.call(t, 'GET', `${this.base(b)}?${params.toString()}`, undefined, c));
    if (!r.ok) throw new Error('Actor gateway response is invalid');
    return r.value;
  }

  async get(t: string, b: number, id: number, c: string | null) {
    return HttpTenderTrackingGatewayClient.record(await this.call(t, 'GET', `${this.base(b)}/${id}`, undefined, c));
  }

  async update(t: string, b: number, id: number, patch: UpdatePatch, c: string | null) {
    return HttpTenderTrackingGatewayClient.record(await this.call(t, 'PATCH', `${this.base(b)}/${id}`, patch, c));
  }

  async archive(t: string, b: number, id: number, c: string | null) {
    return HttpTenderTrackingGatewayClient.record(await this.call(t, 'POST', `${this.base(b)}/${id}/archive`, {}, c));
  }

  async remove(t: string, b: number, id: number, c: string | null) {
    const v = (await this.call(t, 'DELETE', `${this.base(b)}/${id}`, undefined, c)) as { deleted?: unknown } | null;
    const r = parseDeleteResult(v && typeof v === 'object' ? v.deleted : undefined);
    if (!r.ok) throw new Error('Actor gateway response is invalid');
    return r.value;
  }
}
