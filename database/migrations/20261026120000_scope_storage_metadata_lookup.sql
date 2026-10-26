BEGIN;

-- Replace the ID-only getter with an account-aware lookup. The function
-- returns a row only for an active public business logo or when the supplied
-- account has an active membership in the object's business.
--
-- This is defense in depth, not a substitute for HTTP/application identity:
-- the application runtime role is trusted and PostgreSQL cannot derive the
-- end-user identity from a shared runtime credential. Callers must pass the
-- authenticated account ID from AuthContext, never a request-body value.

CREATE OR REPLACE FUNCTION ghm.storage_get_object(
  p_object_id bigint,
  p_account_id bigint
)
RETURNS ghm.storage_object
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.storage_object;
BEGIN
  IF p_object_id IS NULL OR p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'storage object does not exist';
  END IF;

  SELECT so.*
    INTO v_row
    FROM ghm.storage_object so
   WHERE so.id = p_object_id
     AND (
       (
         so.visibility = 'public'
         AND so.resource_type = 'business'
         AND so.resource_id = so.tenant_business_id
         AND so.object_class = 'business_logo'
         AND so.status = 'available'
         AND EXISTS (
           SELECT 1
             FROM ghm.business b
            WHERE b.id = so.tenant_business_id
              AND b.is_active = true
         )
       )
       OR EXISTS (
         SELECT 1
           FROM ghm.business_membership bm
           JOIN ghm.business b ON b.id = bm.business_id
          WHERE bm.business_id = so.tenant_business_id
            AND bm.account_id = p_account_id
            AND bm.membership_status = 'active'
            AND b.is_active = true
       )
     );

  IF NOT FOUND THEN
    -- Use one error for missing and unauthorized records to avoid confirming
    -- that another tenant's object ID exists.
    RAISE EXCEPTION 'storage object does not exist';
  END IF;

  RETURN v_row;
END;
$$;

ALTER FUNCTION ghm.storage_get_object(bigint, bigint)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.storage_get_object(bigint, bigint)
  SET search_path = pg_catalog, ghm;

REVOKE ALL ON FUNCTION ghm.storage_get_object(bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.storage_get_object(bigint, bigint) FROM ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.storage_get_object(bigint, bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_get_object(bigint, bigint) TO ghm_schema_owner;

-- Remove the old unscoped entry point so new code cannot accidentally keep
-- using the one-argument lookup.
REVOKE ALL ON FUNCTION ghm.storage_get_object(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.storage_get_object(bigint) FROM ghm_runtime;
DROP FUNCTION ghm.storage_get_object(bigint);

COMMIT;
