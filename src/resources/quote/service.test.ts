import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  CreateQuoteInput,
  Quote,
  QuoteRepository,
  QuoteStatus,
} from './contracts';
import { DefaultQuoteService } from './service';

const quote = (id: number, accountId: number, status: QuoteStatus = 'active'): Quote => ({
  id,
  accountId,
  customerId: 7,
  customerName: 'Acme Client',
  customerPhone: '0123456789',
  customerEmail: 'client@example.com',
  description: 'Labour, Materials',
  amount: 1500.5,
  followUpDate: '2026-09-20',
  status,
  reminderId: null,
  reminderDate: null,
  notes: '',
  lineItems: [
    {
      id: 1,
      quoteId: id,
      description: 'Labour',
      quantity: 1,
      unitPrice: 1000,
      catalogItemId: null,
      createdAt: new Date(0),
    },
    {
      id: 2,
      quoteId: id,
      description: 'Materials',
      quantity: 2,
      unitPrice: 250.25,
      catalogItemId: 4,
      createdAt: new Date(0),
    },
  ],
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

class FakeRepository implements QuoteRepository {
  quotes = new Map<number, Quote>();
  receivedCreate: CreateQuoteInput | null = null;

  async createQuote(context: AuthContext, input: CreateQuoteInput): Promise<Quote> {
    this.receivedCreate = input;
    const created = quote(1, context.userId);
    this.quotes.set(created.id, created);
    return created;
  }

  async getQuote(context: AuthContext, quoteId: number): Promise<Quote | null> {
    const value = this.quotes.get(quoteId);
    return value && (context.role === 'admin' || value.accountId === context.userId) ? value : null;
  }

  async listQuotes(context: AuthContext): Promise<Quote[]> {
    return [...this.quotes.values()].filter(value => context.role === 'admin' || value.accountId === context.userId);
  }

  async setQuoteStatus(context: AuthContext, quoteId: number, status: QuoteStatus): Promise<Quote> {
    const existing = await this.getQuote(context, quoteId);
    if (!existing) throw new Error('Quote not found or ownership required');
    const updated = { ...existing, status, reminderId: null, reminderDate: null, updatedAt: new Date(1) };
    this.quotes.set(quoteId, updated);
    return updated;
  }

  async setQuoteNotes(context: AuthContext, quoteId: number, notes: string): Promise<Quote> {
    const existing = await this.getQuote(context, quoteId);
    if (!existing) throw new Error('Quote not found or ownership required');
    const updated = { ...existing, notes, updatedAt: new Date(1) };
    this.quotes.set(quoteId, updated);
    return updated;
  }
}

const serviceFor = () => {
  const repository = new FakeRepository();
  return { repository, service: new DefaultQuoteService(repository) };
};

const context: AuthContext = { userId: 10, role: 'customer' };

const validInput: CreateQuoteInput = {
  customerId: 7,
  lineItems: [
    { description: '  Labour  ', quantity: 1, unitPrice: 1000 },
    { description: ' Materials ', quantity: 2, unitPrice: 250.25, catalogItemId: 4 },
  ],
  followUpDate: '2026-09-20',
};

test('Quote creation validates and normalizes line items', async () => {
  const { service, repository } = serviceFor();
  await service.createQuote(context, validInput);

  assert.deepEqual(repository.receivedCreate?.lineItems, [
    { description: 'Labour', quantity: 1, unitPrice: 1000, catalogItemId: null },
    { description: 'Materials', quantity: 2, unitPrice: 250.25, catalogItemId: 4 },
  ]);
});

test('Quote creation requires at least one line item', async () => {
  const { service } = serviceFor();
  await assert.rejects(
    () => service.createQuote(context, { ...validInput, lineItems: [] }),
    /At least one quote line item/,
  );
});

test('invalid Quote line item values are rejected', async () => {
  const { service } = serviceFor();
  await assert.rejects(
    () => service.createQuote(context, { ...validInput, lineItems: [{ description: 'x', quantity: 0, unitPrice: 1 }] }),
    /quantity must be greater than zero/,
  );
  await assert.rejects(
    () => service.createQuote(context, { ...validInput, lineItems: [{ description: 'x', quantity: 1, unitPrice: 0 }] }),
    /unit price must be greater than zero/,
  );
});

test('invalid follow-up date is rejected', async () => {
  const { service } = serviceFor();
  await assert.rejects(
    () => service.createQuote(context, { ...validInput, followUpDate: '2026-02-30' }),
    /Follow-up date must be YYYY-MM-DD/,
  );
});

test('non-owner cannot read Quote', async () => {
  const { service, repository } = serviceFor();
  repository.quotes.set(1, quote(1, 20));
  assert.equal(await service.getQuote(context, 1), null);
});

test('owner can read and list Quotes', async () => {
  const { service, repository } = serviceFor();
  repository.quotes.set(1, quote(1, 10));
  repository.quotes.set(2, quote(2, 20));

  assert.equal((await service.getQuote(context, 1))?.id, 1);
  assert.deepEqual((await service.listQuotes(context)).map(value => value.id), [1]);
});

test('Quote status accepts any differing source-backed status', async () => {
  const { service, repository } = serviceFor();
  repository.quotes.set(1, quote(1, 10));

  assert.equal((await service.setQuoteStatus(context, 1, 'won')).status, 'won');
  assert.equal((await service.setQuoteStatus(context, 1, 'lost')).status, 'lost');
  assert.equal((await service.setQuoteStatus(context, 1, 'active')).status, 'active');
});

test('Quote notes are independently mutable', async () => {
  const { service, repository } = serviceFor();
  repository.quotes.set(1, quote(1, 10));

  const updated = await service.setQuoteNotes(context, 1, 'Customer requested a follow-up call.');
  assert.equal(updated.notes, 'Customer requested a follow-up call.');
});

test('invalid Quote status and id are rejected', async () => {
  const { service } = serviceFor();
  await assert.rejects(() => service.setQuoteStatus(context, 0, 'won'), /Quote id is invalid/);
  await assert.rejects(() => service.setQuoteStatus(context, 1, 'invalid' as never), /Invalid Quote status/);
});
