-- Replay revoke must persist: do not RAISE inside the same transaction as the revoke.
-- Return outcome so the application can commit, then map replay to an error.

DROP FUNCTION IF EXISTS ghm.auth_rotate_refresh(bytea, bytea);

CREATE OR REPLACE FUNCTION ghm.auth_rotate_refresh(
  p_presented_token_hash bytea,
  p_successor_token_hash bytea
) RETURNS TABLE (
  outcome text,
  session_id bigint,
  account_id bigint,
  session_status text,
  created_at timestamptz,
  last_seen_at timestamptz,
  absolute_expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  refresh_credential_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_now timestamptz := now();
  v_cred ghm.refresh_credential%ROWTYPE;
  v_session ghm.authentication_session%ROWTYPE;
  v_account_status text;
  v_updated integer;
  v_successor_id bigint;
BEGIN
  IF p_presented_token_hash IS NULL OR octet_length(p_presented_token_hash) = 0 THEN
    RAISE EXCEPTION 'presented refresh hash must be non-empty' USING ERRCODE = '22023';
  END IF;
  IF p_successor_token_hash IS NULL OR octet_length(p_successor_token_hash) = 0 THEN
    RAISE EXCEPTION 'successor refresh hash must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT rc.* INTO v_cred
    FROM ghm.refresh_credential rc
   WHERE rc.token_hash = p_presented_token_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFRESH_CREDENTIAL_INVALID' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.* INTO v_session
    FROM ghm.authentication_session s
   WHERE s.id = v_cred.session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFRESH_CREDENTIAL_INVALID' USING ERRCODE = 'P0002';
  END IF;

  SELECT rc.* INTO v_cred
    FROM ghm.refresh_credential rc
   WHERE rc.id = v_cred.id
   FOR UPDATE;

  IF v_cred.used_at IS NOT NULL OR v_cred.revoked_at IS NOT NULL THEN
    PERFORM ghm.auth_internal_revoke_session_family(v_session.id, 'replay', v_now);
    SELECT s.* INTO v_session
      FROM ghm.authentication_session s
     WHERE s.id = v_session.id;
    RETURN QUERY
    SELECT
      'replay'::text,
      v_session.id,
      v_session.account_id,
      v_session.session_status,
      v_session.created_at,
      v_session.last_seen_at,
      v_session.absolute_expires_at,
      v_session.revoked_at,
      v_session.revoke_reason,
      NULL::bigint;
    RETURN;
  END IF;

  SELECT a.account_status INTO v_account_status
    FROM ghm.account_identity a
   WHERE a.id = v_session.account_id;
  IF v_account_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Account is disabled' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.session_status <> 'active' THEN
    RAISE EXCEPTION 'SESSION_REVOKED' USING ERRCODE = 'P0001';
  END IF;
  IF v_now >= v_session.absolute_expires_at THEN
    RAISE EXCEPTION 'SESSION_ABSOLUTE_EXPIRED' USING ERRCODE = 'P0001';
  END IF;
  IF v_now >= v_session.last_seen_at + interval '30 days' THEN
    RAISE EXCEPTION 'SESSION_INACTIVITY_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE ghm.refresh_credential rc
     SET used_at = v_now
   WHERE rc.id = v_cred.id
     AND rc.used_at IS NULL
     AND rc.revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    PERFORM ghm.auth_internal_revoke_session_family(v_session.id, 'replay', v_now);
    SELECT s.* INTO v_session
      FROM ghm.authentication_session s
     WHERE s.id = v_session.id;
    RETURN QUERY
    SELECT
      'replay'::text,
      v_session.id,
      v_session.account_id,
      v_session.session_status,
      v_session.created_at,
      v_session.last_seen_at,
      v_session.absolute_expires_at,
      v_session.revoked_at,
      v_session.revoke_reason,
      NULL::bigint;
    RETURN;
  END IF;

  INSERT INTO ghm.refresh_credential (
    session_id,
    token_hash,
    issued_at,
    predecessor_id
  ) VALUES (
    v_session.id,
    p_successor_token_hash,
    v_now,
    v_cred.id
  )
  RETURNING ghm.refresh_credential.id INTO v_successor_id;

  UPDATE ghm.authentication_session s
     SET last_seen_at = v_now
   WHERE s.id = v_session.id
  RETURNING s.* INTO v_session;

  RETURN QUERY
  SELECT
    'rotated'::text,
    v_session.id,
    v_session.account_id,
    v_session.session_status,
    v_session.created_at,
    v_session.last_seen_at,
    v_session.absolute_expires_at,
    v_session.revoked_at,
    v_session.revoke_reason,
    v_successor_id;
END;
$$;

ALTER FUNCTION ghm.auth_rotate_refresh(bytea, bytea)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_rotate_refresh(bytea, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_rotate_refresh(bytea, bytea) TO ghm_runtime;

-- Drop prior overload signature if PostgreSQL kept both (same args; REPLACE updates).
-- Ensure runtime execute remains.
