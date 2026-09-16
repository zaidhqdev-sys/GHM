import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { assertRole } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  CreateSupportRequestInput,
  ListSupportRequestsOptions,
  SupportRequest,
  SupportRequestCategory,
  SupportRequestMessage,
  SupportRequestRepository,
  SupportRequestStatus,
  UpdateSupportRequestStatusInput,
} from './contracts';

const REQUEST_COLUMNS = `id, account_id, business_id, category, subject, description, priority, status, resolution_summary, resolved_at, closed_at, created_at, updated_at`;
const MESSAGE_COLUMNS = `id, support_request_id, account_id, sender_kind, body, created_at`;
const CATEGORIES: readonly SupportRequestCategory[] = ['account', 'business', 'directory', 'marketplace', 'workspace', 'trial_and_commercial', 'technical', 'other'];
const STATUSES: readonly SupportRequestStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

const assertPositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`Invalid ${field}`);
  return value as number;
};

const normalizeText = (value: unknown, field: string, min: number, max: number): string => {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new Error(`${field} must be between ${min} and ${max} characters`);
  return normalized;
};

const mapRequest = (row: any): SupportRequest => ({
  id: Number(row.id), accountId: Number(row.account_id), businessId: row.business_id === null ? null : Number(row.business_id),
  category: row.category, subject: row.subject, description: row.description, priority: row.priority, status: row.status,
  resolutionSummary: row.resolution_summary, resolvedAt: row.resolved_at, closedAt: row.closed_at, createdAt: row.created_at, updatedAt: row.updated_at,
});

const mapMessage = (row: any): SupportRequestMessage => ({
  id: Number(row.id), supportRequestId: Number(row.support_request_id), accountId: Number(row.account_id),
  senderKind: row.sender_kind, body: row.body, createdAt: row.created_at,
});

const normalizeCreate = (input: CreateSupportRequestInput) => {
  if (!input || typeof input !== 'object') throw new Error('Support Request input is required');
  if (!CATEGORIES.includes(input.category)) throw new Error('Invalid Support Request category');
  return {
    businessId: input.businessId === undefined || input.businessId === null ? null : assertPositiveId(input.businessId, 'businessId'),
    category: input.category,
    subject: normalizeText(input.subject, 'subject', 3, 160),
    description: normalizeText(input.description, 'description', 10, 4000),
  };
};

const normalizeStatusInput = (input: UpdateSupportRequestStatusInput) => {
  if (!input || !STATUSES.includes(input.status)) throw new Error('Invalid Support Request status');
  if (input.status === 'resolved' || input.status === 'closed') {
    return { status: input.status, resolutionSummary: normalizeText(input.resolutionSummary, 'resolutionSummary', 1, 2000) };
  }
  if (input.resolutionSummary !== undefined && input.resolutionSummary !== null) throw new Error('Resolution summary is only valid for resolved or closed requests');
  return { status: input.status, resolutionSummary: null };
};

const assertRequestOwner = async (client: PoolClient, context: AuthContext, requestId: number): Promise<SupportRequest> => {
  const result = await client.query(`SELECT ${REQUEST_COLUMNS} FROM ghm.support_request WHERE id = $1 AND account_id = $2`, [requestId, context.userId]);
  if (result.rowCount !== 1) throw new Error('Support Request not found');
  return mapRequest(result.rows[0]);
};

const assertBusinessMember = async (client: PoolClient, accountId: number, businessId: number): Promise<void> => {
  const result = await client.query(`SELECT 1 FROM ghm.business_membership WHERE business_id = $1 AND account_id = $2 AND membership_status = 'active' LIMIT 1`, [businessId, accountId]);
  if (result.rowCount !== 1) throw new Error('Business membership required');
};

export class PostgresSupportRequestRepository implements SupportRequestRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async createSupportRequest(context: AuthContext, input: CreateSupportRequestInput): Promise<SupportRequest> {
    assertRole(context, 'customer');
    const normalized = normalizeCreate(input);
    return withAuthorizedTransaction(context, async client => {
      const account = await client.query(`SELECT 1 FROM ghm.account_identity WHERE id = $1 LIMIT 1`, [context.userId]);
      if (account.rowCount !== 1) throw new Error('Account not found');
      if (normalized.businessId !== null) await assertBusinessMember(client, context.userId, normalized.businessId);

      const requestResult = await client.query(
        `INSERT INTO ghm.support_request (account_id, business_id, category, subject, description)
         VALUES ($1,$2,$3,$4,$5) RETURNING ${REQUEST_COLUMNS}`,
        [context.userId, normalized.businessId, normalized.category, normalized.subject, normalized.description],
      );
      if (requestResult.rowCount !== 1) throw new Error('Support Request creation failed');
      const request = mapRequest(requestResult.rows[0]);

      await client.query(
        `INSERT INTO ghm.support_request_message (support_request_id, account_id, sender_kind, body)
         VALUES ($1,$2,'customer',$3)`,
        [request.id, context.userId, normalized.description],
      );
      return request;
    }, this.transactionPool);
  }

  async getSupportRequest(context: AuthContext, requestId: number): Promise<SupportRequest | null> {
    assertPositiveId(requestId, 'requestId');
    return withAuthorizedTransaction(context, async client => {
      if (context.role === 'admin') {
        const result = await client.query(`SELECT ${REQUEST_COLUMNS} FROM ghm.support_request WHERE id = $1`, [requestId]);
        return result.rowCount === 1 ? mapRequest(result.rows[0]) : null;
      }
      const result = await client.query(`SELECT ${REQUEST_COLUMNS} FROM ghm.support_request WHERE id = $1 AND account_id = $2`, [requestId, context.userId]);
      return result.rowCount === 1 ? mapRequest(result.rows[0]) : null;
    }, this.transactionPool);
  }

  async listSupportRequests(context: AuthContext, options: ListSupportRequestsOptions = {}): Promise<SupportRequest[]> {
    const limit = options.limit ?? 30;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid Support Request limit');
    if (options.status !== undefined && !STATUSES.includes(options.status)) throw new Error('Invalid Support Request status');

    return withAuthorizedTransaction(context, async client => {
      const params: unknown[] = [];
      const predicates: string[] = [];
      if (context.role === 'admin') {
        if (options.status !== undefined) { params.push(options.status); predicates.push(`status = $${params.length}`); }
      } else {
        params.push(context.userId); predicates.push(`account_id = $${params.length}`);
        if (options.status !== undefined) { params.push(options.status); predicates.push(`status = $${params.length}`); }
      }
      params.push(limit);
      const result = await client.query(`SELECT ${REQUEST_COLUMNS} FROM ghm.support_request WHERE ${predicates.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`, params);
      return result.rows.map(mapRequest);
    }, this.transactionPool);
  }

  async updateSupportRequestStatus(context: AuthContext, requestId: number, input: UpdateSupportRequestStatusInput): Promise<SupportRequest> {
    assertRole(context, 'admin');
    assertPositiveId(requestId, 'requestId');
    const normalized = normalizeStatusInput(input);
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `UPDATE ghm.support_request
            SET status = $2,
                resolution_summary = $3,
                resolved_at = CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at, now()) ELSE NULL END,
                closed_at = CASE WHEN $2 = 'closed' THEN COALESCE(closed_at, now()) ELSE NULL END,
                updated_at = now()
          WHERE id = $1
          RETURNING ${REQUEST_COLUMNS}`,
        [requestId, normalized.status, normalized.resolutionSummary],
      );
      if (result.rowCount !== 1) throw new Error('Support Request not found');
      return mapRequest(result.rows[0]);
    }, this.transactionPool);
  }

  async getMessages(context: AuthContext, requestId: number): Promise<SupportRequestMessage[]> {
    assertPositiveId(requestId, 'requestId');
    return withAuthorizedTransaction(context, async client => {
      if (context.role !== 'admin') await assertRequestOwner(client, context, requestId);
      else {
        const exists = await client.query(`SELECT 1 FROM ghm.support_request WHERE id = $1`, [requestId]);
        if (exists.rowCount !== 1) throw new Error('Support Request not found');
      }
      const result = await client.query(`SELECT ${MESSAGE_COLUMNS} FROM ghm.support_request_message WHERE support_request_id = $1 ORDER BY created_at ASC, id ASC`, [requestId]);
      return result.rows.map(mapMessage);
    }, this.transactionPool);
  }

  async replyAsCustomer(context: AuthContext, requestId: number, body: string): Promise<SupportRequestMessage> {
    assertRole(context, 'customer');
    return this.replyInTransaction(context, requestId, body, 'customer');
  }

  async replyAsAdmin(context: AuthContext, requestId: number, body: string): Promise<SupportRequestMessage> {
    assertRole(context, 'admin');
    return this.replyInTransaction(context, requestId, body, 'admin');
  }

  private async replyInTransaction(context: AuthContext, requestId: number, body: string, senderKind: 'customer' | 'admin'): Promise<SupportRequestMessage> {
    assertPositiveId(requestId, 'requestId');
    const normalizedBody = normalizeText(body, 'body', 1, 4000);
    return withAuthorizedTransaction(context, async client => {
      let request: SupportRequest;
      if (senderKind === 'admin') {
        const result = await client.query(`SELECT ${REQUEST_COLUMNS} FROM ghm.support_request WHERE id = $1 FOR UPDATE`, [requestId]);
        if (result.rowCount !== 1) throw new Error('Support Request not found');
        request = mapRequest(result.rows[0]);
      } else {
        request = await assertRequestOwner(client, context, requestId);
        await client.query(`SELECT id FROM ghm.support_request WHERE id = $1 FOR UPDATE`, [requestId]);
      }

      const result = await client.query(
        `INSERT INTO ghm.support_request_message (support_request_id, account_id, sender_kind, body)
         VALUES ($1,$2,$3,$4) RETURNING ${MESSAGE_COLUMNS}`,
        [requestId, context.userId, senderKind, normalizedBody],
      );

      if (senderKind === 'customer') {
        await client.query(`UPDATE ghm.support_request SET status = 'open', resolution_summary = NULL, resolved_at = NULL, closed_at = NULL, updated_at = now() WHERE id = $1`, [requestId]);
      } else if (request.status === 'resolved' || request.status === 'closed') {
        await client.query(`UPDATE ghm.support_request SET status = 'in_progress', resolution_summary = NULL, resolved_at = NULL, closed_at = NULL, updated_at = now() WHERE id = $1`, [requestId]);
      }

      if (result.rowCount !== 1) throw new Error('Support reply creation failed');
      return mapMessage(result.rows[0]);
    }, this.transactionPool);
  }
}
