-- DISPOSABLE QUALIFICATION ONLY.
-- Applied by CI to ghm_disposable_test after the complete migration chain.
-- Never apply this fixture to any shared, sandbox, staging or production database.
BEGIN;

GRANT USAGE ON SCHEMA ghm TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_lookup_password_by_normalized_email(text)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_password_by_normalized_email(text)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_set_password(bigint, text, text, text, integer, integer, integer)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_set_password(bigint, text, text, text, integer, integer, integer)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_create_session_with_refresh(bigint, bytea)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_create_session_with_refresh(bigint, bytea)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_validate_session(bigint)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_validate_session(bigint)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_rotate_refresh(bytea, bytea)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_rotate_refresh(bytea, bytea)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_revoke_by_refresh_hash(bytea, text)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_revoke_by_refresh_hash(bytea, text)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_issue_recovery(bigint, bytea, timestamptz)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_issue_recovery(bigint, bytea, timestamptz)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_redeem_recovery(bytea)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_redeem_recovery(bytea)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_redeem_recovery_with_count(bytea)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_redeem_recovery_with_count(bytea)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)
  TO ghm_auth_issuer;

REVOKE ALL ON FUNCTION ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)
  FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)
  TO ghm_auth_issuer;

COMMIT;
