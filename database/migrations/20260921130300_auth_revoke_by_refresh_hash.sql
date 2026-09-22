-- Logout by refresh-token hash (session-family revoke). Idempotent when unknown/already revoked.

CREATE OR REPLACE FUNCTION ghm.auth_revoke_by_refresh_hash(
  p_token_hash bytea,
  p_reason text DEFAULT 'logout'
) RETURNS TABLE (
  found boolean,
  session_id bigint,
  account_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_cred ghm.refresh_credential%ROWTYPE;
  v_session ghm.authentication_session%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR octet_length(p_token_hash) = 0 THEN
    RAISE EXCEPTION 'refresh token hash must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT rc.* INTO v_cred
    FROM ghm.refresh_credential rc
   WHERE rc.token_hash = p_token_hash;

  IF NOT FOUND THEN
    found := false;
    session_id := NULL;
    account_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT s.* INTO v_session
    FROM ghm.authentication_session s
   WHERE s.id = v_cred.session_id;

  PERFORM ghm.auth_internal_revoke_session_family(
    v_cred.session_id,
    COALESCE(p_reason, 'logout'),
    now()
  );

  found := true;
  session_id := v_cred.session_id;
  account_id := v_session.account_id;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_revoke_by_refresh_hash(bytea, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_revoke_by_refresh_hash(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_revoke_by_refresh_hash(bytea, text) TO ghm_runtime;
