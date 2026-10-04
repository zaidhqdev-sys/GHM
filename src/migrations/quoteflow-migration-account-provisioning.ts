export type MigrationCredentialDisposition =
  | 'reset_required'
  | 'migrate_verified_hash'
  | 'blocked';

export type MigrationProvisioningOutcome =
  | 'created'
  | 'already_provisioned'
  | 'conflict'
  | 'blocked';

export interface MigrationAccountProvisioningRequest {
  sourceProvider: 'supabase';
  sourceSubject: string;
  fullName: string | null;
  loginEmail: string;
  normalizedEmail: string;
  role: 'customer' | 'business';
  credentialDisposition: MigrationCredentialDisposition;
  targetAccountId: number | null;
}

export interface MigrationAccountProvisioningResult {
  outcome: MigrationProvisioningOutcome;
  targetAccountId: number | null;
  credentialDisposition: MigrationCredentialDisposition;
  reasonCode: string;
}

/**
 * Migration provisioning is deliberately narrower than public registration.
 *
 * Public registration creates a credential and session. Migration provisioning
 * must never invent a credential, import an unqualified legacy hash, or issue a
 * session. This contract therefore only permits an already-reviewed target
 * account to be treated as provisioned by a future migration-owned primitive.
 */
export interface MigrationAccountProvisioningStore {
  createCredentiallessAccount(input: {
    fullName: string | null;
    role: 'customer' | 'business';
    loginEmail: string;
    normalizedEmail: string;
  }): Promise<{ accountId: number }>;

  lookupExternalIdentity(
    provider: 'supabase',
    subject: string,
  ): Promise<{ accountId: number } | null>;

  linkExternalIdentity(
    provider: 'supabase',
    subject: string,
    accountId: number,
  ): Promise<'created' | 'already_linked' | 'conflict' | 'account_not_found'>;
}

export interface MigrationAccountProvisioningService {
  provision(input: MigrationAccountProvisioningRequest): Promise<MigrationAccountProvisioningResult>;
}

export const createMigrationAccountProvisioningService = (
  store: MigrationAccountProvisioningStore,
): MigrationAccountProvisioningService => ({
  async provision(input) {
    if (input.credentialDisposition === 'blocked') {
      return {
        outcome: 'blocked',
        targetAccountId: input.targetAccountId,
        credentialDisposition: input.credentialDisposition,
        reasonCode: 'CREDENTIAL_MIGRATION_BLOCKED',
      };
    }

    if (input.targetAccountId !== null) {
      const existing = await store.lookupExternalIdentity(input.sourceProvider, input.sourceSubject);
      if (existing && existing.accountId !== input.targetAccountId) {
        return {
          outcome: 'conflict',
          targetAccountId: existing.accountId,
          credentialDisposition: input.credentialDisposition,
          reasonCode: 'EXTERNAL_MAPPING_CONFLICT',
        };
      }

      const mapping = await store.linkExternalIdentity(
        input.sourceProvider,
        input.sourceSubject,
        input.targetAccountId,
      );

      if (mapping === 'conflict') {
        return {
          outcome: 'conflict',
          targetAccountId: input.targetAccountId,
          credentialDisposition: input.credentialDisposition,
          reasonCode: 'EXTERNAL_MAPPING_CONFLICT',
        };
      }

      if (mapping === 'account_not_found') {
        return {
          outcome: 'blocked',
          targetAccountId: input.targetAccountId,
          credentialDisposition: input.credentialDisposition,
          reasonCode: 'GHM_ACCOUNT_NOT_FOUND',
        };
      }

      return {
        outcome: 'already_provisioned',
        targetAccountId: input.targetAccountId,
        credentialDisposition: input.credentialDisposition,
        reasonCode: 'GHM_ACCOUNT_ALREADY_RESOLVED',
      };
    }

    const account = await store.createCredentiallessAccount({
      fullName: input.fullName,
      role: input.role,
      loginEmail: input.loginEmail,
      normalizedEmail: input.normalizedEmail,
    });

    const mapping = await store.linkExternalIdentity(
      input.sourceProvider,
      input.sourceSubject,
      account.accountId,
    );

    if (mapping === 'conflict') {
      return {
        outcome: 'conflict',
        targetAccountId: account.accountId,
        credentialDisposition: input.credentialDisposition,
        reasonCode: 'EXTERNAL_MAPPING_CONFLICT',
      };
    }

    if (mapping === 'account_not_found') {
      return {
        outcome: 'blocked',
        targetAccountId: account.accountId,
        credentialDisposition: input.credentialDisposition,
        reasonCode: 'GHM_ACCOUNT_NOT_FOUND',
      };
    }

    return {
      outcome: 'created',
      targetAccountId: account.accountId,
      credentialDisposition: input.credentialDisposition,
      reasonCode: input.credentialDisposition === 'reset_required'
        ? 'ACCOUNT_PROVISIONED_RESET_REQUIRED'
        : 'ACCOUNT_PROVISIONED_READY_FOR_CREDENTIAL_MIGRATION',
    };
  },
});
