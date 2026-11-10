-- Gateway-only wrapper for private Business registration identity reads.
-- The existing runtime RPC remains available until the HTTP resource API is
-- migrated in a separately qualified cutover. This wrapper is the only gateway
-- operation and derives actor authority from the isolated gateway principal.

CREATE OR REPLACE FUNCTION ghm.gateway_read_business_registration_identity(
  p_actor_account_id bigint,
  p_business_id bigint
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
    SELECT *
      FROM ghm.read_business_registration_identity(
        p_actor_account_id,
        p_business_id
      );
END;
$$;

ALTER FUNCTION ghm.gateway_read_business_registration_identity(bigint, bigint) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_read_business_registration_identity(bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.gateway_read_business_registration_identity(bigint, bigint) FROM ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.gateway_read_business_registration_identity(bigint, bigint) TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.gateway_read_business_registration_identity(bigint, bigint) IS
  'Private Business registration identity read for the isolated actor gateway. Requires gateway login and derives actor ID from the gateway-verified GHM token subject.';
