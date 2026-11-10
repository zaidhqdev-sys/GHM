-- Gateway-only wrapper for private Business registration identity writes.
-- The legacy runtime RPC remains available until the resource API write route
-- is migrated and the deployment/grant cutover is separately authorized.

CREATE OR REPLACE FUNCTION ghm.gateway_update_business_registration_identity(
  p_actor_account_id bigint,
  p_business_id bigint,
  p_registration_status text,
  p_registration_number text,
  p_legal_name text
) RETURNS TABLE (
  business_id bigint,
  registration_status text,
  registration_number text,
  legal_name text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  PERFORM ghm.assert_actor_gateway(p_actor_account_id);

  RETURN QUERY
    SELECT updated.business_id,
           updated.registration_status,
           updated.registration_number,
           updated.legal_name,
           updated.updated_at
      FROM ghm.update_business_registration_identity(
        p_actor_account_id,
        p_business_id,
        p_registration_status,
        p_registration_number,
        p_legal_name
      ) AS updated;
END;
$$;

ALTER FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) FROM ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) IS
  'Private Business registration identity write for the isolated actor gateway. Requires gateway login and derives actor ID from the gateway-verified GHM token subject.';
