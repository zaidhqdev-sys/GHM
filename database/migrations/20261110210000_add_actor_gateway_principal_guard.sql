-- First isolated database actor-gateway primitive.
-- The login is provisioned out-of-band; this migration refuses an unsafe role.
-- No existing runtime privileges are revoked in this additive foundation step.

DO $$
DECLARE
  gateway_oid oid;
  trusted_admin_oid oid;
  gateway_role pg_roles%ROWTYPE;
BEGIN
  IF to_regrole('ghm_actor_gateway') IS NULL THEN
    RAISE EXCEPTION 'ghm_actor_gateway must be provisioned before applying this migration';
  END IF;

  gateway_oid := to_regrole('ghm_actor_gateway')::oid;

  IF to_regrole('ghm_db_user') IS NULL THEN
    RAISE EXCEPTION 'trusted Render administrator ghm_db_user must exist before applying this migration';
  END IF;

  trusted_admin_oid := to_regrole('ghm_db_user')::oid;

  SELECT * INTO gateway_role
    FROM pg_roles
   WHERE rolname = 'ghm_actor_gateway';

  IF NOT gateway_role.rolcanlogin
     OR gateway_role.rolinherit
     OR gateway_role.rolsuper
     OR gateway_role.rolcreatedb
     OR gateway_role.rolcreaterole
     OR gateway_role.rolreplication
     OR gateway_role.rolbypassrls THEN
    RAISE EXCEPTION 'ghm_actor_gateway must be LOGIN NOINHERIT and have no elevated role attributes';
  END IF;

  -- Render retains ghm_db_user as the trusted administrator. It may hold
  -- ADMIN OPTION on the gateway role, but must not inherit or SET ROLE to it.
  -- No service login may be a member of the gateway role, and the gateway
  -- login itself may not be a member of any other role.
  IF EXISTS (
    SELECT 1
      FROM pg_auth_members
     WHERE member = gateway_oid
        OR (roleid = gateway_oid AND member <> trusted_admin_oid)
  ) THEN
    RAISE EXCEPTION 'ghm_actor_gateway may only be granted to trusted administrator ghm_db_user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_auth_members
     WHERE roleid = gateway_oid
       AND member = trusted_admin_oid
       AND admin_option
       AND NOT inherit_option
       AND NOT set_option
  ) THEN
    RAISE EXCEPTION 'ghm_actor_gateway requires ghm_db_user ADMIN OPTION without INHERIT or SET';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway(
  p_actor_account_id bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  -- session_user remains the authenticated login inside SECURITY DEFINER.
  -- current_user would be ghm_schema_owner here and is not an identity proof.
  IF session_user <> 'ghm_actor_gateway' THEN
    RAISE EXCEPTION 'Actor gateway database principal required'
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_account_id IS NULL OR p_actor_account_id <= 0 THEN
    RAISE EXCEPTION 'Actor account ID must be a positive integer'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM ghm.account_identity
     WHERE id = p_actor_account_id
       AND account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active actor account required'
      USING ERRCODE = '42501';
  END IF;

  RETURN p_actor_account_id;
END;
$$;

ALTER FUNCTION ghm.assert_actor_gateway(bigint) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.assert_actor_gateway(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.assert_actor_gateway(bigint) FROM ghm_runtime;
GRANT USAGE ON SCHEMA ghm TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway(bigint) TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.assert_actor_gateway(bigint) IS
  'Returns an active actor account ID only to the isolated ghm_actor_gateway login. The caller must derive this ID from an independently verified GHM access token. Not yet wired to feature RPCs.';
