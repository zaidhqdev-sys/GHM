-- Bind registration identity and actor self-read wrappers to the same
-- one-use database-verifiable HMAC actor assertion used by capability writes.
BEGIN;

CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway_capability(
 p_actor_account_id bigint,p_operation text,p_issued_at bigint,p_nonce uuid,p_signature text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm
AS $$
DECLARE
 v_secret bytea;
 v_payload text;
 v_expected bytea;
 v_provided bytea;
 v_diff integer := 0;
 v_i integer;
BEGIN
 IF session_user<>'ghm_actor_gateway' THEN RAISE EXCEPTION 'Actor gateway database principal required' USING ERRCODE='42501'; END IF;
 IF p_actor_account_id IS NULL OR p_actor_account_id<=0 OR p_issued_at IS NULL OR p_nonce IS NULL
    OR p_operation IS NULL OR p_operation NOT IN (
      'capability.list','capability.create','capability.update','capability.transition',
      'supplier.classification.update','business.profile.update',
      'business.registration.read','business.registration.update','actor.identity.read'
    )
    OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid actor assertion' USING ERRCODE='42501'; END IF;
 IF abs(extract(epoch FROM clock_timestamp())::bigint-p_issued_at)>60 THEN RAISE EXCEPTION 'Actor assertion expired' USING ERRCODE='42501'; END IF;
 SELECT secret INTO v_secret FROM ghm.actor_gateway_capability_assertion_secret WHERE singleton=true;
 IF v_secret IS NULL OR octet_length(v_secret)<>32 THEN RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE='42501'; END IF;
 v_payload:='ghm-actor-gateway:v1|'||p_actor_account_id::text||'|'||p_operation||'|'||p_issued_at::text||'|'||p_nonce::text;
 v_expected:=public.hmac(convert_to(v_payload,'UTF8'),v_secret,'sha256');
 v_provided:=decode(p_signature,'hex');
 -- Compare all 32 bytes before branching; do not expose a prefix timing oracle.
 FOR v_i IN 0..31 LOOP
  v_diff:=v_diff | (get_byte(v_expected,v_i) # get_byte(v_provided,v_i));
 END LOOP;
 IF v_diff<>0 THEN RAISE EXCEPTION 'Actor assertion signature invalid' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active') THEN RAISE EXCEPTION 'Active actor account required' USING ERRCODE='42501'; END IF;
 DELETE FROM ghm.actor_gateway_capability_assertion_nonce WHERE expires_at<clock_timestamp();
 BEGIN
  INSERT INTO ghm.actor_gateway_capability_assertion_nonce(nonce,expires_at) VALUES(p_nonce,GREATEST(clock_timestamp(),to_timestamp(p_issued_at))+interval '60 seconds');
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Actor assertion replay detected' USING ERRCODE='42501';
 END;
 RETURN p_actor_account_id;
END;
$$;
ALTER FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) TO ghm_actor_gateway;

DROP FUNCTION ghm.gateway_get_actor_identity(bigint);
CREATE FUNCTION ghm.gateway_get_actor_identity(
 p_actor_account_id bigint,p_issued_at bigint,p_nonce uuid,p_signature text
) RETURNS TABLE(account_id bigint,account_role text,full_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm
AS $$
DECLARE v_actor bigint;
BEGIN
 v_actor:=ghm.assert_actor_gateway_capability(p_actor_account_id,'actor.identity.read',p_issued_at,p_nonce,p_signature);
 RETURN QUERY SELECT a.id,a.role::text,a.full_name FROM ghm.account_identity a WHERE a.id=v_actor AND a.account_status='active';
END;
$$;
ALTER FUNCTION ghm.gateway_get_actor_identity(bigint,bigint,uuid,text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_get_actor_identity(bigint,bigint,uuid,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_get_actor_identity(bigint,bigint,uuid,text) TO ghm_actor_gateway;

DROP FUNCTION ghm.gateway_read_business_registration_identity(bigint,bigint);
CREATE FUNCTION ghm.gateway_read_business_registration_identity(
 p_actor_account_id bigint,p_issued_at bigint,p_nonce uuid,p_signature text,p_business_id bigint
) RETURNS TABLE(business_id bigint,registration_status text,registration_number text,legal_name text,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm
AS $$
BEGIN
 PERFORM ghm.assert_actor_gateway_capability(p_actor_account_id,'business.registration.read',p_issued_at,p_nonce,p_signature);
 RETURN QUERY SELECT * FROM ghm.read_business_registration_identity(p_actor_account_id,p_business_id);
END;
$$;
ALTER FUNCTION ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,bigint) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,bigint) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,bigint) TO ghm_actor_gateway;

DROP FUNCTION ghm.gateway_update_business_registration_identity(bigint,bigint,text,text,text);
CREATE FUNCTION ghm.gateway_update_business_registration_identity(
 p_actor_account_id bigint,p_issued_at bigint,p_nonce uuid,p_signature text,
 p_business_id bigint,p_registration_status text,p_registration_number text,p_legal_name text
) RETURNS TABLE(business_id bigint,registration_status text,registration_number text,legal_name text,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm
AS $$
BEGIN
 PERFORM ghm.assert_actor_gateway_capability(p_actor_account_id,'business.registration.update',p_issued_at,p_nonce,p_signature);
 RETURN QUERY SELECT updated.business_id,updated.registration_status,updated.registration_number,updated.legal_name,updated.updated_at
 FROM ghm.update_business_registration_identity(p_actor_account_id,p_business_id,p_registration_status,p_registration_number,p_legal_name) AS updated;
END;
$$;
ALTER FUNCTION ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,bigint,text,text,text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,bigint,text,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,bigint,text,text,text) TO ghm_actor_gateway;

COMMIT;
