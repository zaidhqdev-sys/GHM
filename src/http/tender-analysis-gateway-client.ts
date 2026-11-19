import { assertActorGatewayBaseUrl } from './actor-gateway-url';
import {
  parseAnalysisDelete, parseAnalysisList, parseAnalysisRecord,
  type AnalysisListQuery, type AnalysisMetadata, type AnalysisRecord, type CreateAnalysisInput,
} from '../tender/analysis-contract';

export class TenderAnalysisGatewayError extends Error {
  constructor(readonly status: number) {
    super('Actor gateway request failed');
    this.name = 'TenderAnalysisGatewayError';
  }
}

export interface TenderAnalysisGatewayClient {
  create(token: string, businessId: number, input: CreateAnalysisInput, correlationId: string | null): Promise<AnalysisRecord>;
  list(token: string, businessId: number, query: AnalysisListQuery, correlationId: string | null): Promise<{ items: AnalysisMetadata[]; nextAfter: number | null }>;
  get(token: string, businessId: number, id: number, correlationId: string | null): Promise<AnalysisRecord>;
  remove(token: string, businessId: number, id: number, correlationId: string | null): Promise<{ id: number; businessId: number; deleted: true }>;
}

/**
 * Forwards the caller's own bearer token and the path Business id. It never supplies an actor,
 * account, role or membership. Responses are validated with the version-2 contract before
 * they are returned: a Gateway response outside the contract is a server fault.
 */
export class HttpTenderAnalysisGatewayClient implements TenderAnalysisGatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    assertActorGatewayBaseUrl(baseUrl);
  }

  private async call(token: string, method: string, path: string, body: unknown, correlationId: string | null): Promise<unknown> {
    if (!token.trim()) throw new Error('Actor gateway bearer token is required');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: 'application/json' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (correlationId) headers['x-request-id'] = correlationId;
      const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method, redirect: 'error', headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new TenderAnalysisGatewayError(response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private static record(v: unknown): AnalysisRecord {
    const wrapper = v as { analysis?: unknown } | null;
    const r = parseAnalysisRecord(wrapper && typeof wrapper === 'object' ? wrapper.analysis : undefined);
    if (!r.ok) throw new Error('Actor gateway response is invalid');
    return r.value;
  }

  private base(businessId: number): string {
    return `/v1/businesses/${businessId}/tenders/analyses`;
  }

  async create(t: string, b: number, input: CreateAnalysisInput, c: string | null) {
    const body: Record<string, unknown> = {
      model: input.model, promptVersion: input.promptVersion, documentSha256: input.documentSha256,
      documentHashVersion: input.documentHashVersion, result: input.result,
    };
    if (input.trackingId !== null) body.trackingId = String(input.trackingId);
    return HttpTenderAnalysisGatewayClient.record(await this.call(t, 'POST', this.base(b), body, c));
  }

  async list(t: string, b: number, q: AnalysisListQuery, c: string | null) {
    const params = new URLSearchParams({ limit: String(q.limit) });
    if (q.after !== null) params.set('after', String(q.after));
    const r = parseAnalysisList(await this.call(t, 'GET', `${this.base(b)}?${params.toString()}`, undefined, c));
    if (!r.ok) throw new Error('Actor gateway response is invalid');
    return r.value;
  }

  async get(t: string, b: number, id: number, c: string | null) {
    return HttpTenderAnalysisGatewayClient.record(await this.call(t, 'GET', `${this.base(b)}/${id}`, undefined, c));
  }

  async remove(t: string, b: number, id: number, c: string | null) {
    const v = (await this.call(t, 'DELETE', `${this.base(b)}/${id}`, undefined, c)) as { deleted?: unknown } | null;
    const r = parseAnalysisDelete(v && typeof v === 'object' ? v.deleted : undefined);
    if (!r.ok) throw new Error('Actor gateway response is invalid');
    return r.value;
  }
}
