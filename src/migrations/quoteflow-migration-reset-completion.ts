import type { AuthPersistence } from '../auth/foundation/persistence';

export interface QuoteFlowMigrationResetCompletionService {
  complete(recoveryToken: string, password: string): Promise<{ accountId: number; loginEmail: string }>;
}

export const createQuoteFlowMigrationResetCompletionService = (
  persistence: AuthPersistence,
): QuoteFlowMigrationResetCompletionService => ({
  async complete(recoveryToken, password) {
    return persistence.completeQuoteFlowMigrationReset(recoveryToken, password);
  },
});
