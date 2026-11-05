BEGIN;

ALTER TABLE ghm.business
  ADD COLUMN logo_storage_object_id bigint
    REFERENCES ghm.storage_object(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX business_logo_storage_object_unique
  ON ghm.business (logo_storage_object_id)
  WHERE logo_storage_object_id IS NOT NULL;

COMMENT ON COLUMN ghm.business.logo_storage_object_id IS
  'Canonical GHM storage_object ID for the public Business logo. The referenced object must belong to this Business and be an available business_logo.';

CREATE OR REPLACE FUNCTION ghm.set_business_logo_object(
  p_account_id bigint,
  p_business_id bigint,
  p_storage_object_id bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  previous_object_id bigint;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Authentication is required to update a Business logo.';
  END IF;
  IF p_business_id IS NULL OR p_business_id <= 0 THEN
    RAISE EXCEPTION 'Business ID must be a positive integer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM ghm.business_membership bm
     WHERE bm.business_id = p_business_id
       AND bm.account_id = p_account_id
       AND bm.membership_status = 'active'
       AND bm.membership_role IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Business management permission required';
  END IF;

  SELECT b.logo_storage_object_id
    INTO previous_object_id
    FROM ghm.business b
   WHERE b.id = p_business_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  IF p_storage_object_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM ghm.storage_object so
     WHERE so.id = p_storage_object_id
       AND so.tenant_business_id = p_business_id
       AND so.resource_type = 'business'
       AND so.resource_id = p_business_id
       AND so.object_class = 'business_logo'
       AND so.visibility = 'public'
       AND so.status = 'available'
  ) THEN
    RAISE EXCEPTION 'Available Business logo object not found';
  END IF;

  UPDATE ghm.business
     SET logo_storage_object_id = p_storage_object_id,
         updated_at = clock_timestamp()
   WHERE id = p_business_id;

  RETURN previous_object_id;
END;
$$;

ALTER FUNCTION ghm.set_business_logo_object(bigint, bigint, bigint)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.set_business_logo_object(bigint, bigint, bigint)
  SET search_path = pg_catalog, ghm;
REVOKE ALL ON FUNCTION ghm.set_business_logo_object(bigint, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.set_business_logo_object(bigint, bigint, bigint) FROM ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.set_business_logo_object(bigint, bigint, bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.set_business_logo_object(bigint, bigint, bigint) TO ghm_schema_owner;

CREATE OR REPLACE FUNCTION ghm.storage_get_public_business_logo(
  p_business_id bigint
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
  SELECT so.provider_key
    FROM ghm.business b
    JOIN ghm.storage_object so
      ON so.id = b.logo_storage_object_id
     AND so.tenant_business_id = b.id
     AND so.resource_type = 'business'
     AND so.resource_id = b.id
     AND so.object_class = 'business_logo'
     AND so.visibility = 'public'
     AND so.status = 'available'
   WHERE b.id = p_business_id
     AND b.is_active = true
     AND b.is_verified = true
     AND b.verification_status = 'approved'
   LIMIT 1
$$;

ALTER FUNCTION ghm.storage_get_public_business_logo(bigint)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.storage_get_public_business_logo(bigint)
  SET search_path = pg_catalog, ghm;
REVOKE ALL ON FUNCTION ghm.storage_get_public_business_logo(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.storage_get_public_business_logo(bigint) FROM ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.storage_get_public_business_logo(bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_get_public_business_logo(bigint) TO ghm_schema_owner;

COMMIT;
