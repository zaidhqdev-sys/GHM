-- Token-bound password reset that preserves the account's existing login email.
-- The presented recovery token and normalized email must belong to the same active
-- credential. The operation consumes the token, updates only the password hash,
-- and revokes all sessions atomically.
BEGIN;

CREATE OR REPLACE FUNCTION ghm.auth_reset_password_with_recovery(
  p_token_hash bytea,
  p_login_email_normalized text,
  p_password_hash text,
  p_argon2_memory_kib integer DEFAULT NULL,
  p_argon2_time_cost integer DEFAULT NULL,
  p_argon2_parallelism integer DEFAULT NULL
) RETURNS TABLE (
  account_id bigint,
  revoked_session_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_now timestamptz := now();
  v_recovery ghm.password_recovery_credential%ROWTYPE;
  v_account_id bigint;
  v_updated integer := 0;
  v_revoked integer := 0;
BEGIN
  IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32
     OR p_login_email_normalized IS NULL OR btrim(p_login_email_normalized) = ''
     OR p_password_hash IS NULL OR btrim(p_password_hash) = '' THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT r.*
    INTO v_recovery
    FROM ghm.password_recovery_credential r
   WHERE r.token_hash = p_token_hash
     AND r.used_at IS NULL
     AND r.revoked_at IS NULL
     AND r.expires_at > v_now
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.id
    INTO v_account_id
    FROM ghm.account_identity a
    JOIN ghm.account_password_credential c ON c.account_id = a.id
   WHERE a.id = v_recovery.account_id
     AND a.account_status = 'active'
     AND c.credential_status = 'active'
     AND c.login_email_normalized = btrim(p_login_email_normalized)
   FOR UPDATE OF a, c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  UPDATE ghm.password_recovery_credential
     SET used_at = v_now
   WHERE id = v_recovery.id
     AND used_at IS NULL
     AND revoked_at IS NULL
     AND expires_at > v_now;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  UPDATE ghm.account_password_credential
     SET password_hash = p_password_hash,
         argon2_memory_kib = p_argon2_memory_kib,
         argon2_time_cost = p_argon2_time_cost,
         argon2_parallelism = p_argon2_parallelism,
         password_changed_at = v_now,
         updated_at = v_now
   WHERE account_id = v_account_id
     AND credential_status = 'active';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_revoked := ghm.auth_internal_revoke_all_sessions_for_account(
    v_account_id,
    'password_recovery',
    v_now,
    NULL
  );

  account_id := v_account_id;
  revoked_session_count := v_revoked;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_reset_password_with_recovery(
  bytea, text, text, integer, integer, integer
) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.auth_reset_password_with_recovery(
  bytea, text, text, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_reset_password_with_recovery(
  bytea, text, text, integer, integer, integer
) TO ghm_runtime;

COMMENT ON FUNCTION ghm.auth_reset_password_with_recovery(
  bytea, text, text, integer, integer, integer
) IS
  'Token-bound password reset. Requires matching normalized login email, preserves the existing email, consumes one recovery token, and revokes all sessions atomically.';

COMMIT;
