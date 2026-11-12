-- Conditional password-hash rehash. A login may update a hash only if the
-- credential still contains the exact hash it verified. This prevents a stale
-- login from overwriting a concurrent password reset/change.
BEGIN;

CREATE OR REPLACE FUNCTION ghm.auth_rehash_password_if_unchanged(
  p_account_id bigint,
  p_expected_password_hash text,
  p_password_hash text,
  p_argon2_memory_kib integer,
  p_argon2_time_cost integer,
  p_argon2_parallelism integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  IF p_account_id IS NULL OR p_account_id < 1
     OR p_expected_password_hash IS NULL OR btrim(p_expected_password_hash) = ''
     OR p_password_hash IS NULL OR btrim(p_password_hash) = ''
     OR p_argon2_memory_kib IS NULL OR p_argon2_memory_kib < 1
     OR p_argon2_time_cost IS NULL OR p_argon2_time_cost < 1
     OR p_argon2_parallelism IS NULL OR p_argon2_parallelism < 1 THEN
    RAISE EXCEPTION 'PASSWORD_REHASH_INVALID' USING ERRCODE = 'P0001';
  END IF;

  UPDATE ghm.account_password_credential
     SET password_hash = p_password_hash,
         argon2_memory_kib = p_argon2_memory_kib,
         argon2_time_cost = p_argon2_time_cost,
         argon2_parallelism = p_argon2_parallelism,
         password_changed_at = v_now,
         updated_at = v_now
   WHERE account_id = p_account_id
     AND credential_status = 'active'
     AND password_hash = p_expected_password_hash;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

ALTER FUNCTION ghm.auth_rehash_password_if_unchanged(
  bigint, text, text, integer, integer, integer
) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.auth_rehash_password_if_unchanged(
  bigint, text, text, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_rehash_password_if_unchanged(
  bigint, text, text, integer, integer, integer
) TO ghm_runtime;

COMMENT ON FUNCTION ghm.auth_rehash_password_if_unchanged(
  bigint, text, text, integer, integer, integer
) IS
  'Conditionally rehashes an active credential only while its stored password hash equals the hash verified by the caller; never changes login email.';

COMMIT;
