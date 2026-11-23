import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction, withTenantTransaction } from '../../db/authorized-transaction';
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
  business_id,
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
  business_id,
  business_offering_id,
  currency_code,
  price_unit,
  created_at
`;

const ownerPredicate = (context: AuthContext, column = 'account_id'): string =>
  context.role === 'admin' ? ' AND business_id IS NULL' : ` AND business_id IS NULL AND ${column} = $2`;

const ownerValues = (context: AuthContext, id: number): number[] =>
  context.role === 'admin' ? [id] : [id, context.userId];

const mapLineItem = (row: any): QuoteLineItem => ({
  id: Number(row.id),
  quoteId: Number(row.quote_id),
  description: row.description,
  quantity: Number(row.quantity),
  unitPrice: Number(row.unit_price),
  catalogItemId: row.catalog_item_id === null ? null : Number(row.catalog_item_id),
  businessOfferingId: row.business_offering_id === null ? null : String(row.business_offering_id),
  currencyCode: row.currency_code == null ? null : String(row.currency_code),
  priceUnit: row.price_unit == null ? null : String(row.price_unit),
  createdAt: row.created_at,
});

const mapQuote = (row: any, lineItems: readonly QuoteLineItem[]): Quote => ({
  id: Number(row.id),
  accountId: Number(row.account_id),
  businessId: row.business_id === null || row.business_id === undefined ? null : Number(row.business_id),
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

const loadQuote = async (
  client: PoolClient,
  context: AuthContext,
  quoteId: QuoteId,
  lock = false,
): Promise<Quote | null> => {
  const result = await client.query(
    `SELECT ${QUOTE_COLUMNS}
     FROM ghm.quote
     WHERE id = $1${ownerPredicate(context)}${lock ? ' FOR UPDATE' : ''}`,
    ownerValues(context, quoteId),
  );
  if (result.rowCount !== 1) return null;
  return mapQuote(result.rows[0], await loadLineItems(client, quoteId));
};

export class PostgresQuoteRepository implements QuoteRepository {
  constructor(private readonly transactionPool?: TransactionPool | Pool) {}


  async createBusinessQuote(context: AuthContext, businessId: number, input: CreateQuoteInput): Promise<Quote> {
    return withTenantTransaction(context, businessId, async (client, _context, tenant) => {
      const customer = await client.query(
        `SELECT id, name, phone, email, status FROM ghm.customer
         WHERE id = $1 AND business_id = $2 FOR SHARE`,
        [input.customerId, tenant.businessId],
      );
      if (customer.rowCount !== 1) throw new Error('Customer not found or ownership required');
      if (customer.rows[0].status !== 'active') throw new Error('Customer must be active');
      const customerRow = customer.rows[0];
      const resolvedLines = [];
      for (const item of input.lineItems) {
        if (item.businessOfferingId) {
          const offering = await client.query(
            `SELECT id, name, description, price_amount, currency_code, price_unit FROM ghm.business_offering WHERE id = $1 AND business_id = $2 AND is_active = true FOR SHARE`,
            [item.businessOfferingId, tenant.businessId],
          );
          if (offering.rowCount !== 1) throw new Error('Business Offering not found or ownership required');
          const row = offering.rows[0];
          if (row.price_amount === null) throw new Error('Business Offering must have a price before quoting');
          resolvedLines.push({ description: String(row.description ?? row.name), quantity: item.quantity, unitPrice: Number(row.price_amount), businessOfferingId: String(row.id), currencyCode: String(row.currency_code), priceUnit: row.price_unit === null ? null : String(row.price_unit) });
        } else {
          resolvedLines.push({ description: item.description.trim(), quantity: item.quantity, unitPrice: item.unitPrice, businessOfferingId: null, currencyCode: null, priceUnit: null });
        }
      }
      const amount = resolvedLines.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
      const description = resolvedLines.map(item => item.description.trim()).join(', ');
      const quoteResult = await client.query(
        `INSERT INTO ghm.quote
          (account_id, business_id, customer_id, customer_name, customer_phone, customer_email, description, amount, follow_up_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${QUOTE_COLUMNS}`,
        [tenant.accountId, tenant.businessId, input.customerId, customerRow.name, customerRow.phone, customerRow.email, description, amount, input.followUpDate],
      );
      if (quoteResult.rowCount !== 1) throw new Error('Quote creation failed');
      const quoteId = Number(quoteResult.rows[0].id);
      for (const item of resolvedLines) {
        await client.query(
          `INSERT INTO ghm.quote_line_item (quote_id, description, quantity, unit_price, catalog_item_id, business_id, business_offering_id, currency_code, price_unit)
           VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)`,
          [quoteId, item.description, item.quantity, item.unitPrice, tenant.businessId, item.businessOfferingId, item.currencyCode, item.priceUnit],
        );
      }
      return mapQuote(quoteResult.rows[0], await loadLineItems(client, quoteId));
    }, this.transactionPool);
  }

  async getBusinessQuote(context: AuthContext, businessId: number, quoteId: QuoteId): Promise<Quote | null> {
    return withTenantTransaction(context, businessId, async client => {
      const result = await client.query(
        `SELECT ${QUOTE_COLUMNS} FROM ghm.quote WHERE business_id = $1 AND id = $2`,
        [businessId, quoteId],
      );
      if (result.rowCount !== 1) return null;
      return mapQuote(result.rows[0], await loadLineItems(client, quoteId));
    }, this.transactionPool);
  }

  async listBusinessQuotes(context: AuthContext, businessId: number): Promise<Quote[]> {
    return withTenantTransaction(context, businessId, async client => {
      const result = await client.query(
        `SELECT ${QUOTE_COLUMNS} FROM ghm.quote
         WHERE business_id = $1 ORDER BY created_at DESC, id DESC`,
        [businessId],
      );
      const values: Quote[] = [];
      for (const row of result.rows) values.push(mapQuote(row, await loadLineItems(client, Number(row.id))));
      return values;
    }, this.transactionPool);
  }

  async setBusinessQuoteStatus(context: AuthContext, businessId: number, quoteId: QuoteId, status: QuoteStatus): Promise<Quote> {
    return withTenantTransaction(context, businessId, async client => {
      const existingResult = await client.query(
        `SELECT ${QUOTE_COLUMNS} FROM ghm.quote
         WHERE id = $1 AND business_id = $2 FOR UPDATE`,
        [quoteId, businessId],
      );
      if (existingResult.rowCount !== 1) throw new Error('Quote not found or ownership required');
      const existing = mapQuote(existingResult.rows[0], await loadLineItems(client, quoteId));
      if (existing.status === status) return existing;
      const result = await client.query(
        `UPDATE ghm.quote SET status = $1, reminder_id = NULL, reminder_date = NULL, updated_at = now()
         WHERE id = $2 AND business_id = $3 RETURNING ${QUOTE_COLUMNS}`,
        [status, quoteId, businessId],
      );
      if (result.rowCount !== 1) throw new Error('Quote status update failed');
      return mapQuote(result.rows[0], existing.lineItems);
    }, this.transactionPool);
  }

  async setBusinessQuoteNotes(context: AuthContext, businessId: number, quoteId: QuoteId, notes: string): Promise<Quote> {
    return withTenantTransaction(context, businessId, async client => {
      const result = await client.query(
        `UPDATE ghm.quote SET notes = $1, updated_at = now()
         WHERE id = $2 AND business_id = $3 RETURNING ${QUOTE_COLUMNS}`,
        [notes, quoteId, businessId],
      );
      if (result.rowCount !== 1) throw new Error('Quote not found or ownership required');
      return mapQuote(result.rows[0], await loadLineItems(client, quoteId));
    }, this.transactionPool);
  }

  async createQuote(context: AuthContext, input: CreateQuoteInput): Promise<Quote> {
    return withAuthorizedTransaction(context, async client => {
      const customer = await client.query(
        `SELECT id, name, phone, email, status
         FROM ghm.customer
         WHERE id = $1 AND account_id = $2 AND business_id IS NULL
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
      const where = context.role === 'admin' ? 'WHERE business_id IS NULL' : 'WHERE business_id IS NULL AND account_id = $1';
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
      const existing = await loadQuote(client, context, quoteId, true);
      if (!existing) throw new Error('Quote not found or ownership required');
      if (existing.status === status) return existing;

      const result = await client.query(
        `UPDATE ghm.quote
         SET status = $1, reminder_id = NULL, reminder_date = NULL, updated_at = now()
         WHERE id = $2 AND business_id IS NULL${context.role === 'admin' ? '' : ' AND account_id = $3'}
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
