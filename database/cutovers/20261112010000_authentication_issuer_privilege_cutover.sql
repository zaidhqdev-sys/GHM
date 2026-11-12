-- MANUAL CUTOVER ONLY — do not place this file in database/migrations.
-- Apply only after all auth routes have moved to the isolated Authentication Issuer,
-- its separate service and private routing/public ingress have passed end-to-end
-- qualification, GHM web/Connect/QuoteFlow issuer URLs are configured, and the
-- issuer has its own verified ghm_auth_issuer database login and secrets.
--
-- This cutover deliberately disables auth lifecycle calls through ghm_runtime.
-- Applying it before route cutover will break registration/login/refresh/logout
-- and password reset on the Resource API. Never apply it to production until the
-- documented service/client/backup/approval gates are satisfied.
--
-- Issuer functions are SECURITY DEFINER and owned by ghm_schema_owner. The issuer
-- receives EXECUTE only; it receives no direct table/sequence privileges.
BEGIN;

DO $issuer_operator_guard$
BEGIN
  IF session_user IS DISTINCT FROM 'ghm_migrator'
     OR current_user IS DISTINCT FROM 'ghm_schema_owner' THEN
    RAISE EXCEPTION 'issuer privilege operation requires session_user=ghm_migrator and current_user=ghm_schema_owner';
  END IF;
END;
$issuer_operator_guard$;

DO $issuer_role_guard$
DECLARE
  issuer_role pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO issuer_role
    FROM pg_roles
   WHERE rolname = 'ghm_auth_issuer';

  IF NOT FOUND
     OR issuer_role.rolcanlogin IS DISTINCT FROM true
     OR issuer_role.rolinherit IS DISTINCT FROM false
     OR issuer_role.rolsuper IS DISTINCT FROM false
     OR issuer_role.rolcreatedb IS DISTINCT FROM false
     OR issuer_role.rolcreaterole IS DISTINCT FROM false
     OR issuer_role.rolreplication IS DISTINCT FROM false
     OR issuer_role.rolbypassrls IS DISTINCT FROM false
     OR EXISTS (
       SELECT 1
         FROM pg_auth_members m
         JOIN pg_roles member_role ON member_role.oid = m.member
        WHERE m.member = issuer_role.oid
           OR (m.roleid = issuer_role.oid AND member_role.rolname <> 'ghm_db_user')
     ) THEN
    RAISE EXCEPTION 'ghm_auth_issuer must exist as LOGIN NOINHERIT with no elevated attributes or role memberships';
  END IF;
END;
$issuer_role_guard$;

REVOKE CREATE ON SCHEMA ghm FROM ghm_auth_issuer;
GRANT USAGE ON SCHEMA ghm TO ghm_auth_issuer;

-- Reset any accidental direct relation/function grants before applying the
-- reviewed issuer function allow-list.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ghm FROM ghm_auth_issuer;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ghm FROM ghm_auth_issuer;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ghm FROM ghm_auth_issuer;

-- Remove the shared Resource API login's direct auth lifecycle authority.
REVOKE ALL ON FUNCTION ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_lookup_password_by_normalized_email(text)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_set_password(bigint, text, text, text, integer, integer, integer)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_rehash_password_if_unchanged(bigint, text, text, integer, integer, integer)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_create_session_with_refresh(bigint, bytea)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_validate_session(bigint)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_rotate_refresh(bytea, bytea)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_revoke_by_refresh_hash(bytea, text)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_issue_recovery(bigint, bytea, timestamptz)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_redeem_recovery(bytea)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_redeem_recovery_with_count(bytea)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_reset_password_with_recovery(bytea, text, text, integer, integer, integer)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)
  FROM PUBLIC, ghm_runtime;

-- Connect Business provider mapping is now an internal helper used only by the
-- signed Actor Gateway provisioning transaction; runtime and other app logins
-- must not invoke it directly.
REVOKE ALL ON FUNCTION ghm.auth_link_business_external_mapping(text, text, bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway, ghm_auth_issuer, ghm_payment_provider;

-- Remove legacy account-ID authority readers and all-session administration
-- wrappers retained in older production schemas. They are not part of the new
-- issuer API; the issuer uses token-bound lifecycle functions and the internal
-- owner-executed revocation helper. Some historical installations may not contain
-- these signatures, so revoke conditionally without making the cutover non-portable.
DO $legacy_auth_authority_revoke$
BEGIN
  IF to_regprocedure('ghm.auth_read_account_email(bigint)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION ghm.auth_read_account_email(bigint) FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway, ghm_auth_issuer, ghm_payment_provider';
  END IF;
  IF to_regprocedure('ghm.auth_read_connect_identity_authority(bigint)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION ghm.auth_read_connect_identity_authority(bigint) FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway, ghm_auth_issuer, ghm_payment_provider';
  END IF;
  IF to_regprocedure('ghm.auth_revoke_all_sessions_for_account(bigint,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION ghm.auth_revoke_all_sessions_for_account(bigint,text) FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway, ghm_auth_issuer, ghm_payment_provider';
  END IF;
END;
$legacy_auth_authority_revoke$;

-- Grant exactly the reviewed authentication issuer function allow-list.
GRANT EXECUTE ON FUNCTION ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)
  TO ghm_auth_issuer;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_password_by_normalized_email(text)
  TO ghm_auth_issuer;
GRANT EXECUTE ON FUNCTION ghm.auth_rehash_password_if_unchanged(bigint, text, text, integer, integer, integer)
  TO ghm_auth_issuer;
GRANT EXECUTE ON FUNCTION ghm.auth_create_session_with_refresh(bigint, bytea)
  TO ghm_auth_issuer;
GRANT EXECUTE ON FUNCTION ghm.auth_rotate_refresh(bytea, bytea)
  TO ghm_auth_issuer;
GRANT EXECUTE ON FUNCTION ghm.auth_revoke_by_refresh_hash(bytea, text)
  TO ghm_auth_issuer;
GRANT EXECUTE ON FUNCTION ghm.auth_issue_recovery(bigint, bytea, timestamptz)
  TO ghm_auth_issuer;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)
  TO ghm_auth_issuer;
GRANT EXECUTE ON FUNCTION ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)
  TO ghm_auth_issuer;

-- QuoteFlow reset enrollment registration is a migration/operator action.
-- The issuer may read/complete an existing enrollment, but cannot register or
-- alter the approved migration provenance itself.
REVOKE ALL ON FUNCTION ghm.auth_register_quoteflow_migration_reset_enrollment(bigint, text, text, text, text, text)
  FROM PUBLIC, ghm_runtime, ghm_auth_issuer;

-- The Resource API runtime retains only lookup access to existing person
-- and business external-identity mappings. Connect Business provisioning now
-- executes through its signed Actor Gateway operation; this internal mapping-link
-- helper is not directly executable by ghm_runtime or other application logins.
-- The signed gateway wrapper owns the authorized provisioning transaction.

GRANT EXECUTE ON FUNCTION ghm.auth_reset_password_with_recovery(bytea, text, text, integer, integer, integer)
  TO ghm_auth_issuer;

COMMIT;
