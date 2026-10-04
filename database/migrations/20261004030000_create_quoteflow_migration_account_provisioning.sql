-- Migration-only credentialless QuoteFlow account provisioning.
-- Creates a canonical GHM account and its exact legacy Supabase provenance
-- mapping atomically. It never creates credentials or sessions.

CREATE OR REPLACE FUNCTION ghm.auth_provision_migration_account(
  p_provider text,
  p_subject text,
  p_full_name text,
  p_role text
) RETURNS TABLE (
  outcome text,
  account_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $$
DECLARE
  v_existing ghm.account_external_identity%ROWTYPE;
  v_account_id bigint;
  v_role text := COALESCE(NULLIF(btrim(p_role), ''), 'customer');
  v_lock_key bigint;
BEGIN
  IF p_provider IS NULL OR btrim(p_provider) = '' THEN
    RAISE EXCEPTION 'provider must be non-blank' USING ERRCODE = '22023';
  END IF;

  IF p_provider <> 'supabase' THEN
    RAISE EXCEPTION 'migration provider must be supabase' USING ERRCODE = '22023';
  END IF;

  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'subject must be non-blank' USING ERRCODE = '22023';
  END IF;

  IF v_role NOT IN ('customer', 'business') THEN
    RAISE EXCEPTION 'migration role must be customer or business' USING ERRCODE = '22023';
  END IF;

  v_lock_key := pg_catalog.hashtextextended(p_provider || E'\\x1f' || p_subject, 0);
  PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

  SELECT m.* INTO v_existing
    FROM ghm.account_external_identity m
   WHERE m.provider = p_provider
     AND m.subject = p_subject;

  IF FOUND THEN
    outcome := 'already_provisioned';
    account_id := v_existing.account_id;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Keep both inserts in the same function statement transaction boundary.
  -- Any failure in the mapping insert aborts the function call and therefore
  -- cannot leave an orphan canonical account.
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

  INSERT INTO ghm.account_external_identity (
    provider,
    subject,
    account_id
  )
  VALUES (
    p_provider,
    p_subject,
    v_account_id
  );

  outcome := 'created';
  account_id := v_account_id;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_provision_migration_account(
  text, text, text, text
) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.auth_provision_migration_account(
  text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ghm.auth_provision_migration_account(
  text, text, text, text
) TO ghm_runtime;

COMMENT ON FUNCTION ghm.auth_provision_migration_account(
  text, text, text, text
) IS
  'Migration-only credentialless account provisioning for legacy Supabase identity. Creates account_identity plus exact external mapping atomically; never creates password credentials, sessions, Businesses, memberships, or email-based identity matches.';

REVOKE INSERT, UPDATE, DELETE ON TABLE ghm.account_identity FROM ghm_runtime;
REVOKE INSERT, UPDATE, DELETE ON TABLE ghm.account_external_identity FROM ghm_runtime;
