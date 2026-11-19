import { isDeepStrictEqual } from 'node:util';
import type { Pool } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';
import { TenderGatewayContractError, type TenderRequestIds } from './tender-tracking-reader';
import {
  parseAnalysisDelete, parseAnalysisList, parseAnalysisRecord,
  type AnalysisListQuery, type AnalysisMetadata, type AnalysisRecord, type CreateAnalysisInput,
} from '../tender/analysis-contract';

type ConnectablePool = Pick<Pool, 'connect'>;

export interface TenderAnalysisGatewayReader {
  create(actor: number, businessId: number, input: CreateAnalysisInput, ids: TenderRequestIds): Promise<AnalysisRecord>;
  list(actor: number, businessId: number, query: AnalysisListQuery): Promise<{ items: AnalysisMetadata[]; nextAfter: number | null }>;
  get(actor: number, businessId: number, id: number): Promise<AnalysisRecord>;
  remove(actor: number, businessId: number, id: number, ids: TenderRequestIds): Promise<{ id: number; businessId: number; deleted: true }>;
}

/**
 * Saved analyses behind the Actor Gateway. Every result is validated against the version-2
 * contract BEFORE the transaction commits, so a database that returned something outside the
 * contract rolls back instead of persisting it, and nothing outside the contract is ever
 * returned to the caller.
 */
export class PostgresTenderAnalysisGatewayReader implements TenderAnalysisGatewayReader {
  private readonly key: Buffer;
  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  private async run<T>(
    actor: number,
    operation: string,
    context: Record<string, unknown>,
    fn: string,
    tail: unknown[],
    validate: (raw: unknown) => T,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const a = createActorGatewayAssertion(this.key, actor, operation, context);
      const placeholders = Array.from({ length: 5 + tail.length }, (_, i) => `$${i + 1}`).join(',');
      const result = await client.query(
        `SELECT ghm.${fn}(${placeholders}) AS result`,
        [actor, a.issuedAt, a.nonce, a.context, a.signature, ...tail],
      );
      const checked = validate(result.rows[0]?.result);
      await client.query('COMMIT');
      return checked;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private static record(raw: unknown): AnalysisRecord {
    const r = parseAnalysisRecord(raw);
    if (!r.ok) throw new TenderGatewayContractError();
    return r.value;
  }

  async create(actor: number, businessId: number, i: CreateAnalysisInput, ids: TenderRequestIds): Promise<AnalysisRecord> {
    const context = {
      businessId, trackingId: i.trackingId, model: i.model, promptVersion: i.promptVersion,
      documentSha256: i.documentSha256, documentHashVersion: i.documentHashVersion, result: i.result,
      requestId: ids.requestId, clientCorrelationId: ids.clientCorrelationId,
    };
    return this.run(actor, 'tender.analysis.create', context, 'gateway_create_tender_analysis',
      [businessId, i.trackingId, i.model, i.promptVersion, i.documentSha256, JSON.stringify(i.result), ids.requestId, ids.clientCorrelationId],
      raw => {
        const record = PostgresTenderAnalysisGatewayReader.record(raw);
        // What was stored must be what was sent: status, coverage, evidence offsets, truncation.
        if (record.businessId !== businessId || record.createdBy !== actor || record.trackingId !== i.trackingId
          || record.model !== i.model || record.promptVersion !== i.promptVersion
          || record.documentSha256 !== i.documentSha256 || !isDeepStrictEqual(record.result, i.result)) {
          throw new TenderGatewayContractError();
        }
        return record;
      });
  }

  async list(actor: number, businessId: number, q: AnalysisListQuery) {
    return this.run(actor, 'tender.analysis.list', { businessId, limit: q.limit, after: q.after },
      'gateway_list_tender_analysis', [businessId, q.limit, q.after], raw => {
        const r = parseAnalysisList(raw);
        if (!r.ok || r.value.items.some(item => item.businessId !== businessId)) throw new TenderGatewayContractError();
        return r.value;
      });
  }

  async get(actor: number, businessId: number, id: number): Promise<AnalysisRecord> {
    return this.run(actor, 'tender.analysis.get', { businessId, analysisId: id },
      'gateway_get_tender_analysis', [businessId, id], raw => {
        const record = PostgresTenderAnalysisGatewayReader.record(raw);
        if (record.id !== id || record.businessId !== businessId) throw new TenderGatewayContractError();
        return record;
      });
  }

  async remove(actor: number, businessId: number, id: number, ids: TenderRequestIds) {
    const context = { businessId, analysisId: id, requestId: ids.requestId, clientCorrelationId: ids.clientCorrelationId };
    return this.run(actor, 'tender.analysis.delete', context, 'gateway_delete_tender_analysis',
      [businessId, id, ids.requestId, ids.clientCorrelationId], raw => {
        const r = parseAnalysisDelete(raw);
        if (!r.ok || r.value.id !== id || r.value.businessId !== businessId) throw new TenderGatewayContractError();
        return r.value;
      });
  }
}
