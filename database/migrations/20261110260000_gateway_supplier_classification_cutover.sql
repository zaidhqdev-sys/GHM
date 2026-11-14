-- Move supplier classification writes behind the isolated actor gateway.
-- The gateway verifies the GHM ES256 access token and derives the account ID
-- from its signed subject. The database checks the gateway login independently.
-- Revoke the legacy direct runtime RPC so callers cannot supply another admin's ID.

CREATE OR REPLACE FUNCTION ghm.gateway_update_business_supplier_classification(
  p_actor_account_id bigint,
  p_business_id bigint,
  p_is_supplier boolean
)
RETURNS TABLE (business_id bigint, is_supplier boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  PERFORM ghm.assert_actor_gateway(p_actor_account_id);

  RETURN QUERY
    SELECT updated.id, updated.is_supplier
      FROM ghm.update_business_supplier_classification(
        p_actor_account_id,
        p_business_id,
        p_is_supplier
      ) AS updated;
END;
$$;

ALTER FUNCTION ghm.gateway_update_business_supplier_classification(bigint, bigint, boolean)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_business_supplier_classification(bigint, bigint, boolean)
  SET search_path = pg_catalog, ghm;

REVOKE ALL ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint, bigint, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint, bigint, boolean) FROM ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint, bigint, boolean) TO ghm_actor_gateway;

-- The old function remains callable only by trusted schema-owner code.
REVOKE ALL ON FUNCTION ghm.update_business_supplier_classification(bigint, bigint, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.update_business_supplier_classification(bigint, bigint, boolean) FROM ghm_runtime;

COMMENT ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint, bigint, boolean) IS
  'Supplier classification write available only to ghm_actor_gateway. Actor account ID is derived from the ES256 token subject by the isolated gateway; direct ghm_runtime execution is revoked.';
