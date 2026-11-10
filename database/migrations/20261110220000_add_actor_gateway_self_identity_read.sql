-- First typed, actor-bound gateway read operation.
-- The gateway role is the only caller and must derive p_actor_account_id from
-- an independently verified GHM ES256 access token subject.

CREATE OR REPLACE FUNCTION ghm.gateway_get_actor_identity(
  p_actor_account_id bigint
) RETURNS TABLE (
  account_id bigint,
  account_role text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_actor_account_id bigint;
BEGIN
  v_actor_account_id := ghm.assert_actor_gateway(p_actor_account_id);

  RETURN QUERY
  SELECT a.id,
         a.role::text,
         a.full_name
    FROM ghm.account_identity a
   WHERE a.id = v_actor_account_id
     AND a.account_status = 'active';
END;
$$;

ALTER FUNCTION ghm.gateway_get_actor_identity(bigint) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_get_actor_identity(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.gateway_get_actor_identity(bigint) FROM ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.gateway_get_actor_identity(bigint) TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.gateway_get_actor_identity(bigint) IS
  'Returns the authenticated actor own identity only to ghm_actor_gateway. Actor ID must originate from the gateway-verified GHM access token subject.';
