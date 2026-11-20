-- Prepare the signed Actor Gateway supplier-classification wrapper.
-- Keep the legacy runtime RPC available during the additive migration phase.
-- Its runtime revocation is a separate manual cutover after the signed route is live.

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

-- Remove PUBLIC access, but retain the explicit legacy runtime grant until the
-- separately gated manual cutover after signed Gateway route verification.
REVOKE ALL ON FUNCTION ghm.update_business_supplier_classification(bigint, bigint, boolean) FROM PUBLIC;

COMMENT ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint, bigint, boolean) IS
  'Supplier classification write prepared for the isolated Actor Gateway; the legacy runtime route remains available until a separately approved manual cutover.';
