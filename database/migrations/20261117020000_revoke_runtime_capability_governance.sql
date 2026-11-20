-- Close the legacy caller-supplied account-ID capability governance RPCs
-- The required pg_temp-last path matches 20261112090000_pin_security_definer_search_path.
-- only after the signed-assertion Actor Gateway replacements are installed.
--
-- This is a post-deployment cutover migration. Do not execute it until the
-- dedicated Actor Gateway has passed startup identity/ACL checks and
-- authenticated capability list/create/update/transition end-to-end tests.

BEGIN;

DO $$
DECLARE
  v_gateway_role oid := (SELECT oid FROM pg_roles WHERE rolname = 'ghm_actor_gateway');
  v_runtime_role oid := (SELECT oid FROM pg_roles WHERE rolname = 'ghm_runtime');
  v_schema_owner oid := (SELECT oid FROM pg_roles WHERE rolname = 'ghm_schema_owner');
  v_verifier oid := to_regprocedure(
    'ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text)'
  );
  v_list oid := to_regprocedure(
    'ghm.gateway_list_capabilities(bigint,bigint,uuid,text,text)'
  );
  v_create oid := to_regprocedure(
    'ghm.gateway_create_capability_draft(bigint,bigint,uuid,text,text,text,text,text,uuid,integer,text,integer)'
  );
  v_update oid := to_regprocedure(
    'ghm.gateway_update_capability_draft(bigint,bigint,uuid,text,text,uuid,text,text,text,uuid,integer,text,integer)'
  );
  v_transition oid := to_regprocedure(
    'ghm.gateway_transition_capability_lifecycle(bigint,bigint,uuid,text,text,uuid,text,uuid,integer)'
  );
  v_function oid;
BEGIN
  IF v_gateway_role IS NULL OR v_runtime_role IS NULL OR v_schema_owner IS NULL THEN
    RAISE EXCEPTION 'Required Actor Gateway, runtime, or schema-owner role is missing';
  END IF;
  IF v_verifier IS NULL OR v_list IS NULL OR v_create IS NULL OR v_update IS NULL OR v_transition IS NULL THEN
    RAISE EXCEPTION 'Signed capability assertion verifier and all four gateway operations must exist';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[v_verifier,v_list,v_create,v_update,v_transition] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.oid=v_function
        AND n.nspname='ghm'
        AND p.prosecdef=true
        AND p.proowner=v_schema_owner
        AND p.proconfig @> ARRAY['search_path=pg_catalog, ghm, pg_temp']
    ) THEN
      RAISE EXCEPTION 'A signed capability gateway function has unexpected owner, SECURITY DEFINER setting, or search_path: %',
        v_function::regprocedure;
    END IF;
    IF NOT has_function_privilege(v_gateway_role,v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Actor Gateway lacks EXECUTE on signed capability function: %',v_function::regprocedure;
    END IF;
    IF has_function_privilege(v_runtime_role,v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'GHM runtime must not execute signed capability gateway function: %',v_function::regprocedure;
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)') IS NULL
     OR to_regprocedure('ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)') IS NULL
     OR to_regprocedure('ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'One or more legacy capability governance functions are missing';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ghm.create_capability_draft(
  bigint,text,text,text,uuid,integer,text,integer
) FROM PUBLIC,ghm_runtime,ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.update_capability_draft(
  bigint,uuid,text,text,text,uuid,integer,text,integer
) FROM PUBLIC,ghm_runtime,ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.transition_capability_lifecycle(
  bigint,uuid,text,uuid,integer
) FROM PUBLIC,ghm_runtime,ghm_actor_gateway;

DO $$
DECLARE
  v_function oid;
  v_unexpected text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    to_regprocedure('ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)'),
    to_regprocedure('ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)'),
    to_regprocedure('ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer)')
  ] LOOP
    IF has_function_privilege('ghm_runtime',v_function,'EXECUTE')
       OR has_function_privilege('ghm_actor_gateway',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Direct capability governance EXECUTE remains for runtime or gateway: %',v_function::regprocedure;
    END IF;
    SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
      INTO v_unexpected
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=v_function
      AND a.privilege_type='EXECUTE'
      AND a.grantee<>p.proowner
    LIMIT 1;
    IF v_unexpected IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected direct capability governance EXECUTE grantee % on %',v_unexpected,v_function::regprocedure;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
