-- Canonical GHM account registration primitive.
-- Creates identity + password credential atomically; never creates membership.

CREATE OR REPLACE FUNCTION ghm.auth_create_account(
  p_full_name text,
  p_role text,
  p_login_email text,
  p_login_email_normalized text,
  p_password_hash text,
  p_argon2_memory_kib integer,
  p_argon2_time_cost integer,
  p_argon2_parallelism integer
)
RETURNS TABLE (
  account_id bigint,
  login_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ghm, pg_temp
AS $$
DECLARE
  v_account_id bigint;
  v_role text := COALESCE(NULLIF(btrim(p_role), ''), 'customer');
BEGIN
  IF p_login_email IS NULL OR btrim(p_login_email) = '' THEN
    RAISE EXCEPTION 'login email must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_login_email_normalized IS NULL OR btrim(p_login_email_normalized) = '' THEN
    RAISE EXCEPTION 'normalized login email must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_password_hash IS NULL OR btrim(p_password_hash) = '' THEN
    RAISE EXCEPTION 'password hash must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF v_role NOT IN ('customer', 'business') THEN
    RAISE EXCEPTION 'registration role must be customer or business' USING ERRCODE = '22023';
  END IF;

  INSERT INTO ghm.account_identity (
    full_name,
    role,
    account_status,
    is_system_admin
  )
  VALUES (
    NULLIF(btrim(p_full_name), ''),
    v_role,
    'active',
    false
  )
  RETURNING id INTO v_account_id;

  INSERT INTO ghm.account_password_credential (
    account_id,
    login_email,
    login_email_normalized,
    password_hash,
    argon2_memory_kib,
    argon2_time_cost,
    argon2_parallelism,
    credential_status
  )
  VALUES (
    v_account_id,
    p_login_email,
    p_login_email_normalized,
    p_password_hash,
    p_argon2_memory_kib,
    p_argon2_time_cost,
    p_argon2_parallelism,
    'active'
  );

  RETURN QUERY SELECT v_account_id, p_login_email;
END;
$$;

ALTER FUNCTION ghm.auth_create_account(
  text, text, text, text, text, integer, integer, integer
) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.auth_create_account(
  text, text, text, text, text, integer, integer, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ghm.auth_create_account(
  text, text, text, text, text, integer, integer, integer
) TO ghm_runtime;
