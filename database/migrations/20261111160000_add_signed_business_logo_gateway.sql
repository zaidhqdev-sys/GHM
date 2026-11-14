-- Signed Actor Gateway boundary for canonical Business Logo object binding.
BEGIN;

CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway_capability(
 p_actor bigint,p_operation text,p_issued bigint,p_nonce uuid,p_context text,p_signature text
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
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
  'business.hours.replace','business.hours.read','trust.score.calculate','business.logo.bind'
 ) OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid actor assertion' USING ERRCODE='42501';
 END IF;
 IF abs(extract(epoch FROM clock_timestamp())::bigint-p_issued)>60 THEN
  RAISE EXCEPTION 'Actor assertion expired' USING ERRCODE='42501';
 END IF;
 SELECT secret INTO v_secret FROM ghm.actor_gateway_capability_assertion_secret WHERE singleton=true;
 IF v_secret IS NULL OR octet_length(v_secret)<>32 THEN RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE='42501';END IF;
 v_payload:='ghm-actor-gateway:v2|'||p_actor::text||'|'||p_operation||'|'||p_issued::text||'|'||p_nonce::text||'|'||encode(convert_to(p_context,'UTF8'),'hex');
 v_expected:=public.hmac(convert_to(v_payload,'UTF8'),v_secret,'sha256');v_provided:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i) # get_byte(v_provided,v_i));END LOOP;
 IF v_diff<>0 THEN RAISE EXCEPTION 'Actor assertion signature invalid' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM ghm.account_identity WHERE id=p_actor AND account_status='active') THEN RAISE EXCEPTION 'Active actor account required' USING ERRCODE='42501';END IF;
 DELETE FROM ghm.actor_gateway_capability_assertion_nonce WHERE expires_at<clock_timestamp();
 BEGIN INSERT INTO ghm.actor_gateway_capability_assertion_nonce(nonce,expires_at) VALUES(p_nonce,GREATEST(clock_timestamp(),to_timestamp(p_issued))+interval '60 seconds');
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Actor assertion replay detected' USING ERRCODE='42501';END;
 RETURN p_actor;
END;$$;
ALTER FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) TO ghm_actor_gateway;

CREATE FUNCTION ghm.gateway_set_business_logo_object(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,
 p_business_id bigint,p_storage_object_id bigint
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
DECLARE v_actor bigint;v_previous_object_id bigint;
BEGIN
 IF p_context::jsonb<>jsonb_build_object('businessId',p_business_id,'objectId',p_storage_object_id) THEN
  RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'business.logo.bind',p_issued,p_nonce,p_context,p_signature);
 v_previous_object_id:=ghm.set_business_logo_object(v_actor,p_business_id,p_storage_object_id);
 RETURN v_previous_object_id;
END;$$;
ALTER FUNCTION ghm.gateway_set_business_logo_object(bigint,bigint,uuid,text,text,bigint,bigint) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_set_business_logo_object(bigint,bigint,uuid,text,text,bigint,bigint) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_set_business_logo_object(bigint,bigint,uuid,text,text,bigint,bigint) TO ghm_actor_gateway;

COMMIT;
