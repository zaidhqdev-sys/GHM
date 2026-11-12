-- Bind Campaign mutations and owner directory-review presentation to a
-- short-lived, one-use Actor Gateway assertion. Runtime direct grants are
-- revoked only by this forward migration; production rollout remains manual.
DO $$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text)'::regprocedure
  ) INTO v_definition;
  IF position('''business.connect.provision''' || chr(10) IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Actor Gateway capability operation allow-list changed; reconcile migration manually';
  END IF;
  v_definition := replace(
    v_definition,
    '''business.connect.provision''' || chr(10),
    '''business.connect.provision'',''campaign.create'',''campaign.update'',''directory_review.presentation.read''' || chr(10)
  );
  EXECUTE v_definition;
END;
$$;

CREATE OR REPLACE FUNCTION ghm.gateway_create_campaign(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,
 p_business bigint,p_title text
) RETURNS SETOF ghm.campaign
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm,pg_temp
AS $$
DECLARE v_actor bigint;
BEGIN
 IF p_context::jsonb<>jsonb_build_object('businessId',p_business,'title',p_title) THEN
   RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'campaign.create',p_issued,p_nonce,p_context,p_signature);
 RETURN QUERY SELECT * FROM ghm.create_campaign(v_actor,p_business,p_title);
END;
$$;

CREATE OR REPLACE FUNCTION ghm.gateway_update_campaign(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,
 p_campaign bigint,p_title text,p_status text
) RETURNS SETOF ghm.campaign
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm,pg_temp
AS $$
DECLARE v_actor bigint;
BEGIN
 IF p_context::jsonb<>jsonb_build_object('campaignId',p_campaign,'title',p_title,'status',p_status) THEN
   RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'campaign.update',p_issued,p_nonce,p_context,p_signature);
 RETURN QUERY SELECT * FROM ghm.update_campaign(v_actor,p_campaign,p_title,p_status);
END;
$$;

CREATE OR REPLACE FUNCTION ghm.gateway_get_business_directory_review_presentation(
 p_actor bigint,p_issued bigint,p_nonce uuid,p_context text,p_signature text,
 p_business bigint
) RETURNS TABLE (
 business_id bigint,
 verification_status text,
 is_verified boolean,
 directory_review_submitted_at timestamptz,
 directory_review_last_reason text,
 directory_review_last_event_type text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm,pg_temp
AS $$
DECLARE v_actor bigint;
BEGIN
 IF p_context::jsonb<>jsonb_build_object('businessId',p_business) THEN
   RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
 END IF;
 v_actor:=ghm.assert_actor_gateway_capability(p_actor,'directory_review.presentation.read',p_issued,p_nonce,p_context,p_signature);
 RETURN QUERY SELECT * FROM ghm.get_business_directory_review_presentation(v_actor,p_business);
END;
$$;

ALTER FUNCTION ghm.gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint) OWNER TO ghm_schema_owner;

ALTER FUNCTION ghm.gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text) SET search_path=pg_catalog,ghm,pg_temp;
ALTER FUNCTION ghm.gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text) SET search_path=pg_catalog,ghm,pg_temp;
ALTER FUNCTION ghm.gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint) SET search_path=pg_catalog,ghm,pg_temp;

REVOKE ALL ON FUNCTION ghm.gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint) FROM PUBLIC,ghm_runtime,ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint) TO ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.create_campaign(bigint,bigint,text) FROM PUBLIC,ghm_runtime;
REVOKE ALL ON FUNCTION ghm.update_campaign(bigint,bigint,text,text) FROM PUBLIC,ghm_runtime;
REVOKE ALL ON FUNCTION ghm.get_business_directory_review_presentation(bigint,bigint) FROM PUBLIC,ghm_runtime;

COMMENT ON FUNCTION ghm.gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text) IS
 'Creates a Campaign only after a one-use signed Actor Gateway assertion binds the authenticated active actor and request context.';
COMMENT ON FUNCTION ghm.gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text) IS
 'Updates a Campaign only after a one-use signed Actor Gateway assertion binds the authenticated active actor and request context.';
COMMENT ON FUNCTION ghm.gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint) IS
 'Reads owner directory-review presentation only after a one-use signed Actor Gateway assertion binds the authenticated active actor and business context.';
