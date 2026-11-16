-- MANUAL ROLLBACK ONLY — never place this file in database/migrations.
-- Restores only the reviewed pre-cutover ghm_runtime EXECUTE grant. PUBLIC,
-- ghm_migrator and ghm_actor_gateway remain denied; owner authority is unchanged.
-- The public Business Logo lookup is outside this five-function cutover.
BEGIN;
DO $storage_metadata_acl_guard$
DECLARE v_signature text; v_oid oid; v_owner oid; v_security_definer boolean; v_settings text[]; v_public_execute boolean;
BEGIN
  IF session_user IS DISTINCT FROM 'ghm_migrator' OR current_user IS DISTINCT FROM 'ghm_schema_owner' THEN
    RAISE EXCEPTION 'storage metadata ACL operation requires session_user=ghm_migrator and current_user=ghm_schema_owner';
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text)',
    'ghm.storage_get_object(bigint,bigint)',
    'ghm.storage_mark_available(bigint,text)',
    'ghm.storage_mark_deletion_pending(bigint)',
    'ghm.storage_mark_deleted(bigint)'
  ]::text[] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'required legacy storage function is missing: %', v_signature; END IF;
    SELECT p.proowner,p.prosecdef,p.proconfig INTO v_owner,v_security_definer,v_settings FROM pg_catalog.pg_proc p WHERE p.oid=v_oid;
    IF v_owner <> 'ghm_schema_owner'::regrole OR v_security_definer IS DISTINCT FROM true
       OR NOT (COALESCE(v_settings,ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog, ghm']) THEN
      RAISE EXCEPTION 'legacy storage function owner/security/search_path mismatch: %',v_signature;
    END IF;
    SELECT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=v_oid AND a.grantee=0 AND a.privilege_type='EXECUTE') INTO v_public_execute
      FROM pg_catalog.pg_proc p WHERE p.oid=v_oid;
    IF v_public_execute THEN RAISE EXCEPTION 'PUBLIC EXECUTE must not be present: %',v_signature; END IF;
    IF has_function_privilege('ghm_runtime', v_oid, 'EXECUTE') OR has_function_privilege('ghm_migrator', v_oid, 'EXECUTE') OR has_function_privilege('ghm_actor_gateway', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'legacy storage EXECUTE must remain revoked before rollback: %',v_signature; END IF;
  END LOOP;
  FOREACH v_signature IN ARRAY ARRAY[
    'ghm.gateway_storage_create_pending(bigint,bigint,uuid,text,text,bigint,text,bigint,text,text,text,bigint,text,text)',
    'ghm.gateway_storage_get_object(bigint,bigint,uuid,text,text,bigint)',
    'ghm.gateway_storage_mark_deletion_pending(bigint,bigint,uuid,text,text,bigint)',
    'ghm.gateway_storage_mark_available(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text,text,text,bigint)',
    'ghm.gateway_storage_mark_deleted(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text)'
  ]::text[] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL OR NOT has_function_privilege('ghm_actor_gateway',v_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Actor Gateway storage wrapper missing or not executable: %',v_signature;
    END IF;
  END LOOP;
END;
$storage_metadata_acl_guard$;
GRANT EXECUTE ON FUNCTION ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_get_object(bigint,bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_available(bigint,text) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_deletion_pending(bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_deleted(bigint) TO ghm_runtime;
DO $storage_metadata_acl_guard$
DECLARE v_signature text; v_oid oid; v_owner oid; v_security_definer boolean; v_settings text[]; v_public_execute boolean;
BEGIN
  IF session_user IS DISTINCT FROM 'ghm_migrator' OR current_user IS DISTINCT FROM 'ghm_schema_owner' THEN
    RAISE EXCEPTION 'storage metadata ACL operation requires session_user=ghm_migrator and current_user=ghm_schema_owner';
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text)',
    'ghm.storage_get_object(bigint,bigint)',
    'ghm.storage_mark_available(bigint,text)',
    'ghm.storage_mark_deletion_pending(bigint)',
    'ghm.storage_mark_deleted(bigint)'
  ]::text[] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'required legacy storage function is missing: %', v_signature; END IF;
    SELECT p.proowner,p.prosecdef,p.proconfig INTO v_owner,v_security_definer,v_settings FROM pg_catalog.pg_proc p WHERE p.oid=v_oid;
    IF v_owner <> 'ghm_schema_owner'::regrole OR v_security_definer IS DISTINCT FROM true
       OR NOT (COALESCE(v_settings,ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog, ghm']) THEN
      RAISE EXCEPTION 'legacy storage function owner/security/search_path mismatch: %',v_signature;
    END IF;
    SELECT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=v_oid AND a.grantee=0 AND a.privilege_type='EXECUTE') INTO v_public_execute
      FROM pg_catalog.pg_proc p WHERE p.oid=v_oid;
    IF v_public_execute THEN RAISE EXCEPTION 'PUBLIC EXECUTE must not be present: %',v_signature; END IF;
    IF !has_function_privilege('ghm_runtime', v_oid, 'EXECUTE') OR has_function_privilege('ghm_migrator', v_oid, 'EXECUTE') OR has_function_privilege('ghm_actor_gateway', v_oid, 'EXECUTE') THEN RAISE EXCEPTION 'legacy storage EXECUTE state is not the reviewed pre-cutover state: %',v_signature; END IF;
  END LOOP;
  FOREACH v_signature IN ARRAY ARRAY[
    'ghm.gateway_storage_create_pending(bigint,bigint,uuid,text,text,bigint,text,bigint,text,text,text,bigint,text,text)',
    'ghm.gateway_storage_get_object(bigint,bigint,uuid,text,text,bigint)',
    'ghm.gateway_storage_mark_deletion_pending(bigint,bigint,uuid,text,text,bigint)',
    'ghm.gateway_storage_mark_available(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text,text,text,bigint)',
    'ghm.gateway_storage_mark_deleted(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text)'
  ]::text[] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL OR NOT has_function_privilege('ghm_actor_gateway',v_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'Actor Gateway storage wrapper missing or not executable: %',v_signature;
    END IF;
  END LOOP;
END;
$storage_metadata_acl_guard$;
COMMIT;
