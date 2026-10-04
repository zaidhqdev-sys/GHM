import type { AuthPersistence } from './foundation/persistence';

export interface PasswordResetService {
  reset(recoveryToken: string, email: string, password: string): Promise<void>;
}

export const createPasswordResetService = (
  persistence: AuthPersistence,
): PasswordResetService => ({
  async reset(recoveryToken, email, password): Promise<void> {
    await persistence.resetPasswordWithRecovery(recoveryToken, email, password);
  },
});
