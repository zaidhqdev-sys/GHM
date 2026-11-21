-- Prepare the Business profile Actor Gateway wrapper.
-- Keep the legacy runtime RPC available during the additive migration phase.
-- Its runtime revocation is a separate manual cutover after the signed route is live.

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

-- Remove PUBLIC access, but retain the explicit legacy runtime grant until the
-- separately gated manual cutover after signed Gateway route verification.
REVOKE ALL ON FUNCTION ghm.update_business_profile(bigint, bigint, jsonb) FROM PUBLIC;

COMMENT ON FUNCTION ghm.gateway_update_business_profile(bigint, bigint, jsonb) IS
  'Business profile update prepared for the isolated Actor Gateway; the legacy runtime route remains available until a separately approved manual cutover.';
