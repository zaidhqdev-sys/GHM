-- Extend the database-verifiable gateway assertion to supplier writes.
BEGIN;

CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway_capability(
  p_actor_account_id bigint,
  p_operation text,
  p_issued_at bigint,
  p_nonce uuid,
  p_signature text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
DECLARE v_secret bytea; v_payload text; v_expected bytea;
BEGIN
  IF session_user <> 'ghm_actor_gateway' THEN
    RAISE EXCEPTION 'Actor gateway database principal required' USING ERRCODE='42501';
  END IF;
  IF p_actor_account_id IS NULL OR p_actor_account_id <= 0 OR p_issued_at IS NULL OR p_nonce IS NULL
     OR p_operation IS NULL OR p_operation NOT IN (
       'capability.list','capability.create','capability.update','capability.transition',
       'supplier.classification.update'
     )
     OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid actor assertion' USING ERRCODE='42501';
  END IF;
  IF abs(extract(epoch FROM clock_timestamp())::bigint-p_issued_at)>60 THEN
    RAISE EXCEPTION 'Actor assertion expired' USING ERRCODE='42501';
  END IF;
  SELECT secret INTO v_secret FROM ghm.actor_gateway_capability_assertion_secret WHERE singleton=true;
  IF v_secret IS NULL OR octet_length(v_secret)<>32 THEN
    RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE='42501';
  END IF;
  v_payload := 'ghm-actor-gateway:v1|'||p_actor_account_id::text||'|'||p_operation||'|'||p_issued_at::text||'|'||p_nonce::text;
  v_expected := public.hmac(convert_to(v_payload,'UTF8'),v_secret,'sha256');
  IF v_expected <> decode(p_signature,'hex') THEN
    RAISE EXCEPTION 'Actor assertion signature invalid' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active') THEN
    RAISE EXCEPTION 'Active actor account required' USING ERRCODE='42501';
  END IF;
  DELETE FROM ghm.actor_gateway_capability_assertion_nonce WHERE expires_at<clock_timestamp();
  BEGIN
    INSERT INTO ghm.actor_gateway_capability_assertion_nonce(nonce,expires_at)
    VALUES(p_nonce,to_timestamp(p_issued_at)+interval '60 seconds');
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Actor assertion replay detected' USING ERRCODE='42501';
  END;
  RETURN p_actor_account_id;
END;
$$;
ALTER FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) TO ghm_actor_gateway;

DROP FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,boolean);
CREATE FUNCTION ghm.gateway_update_business_supplier_classification(
  p_actor_account_id bigint,
  p_issued_at bigint,
  p_nonce uuid,
  p_signature text,
  p_business_id bigint,
  p_is_supplier boolean
) RETURNS TABLE(business_id bigint,is_supplier boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm
AS $$
BEGIN
  PERFORM ghm.assert_actor_gateway_capability(p_actor_account_id,'supplier.classification.update',p_issued_at,p_nonce,p_signature);
  RETURN QUERY SELECT updated.id,updated.is_supplier
    FROM ghm.update_business_supplier_classification(p_actor_account_id,p_business_id,p_is_supplier) AS updated;
END;
$$;
ALTER FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,uuid,text,bigint,boolean) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,uuid,text,bigint,boolean) SET search_path=pg_catalog,ghm;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,uuid,text,bigint,boolean) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,uuid,text,bigint,boolean) TO ghm_actor_gateway;
COMMENT ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,uuid,text,bigint,boolean) IS
 'Supplier classification write requires a short-lived, one-use HMAC assertion bound to supplier.classification.update; direct gateway SQL callers cannot choose another actor ID.';

COMMIT;
