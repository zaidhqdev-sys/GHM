-- Harden Saved Business mutation functions so runtime callers cannot supply
-- an arbitrary account identifier as the authorization context.
-- Construction-only. No production migration or product cutover is authorized.

CREATE OR REPLACE FUNCTION ghm.create_saved_business(p_business_id bigint)
RETURNS TABLE (id bigint, account_id bigint, business_id bigint, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  context_account_id bigint;
BEGIN
  context_account_id := NULLIF(current_setting('ghm.saved_business_account_id', true), '')::bigint;

  IF context_account_id IS NULL OR context_account_id <= 0 THEN
    RAISE EXCEPTION 'Authenticated account context is required';
  END IF;

  IF p_business_id IS NULL OR p_business_id <= 0 THEN
    RAISE EXCEPTION 'Business ID must be a positive integer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ghm.business
     WHERE ghm.business.id = p_business_id
       AND is_active = true
       AND is_verified = true
       AND verification_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Business is not eligible to be saved';
  END IF;

  RETURN QUERY
  INSERT INTO ghm.saved_business (account_id, business_id)
  VALUES (context_account_id, p_business_id)
  RETURNING ghm.saved_business.id, ghm.saved_business.account_id,
            ghm.saved_business.business_id, ghm.saved_business.created_at;
END;
$$;

ALTER FUNCTION ghm.create_saved_business(bigint)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.create_saved_business(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.create_saved_business(bigint) TO ghm_runtime;

REVOKE ALL ON FUNCTION ghm.create_saved_business(bigint, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ghm.create_saved_business(bigint, bigint) FROM ghm_runtime;
DROP FUNCTION ghm.create_saved_business(bigint, bigint);

CREATE OR REPLACE FUNCTION ghm.delete_saved_business(p_saved_business_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  context_account_id bigint;
  deleted_count integer;
BEGIN
  context_account_id := NULLIF(current_setting('ghm.saved_business_account_id', true), '')::bigint;

  IF context_account_id IS NULL OR context_account_id <= 0 THEN
    RAISE EXCEPTION 'Authenticated account context is required';
  END IF;

  IF p_saved_business_id IS NULL OR p_saved_business_id <= 0 THEN
    RAISE EXCEPTION 'Saved Business ID must be a positive integer';
  END IF;

  DELETE FROM ghm.saved_business
   WHERE id = p_saved_business_id
     AND account_id = context_account_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count = 1;
END;
$$;

ALTER FUNCTION ghm.delete_saved_business(bigint)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.delete_saved_business(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.delete_saved_business(bigint) TO ghm_runtime;

REVOKE ALL ON FUNCTION ghm.delete_saved_business(bigint, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ghm.delete_saved_business(bigint, bigint) FROM ghm_runtime;
DROP FUNCTION ghm.delete_saved_business(bigint, bigint);
