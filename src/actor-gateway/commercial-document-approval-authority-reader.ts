import type { Pool, PoolClient } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';

export type CommercialDocumentApprovalAuthorityAction = 'grant' | 'revoke';
export type CommercialDocumentApprovalDocumentType = 'trial_terms' | 'subscription_terms';

export interface ManageCommercialDocumentApprovalAuthorityInput {
  action: CommercialDocumentApprovalAuthorityAction;
  documentType: CommercialDocumentApprovalDocumentType;
  documentKey: string;
  jurisdictionCountryId: number | null;
  reason: string;
}

export interface CommercialDocumentApprovalAuthorityResult {
  authorityId: string;
  authorityEventId: number;
  eventType: 'granted' | 'revoked';
}

export interface CommercialDocumentApprovalAuthorityReader {
  manage(
    actorAccountId: number,
    input: ManageCommercialDocumentApprovalAuthorityInput,
  ): Promise<CommercialDocumentApprovalAuthorityResult>;
}

type ConnectablePool = Pick<Pool, 'connect'>;

export class PostgresCommercialDocumentApprovalAuthorityReader
implements CommercialDocumentApprovalAuthorityReader {
  private readonly key: Buffer;

  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  async manage(
    actorAccountId: number,
    input: ManageCommercialDocumentApprovalAuthorityInput,
  ): Promise<CommercialDocumentApprovalAuthorityResult> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const assertion = createActorGatewayAssertion(
        this.key,
        actorAccountId,
        'commercial.document.authority.manage',
        {
          action: input.action,
          documentType: input.documentType,
          documentKey: input.documentKey,
          jurisdictionCountryId: input.jurisdictionCountryId,
          reason: input.reason,
        },
      );
      const result = await client.query<{
        authority_id: string;
        authority_event_id: string | number;
        event_type: 'granted' | 'revoked';
      }>(
        'SELECT * FROM ghm.gateway_manage_commercial_document_approval_authority($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          actorAccountId,
          assertion.issuedAt,
          assertion.nonce,
          assertion.context,
          assertion.signature,
          input.action,
          input.documentType,
          input.documentKey,
          input.jurisdictionCountryId,
          input.reason,
        ],
      );
      if (result.rowCount !== 1) {
        throw Object.assign(new Error('Commercial approval authority operation returned no row'), { code: 'P0001' });
      }
      const row = result.rows[0];
      await client.query('COMMIT');
      return {
        authorityId: row.authority_id,
        authorityEventId: Number(row.authority_event_id),
        eventType: row.event_type,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
