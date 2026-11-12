import type { Pool } from 'pg';

export interface RuntimeDatabaseFunctionPrivileges {
  executable_functions: string[];
}

// Exact pre-migration baseline from the disposable PostgreSQL 18.6 whole-database
// SECURITY DEFINER inventory. Production enforcement stays gated until its own
// catalog is captured and reconciled. Do not add a signature without reviewing its
// actor binding, tenant scope, lifecycle checks and owning service.
export const RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS = [
  'ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)',
  'ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)',
  'ghm.auth_create_session_with_refresh(bigint, bytea)',
  'ghm.auth_issue_recovery(bigint, bytea, timestamp with time zone)',
  'ghm.auth_lookup_business_external_mapping(text, text)',
  'ghm.auth_lookup_external_identity(text, text)',
  'ghm.auth_lookup_password_by_normalized_email(text)',
  'ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)',
  'ghm.auth_redeem_recovery(bytea)',
  'ghm.auth_redeem_recovery_with_count(bytea)',
  'ghm.auth_rehash_password_if_unchanged(bigint, text, text, integer, integer, integer)',
  'ghm.auth_reset_password_with_recovery(bytea, text, text, integer, integer, integer)',
  'ghm.auth_revoke_by_refresh_hash(bytea, text)',
  'ghm.auth_rotate_refresh(bytea, bytea)',
  'ghm.auth_set_password(bigint, text, text, text, integer, integer, integer)',
  'ghm.auth_validate_session(bigint)',
  'ghm.calculate_business_trust_score(bigint, bigint)',
  'ghm.connect_service_assertion_consume(text, text, timestamp with time zone)',
  'ghm.create_campaign(bigint, bigint, text)',
  'ghm.create_capability_draft(bigint, text, text, text, uuid, integer, text, integer)',
  'ghm.create_saved_business(bigint, bigint)',
  'ghm.delete_saved_business(bigint, bigint)',
  'ghm.get_business_directory_review_presentation(bigint, bigint)',
  'ghm.get_public_business_hours(bigint)',
  'ghm.get_public_trust_score(bigint)',
  'ghm.is_business_capability_publicly_evidence_eligible(bigint)',
  'ghm.list_public_trust_scores(text)',
  'ghm.read_business_registration_identity(bigint, bigint)',
  'ghm.replace_business_capability_assertions(bigint, bigint, jsonb)',
  'ghm.replace_business_hours(bigint, bigint, jsonb)',
  'ghm.set_business_logo_object(bigint, bigint, bigint)',
  'ghm.storage_create_pending(bigint, text, bigint, text, text, text, bigint, text, text)',
  'ghm.storage_get_object(bigint, bigint)',
  'ghm.storage_get_public_business_logo(bigint)',
  'ghm.storage_mark_available(bigint, text)',
  'ghm.storage_mark_deleted(bigint)',
  'ghm.storage_mark_deletion_pending(bigint)',
  'ghm.transition_business_capability_evidence(bigint, text, bigint, text)',
  'ghm.transition_business_capability_verification(bigint, text, text, bigint, text)',
  'ghm.transition_capability_lifecycle(bigint, uuid, text, uuid, integer)',
  'ghm.update_business_registration_identity(bigint, bigint, text, text, text)',
  'ghm.update_campaign(bigint, bigint, text, text)',
  'ghm.update_capability_draft(bigint, uuid, text, text, text, uuid, integer, text, integer)'
] as const;

const CAMPAIGN_REVIEW_LEGACY_FUNCTIONS = [
  'ghm.create_campaign(bigint, bigint, text)',
  'ghm.update_campaign(bigint, bigint, text, text)',
  'ghm.get_business_directory_review_presentation(bigint, bigint)',
] as const;

const AUTH_ISSUER_REVOKED_RUNTIME_FUNCTIONS = [
  'ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)',
  'ghm.auth_lookup_password_by_normalized_email(text)',
  'ghm.auth_set_password(bigint, text, text, text, integer, integer, integer)',
  'ghm.auth_rehash_password_if_unchanged(bigint, text, text, integer, integer, integer)',
  'ghm.auth_create_session_with_refresh(bigint, bytea)',
  'ghm.auth_validate_session(bigint)',
  'ghm.auth_rotate_refresh(bytea, bytea)',
  'ghm.auth_revoke_by_refresh_hash(bytea, text)',
  'ghm.auth_issue_recovery(bigint, bytea, timestamp with time zone)',
  'ghm.auth_redeem_recovery(bytea)',
  'ghm.auth_redeem_recovery_with_count(bytea)',
  'ghm.auth_reset_password_with_recovery(bytea, text, text, integer, integer, integer)',
  'ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)',
  'ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)',
] as const;

const REGISTRATION_IDENTITY_LEGACY_FUNCTIONS = [
  'ghm.read_business_registration_identity(bigint, bigint)',
  'ghm.update_business_registration_identity(bigint, bigint, text, text, text)',
] as const;

const normalizeSignature = (signature: string): string => signature.replace(/,\s+/g, ',');
const without = (source: readonly string[], removed: readonly string[]): string[] =>
  source.filter(signature => !(removed as readonly string[]).includes(signature));

export const RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS = without(
  RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS, CAMPAIGN_REVIEW_LEGACY_FUNCTIONS,
);
export const RUNTIME_POST_AUTH_ISSUER_FUNCTIONS = without(
  RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS, AUTH_ISSUER_REVOKED_RUNTIME_FUNCTIONS,
);
export const RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS = without(
  RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS, AUTH_ISSUER_REVOKED_RUNTIME_FUNCTIONS,
);
export const RUNTIME_POST_REGISTRATION_IDENTITY_FUNCTIONS = without(
  RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS, REGISTRATION_IDENTITY_LEGACY_FUNCTIONS,
);
export const RUNTIME_POST_CAMPAIGN_REVIEW_AND_REGISTRATION_IDENTITY_FUNCTIONS = without(
  RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS, REGISTRATION_IDENTITY_LEGACY_FUNCTIONS,
);
export const RUNTIME_POST_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS = without(
  RUNTIME_POST_AUTH_ISSUER_FUNCTIONS, REGISTRATION_IDENTITY_LEGACY_FUNCTIONS,
);
export const RUNTIME_POST_CAMPAIGN_REVIEW_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS = without(
  RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS, REGISTRATION_IDENTITY_LEGACY_FUNCTIONS,
);

const REVIEWED_RUNTIME_FUNCTION_STAGES = [
  RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_POST_AUTH_ISSUER_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS,
  RUNTIME_POST_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AND_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_POST_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS,
] as const;

export const RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL = `
  SELECT ARRAY(
    SELECT p.oid::regprocedure::text
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.prosecdef
       AND has_function_privilege(session_user, p.oid, 'EXECUTE')
     ORDER BY 1
  ) AS executable_functions
`;

export const assertRuntimeDatabaseFunctionPrivileges = (
  privileges: RuntimeDatabaseFunctionPrivileges,
): void => {
  const actual = privileges.executable_functions.map(normalizeSignature).sort();
  const stages = REVIEWED_RUNTIME_FUNCTION_STAGES.map(stage =>
    stage.map(normalizeSignature).sort(),
  );
  const expectedLengths = [43, 40, 29, 26, 41, 38, 27, 24];
  if (stages.some((stage, index) => stage.length !== expectedLengths[index])) {
    throw new Error('Runtime database function allow-list signatures did not all resolve in this source revision');
  }
  if (!stages.some(expected => JSON.stringify(actual) === JSON.stringify(expected))) {
    const diagnostics = stages.map((expected, index) => ({
      stage: index,
      count: expected.length,
      missing: expected.filter(signature => !actual.includes(signature)),
      unexpected: actual.filter(signature => !expected.includes(signature)),
    }));
    throw new Error(
      `Runtime database function EXECUTE allow-list mismatch: actual=${JSON.stringify(actual)}, stages=${JSON.stringify(diagnostics)}`,
    );
  }
};

export async function readRuntimeDatabaseFunctionPrivileges(
  pool: Pick<Pool, 'query'>,
): Promise<RuntimeDatabaseFunctionPrivileges> {
  const result = await pool.query<RuntimeDatabaseFunctionPrivileges>(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL);
  if (!result.rows[0]) throw new Error('Runtime database function privileges could not be resolved');
  return result.rows[0];
}
