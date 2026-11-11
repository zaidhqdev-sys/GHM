-- Bind every one-use gateway assertion to the exact operation arguments.
BEGIN;
DROP FUNCTION ghm.gateway_list_capabilities(bigint,bigint,uuid,text);
DROP FUNCTION ghm.gateway_create_capability_draft(bigint,bigint,uuid,text,text,text,text,uuid,integer,text,integer);
DROP FUNCTION ghm.gateway_update_capability_draft(bigint,bigint,uuid,text,uuid,text,text,text,uuid,integer,text,integer);
DROP FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,bigint,uuid,text,uuid,text,uuid,integer);
DROP FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,uuid,text,bigint,boolean);
DROP FUNCTION ghm.gateway_update_business_profile(bigint,bigint,uuid,text,bigint,jsonb);
DROP FUNCTION ghm.gateway_get_actor_identity(bigint,bigint,uuid,text);
DROP FUNCTION ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,bigint);
DROP FUNCTION ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,bigint,text,text,text);
DROP FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text);

CREATE FUNCTION ghm.assert_actor_gateway_capability(p_actor bigint,p_operation text,p_issued bigint,p_nonce uuid,p_context text,p_signature text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
DECLARE v_secret bytea;v_expected bytea;v_provided bytea;v_payload text;v_diff integer:=0;v_i integer;
BEGIN
 IF session_user<>'ghm_actor_gateway' OR p_actor IS NULL OR p_actor<=0 OR p_issued IS NULL OR p_nonce IS NULL OR p_context IS NULL OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid actor assertion' USING ERRCODE='42501';END IF;
 IF abs(extract(epoch FROM clock_timestamp())::bigint-p_issued)>60 THEN RAISE EXCEPTION 'Actor assertion expired' USING ERRCODE='42501';END IF;
 SELECT secret INTO v_secret FROM ghm.actor_gateway_capability_assertion_secret WHERE singleton=true;
 IF v_secret IS NULL OR octet_length(v_secret)<>32 THEN RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE='42501';END IF;
 v_payload:='ghm-actor-gateway:v2|'||p_actor::text||'|'||p_operation||'|'||p_issued::text||'|'||p_nonce::text||'|'||encode(convert_to(p_context,'UTF8'),'hex');
 v_expected:=public.hmac(convert_to(v_payload,'UTF8'),v_secret,'sha256');v_provided:=decode(p_signature,'hex');
 FOR v_i IN 0..31 LOOP v_diff:=v_diff | (get_byte(v_expected,v_i) # get_byte(v_provided,v_i));END LOOP;
 IF v_diff<>0 THEN RAISE EXCEPTION 'Actor assertion signature invalid' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM ghm.account_identity WHERE id=p_actor AND account_status='active') THEN RAISE EXCEPTION 'Active actor account required' USING ERRCODE='42501';END IF;
 DELETE FROM ghm.actor_gateway_capability_assertion_nonce WHERE expires_at<clock_timestamp();
 BEGIN INSERT INTO ghm.actor_gateway_capability_assertion_nonce(nonce,expires_at) VALUES(p_nonce,to_timestamp(p_issued)+interval '60 seconds');
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Actor assertion replay detected' USING ERRCODE='42501';END;
 RETURN p_actor;
END;$$;

CREATE FUNCTION ghm.gateway_list_capabilities(p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text)
RETURNS SETOF ghm.capability LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>'{}'::jsonb THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'capability.list',p_issued,p_nonce,p_context,p_signature);
 IF NOT EXISTS(SELECT 1 FROM ghm.account_identity WHERE id=p_actor AND account_status='active' AND (is_system_admin OR role='admin')) THEN RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT c.* FROM ghm.capability c ORDER BY taxonomy_version DESC,sort_order,name,id;
END;$$;

CREATE FUNCTION ghm.gateway_create_capability_draft(p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_name text,p_slug text,p_description text,p_parent uuid,p_sort integer,p_source text,p_version integer)
RETURNS ghm.capability LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('name',p_name,'slug',p_slug,'description',p_description,'parentId',p_parent,'sortOrder',p_sort,'sourceReference',p_source,'version',p_version) THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'capability.create',p_issued,p_nonce,p_context,p_signature);
 IF NOT EXISTS(SELECT 1 FROM ghm.account_identity WHERE id=p_actor AND account_status='active' AND (is_system_admin OR role='admin')) THEN RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';END IF;
 RETURN ghm.create_capability_draft(p_actor,p_name,p_slug,p_description,p_parent,p_sort,p_source,p_version);
END;$$;

CREATE FUNCTION ghm.gateway_update_capability_draft(p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_id uuid,p_name text,p_slug text,p_description text,p_parent uuid,p_sort integer,p_source text,p_version integer)
RETURNS ghm.capability LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('capabilityId',p_id,'name',p_name,'slug',p_slug,'description',p_description,'parentId',p_parent,'sortOrder',p_sort,'sourceReference',p_source,'version',p_version) THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'capability.update',p_issued,p_nonce,p_context,p_signature);
 IF NOT EXISTS(SELECT 1 FROM ghm.account_identity WHERE id=p_actor AND account_status='active' AND (is_system_admin OR role='admin')) THEN RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';END IF;
 RETURN ghm.update_capability_draft(p_actor,p_id,p_name,p_slug,p_description,p_parent,p_sort,p_source,p_version);
END;$$;

CREATE FUNCTION ghm.gateway_transition_capability_lifecycle(p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_id uuid,p_status text,p_replacement uuid,p_version integer)
RETURNS ghm.capability LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('capabilityId',p_id,'targetStatus',p_status,'replacedByCapabilityId',p_replacement,'version',p_version) THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'capability.transition',p_issued,p_nonce,p_context,p_signature);
 IF NOT EXISTS(SELECT 1 FROM ghm.account_identity WHERE id=p_actor AND account_status='active' AND (is_system_admin OR role='admin')) THEN RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';END IF;
 RETURN ghm.transition_capability_lifecycle(p_actor,p_id,p_status,p_replacement,p_version);
END;$$;

CREATE FUNCTION ghm.gateway_update_business_supplier_classification(p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_business bigint,p_supplier boolean)
RETURNS TABLE(business_id bigint,is_supplier boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('businessId',p_business,'isSupplier',p_supplier) THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'supplier.classification.update',p_issued,p_nonce,p_context,p_signature);
 RETURN QUERY SELECT u.id,u.is_supplier FROM ghm.update_business_supplier_classification(p_actor,p_business,p_supplier) u;
END;$$;

CREATE FUNCTION ghm.gateway_update_business_profile(p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_business bigint,p_patch jsonb)
RETURNS ghm.business LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('businessId',p_business,'patch',p_patch) THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'business.profile.update',p_issued,p_nonce,p_context,p_signature);
 RETURN ghm.update_business_profile(p_actor,p_business,p_patch);
END;$$;

CREATE FUNCTION ghm.gateway_get_actor_identity(p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text)
RETURNS TABLE(account_id bigint,account_role text,full_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
DECLARE v_actor bigint;
BEGIN
 IF p_context::jsonb<>'{}'::jsonb THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'actor.identity.read',p_issued,p_nonce,p_context,p_signature);
 RETURN QUERY SELECT a.id,a.role::text,a.full_name FROM ghm.account_identity a WHERE a.id=v_actor AND a.account_status='active';
END;$$;

CREATE FUNCTION ghm.gateway_read_business_registration_identity(p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_business bigint)
RETURNS TABLE(business_id bigint,registration_status text,registration_number text,legal_name text,updated_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('businessId',p_business) THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'business.registration.read',p_issued,p_nonce,p_context,p_signature);
 RETURN QUERY SELECT * FROM ghm.read_business_registration_identity(p_actor,p_business);
END;$$;

CREATE FUNCTION ghm.gateway_update_business_registration_identity(p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,p_business bigint,p_status text,p_number text,p_legal text)
RETURNS TABLE(business_id bigint,registration_status text,registration_number text,legal_name text,updated_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
BEGIN
 IF p_context::jsonb<>jsonb_build_object('businessId',p_business,'registrationStatus',p_status,'registrationNumber',p_number,'legalName',p_legal) THEN RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';END IF;
 PERFORM ghm.assert_actor_gateway_capability(p_actor,'business.registration.update',p_issued,p_nonce,p_context,p_signature);
 RETURN QUERY SELECT u.business_id,u.registration_status,u.registration_number,u.legal_name,u.updated_at FROM ghm.update_business_registration_identity(p_actor,p_business,p_status,p_number,p_legal) u;
END;$$;

ALTER FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_list_capabilities(bigint,bigint,uuid,text,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_create_capability_draft(bigint,bigint,uuid,text,text,text,text,text,uuid,integer,text,integer) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_capability_draft(bigint,bigint,uuid,text,text,uuid,text,text,text,uuid,integer,text,integer) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,bigint,uuid,text,text,uuid,text,uuid,integer) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,uuid,text,text,bigint,boolean) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_business_profile(bigint,bigint,uuid,text,text,bigint,jsonb) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_get_actor_identity(bigint,bigint,uuid,text,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,text,bigint) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,text,bigint,text,text,text) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text) TO ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.gateway_list_capabilities(bigint,bigint,uuid,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_create_capability_draft(bigint,bigint,uuid,text,text,text,text,text,uuid,integer,text,integer) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_update_capability_draft(bigint,bigint,uuid,text,text,uuid,text,text,text,uuid,integer,text,integer) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,bigint,uuid,text,text,uuid,text,uuid,integer) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,uuid,text,text,bigint,boolean) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_profile(bigint,bigint,uuid,text,text,bigint,jsonb) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_get_actor_identity(bigint,bigint,uuid,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,text,bigint) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,text,bigint,text,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;

GRANT EXECUTE ON FUNCTION ghm.gateway_list_capabilities(bigint,bigint,uuid,text,text) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_create_capability_draft(bigint,bigint,uuid,text,text,text,text,text,uuid,integer,text,integer) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_capability_draft(bigint,bigint,uuid,text,text,uuid,text,text,text,uuid,integer,text,integer) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,bigint,uuid,text,text,uuid,text,uuid,integer) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint,bigint,uuid,text,text,bigint,boolean) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_business_profile(bigint,bigint,uuid,text,text,bigint,jsonb) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_get_actor_identity(bigint,bigint,uuid,text,text) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_read_business_registration_identity(bigint,bigint,uuid,text,text,bigint) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_business_registration_identity(bigint,bigint,uuid,text,text,bigint,text,text,text) TO ghm_actor_gateway;
COMMIT;
