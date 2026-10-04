import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AuthPersistence,
} from '../../auth/foundation/persistence';
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
  bootstrap: AuthPersistence['bootstrapExternalIdentity'],
): AuthPersistence => ({
  completeQuoteFlowMigrationReset: async () => ({ accountId: 0, loginEmail: '', revokedSessionCount: 0 }),
  setPassword: async () => { throw new Error('unused'); },
  resetPasswordWithRecovery: async () => { throw new Error('unused'); },
  lookupPasswordByEmail: async () => null,
  createSessionWithRefresh: async () => { throw new Error('unused'); },
  validateSession: async () => { throw new Error('unused'); },
  rotateRefresh: async () => { throw new Error('unused'); },
  revokeSession: async () => false,
  revokeAllSessionsForAccount: async () => 0,
  changePassword: async () => { throw new Error('unused'); },
  disableAccount: async () => {},
  issueRecovery: async () => { throw new Error('unused'); },
  redeemRecovery: async () => { throw new Error('unused'); },
  lookupQuoteFlowMigrationResetEnrollment: async () => null,
  lookupExternalIdentity: lookup,
  bootstrapExternalIdentity: bootstrap,
  linkExternalIdentity: async () => { throw new Error('unused'); },
  linkBusinessExternalMapping: async () => { throw new Error('unused'); },
  revokeSessionByRefreshToken: async () => ({ found: false, sessionId: null, accountId: null }),
});

test('Connect adapter resolves an existing Supabase identity without bootstrap', async () => {
  const existing = mapping(42);
  let bootstrapCalls = 0;
  const adapter = new ConnectIdentityAdapterImpl(
    createPersistence(
      async (_provider, subject) => {
        assert.equal(subject, '11111111-1111-4111-8111-111111111111');
        return existing;
      },
      async () => {
        bootstrapCalls += 1;
        return { ...existing, created: false };
      },
    ),
  );

  const result = await adapter.resolve('11111111-1111-4111-8111-111111111111', {
    allowBootstrap: true,
  });

  assert.equal(result.outcome, 'resolved');
  assert.equal(result.mapping.accountId, 42);
  assert.equal(bootstrapCalls, 0);
});

test('Connect adapter returns unmapped without explicit bootstrap authorization', async () => {
  const adapter = new ConnectIdentityAdapterImpl(
    createPersistence(
      async () => null,
      async () => { throw new Error('bootstrap must not be called'); },
    ),
  );

  const result = await adapter.resolve('22222222-2222-4222-8222-222222222222');

  assert.equal(result.outcome, 'unmapped');
  assert.equal(result.mapping, null);
});

test('Connect adapter performs minimum bootstrap only when explicitly allowed', async () => {
  const bootstrapped = mapping(77);
  let captured: unknown[] = [];
  const adapter = new ConnectIdentityAdapterImpl(
    createPersistence(
      async () => null,
      async (provider, subject, fullName, role) => {
        captured = [provider, subject, fullName, role];
        return { ...bootstrapped, created: true };
      },
    ),
  );

  const result = await adapter.resolve('33333333-3333-4333-8333-333333333333', {
    allowBootstrap: true,
    fullName: 'Connect User',
    role: 'customer',
  });

  assert.equal(result.outcome, 'bootstrapped');
  assert.equal(result.mapping.accountId, 77);
  assert.deepEqual(captured, [
    'supabase',
    '33333333-3333-4333-8333-333333333333',
    'Connect User',
    'customer',
  ]);
});

test('Connect adapter rejects malformed external subjects', async () => {
  const adapter = new ConnectIdentityAdapterImpl(
    createPersistence(
      async () => { throw new Error('lookup must not be called'); },
      async () => { throw new Error('bootstrap must not be called'); },
    ),
  );

  await assert.rejects(
    () => adapter.resolve('not-a-supabase-uuid'),
    /Invalid Connect external identity subject/,
  );
});

test('Connect adapter normalizes UUID case and surrounding whitespace', async () => {
  let received = '';
  const adapter = new ConnectIdentityAdapterImpl(
    createPersistence(
      async (_provider, subject) => {
        received = subject;
        return null;
      },
      async () => { throw new Error('unused'); },
    ),
  );

  const result = await adapter.resolve('  44444444-4444-4444-8444-444444444444  ');
  assert.equal(result.outcome, 'unmapped');
  assert.equal(received, '44444444-4444-4444-8444-444444444444');
});

test('Connect adapter never accepts a bearer token as identity input', async () => {
  const adapter = new ConnectIdentityAdapterImpl(
    createPersistence(
      async () => null,
      async () => { throw new Error('bootstrap must not be called'); },
    ),
  );

  await assert.rejects(
    () => adapter.resolve('eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature'),
    /Invalid Connect external identity subject/,
  );
});
