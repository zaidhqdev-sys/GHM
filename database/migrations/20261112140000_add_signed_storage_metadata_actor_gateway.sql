-- Add actor-bound entry points for the user-authorized storage metadata operations.
-- Provider-confirmed lifecycle transitions remain deliberately excluded.
BEGIN;

CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway_capability(
 p_actor bigint,p_operation text,p_issued bigint,p_nonce uuid,p_context text,p_signature text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, ghm, pg_temp
AS $$
DECLARE v_secret bytea;v_expected bytea;v_provided bytea;v_payload text;v_diff integer:=0;v_i integer;
BEGIN
 IF session_user<>'ghm_actor_gateway' OR p_actor IS NULL OR p_actor<=0 OR p_issued IS NULL OR p_nonce IS NULL
    OR p_context IS NULL OR octet_length(convert_to(p_context,'UTF8'))>32768
    OR p_operation IS NULL OR p_operation NOT IN (
      'capability.list','capability.create','capability.update','capability.transition',
      'supplier.classification.update','business.profile.update','actor.identity.read',
      'business.registration.read','business.registration.update',
      'business.capability.replace','business.capability.verify','business.capability.evidence.review','business.capability.evidence.submit',
      'saved_business.read','saved_business.create','saved_business.delete',
      'business.hours.replace','business.hours.read','trust.score.calculate','trust.score.read',
      'business.logo.bind','business.connect.provision',
      'storage.metadata.create','storage.metadata.read','storage.metadata.mark_deletion_pending',
      'storage.metadata.mark_available','storage.metadata.mark_deleted'
    )
    OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'Invalid actor assertion' USING ERRCODE='42501';
 END IF;
 IF abs(extract(epoch FROM clock_timestamp())::bigint-p_issued)>60 THEN
   RAISE EXCEPTION 'Actor assertion expired' USING ERRCODE='42501';
 END IF;
 SELECT secret INTO v_secret FROM ghm.actor_gateway_capability_assertion_secret WHERE singleton=true;
 IF v_secret IS NULL OR octet_length(v_secret)<>32 THEN
   RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE='42501';
 END IF;
 v_payload:='ghm-actor-gateway:v2|'||p_actor::text||'|'||p_operation||'|'||p_issued::text||'|'||p_nonce::text||'|'||encode(convert_to(p_context,'UTF8'),'hex');
 v_expected:=public.hmac(convert_to(v_payload,'UTF8'),v_secret,'sha256');
 v_provided:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i) # get_byte(v_provided,v_i));END LOOP;
 IF v_diff<>0 THEN RAISE EXCEPTION 'Actor assertion signature invalid' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM ghm.account_identity WHERE id=p_actor AND account_status='active') THEN
   RAISE EXCEPTION 'Active actor account required' USING ERRCODE='42501';
 END IF;
 DELETE FROM ghm.actor_gateway_capability_assertion_nonce WHERE expires_at<clock_timestamp();
 BEGIN
   INSERT INTO ghm.actor_gateway_capability_assertion_nonce(nonce,expires_at)
   VALUES(p_nonce,GREATEST(clock_timestamp(),to_timestamp(p_issued))+interval '60 seconds');
 EXCEPTION WHEN unique_violation THEN
   RAISE EXCEPTION 'Actor assertion replay detected' USING ERRCODE='42501';
 END;
 RETURN p_actor;
END;
$$;
ALTER FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) SET search_path=pg_catalog, ghm, pg_temp;
REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) TO ghm_actor_gateway;

CREATE OR REPLACE FUNCTION ghm.gateway_storage_create_pending(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,
 p_business bigint,p_resource_type text,p_resource_id bigint,p_object_class text,
 p_provider_key text,p_content_type text,p_byte_size bigint,p_visibility text,p_original_filename text
) RETURNS ghm.storage_object
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, ghm, pg_temp
AS $$
DECLARE v_actor bigint;v_row ghm.storage_object;
BEGIN
 IF p_context::jsonb<>jsonb_build_object(
   'businessId',p_business,'resourceType',p_resource_type,'resourceId',p_resource_id,
   'objectClass',p_object_class,'providerKey',p_provider_key,'contentType',p_content_type,
   'byteSize',p_byte_size,'visibility',p_visibility,'originalFilename',p_original_filename
 ) THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'storage.metadata.create',p_issued,p_nonce,p_context,p_signature);
 IF p_resource_type<>'business' OR p_resource_id IS DISTINCT FROM p_business
    OR p_object_class<>'business_logo' OR p_visibility<>'public'
    OR p_provider_key IS NULL OR p_provider_key !~* ('^media/logos/'||p_business::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12} ('image/jpeg','image/png','image/webp')
    OR p_byte_size IS NULL OR p_byte_size<0 OR p_byte_size>2097152
    OR (p_original_filename IS NOT NULL AND length(p_original_filename)>255) THEN
   RAISE EXCEPTION 'Invalid Business Logo storage metadata' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(
   SELECT 1 FROM ghm.business b
   JOIN ghm.business_membership bm ON bm.business_id=b.id
   WHERE b.id=p_business AND b.is_active=true AND bm.account_id=v_actor
     AND bm.membership_status='active' AND bm.membership_role IN ('owner','administrator')
 ) THEN RAISE EXCEPTION 'Business management permission required' USING ERRCODE='42501';END IF;
 SELECT * INTO v_row FROM ghm.storage_create_pending(
   p_business,p_resource_type,p_resource_id,p_object_class,p_provider_key,
   p_content_type,p_byte_size,p_visibility,p_original_filename
 );
 RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION ghm.gateway_storage_get_object(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_object_id bigint
) RETURNS SETOF ghm.storage_object
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, ghm, pg_temp
AS $$
DECLARE v_actor bigint;
BEGIN
 IF p_context::jsonb<>jsonb_build_object('objectId',p_object_id) THEN
   RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'storage.metadata.read',p_issued,p_nonce,p_context,p_signature);
 RETURN QUERY
 SELECT so.* FROM ghm.storage_object so
 WHERE so.id=p_object_id
   AND (
     (
       so.visibility='public' AND so.resource_type='business'
       AND so.resource_id=so.tenant_business_id AND so.object_class='business_logo'
       AND EXISTS(SELECT 1 FROM ghm.business b WHERE b.id=so.tenant_business_id AND b.is_active=true)
     )
     OR EXISTS(
       SELECT 1 FROM ghm.business_membership bm
       JOIN ghm.business b ON b.id=bm.business_id
       WHERE bm.business_id=so.tenant_business_id AND bm.account_id=v_actor
         AND bm.membership_status='active' AND b.is_active=true
     )
   );
END;
$$;

CREATE OR REPLACE FUNCTION ghm.gateway_storage_mark_deletion_pending(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_object_id bigint
) RETURNS ghm.storage_object
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, ghm, pg_temp
AS $$
DECLARE v_actor bigint;v_business bigint;v_row ghm.storage_object;
BEGIN
 IF p_context::jsonb<>jsonb_build_object('objectId',p_object_id) THEN
   RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'storage.metadata.mark_deletion_pending',p_issued,p_nonce,p_context,p_signature);
 SELECT tenant_business_id INTO v_business FROM ghm.storage_object WHERE id=p_object_id;
 IF v_business IS NULL OR NOT EXISTS(
   SELECT 1 FROM ghm.business b
   JOIN ghm.business_membership bm ON bm.business_id=b.id
   WHERE b.id=v_business AND b.is_active=true AND bm.account_id=v_actor
     AND bm.membership_status='active' AND bm.membership_role IN ('owner','administrator')
 ) THEN RAISE EXCEPTION 'Business management permission required' USING ERRCODE='42501';END IF;
 SELECT * INTO v_row FROM ghm.storage_mark_deletion_pending(p_object_id);
 RETURN v_row;
END;
$$;

ALTER FUNCTION ghm.gateway_storage_create_pending(bigint,bigint,uuid,text,text,bigint,text,bigint,text,text,text,bigint,text,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_storage_get_object(bigint,bigint,uuid,text,text,bigint) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_storage_mark_deletion_pending(bigint,bigint,uuid,text,text,bigint) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_storage_create_pending(bigint,bigint,uuid,text,text,bigint,text,bigint,text,text,text,bigint,text,text) SET search_path=pg_catalog, ghm, pg_temp;
ALTER FUNCTION ghm.gateway_storage_get_object(bigint,bigint,uuid,text,text,bigint) SET search_path=pg_catalog, ghm, pg_temp;
ALTER FUNCTION ghm.gateway_storage_mark_deletion_pending(bigint,bigint,uuid,text,text,bigint) SET search_path=pg_catalog, ghm, pg_temp;

REVOKE ALL ON FUNCTION ghm.gateway_storage_create_pending(bigint,bigint,uuid,text,text,bigint,text,bigint,text,text,text,bigint,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_storage_get_object(bigint,bigint,uuid,text,text,bigint) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_storage_mark_deletion_pending(bigint,bigint,uuid,text,text,bigint) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_storage_create_pending(bigint,bigint,uuid,text,text,bigint,text,bigint,text,text,text,bigint,text,text) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_storage_get_object(bigint,bigint,uuid,text,text,bigint) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_storage_mark_deletion_pending(bigint,bigint,uuid,text,text,bigint) TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.gateway_storage_create_pending(bigint,bigint,uuid,text,text,bigint,text,bigint,text,text,text,bigint,text,text) IS
 'Creates pending Business Logo metadata only after a one-use v2 actor assertion and active Business owner/administrator authorization.';
COMMENT ON FUNCTION ghm.gateway_storage_get_object(bigint,bigint,uuid,text,text,bigint) IS
 'Reads storage metadata through a one-use v2 actor assertion; public Business Logo and active Business membership rules are enforced in the database.';
COMMENT ON FUNCTION ghm.gateway_storage_mark_deletion_pending(bigint,bigint,uuid,text,text,bigint) IS
 'Requests pending deletion only after a one-use v2 actor assertion and active Business owner/administrator authorization.';

COMMIT;
