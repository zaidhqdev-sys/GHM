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
 * session.
 *
 * New-account creation and provenance linking are one atomic store operation.
 * This prevents an account from being left behind if the external mapping
 * cannot be established.
 */
export interface MigrationAccountProvisioningStore {
  lookupExternalIdentity(
    provider: 'supabase',
    subject: string,
  ): Promise<{ accountId: number } | null>;

  provisionCredentiallessAccountAndLink(input: {
    sourceProvider: 'supabase';
    sourceSubject: string;
    fullName: string | null;
    role: 'customer' | 'business';
    loginEmail: string;
    normalizedEmail: string;
  }): Promise<
    | { outcome: 'created'; accountId: number }
    | { outcome: 'already_provisioned'; accountId: number }
    | { outcome: 'conflict'; accountId: number }
  >;

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
        reasonCode: input.credentialDisposition === 'reset_required'
          ? 'GHM_ACCOUNT_ALREADY_RESOLVED_RESET_REQUIRED'
          : 'GHM_ACCOUNT_ALREADY_RESOLVED_READY_FOR_CREDENTIAL_MIGRATION',
      };
    }

    const result = await store.provisionCredentiallessAccountAndLink({
      sourceProvider: input.sourceProvider,
      sourceSubject: input.sourceSubject,
      fullName: input.fullName,
      role: input.role,
      loginEmail: input.loginEmail,
      normalizedEmail: input.normalizedEmail,
    });

    if (result.outcome === 'conflict') {
      return {
        outcome: 'conflict',
        targetAccountId: result.accountId,
        credentialDisposition: input.credentialDisposition,
        reasonCode: 'EXTERNAL_MAPPING_CONFLICT',
      };
    }

    return {
      outcome: result.outcome,
      targetAccountId: result.accountId,
      credentialDisposition: input.credentialDisposition,
      reasonCode: input.credentialDisposition === 'reset_required'
        ? 'ACCOUNT_PROVISIONED_RESET_REQUIRED'
        : 'ACCOUNT_PROVISIONED_READY_FOR_CREDENTIAL_MIGRATION',
    };
  },
});
