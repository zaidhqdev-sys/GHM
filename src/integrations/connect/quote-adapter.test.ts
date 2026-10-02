import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { Quote, QuoteService } from '../../resources/quote/contracts';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import { ConnectQuoteAdapterError, dispatchConnectQuoteCapability } from './quote-adapter';

const context: AuthContext = { userId: 42, role: 'customer' };
const quote = (id = 7): Quote => ({
  id, accountId: 42, customerId: 9, customerName: 'Alice', customerPhone: null, customerEmail: null,
  description: 'Test', amount: 100, followUpDate: '2026-10-10', status: 'active',
  reminderId: null, reminderDate: null, notes: '', lineItems: [], createdAt: new Date(), updatedAt: new Date(),
});
const authorized = (capability: ConnectAuthorizedOperation['capability'], operation: ConnectAuthorizedOperation['operation']): ConnectAuthorizedOperation =>
  ({ capability, resource: 'quote', operation, context });
const service = (calls: string[]): QuoteService => ({
  listQuotes: async () => { calls.push('list'); return [quote()]; },
  getQuote: async (_context, id) => { calls.push(`get:${id}`); return quote(id); },
  createQuote: async (_context, input) => { calls.push(`create:${input.customerId}:${input.lineItems.length}`); return quote(8); },
  setQuoteStatus: async (_context, id, status) => { calls.push(`status:${id}:${status}`); return { ...quote(id), status }; },
  setQuoteNotes: async (_context, id, notes) => { calls.push(`notes:${id}:${notes}`); return { ...quote(id), notes }; },
});

test('quote read list dispatches to typed service', async () => {
  const calls: string[] = [];
  const result = await dispatchConnectQuoteCapability(authorized('quote.read', 'read'), { capability: 'quote.read' }, { quotes: service(calls) });
  assert.equal((result as Quote[])[0].id, 7);
  assert.deepEqual(calls, ['list']);
});
test('quote read item dispatches to typed service', async () => {
  const calls: string[] = [];
  await dispatchConnectQuoteCapability(authorized('quote.read', 'read'), { capability: 'quote.read', quoteId: 9 }, { quotes: service(calls) });
  assert.deepEqual(calls, ['get:9']);
});
test('quote create delegates typed input', async () => {
  const calls: string[] = [];
  await dispatchConnectQuoteCapability(authorized('quote.create', 'create'), { capability: 'quote.create', customerId: 9, lineItems: [{ description: 'Work', quantity: 1, unitPrice: 100 }], followUpDate: '2026-10-10' }, { quotes: service(calls) });
  assert.deepEqual(calls, ['create:9:1']);
});
test('quote update delegates status or notes', async () => {
  const calls: string[] = [];
  await dispatchConnectQuoteCapability(authorized('quote.update', 'update'), { capability: 'quote.update', quoteId: 9, status: 'won' }, { quotes: service(calls) });
  await dispatchConnectQuoteCapability(authorized('quote.update', 'update'), { capability: 'quote.update', quoteId: 9, notes: 'Follow up' }, { quotes: service(calls) });
  assert.deepEqual(calls, ['status:9:won', 'notes:9:Follow up']);
});
test('capability mismatch fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(() => dispatchConnectQuoteCapability(authorized('quote.read', 'read'), { capability: 'quote.create', customerId: 9, lineItems: [], followUpDate: '2026-10-10' }, { quotes: service(calls) }), ConnectQuoteAdapterError);
  assert.deepEqual(calls, []);
});
test('invalid identifiers fail before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(() => dispatchConnectQuoteCapability(authorized('quote.read', 'read'), { capability: 'quote.read', quoteId: 0 }, { quotes: service(calls) }), /Invalid quote\/customer identifier/);
  assert.deepEqual(calls, []);
});
test('empty update fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(() => dispatchConnectQuoteCapability(authorized('quote.update', 'update'), { capability: 'quote.update', quoteId: 9 }, { quotes: service(calls) }), /Quote update requires status or notes/);
  assert.deepEqual(calls, []);
});
