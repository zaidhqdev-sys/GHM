-- Correct GHM founder system-admin bootstrap authority.
-- Replaces the original create-account primitive with a promotion-only
-- primitive for an already-existing canonical founder account.
--
-- This migration does NOT bootstrap the founder account.
-- It only changes the controlled installation primitive.

DROP FUNCTION ghm.auth_bootstrap_founder_system_admin(
  text, text, text, text, integer, integer, integer
);

REVOKE ALL ON TABLE ghm.founder_system_admin_bootstrap_state FROM PUBLIC;
REVOKE ALL ON TABLE ghm.founder_system_admin_bootstrap_state FROM ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.auth_bootstrap_founder_system_admin(
  p_login_email text
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

  IF EXISTS (
    SELECT 1
    FROM ghm.founder_system_admin_bootstrap_state
  ) THEN
    RAISE EXCEPTION 'GHM founder bootstrap already initialized'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM ghm.account_identity
    WHERE is_system_admin = true
  ) THEN
    RAISE EXCEPTION 'GHM system administrator already exists'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_login_email IS NULL
     OR btrim(p_login_email) <> 'zaidhqdev@gmail.com' THEN
    RAISE EXCEPTION 'Founder bootstrap is restricted to the designated founder email'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
    FROM ghm.account_password_credential pc
    WHERE pc.login_email_normalized = 'zaidhqdev@gmail.com'
  ) <> 1 THEN
    RAISE EXCEPTION 'Designated founder identity is missing or ambiguous'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pc.account_id
    INTO v_account_id
  FROM ghm.account_password_credential pc
  JOIN ghm.account_identity ai
    ON ai.id = pc.account_id
  WHERE pc.login_email_normalized = 'zaidhqdev@gmail.com'
    AND ai.account_status = 'active';

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Designated founder account does not exist as an active GHM account'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE ghm.account_identity
     SET is_system_admin = true
   WHERE id = v_account_id
     AND is_system_admin = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Founder system-admin state could not be established'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO ghm.founder_system_admin_bootstrap_state (
    account_id,
    founder_login_email
  )
  VALUES (
    v_account_id,
    'zaidhqdev@gmail.com'
  );

  RETURN QUERY
  SELECT v_account_id, 'zaidhqdev@gmail.com'::text;
END;
$$;

ALTER FUNCTION ghm.auth_bootstrap_founder_system_admin(text)
  OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.auth_bootstrap_founder_system_admin(text)
  FROM PUBLIC;

REVOKE ALL ON FUNCTION ghm.auth_bootstrap_founder_system_admin(text)
  FROM ghm_runtime;
