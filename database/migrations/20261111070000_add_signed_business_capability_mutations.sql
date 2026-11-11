-- Add signed Actor Gateway entry points for Business Capability assertion and evidence decisions.
-- Legacy runtime grants remain in place until the separately approved manual cutover.
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
  'business.capability.replace','business.capability.verify','business.capability.evidence.review','business.capability.evidence.submit'
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

CREATE FUNCTION ghm.gateway_replace_business_capability_assertions(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_business bigint,p_assertions jsonb
) RETURNS SETOF ghm.business_capability LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('businessId',p_business,'assertions',p_assertions) THEN
  RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'business.capability.replace',p_issued,p_nonce,p_context,p_signature);
 RETURN QUERY SELECT * FROM ghm.replace_business_capability_assertions(p_business,p_actor,p_assertions);
END;$$;

CREATE FUNCTION ghm.gateway_transition_business_capability_verification(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,
 p_capability bigint,p_expected text,p_target text,p_reason text
) RETURNS ghm.business_capability LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('businessCapabilityId',p_capability,'expectedStatus',p_expected,'targetStatus',p_target,'reason',p_reason) THEN
  RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'business.capability.verify',p_issued,p_nonce,p_context,p_signature);
 RETURN ghm.transition_business_capability_verification(p_capability,p_expected,p_target,p_actor,p_reason);
END;$$;

CREATE FUNCTION ghm.gateway_transition_business_capability_evidence(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,
 p_evidence bigint,p_decision text,p_reason text
) RETURNS ghm.business_capability_evidence LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('evidenceId',p_evidence,'decision',p_decision,'reason',p_reason) THEN
  RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'business.capability.evidence.review',p_issued,p_nonce,p_context,p_signature);
 RETURN ghm.transition_business_capability_evidence(p_evidence,p_decision,p_actor,p_reason);
END;$$;


CREATE FUNCTION ghm.gateway_submit_business_capability_evidence(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,
 p_capability bigint,p_evidence_type text,p_title text,p_description text,p_issuer text,
 p_reference text,p_url text,p_issued_on date,p_expires_on date,p_visibility text
) RETURNS ghm.business_capability_evidence LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $evidence_submit$
DECLARE v_business bigint;v_role text;v_result ghm.business_capability_evidence%ROWTYPE;v_payload jsonb;
BEGIN
 v_payload:=jsonb_build_object('businessCapabilityId',p_capability,'evidenceType',p_evidence_type,'title',p_title,
  'description',p_description,'issuerName',p_issuer,'referenceNumber',p_reference,'evidenceUrl',p_url,
  'issuedOn',p_issued_on,'expiresOn',p_expires_on,'visibility',p_visibility);
 IF p_context::jsonb<>v_payload THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'business.capability.evidence.submit',p_issued,p_nonce,p_context,p_signature);
 SELECT bc.business_id,bm.membership_role INTO v_business,v_role
 FROM ghm.business_capability bc
 JOIN ghm.business b ON b.id=bc.business_id
 JOIN ghm.business_membership bm ON bm.business_id=b.id
 WHERE bc.id=p_capability AND bc.assertion_status='active' AND bm.account_id=p_actor
 AND bm.membership_status='active' AND b.is_active=true
 LIMIT 1;
 IF v_business IS NULL OR v_role NOT IN ('owner','administrator') THEN RAISE EXCEPTION 'Business management permission required' USING ERRCODE='42501';END IF;
 INSERT INTO ghm.business_capability_evidence
 (business_capability_id,evidence_type,title,description,issuer_name,reference_number,evidence_url,issued_on,expires_on,visibility,verification_status,submitted_by)
 VALUES(p_capability,p_evidence_type,p_title,NULLIF(btrim(p_description),''),NULLIF(btrim(p_issuer),''),NULLIF(btrim(p_reference),''),NULLIF(btrim(p_url),''),p_issued_on,p_expires_on,COALESCE(p_visibility,'private'),'pending',p_actor)
 RETURNING * INTO v_result;
 RETURN v_result;
END;$evidence_submit$;
ALTER FUNCTION ghm.gateway_submit_business_capability_evidence(bigint,bigint,uuid,text,text,bigint,text,text,text,text,text,text,date,date,text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_submit_business_capability_evidence(bigint,bigint,uuid,text,text,bigint,text,text,text,text,text,text,date,date,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_submit_business_capability_evidence(bigint,bigint,uuid,text,text,bigint,text,text,text,text,text,text,date,date,text) TO ghm_actor_gateway;

ALTER FUNCTION ghm.gateway_replace_business_capability_assertions(bigint,bigint,uuid,text,text,bigint,jsonb) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_transition_business_capability_verification(bigint,bigint,uuid,text,text,bigint,text,text,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_transition_business_capability_evidence(bigint,bigint,uuid,text,text,bigint,text,text) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.gateway_replace_business_capability_assertions(bigint,bigint,uuid,text,text,bigint,jsonb) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_transition_business_capability_verification(bigint,bigint,uuid,text,text,bigint,text,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_transition_business_capability_evidence(bigint,bigint,uuid,text,text,bigint,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;

GRANT EXECUTE ON FUNCTION ghm.gateway_replace_business_capability_assertions(bigint,bigint,uuid,text,text,bigint,jsonb) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_transition_business_capability_verification(bigint,bigint,uuid,text,text,bigint,text,text,text) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_transition_business_capability_evidence(bigint,bigint,uuid,text,text,bigint,text,text) TO ghm_actor_gateway;
COMMIT;
