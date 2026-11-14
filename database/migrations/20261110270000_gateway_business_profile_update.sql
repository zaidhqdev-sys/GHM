-- Bind Business profile writes to the isolated Actor Gateway.
-- The gateway verifies the signed GHM ES256 token and derives p_actor_account_id
-- from its subject. The database independently enforces the gateway login.
-- Revoke the shared runtime principal's direct access to the legacy SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION ghm.gateway_update_business_profile(
  p_actor_account_id bigint,
  p_business_id bigint,
  p_patch jsonb
)
RETURNS ghm.business
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  PERFORM ghm.assert_actor_gateway(p_actor_account_id);
  RETURN ghm.update_business_profile(p_actor_account_id, p_business_id, p_patch);
END;
$$;

ALTER FUNCTION ghm.gateway_update_business_profile(bigint, bigint, jsonb)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_business_profile(bigint, bigint, jsonb)
  SET search_path = pg_catalog, ghm;

REVOKE ALL ON FUNCTION ghm.gateway_update_business_profile(bigint, bigint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_profile(bigint, bigint, jsonb) FROM ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_business_profile(bigint, bigint, jsonb) TO ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.update_business_profile(bigint, bigint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.update_business_profile(bigint, bigint, jsonb) FROM ghm_runtime;

COMMENT ON FUNCTION ghm.gateway_update_business_profile(bigint, bigint, jsonb) IS
  'Business profile update available only to ghm_actor_gateway. Actor ID is derived from the ES256 token subject by the isolated gateway; direct ghm_runtime execution is revoked.';
