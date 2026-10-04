import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuoteFlowMigrationResetRecoveryService } from './quoteflow-migration-reset-recovery.js';

test('migration reset recovery uses approved enrollment email and never exposes eligibility', async () => {
  let issuedFor: number | null = null;
  let delivered: { accountId: number; email: string; recoveryToken: string } | null = null;
  const service = createQuoteFlowMigrationResetRecoveryService({
        lookupQuoteFlowMigrationResetEnrollment: async (email: string) => {
      assert.equal(email, 'legacy@example.com');
      return { enrollmentId: 7, accountId: 42, approvedEmail: 'Legacy@Example.com' };
    },
        issueRecovery: async (accountId: number) => {
      issuedFor = accountId;
      return { recoveryTokenWire: 'opaque-token', credentialId: 8, expiresAt: new Date('2026-10-04T01:00:00Z') };
    },
  } as never, {
    deliver: async (input) => {
      delivered = { accountId: input.accountId, email: input.email, recoveryToken: input.recoveryToken };
    },
  });

  await service.request(' Legacy@Example.com ');
  assert.equal(issuedFor, 42);
  assert.deepEqual(delivered, { accountId: 42, email: 'Legacy@Example.com', recoveryToken: 'opaque-token' });
});

test('migration reset recovery is silent for unknown enrollment', async () => {
  let calls = 0;
  const service = createQuoteFlowMigrationResetRecoveryService({
    lookupQuoteFlowMigrationResetEnrollment: async () => null,
    issueRecovery: async () => {
      calls += 1;
      return { recoveryTokenWire: 'unused', credentialId: 1, expiresAt: new Date() };
    },
  } as never, { deliver: async () => { calls += 1; } });

  await service.request('missing@example.com');
  assert.equal(calls, 0);
});
