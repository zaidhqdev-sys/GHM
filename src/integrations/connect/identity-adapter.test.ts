import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthPersistence } from '../../auth/foundation/persistence';
import type { ExternalIdentityMapping } from '../../auth/foundation/types';
import { ConnectIdentityAdapterImpl } from './identity-adapter';

const mapping = (accountId: number): ExternalIdentityMapping => ({
  id: 1,
  provider: 'supabase',
  subject: '11111111-1111-4111-8111-111111111111',
  accountId,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createPersistence = (
  lookup: AuthPersistence['lookupExternalIdentity'],
): AuthPersistence => ({
  completeQuoteFlowMigrationReset: async () => ({ accountId: 0, loginEmail: '', revokedSessionCount: 0 }),
  rehashPasswordIfUnchanged: async () => false,
  resetPasswordWithRecovery: async () => { throw new Error('unused'); },
  lookupPasswordByEmail: async () => null,
  createSessionWithRefresh: async () => { throw new Error('unused'); },
  rotateRefresh: async () => { throw new Error('unused'); },
  issueRecovery: async () => { throw new Error('unused'); },
  lookupQuoteFlowMigrationResetEnrollment: async () => null,
  lookupExternalIdentity: lookup,
  linkBusinessExternalMapping: async () => { throw new Error('unused'); },
  revokeSessionByRefreshToken: async () => ({ found: false, sessionId: null, accountId: null }),
});

test('Connect adapter resolves an existing Supabase identity', async () => {
  const existing = mapping(42);
  const adapter = new ConnectIdentityAdapterImpl(
    createPersistence(async (_provider, subject) => {
      assert.equal(subject, '11111111-1111-4111-8111-111111111111');
      return existing;
    }),
  );

  const result = await adapter.resolve('11111111-1111-4111-8111-111111111111');

  assert.equal(result.outcome, 'resolved');
  assert.equal(result.mapping.accountId, 42);
});

test('Connect adapter returns unmapped when no external identity exists', async () => {
  const adapter = new ConnectIdentityAdapterImpl(createPersistence(async () => null));

  const result = await adapter.resolve('22222222-2222-4222-8222-222222222222');

  assert.equal(result.outcome, 'unmapped');
  assert.equal(result.mapping, null);
});

test('Connect adapter rejects malformed external subjects without querying persistence', async () => {
  const adapter = new ConnectIdentityAdapterImpl(
    createPersistence(async () => { throw new Error('lookup must not be called'); }),
  );

  await assert.rejects(
    () => adapter.resolve('not-a-supabase-uuid'),
    /Invalid Connect external identity subject/,
  );
});

test('Connect adapter normalizes UUID case and surrounding whitespace', async () => {
  let received = '';
  const adapter = new ConnectIdentityAdapterImpl(
    createPersistence(async (_provider, subject) => {
      received = subject;
      return null;
    }),
  );

  const result = await adapter.resolve('  44444444-4444-4444-8444-444444444444  ');
  assert.equal(result.outcome, 'unmapped');
  assert.equal(received, '44444444-4444-4444-8444-444444444444');
});

test('Connect adapter never accepts a bearer token as identity input', async () => {
  const adapter = new ConnectIdentityAdapterImpl(createPersistence(async () => null));

  await assert.rejects(
    () => adapter.resolve('eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature'),
    /Invalid Connect external identity subject/,
  );
});
