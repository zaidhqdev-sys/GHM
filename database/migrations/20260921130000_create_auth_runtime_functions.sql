-- GHM Auth runtime mutation boundary (R6).
-- SECURITY DEFINER functions + EXECUTE grants; tighten account_identity UPDATE columns.
-- Construction foundation only — no HTTP Auth API, no HS cutover, no product migration.

-- ---------------------------------------------------------------------------
-- 1) Tighten account_identity UPDATE: preserve profile fields; block auth lifecycle DML
-- ---------------------------------------------------------------------------

REVOKE UPDATE ON TABLE ghm.account_identity FROM ghm_runtime;

GRANT UPDATE (
  full_name,
  phone,
  avatar_ref,
  role,
  updated_at
) ON TABLE ghm.account_identity TO ghm_runtime;

COMMENT ON COLUMN ghm.account_identity.account_status IS
  'GHM account lifecycle: active | disabled. Mutated only via auth_* DEFINER functions.';

COMMENT ON COLUMN ghm.account_identity.is_system_admin IS
  'Governed system-admin state. Mutated only via auth_* DEFINER functions. Not JWT authority.';

-- ---------------------------------------------------------------------------
-- Helpers: revoke all refresh credentials for a session / account
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ghm.auth_internal_revoke_session_family(
  p_session_id bigint,
  p_reason text,
  p_now timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  UPDATE ghm.authentication_session
     SET session_status = 'revoked',
         revoked_at = COALESCE(revoked_at, p_now),
         revoke_reason = COALESCE(revoke_reason, p_reason)
   WHERE id = p_session_id
     AND session_status = 'active';

  UPDATE ghm.refresh_credential
     SET revoked_at = COALESCE(revoked_at, p_now)
   WHERE session_id = p_session_id
     AND revoked_at IS NULL;
END;
$$;

ALTER FUNCTION ghm.auth_internal_revoke_session_family(bigint, text, timestamptz)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_internal_revoke_session_family(bigint, text, timestamptz) FROM PUBLIC;
-- Internal helper: not granted to ghm_runtime

CREATE OR REPLACE FUNCTION ghm.auth_internal_revoke_all_sessions_for_account(
  p_account_id bigint,
  p_reason text,
  p_now timestamptz DEFAULT now(),
  p_keep_session_id bigint DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  revoked_count integer := 0;
  session_row record;
BEGIN
  FOR session_row IN
    SELECT id
      FROM ghm.authentication_session
     WHERE account_id = p_account_id
       AND session_status = 'active'
       AND (p_keep_session_id IS NULL OR id <> p_keep_session_id)
  LOOP
    PERFORM ghm.auth_internal_revoke_session_family(session_row.id, p_reason, p_now);
    revoked_count := revoked_count + 1;
  END LOOP;
  RETURN revoked_count;
END;
$$;

ALTER FUNCTION ghm.auth_internal_revoke_all_sessions_for_account(bigint, text, timestamptz, bigint)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_internal_revoke_all_sessions_for_account(bigint, text, timestamptz, bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Password credential write
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ghm.auth_set_password(
  p_account_id bigint,
  p_login_email text,
  p_login_email_normalized text,
  p_password_hash text,
  p_argon2_memory_kib integer DEFAULT NULL,
  p_argon2_time_cost integer DEFAULT NULL,
  p_argon2_parallelism integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Account ID must be a positive integer' USING ERRCODE = '22023';
  END IF;
  IF p_login_email IS NULL OR btrim(p_login_email) = '' THEN
    RAISE EXCEPTION 'login_email must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_login_email_normalized IS NULL OR btrim(p_login_email_normalized) = '' THEN
    RAISE EXCEPTION 'login_email_normalized must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_password_hash IS NULL OR btrim(p_password_hash) = '' THEN
    RAISE EXCEPTION 'password_hash must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO ghm.account_password_credential (
    account_id,
    login_email,
    login_email_normalized,
    password_hash,
    argon2_memory_kib,
    argon2_time_cost,
    argon2_parallelism,
    credential_status,
    password_changed_at,
    created_at,
    updated_at
  ) VALUES (
    p_account_id,
    p_login_email,
    p_login_email_normalized,
    p_password_hash,
    p_argon2_memory_kib,
    p_argon2_time_cost,
    p_argon2_parallelism,
    'active',
    now(),
    now(),
    now()
  )
  ON CONFLICT (account_id) DO UPDATE
    SET login_email = EXCLUDED.login_email,
        login_email_normalized = EXCLUDED.login_email_normalized,
        password_hash = EXCLUDED.password_hash,
        argon2_memory_kib = EXCLUDED.argon2_memory_kib,
        argon2_time_cost = EXCLUDED.argon2_time_cost,
        argon2_parallelism = EXCLUDED.argon2_parallelism,
        credential_status = 'active',
        password_changed_at = now(),
        updated_at = now();
END;
$$;

ALTER FUNCTION ghm.auth_set_password(bigint, text, text, text, integer, integer, integer)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_set_password(bigint, text, text, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_set_password(bigint, text, text, text, integer, integer, integer) TO ghm_runtime;

-- Lookup by normalized email (returns hash for verify — EXECUTE only; no table SELECT)
CREATE OR REPLACE FUNCTION ghm.auth_lookup_password_by_normalized_email(
  p_login_email_normalized text
) RETURNS TABLE (
  account_id bigint,
  login_email text,
  login_email_normalized text,
  password_hash text,
  credential_status text,
  argon2_memory_kib integer,
  argon2_time_cost integer,
  argon2_parallelism integer,
  account_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  RETURN QUERY
  SELECT c.account_id,
         c.login_email,
         c.login_email_normalized,
         c.password_hash,
         c.credential_status,
         c.argon2_memory_kib,
         c.argon2_time_cost,
         c.argon2_parallelism,
         a.account_status
    FROM ghm.account_password_credential c
    JOIN ghm.account_identity a ON a.id = c.account_id
   WHERE c.login_email_normalized = p_login_email_normalized;
END;
$$;

ALTER FUNCTION ghm.auth_lookup_password_by_normalized_email(text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_lookup_password_by_normalized_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_password_by_normalized_email(text) TO ghm_runtime;

-- ---------------------------------------------------------------------------
-- Session create + first refresh
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ghm.auth_create_session_with_refresh(
  p_account_id bigint,
  p_refresh_token_hash bytea
) RETURNS TABLE (
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
  v_session ghm.authentication_session%ROWTYPE;
  v_refresh_id bigint;
  v_status text;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Account ID must be a positive integer' USING ERRCODE = '22023';
  END IF;
  IF p_refresh_token_hash IS NULL OR octet_length(p_refresh_token_hash) = 0 THEN
    RAISE EXCEPTION 'refresh token hash must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT a.account_status INTO v_status
    FROM ghm.account_identity a
   WHERE a.id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Account is disabled' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO ghm.authentication_session (
    account_id,
    session_status,
    created_at,
    last_seen_at,
    absolute_expires_at
  ) VALUES (
    p_account_id,
    'active',
    v_now,
    v_now,
    v_now + interval '90 days'
  )
  RETURNING * INTO v_session;

  INSERT INTO ghm.refresh_credential (
    session_id,
    token_hash,
    issued_at,
    predecessor_id
  ) VALUES (
    v_session.id,
    p_refresh_token_hash,
    v_now,
    NULL
  )
  RETURNING id INTO v_refresh_id;

  session_id := v_session.id;
  account_id := v_session.account_id;
  session_status := v_session.session_status;
  created_at := v_session.created_at;
  last_seen_at := v_session.last_seen_at;
  absolute_expires_at := v_session.absolute_expires_at;
  revoked_at := v_session.revoked_at;
  revoke_reason := v_session.revoke_reason;
  refresh_credential_id := v_refresh_id;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_create_session_with_refresh(bigint, bytea)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_create_session_with_refresh(bigint, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_create_session_with_refresh(bigint, bytea) TO ghm_runtime;

-- ---------------------------------------------------------------------------
-- Session validation (read model for foundation tests / future refresh)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ghm.auth_validate_session(
  p_session_id bigint
) RETURNS TABLE (
  session_id bigint,
  account_id bigint,
  session_status text,
  account_status text,
  created_at timestamptz,
  last_seen_at timestamptz,
  absolute_expires_at timestamptz,
  is_usable boolean,
  reject_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_now timestamptz := now();
  v_session ghm.authentication_session%ROWTYPE;
  v_account_status text;
BEGIN
  SELECT * INTO v_session
    FROM ghm.authentication_session s
   WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    session_id := p_session_id;
    account_id := NULL;
    session_status := NULL;
    account_status := NULL;
    created_at := NULL;
    last_seen_at := NULL;
    absolute_expires_at := NULL;
    is_usable := false;
    reject_reason := 'session_not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT a.account_status INTO v_account_status
    FROM ghm.account_identity a
   WHERE a.id = v_session.account_id;

  session_id := v_session.id;
  account_id := v_session.account_id;
  session_status := v_session.session_status;
  account_status := v_account_status;
  created_at := v_session.created_at;
  last_seen_at := v_session.last_seen_at;
  absolute_expires_at := v_session.absolute_expires_at;

  IF v_account_status IS DISTINCT FROM 'active' THEN
    is_usable := false;
    reject_reason := 'account_disabled';
  ELSIF v_session.session_status <> 'active' THEN
    is_usable := false;
    reject_reason := 'session_revoked';
  ELSIF v_now >= v_session.absolute_expires_at THEN
    is_usable := false;
    reject_reason := 'absolute_expired';
  ELSIF v_now >= v_session.last_seen_at + interval '30 days' THEN
    is_usable := false;
    reject_reason := 'inactivity_expired';
  ELSE
    is_usable := true;
    reject_reason := NULL;
  END IF;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_validate_session(bigint)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_validate_session(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_validate_session(bigint) TO ghm_runtime;

-- ---------------------------------------------------------------------------
-- Refresh rotation + replay
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ghm.auth_rotate_refresh(
  p_presented_token_hash bytea,
  p_successor_token_hash bytea
) RETURNS TABLE (
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

  SELECT * INTO v_cred
    FROM ghm.refresh_credential rc
   WHERE rc.token_hash = p_presented_token_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFRESH_CREDENTIAL_INVALID' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_session
    FROM ghm.authentication_session s
   WHERE s.id = v_cred.session_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFRESH_CREDENTIAL_INVALID' USING ERRCODE = 'P0002';
  END IF;

  -- Re-read credential after session lock
  SELECT * INTO v_cred
    FROM ghm.refresh_credential rc
   WHERE rc.id = v_cred.id
   FOR UPDATE;

  IF v_cred.used_at IS NOT NULL OR v_cred.revoked_at IS NOT NULL THEN
    PERFORM ghm.auth_internal_revoke_session_family(v_session.id, 'replay', v_now);
    RAISE EXCEPTION 'REFRESH_CREDENTIAL_REUSED' USING ERRCODE = 'P0001';
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

  UPDATE ghm.refresh_credential
     SET used_at = v_now
   WHERE id = v_cred.id
     AND used_at IS NULL
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    PERFORM ghm.auth_internal_revoke_session_family(v_session.id, 'replay', v_now);
    RAISE EXCEPTION 'REFRESH_CREDENTIAL_REUSED' USING ERRCODE = 'P0001';
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
  RETURNING id INTO v_successor_id;

  UPDATE ghm.authentication_session
     SET last_seen_at = v_now
   WHERE id = v_session.id
  RETURNING * INTO v_session;

  session_id := v_session.id;
  account_id := v_session.account_id;
  session_status := v_session.session_status;
  created_at := v_session.created_at;
  last_seen_at := v_session.last_seen_at;
  absolute_expires_at := v_session.absolute_expires_at;
  revoked_at := v_session.revoked_at;
  revoke_reason := v_session.revoke_reason;
  refresh_credential_id := v_successor_id;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_rotate_refresh(bytea, bytea)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_rotate_refresh(bytea, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_rotate_refresh(bytea, bytea) TO ghm_runtime;

-- ---------------------------------------------------------------------------
-- Logout / revoke helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ghm.auth_revoke_session(
  p_session_id bigint,
  p_reason text DEFAULT 'logout'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_session_id IS NULL OR p_session_id <= 0 THEN
    RAISE EXCEPTION 'Session ID must be a positive integer' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM ghm.authentication_session WHERE id = p_session_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN false;
  END IF;
  PERFORM ghm.auth_internal_revoke_session_family(p_session_id, COALESCE(p_reason, 'logout'), now());
  RETURN true;
END;
$$;

ALTER FUNCTION ghm.auth_revoke_session(bigint, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_revoke_session(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_revoke_session(bigint, text) TO ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.auth_revoke_all_sessions_for_account(
  p_account_id bigint,
  p_reason text DEFAULT 'password_recovery'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Account ID must be a positive integer' USING ERRCODE = '22023';
  END IF;
  RETURN ghm.auth_internal_revoke_all_sessions_for_account(
    p_account_id,
    COALESCE(p_reason, 'password_recovery'),
    now(),
    NULL
  );
END;
$$;

ALTER FUNCTION ghm.auth_revoke_all_sessions_for_account(bigint, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_revoke_all_sessions_for_account(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_revoke_all_sessions_for_account(bigint, text) TO ghm_runtime;

-- Password change: update hash + revoke all OTHER sessions (keep current)
CREATE OR REPLACE FUNCTION ghm.auth_change_password(
  p_account_id bigint,
  p_keep_session_id bigint,
  p_login_email text,
  p_login_email_normalized text,
  p_password_hash text,
  p_argon2_memory_kib integer DEFAULT NULL,
  p_argon2_time_cost integer DEFAULT NULL,
  p_argon2_parallelism integer DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  revoked integer;
BEGIN
  PERFORM ghm.auth_set_password(
    p_account_id,
    p_login_email,
    p_login_email_normalized,
    p_password_hash,
    p_argon2_memory_kib,
    p_argon2_time_cost,
    p_argon2_parallelism
  );
  revoked := ghm.auth_internal_revoke_all_sessions_for_account(
    p_account_id,
    'password_change',
    now(),
    p_keep_session_id
  );
  RETURN revoked;
END;
$$;

ALTER FUNCTION ghm.auth_change_password(bigint, bigint, text, text, text, integer, integer, integer)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_change_password(bigint, bigint, text, text, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_change_password(bigint, bigint, text, text, text, integer, integer, integer) TO ghm_runtime;

-- ---------------------------------------------------------------------------
-- Disable account
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ghm.auth_disable_account(
  p_account_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Account ID must be a positive integer' USING ERRCODE = '22023';
  END IF;
  UPDATE ghm.account_identity
     SET account_status = 'disabled',
         updated_at = now()
   WHERE id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM ghm.auth_internal_revoke_all_sessions_for_account(
    p_account_id,
    'account_disabled',
    now(),
    NULL
  );
END;
$$;

ALTER FUNCTION ghm.auth_disable_account(bigint)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_disable_account(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_disable_account(bigint) TO ghm_runtime;

-- ---------------------------------------------------------------------------
-- Recovery issue + redeem
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ghm.auth_issue_recovery(
  p_account_id bigint,
  p_token_hash bytea,
  p_expires_at timestamptz
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Account ID must be a positive integer' USING ERRCODE = '22023';
  END IF;
  IF p_token_hash IS NULL OR octet_length(p_token_hash) = 0 THEN
    RAISE EXCEPTION 'recovery token hash must be non-empty' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'recovery expires_at must be in the future' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO ghm.password_recovery_credential (
    account_id,
    token_hash,
    created_at,
    expires_at
  ) VALUES (
    p_account_id,
    p_token_hash,
    now(),
    p_expires_at
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

ALTER FUNCTION ghm.auth_issue_recovery(bigint, bytea, timestamptz)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_issue_recovery(bigint, bytea, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_issue_recovery(bigint, bytea, timestamptz) TO ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.auth_redeem_recovery(
  p_token_hash bytea
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_now timestamptz := now();
  v_account_id bigint;
  v_updated integer;
BEGIN
  IF p_token_hash IS NULL OR octet_length(p_token_hash) = 0 THEN
    RAISE EXCEPTION 'recovery token hash must be non-empty' USING ERRCODE = '22023';
  END IF;

  UPDATE ghm.password_recovery_credential
     SET used_at = v_now
   WHERE token_hash = p_token_hash
     AND used_at IS NULL
     AND revoked_at IS NULL
     AND expires_at > v_now
  RETURNING account_id INTO v_account_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'RECOVERY_CREDENTIAL_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM ghm.auth_internal_revoke_all_sessions_for_account(
    v_account_id,
    'password_recovery',
    v_now,
    NULL
  );
  RETURN v_account_id;
END;
$$;

ALTER FUNCTION ghm.auth_redeem_recovery(bytea)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_redeem_recovery(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_redeem_recovery(bytea) TO ghm_runtime;

-- ---------------------------------------------------------------------------
-- External person identity
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ghm.auth_lookup_external_identity(
  p_provider text,
  p_subject text
) RETURNS TABLE (
  id bigint,
  provider text,
  subject text,
  account_id bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.provider, m.subject, m.account_id, m.created_at, m.updated_at
    FROM ghm.account_external_identity m
   WHERE m.provider = p_provider
     AND m.subject = p_subject;
END;
$$;

ALTER FUNCTION ghm.auth_lookup_external_identity(text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_lookup_external_identity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_external_identity(text, text) TO ghm_runtime;

-- Controlled create: min identity + mapping; no membership; no admin
CREATE OR REPLACE FUNCTION ghm.auth_bootstrap_external_identity(
  p_provider text,
  p_subject text,
  p_full_name text DEFAULT NULL,
  p_role text DEFAULT 'customer'
) RETURNS TABLE (
  id bigint,
  provider text,
  subject text,
  account_id bigint,
  created_at timestamptz,
  updated_at timestamptz,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_existing ghm.account_external_identity%ROWTYPE;
  v_account_id bigint;
  v_mapping ghm.account_external_identity%ROWTYPE;
  v_role text := COALESCE(p_role, 'customer');
BEGIN
  IF p_provider IS NULL OR btrim(p_provider) = '' THEN
    RAISE EXCEPTION 'provider must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'subject must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF v_role NOT IN ('customer', 'business') THEN
    RAISE EXCEPTION 'bootstrap role must be customer or business' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
    FROM ghm.account_external_identity m
   WHERE m.provider = p_provider
     AND m.subject = p_subject;
  IF FOUND THEN
    id := v_existing.id;
    provider := v_existing.provider;
    subject := v_existing.subject;
    account_id := v_existing.account_id;
    created_at := v_existing.created_at;
    updated_at := v_existing.updated_at;
    created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin)
    VALUES (p_full_name, v_role, 'active', false)
    RETURNING ghm.account_identity.id INTO v_account_id;

    INSERT INTO ghm.account_external_identity (provider, subject, account_id)
    VALUES (p_provider, p_subject, v_account_id)
    RETURNING * INTO v_mapping;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO v_existing
        FROM ghm.account_external_identity m
       WHERE m.provider = p_provider
         AND m.subject = p_subject;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      id := v_existing.id;
      provider := v_existing.provider;
      subject := v_existing.subject;
      account_id := v_existing.account_id;
      created_at := v_existing.created_at;
      updated_at := v_existing.updated_at;
      created := false;
      RETURN NEXT;
      RETURN;
  END;

  id := v_mapping.id;
  provider := v_mapping.provider;
  subject := v_mapping.subject;
  account_id := v_mapping.account_id;
  created_at := v_mapping.created_at;
  updated_at := v_mapping.updated_at;
  created := true;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_bootstrap_external_identity(text, text, text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_bootstrap_external_identity(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_bootstrap_external_identity(text, text, text, text) TO ghm_runtime;

-- Keep secret tables sealed
REVOKE ALL ON TABLE ghm.account_password_credential FROM ghm_runtime;
REVOKE ALL ON TABLE ghm.refresh_credential FROM ghm_runtime;
REVOKE ALL ON TABLE ghm.password_recovery_credential FROM ghm_runtime;

REVOKE INSERT, UPDATE, DELETE ON TABLE ghm.authentication_session FROM ghm_runtime;
REVOKE INSERT, UPDATE, DELETE ON TABLE ghm.account_external_identity FROM ghm_runtime;
REVOKE INSERT, UPDATE, DELETE ON TABLE ghm.business_external_mapping FROM ghm_runtime;
