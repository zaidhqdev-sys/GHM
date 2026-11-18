import type { Pool } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';
import {
  parseDeleteResult, parseTrackingList, parseTrackingRecord,
  type CreateTrackingInput, type ListQuery, type TrackingRecord, type UpdatePatch,
} from '../tender/tracking-contract';

type ConnectablePool = Pick<Pool, 'connect'>;

export interface TenderRequestIds { requestId: string; clientCorrelationId: string | null }

export interface TenderTrackingGatewayReader {
  create(actor: number, businessId: number, input: CreateTrackingInput, ids: TenderRequestIds): Promise<TrackingRecord>;
  list(actor: number, businessId: number, query: ListQuery): Promise<{ items: TrackingRecord[]; nextAfter: number | null }>;
  get(actor: number, businessId: number, id: number): Promise<TrackingRecord>;
  update(actor: number, businessId: number, id: number, patch: UpdatePatch, ids: TenderRequestIds): Promise<TrackingRecord>;
  archive(actor: number, businessId: number, id: number, ids: TenderRequestIds): Promise<TrackingRecord>;
  remove(actor: number, businessId: number, id: number, ids: TenderRequestIds): Promise<{ id: number; businessId: number; deleted: true }>;
}

/** Output from the database that does not match the contract is a server fault, never passed on. */
export class TenderGatewayContractError extends Error {
  constructor() { super('Tender gateway database result violated the contract'); this.name = 'TenderGatewayContractError'; }
}

export class PostgresTenderTrackingGatewayReader implements TenderTrackingGatewayReader {
  private readonly key: Buffer;
  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  private async run(
    actor: number,
    operation: string,
    context: Record<string, unknown>,
    fn: string,
    tail: unknown[],
  ): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const a = createActorGatewayAssertion(this.key, actor, operation, context);
      const placeholders = Array.from({ length: 5 + tail.length }, (_, i) => `$${i + 1}`).join(',');
      const result = await client.query(
        `SELECT ghm.${fn}(${placeholders}) AS result`,
        [actor, a.issuedAt, a.nonce, a.context, a.signature, ...tail],
      );
      await client.query('COMMIT');
      return result.rows[0]?.result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private record(v: unknown): TrackingRecord {
    const r = parseTrackingRecord(v);
    if (!r.ok) throw new TenderGatewayContractError();
    return r.value;
  }

  async create(actor: number, businessId: number, i: CreateTrackingInput, ids: TenderRequestIds): Promise<TrackingRecord> {
    const context = {
      businessId, title: i.title, referenceNumber: i.referenceNumber, issuerName: i.issuerName,
      sourceUrl: i.sourceUrl, closingAt: i.closingAt, requestId: ids.requestId, clientCorrelationId: ids.clientCorrelationId,
    };
    return this.record(await this.run(actor, 'tender.tracking.create', context, 'gateway_create_tender_tracking',
      [businessId, i.title, i.referenceNumber, i.issuerName, i.sourceUrl, i.closingAt, ids.requestId, ids.clientCorrelationId]));
  }

  async list(actor: number, businessId: number, q: ListQuery) {
    const context = { businessId, stage: q.stage, limit: q.limit, after: q.after };
    const r = parseTrackingList(await this.run(actor, 'tender.tracking.list', context, 'gateway_list_tender_tracking',
      [businessId, q.stage, q.limit, q.after]));
    if (!r.ok) throw new TenderGatewayContractError();
    return r.value;
  }

  async get(actor: number, businessId: number, id: number): Promise<TrackingRecord> {
    return this.record(await this.run(actor, 'tender.tracking.get', { businessId, trackingId: id },
      'gateway_get_tender_tracking', [businessId, id]));
  }

  async update(actor: number, businessId: number, id: number, patch: UpdatePatch, ids: TenderRequestIds): Promise<TrackingRecord> {
    const context = { businessId, trackingId: id, patch, requestId: ids.requestId, clientCorrelationId: ids.clientCorrelationId };
    return this.record(await this.run(actor, 'tender.tracking.update', context, 'gateway_update_tender_tracking',
      [businessId, id, JSON.stringify(patch), ids.requestId, ids.clientCorrelationId]));
  }

  async archive(actor: number, businessId: number, id: number, ids: TenderRequestIds): Promise<TrackingRecord> {
    const context = { businessId, trackingId: id, requestId: ids.requestId, clientCorrelationId: ids.clientCorrelationId };
    return this.record(await this.run(actor, 'tender.tracking.archive', context, 'gateway_archive_tender_tracking',
      [businessId, id, ids.requestId, ids.clientCorrelationId]));
  }

  async remove(actor: number, businessId: number, id: number, ids: TenderRequestIds) {
    const context = { businessId, trackingId: id, requestId: ids.requestId, clientCorrelationId: ids.clientCorrelationId };
    const r = parseDeleteResult(await this.run(actor, 'tender.tracking.delete', context, 'gateway_delete_tender_tracking',
      [businessId, id, ids.requestId, ids.clientCorrelationId]));
    if (!r.ok) throw new TenderGatewayContractError();
    return r.value;
  }
}
