import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { ProjectQuote, ProjectQuoteService } from '../../resources/project-quote/contracts';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import { ConnectProjectQuoteAdapterError, dispatchConnectProjectQuoteCapability } from './project-quote-adapter';

const customerContext: AuthContext = { userId: 42, role: 'customer' };
const businessContext: AuthContext = { userId: 84, role: 'business' };

const quote = (id = 7): ProjectQuote => ({
  id,
  projectId: 11,
  businessId: 84,
  amount: 1500,
  labourMin: 500,
  labourMax: 700,
  materialsMin: 600,
  materialsMax: 800,
  totalMin: 1500,
  totalMax: 1500,
  durationDays: 14,
  description: 'Website build',
  status: 'submitted',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const authorized = (
  context: AuthContext,
  capability: ConnectAuthorizedOperation['capability'],
  operation: ConnectAuthorizedOperation['operation'],
): ConnectAuthorizedOperation => ({ capability, resource: 'project_quote', operation, context });

const service = (calls: string[]): ProjectQuoteService => ({
  readReceived: async (_context, projectId) => { calls.push(`received:${projectId}`); return [quote()]; },
  readOwn: async (_context, businessId) => { calls.push(`own:${businessId}`); return [quote()]; },
  create: async (_context, input) => { calls.push(`create:${input.projectId}`); return quote(8); },
  update: async (_context, id, input) => { calls.push(`update:${id}:${input.amount ?? ''}`); return quote(id); },
  accept: async (_context, id) => { calls.push(`accept:${id}`); return { ...quote(id), status: 'accepted' }; },
  reject: async (_context, id) => { calls.push(`reject:${id}`); return { ...quote(id), status: 'rejected' }; },
});

const createInput = {
  projectId: 11,
  businessId: 84,
  amount: 1500,
  description: 'Website build',
};

test('customer can read received project quotes', async () => {
  const calls: string[] = [];
  await dispatchConnectProjectQuoteCapability(
    authorized(customerContext, 'project_quote.readReceived', 'readReceived'),
    { capability: 'project_quote.readReceived', projectId: 11 },
    { projectQuotes: service(calls) },
  );
  assert.deepEqual(calls, ['received:11']);
});

test('business can read own project quotes', async () => {
  const calls: string[] = [];
  await dispatchConnectProjectQuoteCapability(
    authorized(businessContext, 'project_quote.readOwn', 'readOwn'),
    { capability: 'project_quote.readOwn', businessId: 84 },
    { projectQuotes: service(calls) },
  );
  assert.deepEqual(calls, ['own:84']);
});

test('business can create and update project quotes', async () => {
  const calls: string[] = [];
  await dispatchConnectProjectQuoteCapability(
    authorized(businessContext, 'project_quote.create', 'create'),
    { capability: 'project_quote.create', input: createInput },
    { projectQuotes: service(calls) },
  );
  await dispatchConnectProjectQuoteCapability(
    authorized(businessContext, 'project_quote.update', 'update'),
    { capability: 'project_quote.update', quoteId: 7, input: { amount: 1600 } },
    { projectQuotes: service(calls) },
  );
  assert.deepEqual(calls, ['create:11', 'update:7:1600']);
});

test('customer can accept or reject project quotes', async () => {
  const calls: string[] = [];
  await dispatchConnectProjectQuoteCapability(
    authorized(customerContext, 'project_quote.accept', 'accept'),
    { capability: 'project_quote.accept', quoteId: 7 },
    { projectQuotes: service(calls) },
  );
  await dispatchConnectProjectQuoteCapability(
    authorized(customerContext, 'project_quote.reject', 'reject'),
    { capability: 'project_quote.reject', quoteId: 8 },
    { projectQuotes: service(calls) },
  );
  assert.deepEqual(calls, ['accept:7', 'reject:8']);
});

test('role mismatches fail before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectProjectQuoteCapability(
      authorized(customerContext, 'project_quote.create', 'create'),
      { capability: 'project_quote.create', input: createInput },
      { projectQuotes: service(calls) },
    ),
    ConnectProjectQuoteAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('invalid identifiers fail before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectProjectQuoteCapability(
      authorized(businessContext, 'project_quote.readOwn', 'readOwn'),
      { capability: 'project_quote.readOwn', businessId: 0 },
      { projectQuotes: service(calls) },
    ),
    /Invalid business identifier/,
  );
  assert.deepEqual(calls, []);
});
