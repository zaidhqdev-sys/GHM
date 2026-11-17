-- Close legacy caller-supplied actor-ID registration read/write paths only
-- after signed-assertion Actor Gateway replacements are installed.
-- Post-deployment cutover: require authenticated registration read and write
-- end-to-end tests through the dedicated Actor Gateway before applying.

BEGIN;

DO $$
DECLARE
  v_gateway oid := (SELECT oid FROM pg_roles WHERE rolname='ghm_actor_gateway');
  v_runtime oid := (SELECT oid FROM pg_roles WHERE rolname='ghm_runtime');
  v_owner oid := (SELECT oid FROM pg_roles WHERE rolname='ghm_schema_owner');
  v_functions oid[] := ARRAY[
    to_regprocedure('ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text)'),
    to_regprocedure('ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,text,bigint)'),
    to_regprocedure('ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,text,bigint,text,text,text)')
  ];
  v_function oid;
BEGIN
  IF v_gateway IS NULL OR v_runtime IS NULL OR v_owner IS NULL
     OR array_position(v_functions,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Required roles or signed registration gateway functions are missing';
  END IF;
  FOREACH v_function IN ARRAY v_functions LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.oid=v_function AND n.nspname='ghm'
        AND p.prosecdef AND p.proowner=v_owner
        AND p.proconfig @> ARRAY['search_path=pg_catalog, ghm']
    ) THEN
      RAISE EXCEPTION 'Signed registration gateway function has unsafe owner/security/search_path: %',v_function::regprocedure;
    END IF;
    IF NOT has_function_privilege(v_gateway,v_function,'EXECUTE')
       OR has_function_privilege(v_runtime,v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Signed registration gateway function ACL is not isolated: %',v_function::regprocedure;
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('ghm.read_business_registration_identity(bigint,bigint)') IS NULL
     OR to_regprocedure('ghm.update_business_registration_identity(bigint,bigint,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'One or more legacy registration identity functions are missing';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ghm.read_business_registration_identity(bigint,bigint)
  FROM PUBLIC,ghm_runtime,ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.update_business_registration_identity(bigint,bigint,text,text,text)
  FROM PUBLIC,ghm_runtime,ghm_actor_gateway;

DO $$
DECLARE
  v_function oid;
  v_unexpected text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    to_regprocedure('ghm.read_business_registration_identity(bigint,bigint)'),
    to_regprocedure('ghm.update_business_registration_identity(bigint,bigint,text,text,text)')
  ] LOOP
    IF has_function_privilege('ghm_runtime',v_function,'EXECUTE')
       OR has_function_privilege('ghm_actor_gateway',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'Legacy registration function remains executable by runtime/gateway: %',v_function::regprocedure;
    END IF;
    SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
      INTO v_unexpected
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=v_function AND a.privilege_type='EXECUTE' AND a.grantee<>p.proowner
    LIMIT 1;
    IF v_unexpected IS NOT NULL THEN
      RAISE EXCEPTION 'Unexpected direct registration EXECUTE grantee % on %',v_unexpected,v_function::regprocedure;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
