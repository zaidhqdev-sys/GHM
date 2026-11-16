import type { Pool, PoolClient } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';

export interface ApproveCommercialDocumentVersionInput {
  documentVersionId: number;
  reason: string;
}

export interface CommercialDocumentApprovalResult {
  statusEventId: number;
  documentVersionId: number;
  authorityEventId: number;
  status: 'approved';
}

export interface CommercialDocumentApprovalReader {
  approve(
    actorAccountId: number,
    input: ApproveCommercialDocumentVersionInput,
  ): Promise<CommercialDocumentApprovalResult>;
}

type ConnectablePool = Pick<Pool, 'connect'>;

export class PostgresCommercialDocumentApprovalReader implements CommercialDocumentApprovalReader {
  private readonly key: Buffer;

  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  async approve(
    actorAccountId: number,
    input: ApproveCommercialDocumentVersionInput,
  ): Promise<CommercialDocumentApprovalResult> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const assertion = createActorGatewayAssertion(
        this.key,
        actorAccountId,
        'commercial.document.status.approve',
        {
          documentVersionId: input.documentVersionId,
          reason: input.reason,
        },
      );
      const result = await client.query<{
        status_event_id: string | number;
        document_version_id: string | number;
        authority_event_id: string | number;
        status: 'approved';
      }>(
        'SELECT * FROM ghm.gateway_approve_commercial_document_version($1,$2,$3,$4,$5,$6,$7)',
        [
          actorAccountId,
          assertion.issuedAt,
          assertion.nonce,
          assertion.context,
          assertion.signature,
          input.documentVersionId,
          input.reason,
        ],
      );
      if (result.rowCount !== 1) {
        throw Object.assign(new Error('Commercial document approval returned no row'), { code: 'P0001' });
      }
      const row = result.rows[0];
      await client.query('COMMIT');
      return {
        statusEventId: Number(row.status_event_id),
        documentVersionId: Number(row.document_version_id),
        authorityEventId: Number(row.authority_event_id),
        status: row.status,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
