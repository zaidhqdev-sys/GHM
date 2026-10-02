/**
 * Password recovery application boundary.
 * Recovery credentials are handed only to the delivery port; they are never
 * returned to HTTP callers.
 */

import type { AuthPersistence } from './foundation/persistence';
import { normalizeLoginEmail, EmailNormalizationError } from './foundation/email-normalization';

export interface PasswordRecoveryDelivery {
  deliver(input: {
    accountId: number;
    email: string;
    recoveryToken: string;
    expiresAt: Date;
  }): Promise<void>;
}

export interface PasswordRecoveryService {
  request(email: string): Promise<void>;
}

export const createPasswordRecoveryService = (
  persistence: AuthPersistence,
  delivery: PasswordRecoveryDelivery,
): PasswordRecoveryService => ({
  async request(email: string): Promise<void> {
    let normalized;
    try {
      normalized = normalizeLoginEmail(email);
    } catch (error) {
      if (error instanceof EmailNormalizationError) return;
      throw error;
    }

    const credential = await persistence.lookupPasswordByEmail(normalized.loginEmail);
    if (!credential || credential.accountStatus !== 'active' || credential.credentialStatus !== 'active') {
      return;
    }

    const issued = await persistence.issueRecovery(credential.accountId, 30);
    await delivery.deliver({
      accountId: credential.accountId,
      email: credential.loginEmail,
      recoveryToken: issued.recoveryTokenWire,
      expiresAt: issued.expiresAt,
    });
  },
});
