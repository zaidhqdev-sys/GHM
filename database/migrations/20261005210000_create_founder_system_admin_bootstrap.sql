-- GHM founder system-admin bootstrap authority.
-- One-time installation primitive; never exposed to the runtime role.

CREATE TABLE ghm.founder_system_admin_bootstrap_state (
  id boolean PRIMARY KEY DEFAULT true,
  initialized_at timestamptz NOT NULL DEFAULT now(),
  account_id bigint NOT NULL,
  founder_login_email text NOT NULL,
  CONSTRAINT founder_system_admin_bootstrap_state_singleton CHECK (id)
);

ALTER TABLE ghm.founder_system_admin_bootstrap_state
  OWNER TO ghm_schema_owner;

CREATE OR REPLACE FUNCTION ghm.auth_bootstrap_founder_system_admin(
  p_full_name text,
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
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(731825);

  IF EXISTS (SELECT 1 FROM ghm.founder_system_admin_bootstrap_state) THEN
    RAISE EXCEPTION 'GHM founder bootstrap already initialized' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM ghm.account_identity WHERE is_system_admin = true) THEN
    RAISE EXCEPTION 'GHM system administrator already exists' USING ERRCODE = 'P0001';
  END IF;

  IF p_login_email IS NULL OR btrim(p_login_email) <> 'zaidhqdev@gmail.com' THEN
    RAISE EXCEPTION 'Founder bootstrap is restricted to the designated founder email' USING ERRCODE = '22023';
  END IF;

  IF p_login_email_normalized IS NULL OR btrim(p_login_email_normalized) <> 'zaidhqdev@gmail.com' THEN
    RAISE EXCEPTION 'Founder bootstrap requires the canonical founder login email' USING ERRCODE = '22023';
  END IF;

  IF p_password_hash IS NULL OR btrim(p_password_hash) = '' THEN
    RAISE EXCEPTION 'password hash must be non-blank' USING ERRCODE = '22023';
  END IF;

  IF p_argon2_memory_kib IS NULL OR p_argon2_memory_kib <= 0
     OR p_argon2_time_cost IS NULL OR p_argon2_time_cost <= 0
     OR p_argon2_parallelism IS NULL OR p_argon2_parallelism <= 0 THEN
    RAISE EXCEPTION 'Argon2 parameters must be positive' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ghm.account_password_credential
    WHERE login_email_normalized = 'zaidhqdev@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Founder account already exists' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.account_id
    INTO v_account_id
  FROM ghm.auth_create_account(
    NULLIF(btrim(p_full_name), ''),
    'customer',
    btrim(p_login_email),
    btrim(p_login_email_normalized),
    p_password_hash,
    p_argon2_memory_kib,
    p_argon2_time_cost,
    p_argon2_parallelism
  ) AS a;

  UPDATE ghm.account_identity
     SET is_system_admin = true
   WHERE id = v_account_id
     AND is_system_admin = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Founder system-admin state could not be established' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO ghm.founder_system_admin_bootstrap_state (
    account_id,
    founder_login_email
  )
  VALUES (
    v_account_id,
    'zaidhqdev@gmail.com'
  );

  RETURN QUERY SELECT v_account_id, 'zaidhqdev@gmail.com'::text;
END;
$$;

ALTER FUNCTION ghm.auth_bootstrap_founder_system_admin(
  text, text, text, text, integer, integer, integer
) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.auth_bootstrap_founder_system_admin(
  text, text, text, text, integer, integer, integer
) FROM PUBLIC;

REVOKE ALL ON FUNCTION ghm.auth_bootstrap_founder_system_admin(
  text, text, text, text, integer, integer, integer
) FROM ghm_runtime;
