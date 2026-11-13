-- MANUAL ROLLBACK ONLY — do not place this file in database/migrations.
--
-- This restores the pre-issuer-cutover Resource API authentication function
-- grants for ghm_runtime and removes issuer function/schema access. It does NOT
-- restore an old application binary, signing key, issuer service configuration,
-- or client routing. Coordinate those separately and only after the issuer has
-- been removed from traffic. Never run this while the isolated issuer is active.
--
-- This script intentionally does not restore migration/operator functions,
-- QuoteFlow enrollment registration, external identity link/bootstrap, or
-- account-ID session administration that earlier migrations removed from the
-- runtime. It does not grant direct table/sequence access.
BEGIN;

DO $issuer_operator_guard$
BEGIN
  IF session_user IS DISTINCT FROM 'ghm_migrator'
     OR current_user IS DISTINCT FROM 'ghm_schema_owner' THEN
    RAISE EXCEPTION 'issuer privilege operation requires session_user=ghm_migrator and current_user=ghm_schema_owner';
  END IF;
END;
$issuer_operator_guard$;

REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ghm FROM ghm_auth_issuer;
REVOKE USAGE ON SCHEMA ghm FROM ghm_auth_issuer;

GRANT EXECUTE ON FUNCTION ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_password_by_normalized_email(text)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_set_password(bigint, text, text, text, integer, integer, integer)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_rehash_password_if_unchanged(bigint, text, text, integer, integer, integer)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_create_session_with_refresh(bigint, bytea)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_validate_session(bigint)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_rotate_refresh(bytea, bytea)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_revoke_by_refresh_hash(bytea, text)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_issue_recovery(bigint, bytea, timestamptz)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_redeem_recovery(bytea)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_redeem_recovery_with_count(bytea)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_reset_password_with_recovery(bytea, text, text, integer, integer, integer)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)
  TO ghm_runtime;

COMMIT;
