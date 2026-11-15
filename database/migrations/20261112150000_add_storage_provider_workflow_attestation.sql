-- Provider-confirmed storage transitions require both the user actor proof
-- and a separate Resource API attestation which the Actor Gateway cannot mint.
BEGIN;

CREATE TABLE ghm.storage_provider_workflow_attestation_secret (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret bytea NOT NULL CHECK (octet_length(secret)=32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE ghm.storage_provider_workflow_attestation_secret OWNER TO ghm_schema_owner;
REVOKE ALL ON ghm.storage_provider_workflow_attestation_secret FROM PUBLIC,ghm_runtime,ghm_actor_gateway,ghm_migrator;

CREATE TABLE ghm.storage_provider_workflow_attestation_nonce (
  nonce uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE ghm.storage_provider_workflow_attestation_nonce OWNER TO ghm_schema_owner;
REVOKE ALL ON ghm.storage_provider_workflow_attestation_nonce FROM PUBLIC,ghm_runtime,ghm_actor_gateway,ghm_migrator;
CREATE INDEX storage_provider_workflow_attestation_nonce_expires_at_idx
  ON ghm.storage_provider_workflow_attestation_nonce(expires_at);

CREATE OR REPLACE FUNCTION ghm.assert_storage_provider_workflow_attestation(
 p_operation text,p_issued bigint,p_nonce uuid,p_context text,p_signature text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm,pg_temp
AS $$
DECLARE v_secret bytea;v_expected bytea;v_provided bytea;v_payload text;v_diff integer:=0;v_i integer;
BEGIN
 IF session_user<>'ghm_actor_gateway'
    OR p_operation IS NULL OR p_operation NOT IN ('storage.provider.mark_available','storage.provider.mark_deleted')
    OR p_issued IS NULL OR p_nonce IS NULL OR p_context IS NULL
    OR octet_length(convert_to(p_context,'UTF8'))>32768
    OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN
   RAISE EXCEPTION 'Invalid storage provider attestation' USING ERRCODE='42501';
 END IF;
 IF abs(extract(epoch FROM clock_timestamp())::bigint-p_issued)>60 THEN
   RAISE EXCEPTION 'Storage provider attestation expired' USING ERRCODE='42501';
 END IF;
 SELECT secret INTO v_secret FROM ghm.storage_provider_workflow_attestation_secret WHERE singleton=true;
 IF v_secret IS NULL OR octet_length(v_secret)<>32 THEN
   RAISE EXCEPTION 'Storage provider attestation verifier is not provisioned' USING ERRCODE='42501';
 END IF;
 v_payload:='ghm-storage-provider:v1|'||p_operation||'|'||p_issued::text||'|'||p_nonce::text||'|'||encode(convert_to(p_context,'UTF8'),'hex');
 v_expected:=public.hmac(convert_to(v_payload,'UTF8'),v_secret,'sha256');
 v_provided:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i) # get_byte(v_provided,v_i));END LOOP;
 IF v_diff<>0 THEN RAISE EXCEPTION 'Storage provider attestation signature invalid' USING ERRCODE='42501';END IF;
 DELETE FROM ghm.storage_provider_workflow_attestation_nonce WHERE expires_at<clock_timestamp();
 BEGIN
   INSERT INTO ghm.storage_provider_workflow_attestation_nonce(nonce,expires_at)
   VALUES(p_nonce,GREATEST(clock_timestamp(),to_timestamp(p_issued))+interval '60 seconds');
 EXCEPTION WHEN unique_violation THEN
   RAISE EXCEPTION 'Storage provider attestation replay detected' USING ERRCODE='42501';
 END;
END;
$$;
ALTER FUNCTION ghm.assert_storage_provider_workflow_attestation(text,bigint,uuid,text,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.assert_storage_provider_workflow_attestation(text,bigint,uuid,text,text) SET search_path=pg_catalog,ghm,pg_temp;
REVOKE ALL ON FUNCTION ghm.assert_storage_provider_workflow_attestation(text,bigint,uuid,text,text) FROM PUBLIC,ghm_runtime,ghm_actor_gateway,ghm_migrator;

CREATE FUNCTION ghm.gateway_storage_mark_available(
 p_actor bigint,p_actor_issued bigint,p_actor_nonce uuid,p_actor_context text,p_actor_signature text,
 p_provider_issued bigint,p_provider_nonce uuid,p_provider_context text,p_provider_signature text,
 p_object_id bigint,p_checksum text,p_provider_key text,p_content_type text,p_byte_size bigint
) RETURNS ghm.storage_object
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm,pg_temp
AS $$
DECLARE v_actor bigint;v_row ghm.storage_object;v_provider_context jsonb;
BEGIN
 IF p_actor_context::jsonb<>jsonb_build_object(
   'objectId',p_object_id,'checksum',p_checksum,'providerKey',p_provider_key,
   'contentType',p_content_type,'byteSize',p_byte_size
 ) THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'storage.metadata.mark_available',p_actor_issued,p_actor_nonce,p_actor_context,p_actor_signature);
 SELECT * INTO v_row FROM ghm.storage_object WHERE id=p_object_id FOR UPDATE;
 IF NOT FOUND OR v_row.status<>'pending'
    OR v_row.provider_key IS DISTINCT FROM p_provider_key
    OR v_row.content_type IS DISTINCT FROM p_content_type
    OR v_row.byte_size IS DISTINCT FROM p_byte_size THEN
   RAISE EXCEPTION 'Storage object is not eligible for availability transition' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(
   SELECT 1 FROM ghm.business b JOIN ghm.business_membership bm ON bm.business_id=b.id
   WHERE b.id=v_row.tenant_business_id AND b.is_active=true AND bm.account_id=v_actor
     AND bm.membership_status='active' AND bm.membership_role IN ('owner','administrator')
 ) THEN RAISE EXCEPTION 'Business management permission required' USING ERRCODE='42501';END IF;
 v_provider_context:=jsonb_build_object(
   'businessId',v_row.tenant_business_id,'objectId',p_object_id,'providerKey',v_row.provider_key,
   'contentType',v_row.content_type,'byteSize',v_row.byte_size,'checksum',p_checksum
 );
 IF p_provider_context::jsonb<>v_provider_context THEN
   RAISE EXCEPTION 'Storage provider attestation context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM ghm.assert_storage_provider_workflow_attestation(
   'storage.provider.mark_available',p_provider_issued,p_provider_nonce,p_provider_context,p_provider_signature
 );
 SELECT * INTO v_row FROM ghm.storage_mark_available(p_object_id,p_checksum);
 RETURN v_row;
END;
$$;

CREATE FUNCTION ghm.gateway_storage_mark_deleted(
 p_actor bigint,p_actor_issued bigint,p_actor_nonce uuid,p_actor_context text,p_actor_signature text,
 p_provider_issued bigint,p_provider_nonce uuid,p_provider_context text,p_provider_signature text,
 p_object_id bigint,p_provider_key text
) RETURNS ghm.storage_object
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm,pg_temp
AS $$
DECLARE v_actor bigint;v_row ghm.storage_object;v_provider_context jsonb;
BEGIN
 IF p_actor_context::jsonb<>jsonb_build_object('objectId',p_object_id,'providerKey',p_provider_key) THEN
   RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'storage.metadata.mark_deleted',p_actor_issued,p_actor_nonce,p_actor_context,p_actor_signature);
 SELECT * INTO v_row FROM ghm.storage_object WHERE id=p_object_id FOR UPDATE;
 IF NOT FOUND OR v_row.status<>'deletion_pending' OR v_row.provider_key IS DISTINCT FROM p_provider_key THEN
   RAISE EXCEPTION 'Storage object is not eligible for deletion completion' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(
   SELECT 1 FROM ghm.business b JOIN ghm.business_membership bm ON bm.business_id=b.id
   WHERE b.id=v_row.tenant_business_id AND b.is_active=true AND bm.account_id=v_actor
     AND bm.membership_status='active' AND bm.membership_role IN ('owner','administrator')
 ) THEN RAISE EXCEPTION 'Business management permission required' USING ERRCODE='42501';END IF;
 v_provider_context:=jsonb_build_object('businessId',v_row.tenant_business_id,'objectId',p_object_id,'providerKey',v_row.provider_key);
 IF p_provider_context::jsonb<>v_provider_context THEN
   RAISE EXCEPTION 'Storage provider attestation context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM ghm.assert_storage_provider_workflow_attestation(
   'storage.provider.mark_deleted',p_provider_issued,p_provider_nonce,p_provider_context,p_provider_signature
 );
 SELECT * INTO v_row FROM ghm.storage_mark_deleted(p_object_id);
 RETURN v_row;
END;
$$;

ALTER FUNCTION ghm.gateway_storage_mark_available(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text,text,text,bigint) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_storage_mark_deleted(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_storage_mark_available(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text,text,text,bigint) SET search_path=pg_catalog,ghm,pg_temp;
ALTER FUNCTION ghm.gateway_storage_mark_deleted(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text) SET search_path=pg_catalog,ghm,pg_temp;
REVOKE ALL ON FUNCTION ghm.gateway_storage_mark_available(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text,text,text,bigint) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_storage_mark_deleted(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_storage_mark_available(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text,text,text,bigint) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_storage_mark_deleted(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text) TO ghm_actor_gateway;

COMMIT;
