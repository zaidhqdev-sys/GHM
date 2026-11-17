-- Close legacy caller-supplied account-ID capability governance RPCs only
-- after the signed-assertion Actor Gateway replacements are installed.
-- Post-deployment cutover: require successful authenticated end-to-end tests
-- for capability list/create/update/transition before applying this migration.

BEGIN;

DO $$
DECLARE
  v_gateway oid := (SELECT oid FROM pg_roles WHERE rolname='ghm_actor_gateway');
  v_runtime oid := (SELECT oid FROM pg_roles WHERE rolname='ghm_runtime');
  v_owner oid := (SELECT oid FROM pg_roles WHERE rolname='ghm_schema_owner');
  v_functions oid[] := ARRAY[
    to_regprocedure('ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text)'),
    to_regprocedure('ghm.gateway_list_capabilities(bigint,bigint,uuid,text,text)'),
    to_regprocedure('ghm.gateway_create_capability_draft(bigint,bigint,uuid,text,text,text,text,text,uuid,integer,text,integer)'),
    to_regprocedure('ghm.gateway_update_capability_draft(bigint,bigint,uuid,text,text,uuid,text,text,text,uuid,integer,text,integer)'),
    to_regprocedure('ghm.gateway_transition_capability_lifecycle(bigint,bigint,uuid,text,text,uuid,text,uuid,integer)')
  ];
  v_function oid;
BEGIN
  IF v_gateway IS NULL OR v_runtime IS NULL OR v_owner IS NULL
     OR array_position(v_functions,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Required roles or signed capability gateway functions are missing';
  END IF;
  FOREACH v_function IN ARRAY v_functions LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.oid=v_function AND n.nspname='ghm'
        AND p.prosecdef AND p.proowner=v_owner
        AND p.proconfig @> ARRAY['search_path=pg_catalog, ghm']
    ) THEN
      RAISE EXCEPTION 'Signed capability gateway function has unsafe owner/security/search_path: %',v_function::regprocedure;
    END IF;
    IF NOT has_function_privilege(v_gateway,v_function,'EXECUTE')
       OR has_function_privilege(v_runtime,v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Signed capability gateway function ACL is not isolated: %',v_function::regprocedure;
    END IF;
  END LOOP;
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
    IF v_function IS NULL
       OR has_function_privilege('ghm_runtime',v_function,'EXECUTE')
       OR has_function_privilege('ghm_actor_gateway',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Legacy capability governance function remains executable by runtime/gateway: %',v_function::regprocedure;
    END IF;
    SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
      INTO v_unexpected
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=v_function AND a.privilege_type='EXECUTE' AND a.grantee<>p.proowner
    LIMIT 1;
    IF v_unexpected IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected direct capability EXECUTE grantee % on %',v_unexpected,v_function::regprocedure;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
