-- Atomic completion boundary for the one-user QuoteFlow migration reset ceremony.
-- Binds the recovery credential to an eligible migration enrollment and completes
-- password establishment + session revocation + enrollment transition as one DB operation.

CREATE OR REPLACE FUNCTION ghm.auth_complete_quoteflow_migration_reset(
  p_token_hash bytea,
  p_password_hash text,
  p_argon2_memory_kib integer DEFAULT NULL,
  p_argon2_time_cost integer DEFAULT NULL,
  p_argon2_parallelism integer DEFAULT NULL
) RETURNS TABLE (
  account_id bigint,
  login_email text,
  revoked_session_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $$
DECLARE
  v_recovery ghm.password_recovery_credential%ROWTYPE;
  v_enrollment ghm.quoteflow_migration_reset_enrollment%ROWTYPE;
  v_identity ghm.account_identity%ROWTYPE;
  v_revoked integer;
BEGIN
  IF p_token_hash IS NULL OR octet_length(p_token_hash) = 0 THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_password_hash IS NULL OR btrim(p_password_hash) = '' THEN
    RAISE EXCEPTION 'password hash must be non-blank' USING ERRCODE = '22023';
  END IF;

  -- Lock enrollment first so two valid recovery credentials cannot complete
  -- the same migration enrollment concurrently.
  SELECT e.* INTO v_enrollment
    FROM ghm.quoteflow_migration_reset_enrollment e
   WHERE e.enrollment_status = 'reset_required'
     AND EXISTS (
       SELECT 1
         FROM ghm.password_recovery_credential r
        WHERE r.account_id = e.account_id
          AND r.token_hash = p_token_hash
          AND r.used_at IS NULL
          AND r.revoked_at IS NULL
          AND r.expires_at > now()
     )
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.* INTO v_identity
    FROM ghm.account_identity a
   WHERE a.id = v_enrollment.account_id
     AND a.account_status = 'active'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM ghm.account_external_identity x
     WHERE x.provider = v_enrollment.source_provider
       AND x.subject = v_enrollment.source_subject
       AND x.account_id = v_enrollment.account_id
  ) THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.* INTO v_recovery
    FROM ghm.password_recovery_credential r
   WHERE r.account_id = v_enrollment.account_id
     AND r.token_hash = p_token_hash
     AND r.used_at IS NULL
     AND r.revoked_at IS NULL
     AND r.expires_at > now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  UPDATE ghm.password_recovery_credential
     SET used_at = now()
   WHERE id = v_recovery.id;

  PERFORM ghm.auth_set_password(
    v_enrollment.account_id,
    v_enrollment.approved_email,
    v_enrollment.approved_email_normalized,
    p_password_hash,
    p_argon2_memory_kib,
    p_argon2_time_cost,
    p_argon2_parallelism
  );

  v_revoked := ghm.auth_revoke_all_sessions_for_account(
    v_enrollment.account_id,
    'password_recovery'
  );

  UPDATE ghm.quoteflow_migration_reset_enrollment
     SET enrollment_status = 'completed',
         updated_at = now()
   WHERE id = v_enrollment.id;

  account_id := v_enrollment.account_id;
  login_email := v_enrollment.approved_email;
  revoked_session_count := v_revoked;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_complete_quoteflow_migration_reset(
  bytea, text, integer, integer, integer
) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.auth_complete_quoteflow_migration_reset(
  bytea, text, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_complete_quoteflow_migration_reset(
  bytea, text, integer, integer, integer
) TO ghm_runtime;
