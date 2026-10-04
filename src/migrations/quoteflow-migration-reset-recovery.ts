import type { AuthPersistence } from '../auth/foundation/persistence';
import { normalizeLoginEmail } from '../auth/foundation/email-normalization';
import type { PasswordRecoveryDelivery } from '../auth/password-recovery';

export interface QuoteFlowMigrationResetRecoveryService {
  request(email: string): Promise<void>;
}

export const createQuoteFlowMigrationResetRecoveryService = (
  persistence: AuthPersistence,
  delivery: PasswordRecoveryDelivery,
): QuoteFlowMigrationResetRecoveryService => ({
  async request(email: string): Promise<void> {
    const normalized = normalizeLoginEmail(email);
    const enrollment = await persistence.lookupQuoteFlowMigrationResetEnrollment(normalized.loginEmailNormalized);
    if (!enrollment) return;

    const issued = await persistence.issueRecovery(enrollment.accountId, 30);
    await delivery.deliver({
      accountId: enrollment.accountId,
      email: enrollment.approvedEmail,
      recoveryToken: issued.recoveryTokenWire,
      expiresAt: issued.expiresAt,
    });
  },
});
