import type {
  AccountResolution,
  MigrationManifest,
} from './quoteflow-snapshot-contract';

export type ExternalMappingApplyOutcome =
  | 'created'
  | 'already_linked'
  | 'conflict'
  | 'account_not_found';

export interface ExternalIdentityReconciliationStore {
  linkExternalIdentity(
    provider: 'supabase',
    subject: string,
    accountId: number,
  ): Promise<ExternalMappingApplyOutcome>;
}

export interface MigrationReconciliationResult {
  sourceSubject: string;
  targetAccountId: number | null;
  migrationOutcome: 'MIGRATED' | 'RESET_REQUIRED' | 'CONFLICT' | 'BLOCKED';
  mappingOutcome: ExternalMappingApplyOutcome | 'not_attempted';
  reasonCode: string;
}

export interface MigrationReconciliationExecutor {
  reconcileExistingAccounts(
    manifest: MigrationManifest,
    resolutions: AccountResolution[],
  ): Promise<MigrationReconciliationResult[]>;
}

/**
 * Executes only the already-qualified external-identity reconciliation seam.
 *
 * Deliberate boundary:
 * - never creates a GHM account;
 * - never creates a password credential;
 * - never creates a session;
 * - never creates a Business or membership;
 * - never resolves by email;
 * - never treats the legacy QuoteFlow numeric attestation as canonical identity;
 * - uses the existing idempotent auth_link_external_identity primitive.
 *
 * Account provisioning is a separate gate because the current GHM registration
 * primitive requires a password and creates a credential + session as part of
 * user-facing registration. A migration path must not synthesize password
 * material or issue a login session.
 */
export const createMigrationReconciliationExecutor = (
  store: ExternalIdentityReconciliationStore,
): MigrationReconciliationExecutor => ({
  async reconcileExistingAccounts(manifest, resolutions) {
    const bySubject = new Map(resolutions.map((resolution) => [resolution.sourceSubject, resolution]));
    const results: MigrationReconciliationResult[] = [];

    for (const account of manifest.accounts) {
      const sourceSubject = String(account.sourceSubject);
      const resolution = bySubject.get(sourceSubject);

      if (!resolution || resolution.targetAccountId === null) {
        results.push({
          sourceSubject,
          targetAccountId: resolution?.targetAccountId ?? null,
          migrationOutcome: 'BLOCKED',
          mappingOutcome: 'not_attempted',
          reasonCode: 'GHM_ACCOUNT_NOT_RESOLVED',
        });
        continue;
      }

      if (resolution.externalMappingOutcome === 'conflict') {
        results.push({
          sourceSubject,
          targetAccountId: resolution.targetAccountId,
          migrationOutcome: 'CONFLICT',
          mappingOutcome: 'not_attempted',
          reasonCode: 'EXTERNAL_MAPPING_CONFLICT',
        });
        continue;
      }

      if (resolution.externalMappingOutcome === 'account_not_found') {
        results.push({
          sourceSubject,
          targetAccountId: resolution.targetAccountId,
          migrationOutcome: 'BLOCKED',
          mappingOutcome: 'not_attempted',
          reasonCode: 'GHM_ACCOUNT_NOT_FOUND',
        });
        continue;
      }

      if (
        resolution.credentialDisposition !== 'reset_required'
        && resolution.credentialDisposition !== 'migrate_verified_hash'
      ) {
        results.push({
          sourceSubject,
          targetAccountId: resolution.targetAccountId,
          migrationOutcome: 'BLOCKED',
          mappingOutcome: 'not_attempted',
          reasonCode: 'CREDENTIAL_MIGRATION_BLOCKED',
        });
        continue;
      }

      const mappingOutcome = await store.linkExternalIdentity(
        'supabase',
        sourceSubject,
        resolution.targetAccountId,
      );

      if (mappingOutcome === 'conflict') {
        results.push({
          sourceSubject,
          targetAccountId: resolution.targetAccountId,
          migrationOutcome: 'CONFLICT',
          mappingOutcome,
          reasonCode: 'EXTERNAL_MAPPING_CONFLICT',
        });
        continue;
      }

      if (mappingOutcome === 'account_not_found') {
        results.push({
          sourceSubject,
          targetAccountId: resolution.targetAccountId,
          migrationOutcome: 'BLOCKED',
          mappingOutcome,
          reasonCode: 'GHM_ACCOUNT_NOT_FOUND',
        });
        continue;
      }

      results.push({
        sourceSubject,
        targetAccountId: resolution.targetAccountId,
        migrationOutcome: resolution.credentialDisposition === 'reset_required'
          ? 'RESET_REQUIRED'
          : 'MIGRATED',
        mappingOutcome,
        reasonCode: resolution.credentialDisposition === 'reset_required'
          ? 'EXTERNAL_IDENTITY_LINKED_RESET_REQUIRED'
          : 'EXTERNAL_IDENTITY_LINKED_READY_FOR_CREDENTIAL_MIGRATION',
      });
    }

    return results;
  },
});
