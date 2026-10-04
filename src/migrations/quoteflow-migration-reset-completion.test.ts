import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuoteFlowMigrationResetCompletionService } from './quoteflow-migration-reset-completion.js';

test('migration reset completion delegates the atomic ceremony boundary', async () => {
  let seen: { token: string; password: string } | null = null;
  const service = createQuoteFlowMigrationResetCompletionService({
      const service = createQuoteFlowMigrationResetCompletionService({
    completeQuoteFlowMigrationReset: async (token: string, password: string) => {
      seen = { token, password };
      return { accountId: 42, loginEmail: 'legacy@example.com', revokedSessionCount: 2 };
    },
  } as never);

  const result = await service.complete('opaque-token', 'CorrectHorseBattery1');
  assert.deepEqual(result, { accountId: 42, loginEmail: 'legacy@example.com' });
  assert.deepEqual(seen, { token: 'opaque-token', password: 'CorrectHorseBattery1' });
});
