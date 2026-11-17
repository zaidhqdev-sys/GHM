-- Remove the legacy caller-supplied actor-ID write path only after the
-- signed-assertion gateway replacement has been installed and granted.
--
-- Operational gate: do not include this migration in a production batch until
-- the dedicated Actor Gateway is deployed, its startup identity/ACL checks
-- pass, the registration read/write HTTP paths pass authenticated end-to-end
-- smoke tests, and the GHM runtime is configured with its stable HTTPS URL.
-- The database precondition below makes it impossible to apply this migration
-- before the signed gateway function and its restricted grant exist.

BEGIN;

DO $$
DECLARE
  legacy_function oid := to_regprocedure(
    'ghm.update_business_registration_identity(bigint,bigint,text,text,text)'
  );
  gateway_function oid := to_regprocedure(
    'ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,text,bigint,text,text,text)'
  );
BEGIN
  IF legacy_function IS NULL THEN
    RAISE EXCEPTION 'Legacy business registration identity function is missing';
  END IF;

  IF gateway_function IS NULL THEN
    RAISE EXCEPTION 'Signed Actor Gateway business registration identity function is not installed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ghm_actor_gateway') THEN
    RAISE EXCEPTION 'Dedicated Actor Gateway database role is missing';
  END IF;

  IF NOT has_function_privilege('ghm_actor_gateway', gateway_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Actor Gateway cannot execute the signed registration identity function';
  END IF;

  IF has_function_privilege('ghm_runtime', gateway_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'GHM runtime must not execute the signed registration identity function';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.oid = gateway_function
      AND n.nspname = 'ghm'
      AND p.prosecdef = true
      AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = 'ghm_schema_owner')
  ) THEN
    RAISE EXCEPTION 'Signed registration gateway function must be SECURITY DEFINER and owned by ghm_schema_owner';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ghm.update_business_registration_identity(
  bigint, bigint, text, text, text
) FROM PUBLIC, ghm_runtime, ghm_actor_gateway;

DO $$
DECLARE
  legacy_function oid := to_regprocedure(
    'ghm.update_business_registration_identity(bigint,bigint,text,text,text)'
  );
  unexpected_grantee text;
BEGIN
  IF has_function_privilege('ghm_runtime', legacy_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Legacy business registration identity EXECUTE remains available to ghm_runtime';
  END IF;

  IF has_function_privilege('ghm_actor_gateway', legacy_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Actor Gateway must use the signed wrapper, not the legacy registration function directly';
  END IF;

  SELECT pg_get_userbyid(a.grantee)
    INTO unexpected_grantee
  FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  WHERE p.oid = legacy_function
    AND a.privilege_type = 'EXECUTE'
    AND a.grantee <> p.proowner
  LIMIT 1;

  IF unexpected_grantee IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected direct registration function EXECUTE grantee remains: %', unexpected_grantee;
  END IF;
END;
$$;

COMMIT;
