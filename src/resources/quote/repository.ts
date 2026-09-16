import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  CreateQuoteInput,
  Quote,
  QuoteId,
  QuoteLineItem,
  QuoteRepository,
  QuoteStatus,
} from './contracts';

const QUOTE_COLUMNS = `
  id,
  account_id,
  customer_id,
  customer_name,
  customer_phone,
  customer_email,
  description,
  amount,
  follow_up_date,
  status,
  reminder_id,
  reminder_date,
  notes,
  created_at,
  updated_at
`;

const LINE_COLUMNS = `
  id,
  quote_id,
  description,
  quantity,
  unit_price,
  catalog_item_id,
  created_at
`;

const ownerPredicate = (context: AuthContext, column = 'account_id'): string =>
  context.role === 'admin' ? '' : ` AND ${column} = $2`;

const ownerValues = (context: AuthContext, id: number): number[] =>
  context.role === 'admin' ? [id] : [id, context.userId];

const mapLineItem = (row: any): QuoteLineItem => ({
  id: Number(row.id),
  quoteId: Number(row.quote_id),
  description: row.description,
  quantity: Number(row.quantity),
  unitPrice: Number(row.unit_price),
  catalogItemId: row.catalog_item_id === null ? null : Number(row.catalog_item_id),
  createdAt: row.created_at,
});

const mapQuote = (row: any, lineItems: readonly QuoteLineItem[]): Quote => ({
  id: Number(row.id),
  accountId: Number(row.account_id),
  customerId: Number(row.customer_id),
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  customerEmail: row.customer_email,
  description: row.description,
  amount: Number(row.amount),
  followUpDate: row.follow_up_date,
  status: row.status,
  reminderId: row.reminder_id,
  reminderDate: row.reminder_date,
  notes: row.notes,
  lineItems,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const loadLineItems = async (client: PoolClient, quoteId: QuoteId): Promise<QuoteLineItem[]> => {
  const result = await client.query(
    `SELECT ${LINE_COLUMNS}
     FROM ghm.quote_line_item
     WHERE quote_id = $1
     ORDER BY id ASC`,
    [quoteId],
  );
  return result.rows.map(mapLineItem);
};

const loadQuote = async (client: PoolClient, context: AuthContext, quoteId: QuoteId): Promise<Quote | null> => {
  const result = await client.query(
    `SELECT ${QUOTE_COLUMNS}
     FROM ghm.quote
     WHERE id = $1${ownerPredicate(context)}`,
    ownerValues(context, quoteId),
  );
  if (result.rowCount !== 1) return null;
  return mapQuote(result.rows[0], await loadLineItems(client, quoteId));
};

export class PostgresQuoteRepository implements QuoteRepository {
  constructor(private readonly transactionPool?: TransactionPool | Pool) {}

  async createQuote(context: AuthContext, input: CreateQuoteInput): Promise<Quote> {
    return withAuthorizedTransaction(context, async client => {
      const customer = await client.query(
        `SELECT id, name, phone, email, status
         FROM ghm.customer
         WHERE id = $1 AND account_id = $2
         FOR SHARE`,
        [input.customerId, context.userId],
      );
      if (customer.rowCount !== 1) throw new Error('Customer not found or ownership required');
      if (customer.rows[0].status !== 'active') throw new Error('Customer must be active');

      const customerRow = customer.rows[0];
      const amount = input.lineItems.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
      const description = input.lineItems.map(item => item.description.trim()).join(', ');

      const quoteResult = await client.query(
        `INSERT INTO ghm.quote
           (account_id, customer_id, customer_name, customer_phone, customer_email, description, amount, follow_up_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${QUOTE_COLUMNS}`,
        [context.userId, input.customerId, customerRow.name, customerRow.phone, customerRow.email, description, amount, input.followUpDate],
      );
      if (quoteResult.rowCount !== 1) throw new Error('Quote creation failed');

      const quoteId = Number(quoteResult.rows[0].id);
      for (const item of input.lineItems) {
        await client.query(
          `INSERT INTO ghm.quote_line_item
             (quote_id, description, quantity, unit_price, catalog_item_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [quoteId, item.description.trim(), item.quantity, item.unitPrice, item.catalogItemId ?? null],
        );
      }

      return mapQuote(quoteResult.rows[0], await loadLineItems(client, quoteId));
    }, this.transactionPool);
  }

  async getQuote(context: AuthContext, quoteId: QuoteId): Promise<Quote | null> {
    return withAuthorizedTransaction(context, client => loadQuote(client, context, quoteId), this.transactionPool);
  }

  async listQuotes(context: AuthContext): Promise<Quote[]> {
    return withAuthorizedTransaction(context, async client => {
      const values: number[] = context.role === 'admin' ? [] : [context.userId];
      const where = context.role === 'admin' ? '' : 'WHERE account_id = $1';
      const result = await client.query(
        `SELECT ${QUOTE_COLUMNS}
         FROM ghm.quote
         ${where}
         ORDER BY created_at DESC, id DESC`,
        values,
      );
      const quotes: Quote[] = [];
      for (const row of result.rows) quotes.push(mapQuote(row, await loadLineItems(client, Number(row.id))));
      return quotes;
    }, this.transactionPool);
  }

  async setQuoteStatus(context: AuthContext, quoteId: QuoteId, status: QuoteStatus): Promise<Quote> {
    return withAuthorizedTransaction(context, async client => {
      const existing = await loadQuote(client, context, quoteId);
      if (!existing) throw new Error('Quote not found or ownership required');
      if (existing.status === status) return existing;

      const result = await client.query(
        `UPDATE ghm.quote
         SET status = $1, reminder_id = NULL, reminder_date = NULL, updated_at = now()
         WHERE id = $2${context.role === 'admin' ? '' : ' AND account_id = $3'}
         RETURNING ${QUOTE_COLUMNS}`,
        context.role === 'admin' ? [status, quoteId] : [status, quoteId, context.userId],
      );
      if (result.rowCount !== 1) throw new Error('Quote status update failed');
      return mapQuote(result.rows[0], existing.lineItems);
    }, this.transactionPool);
  }

  async setQuoteNotes(context: AuthContext, quoteId: QuoteId, notes: string): Promise<Quote> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `UPDATE ghm.quote
         SET notes = $1, updated_at = now()
         WHERE id = $2${context.role === 'admin' ? '' : ' AND account_id = $3'}
         RETURNING ${QUOTE_COLUMNS}`,
        context.role === 'admin' ? [notes, quoteId] : [notes, quoteId, context.userId],
      );
      if (result.rowCount !== 1) throw new Error('Quote not found or ownership required');
      return mapQuote(result.rows[0], await loadLineItems(client, quoteId));
    }, this.transactionPool);
  }
}
