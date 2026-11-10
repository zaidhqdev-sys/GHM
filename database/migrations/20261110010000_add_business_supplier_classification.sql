-- Canonical GHM supplier/contractor classification used by Connect Marketplace.
-- Classification is descriptive marketplace metadata, not a capability or Trust assertion.
-- Existing values are preserved; missing/null legacy values normalize to contractor (false).

BEGIN;

ALTER TABLE ghm.business
  ADD COLUMN IF NOT EXISTS is_supplier boolean NOT NULL DEFAULT false;

UPDATE ghm.business
SET is_supplier = false
WHERE is_supplier IS NULL;

ALTER TABLE ghm.business
  ALTER COLUMN is_supplier SET DEFAULT false,
  ALTER COLUMN is_supplier SET NOT NULL;

COMMENT ON COLUMN ghm.business.is_supplier IS
  'Owner-managed Marketplace classification. True means supplier; false means contractor. Not a verified capability or Trust signal.';

CREATE OR REPLACE FUNCTION ghm.update_business_supplier_classification(
  p_account_id bigint,
  p_business_id bigint,
  p_is_supplier boolean
)
RETURNS ghm.business
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $function$
DECLARE
  v_updated ghm.business%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Authentication is required to update supplier classification.';
  END IF;
  IF p_business_id IS NULL OR p_business_id <= 0 THEN
    RAISE EXCEPTION 'Business ID must be a positive integer';
  END IF;
  IF p_is_supplier IS NULL THEN
    RAISE EXCEPTION 'Supplier classification must be true or false';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ghm.business_membership
    WHERE business_id = p_business_id
      AND account_id = p_account_id
      AND membership_status = 'active'
      AND membership_role IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Business management permission required';
  END IF;

  UPDATE ghm.business
  SET is_supplier = p_is_supplier, updated_at = now()
  WHERE id = p_business_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;
  RETURN v_updated;
END;
$function$;

ALTER FUNCTION ghm.update_business_supplier_classification(bigint, bigint, boolean)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.update_business_supplier_classification(bigint, bigint, boolean)
  SET search_path = pg_catalog, ghm;
REVOKE ALL ON FUNCTION ghm.update_business_supplier_classification(bigint, bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.update_business_supplier_classification(bigint, bigint, boolean) TO ghm_runtime;

COMMIT;
