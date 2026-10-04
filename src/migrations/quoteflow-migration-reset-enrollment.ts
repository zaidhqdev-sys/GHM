import { normalizeLoginEmail } from '../auth/foundation/email-normalization.js';

export interface QuoteFlowMigrationResetEnrollmentStore {
  lookupQuoteFlowMigrationResetEnrollment(email: string): Promise<{
    enrollmentId: number;
    accountId: number;
  } | null>;
}

export interface QuoteFlowMigrationResetEnrollmentResult {
  eligible: boolean;
  enrollmentId: number | null;
  accountId: number | null;
}

export const createQuoteFlowMigrationResetEnrollmentService = (
  store: QuoteFlowMigrationResetEnrollmentStore,
) => ({
  async lookup(email: string): Promise<QuoteFlowMigrationResetEnrollmentResult> {
    const normalized = normalizeLoginEmail(email);
    const match = await store.lookupQuoteFlowMigrationResetEnrollment(normalized.loginEmail);
    if (!match) return { eligible: false, enrollmentId: null, accountId: null };
    return { eligible: true, enrollmentId: match.enrollmentId, accountId: match.accountId };
  },
});
