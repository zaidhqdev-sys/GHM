import type { Pool } from 'pg';

export interface RuntimeDatabaseFunctionPrivileges {
  executable_functions: string[];
  expected_pre_cutover_functions?: string[];
  expected_post_campaign_review_functions?: string[];
  expected_post_auth_issuer_functions?: string[];
  expected_post_campaign_review_and_auth_issuer_functions?: string[];
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

// The only two accepted ACL states are the inventoried baseline and the
// forward-only Campaign/directory-review gateway cutover. Future manual
// cutovers must add their exact reviewed state in the same change.
export const RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS = RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS
  .filter(signature => !(CAMPAIGN_REVIEW_LEGACY_FUNCTIONS as readonly string[]).includes(signature));

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

// Post-issuer states preserve only the two separately reviewed external identity
// and business-mapping lookups in the Resource API runtime.
export const RUNTIME_POST_AUTH_ISSUER_FUNCTIONS = RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS
  .filter(signature => !(AUTH_ISSUER_REVOKED_RUNTIME_FUNCTIONS as readonly string[]).includes(signature));

export const RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS = RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS
  .filter(signature => !(AUTH_ISSUER_REVOKED_RUNTIME_FUNCTIONS as readonly string[]).includes(signature));

export const RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL = `
  WITH expected_pre AS (
    SELECT unnest($1::text[]) AS signature
  ),
  expected_post AS (
    SELECT signature FROM expected_pre
     WHERE NOT (signature = ANY($2::text[]))
  ),
  expected_post_issuer AS (
    SELECT signature FROM expected_pre
     WHERE NOT (signature = ANY($3::text[]))
  ),
  expected_post_campaign_and_issuer AS (
    SELECT signature FROM expected_post
     WHERE NOT (signature = ANY($3::text[]))
  )
  SELECT
    ARRAY(
      SELECT p.oid::regprocedure::text
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'ghm'
         AND p.prosecdef
         AND has_function_privilege(session_user, p.oid, 'EXECUTE')
       ORDER BY 1
    ) AS executable_functions,
    ARRAY(
      SELECT to_regprocedure(signature)::text
        FROM expected_pre
       WHERE to_regprocedure(signature) IS NOT NULL
       ORDER BY 1
    ) AS expected_pre_cutover_functions,
    ARRAY(
      SELECT to_regprocedure(signature)::text
        FROM expected_post
       WHERE to_regprocedure(signature) IS NOT NULL
       ORDER BY 1
    ) AS expected_post_campaign_review_functions,
    ARRAY(
      SELECT to_regprocedure(signature)::text
        FROM expected_post_issuer
       WHERE to_regprocedure(signature) IS NOT NULL
       ORDER BY 1
    ) AS expected_post_auth_issuer_functions,
    ARRAY(
      SELECT to_regprocedure(signature)::text
        FROM expected_post_campaign_and_issuer
       WHERE to_regprocedure(signature) IS NOT NULL
       ORDER BY 1
    ) AS expected_post_campaign_review_and_auth_issuer_functions
`;

export const assertRuntimeDatabaseFunctionPrivileges = (
  privileges: RuntimeDatabaseFunctionPrivileges,
): void => {
  const actual = [...privileges.executable_functions].sort();
  const preCutover = [...(privileges.expected_pre_cutover_functions ?? RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS)].sort();
  const postCampaignReview = [...(privileges.expected_post_campaign_review_functions ?? RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS)].sort();
  const postAuthIssuer = [...(privileges.expected_post_auth_issuer_functions ?? RUNTIME_POST_AUTH_ISSUER_FUNCTIONS)].sort();
  const postCampaignAndIssuer = [...(privileges.expected_post_campaign_review_and_auth_issuer_functions ?? RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS)].sort();
  if (preCutover.length !== 43 || postCampaignReview.length !== 40 || postAuthIssuer.length !== 29 || postCampaignAndIssuer.length !== 26) {
    throw new Error('Runtime database function allow-list signatures did not all resolve in this database');
  }
  const matches = (expected: string[]) => JSON.stringify(actual) === JSON.stringify(expected);
  if (!matches(preCutover) && !matches(postCampaignReview) && !matches(postAuthIssuer) && !matches(postCampaignAndIssuer)) {
    throw new Error(
      `Runtime database function EXECUTE allow-list mismatch: actual=${JSON.stringify(actual)}, expected_pre_campaign=${JSON.stringify(preCutover)}, expected_post_campaign=${JSON.stringify(postCampaignReview)}, expected_post_issuer=${JSON.stringify(postAuthIssuer)}, expected_post_campaign_and_issuer=${JSON.stringify(postCampaignAndIssuer)}`,
    );
  }
};

export async function readRuntimeDatabaseFunctionPrivileges(
  pool: Pick<Pool, 'query'>,
): Promise<RuntimeDatabaseFunctionPrivileges> {
  const result = await pool.query<RuntimeDatabaseFunctionPrivileges>(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, [
    RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS,
    CAMPAIGN_REVIEW_LEGACY_FUNCTIONS,
    AUTH_ISSUER_REVOKED_RUNTIME_FUNCTIONS,
  ]);
  if (!result.rows[0]) throw new Error('Runtime database function privileges could not be resolved');
  return result.rows[0];
}
