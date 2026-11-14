-- Recovery-token redemption already revokes all account sessions. Expose the
-- revocation count through a token-bound function so the Resource API does not
-- need the broad account-ID revocation RPC.
BEGIN;

CREATE OR REPLACE FUNCTION ghm.auth_internal_redeem_recovery_with_count(
  p_token_hash bytea
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
  v_account_id bigint;
  v_updated integer := 0;
  v_revoked integer := 0;
BEGIN
  IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  UPDATE ghm.password_recovery_credential AS recovery
     SET used_at = v_now
   WHERE recovery.token_hash = p_token_hash
     AND recovery.used_at IS NULL
     AND recovery.expires_at > v_now
  RETURNING recovery.account_id INTO v_account_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 OR v_account_id IS NULL THEN
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

ALTER FUNCTION ghm.auth_internal_redeem_recovery_with_count(bytea) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_internal_redeem_recovery_with_count(bytea) FROM PUBLIC, ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.auth_redeem_recovery(p_token_hash bytea)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_account_id bigint;
BEGIN
  SELECT redeemed.account_id
    INTO v_account_id
    FROM ghm.auth_internal_redeem_recovery_with_count(p_token_hash) AS redeemed;
  RETURN v_account_id;
END;
$$;

ALTER FUNCTION ghm.auth_redeem_recovery(bytea) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_redeem_recovery(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_redeem_recovery(bytea) TO ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.auth_redeem_recovery_with_count(p_token_hash bytea)
RETURNS TABLE (
  account_id bigint,
  revoked_session_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
  SELECT *
    FROM ghm.auth_internal_redeem_recovery_with_count(p_token_hash);
$$;

ALTER FUNCTION ghm.auth_redeem_recovery_with_count(bytea) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_redeem_recovery_with_count(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_redeem_recovery_with_count(bytea) TO ghm_runtime;

-- This wrapper accepts a caller-supplied account ID. Recovery and QuoteFlow
-- reset now revoke sessions from token-bound SECURITY DEFINER functions.
-- The QuoteFlow reset function may still call this as ghm_schema_owner.
REVOKE ALL ON FUNCTION ghm.auth_revoke_all_sessions_for_account(bigint, text)
  FROM PUBLIC, ghm_runtime;

COMMIT;
