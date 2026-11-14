-- Bind all capability governance RPCs to the isolated actor gateway principal.
-- The gateway derives the actor account ID from its verified ES256 token subject.
-- Legacy runtime grants remain until the API gateway cutover is separately approved.
BEGIN;

CREATE OR REPLACE FUNCTION ghm.gateway_list_capabilities(p_actor_account_id bigint)
RETURNS SETOF ghm.capability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
BEGIN
  PERFORM ghm.assert_actor_gateway(p_actor_account_id);
  IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active' AND (is_system_admin=true OR role='admin')) THEN
    RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT c.* FROM ghm.capability c ORDER BY taxonomy_version DESC, sort_order, name, id;
END; $$;

CREATE OR REPLACE FUNCTION ghm.gateway_create_capability_draft(
 p_actor_account_id bigint,p_name text,p_slug text,p_description text,p_parent_id uuid,p_sort_order integer,p_source_reference text,p_version integer
) RETURNS ghm.capability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
BEGIN
 PERFORM ghm.assert_actor_gateway(p_actor_account_id);
 IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active' AND (is_system_admin=true OR role='admin')) THEN
  RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';
 END IF;
 RETURN ghm.create_capability_draft(p_actor_account_id,p_name,p_slug,p_description,p_parent_id,p_sort_order,p_source_reference,p_version);
END; $$;

CREATE OR REPLACE FUNCTION ghm.gateway_update_capability_draft(
 p_actor_account_id bigint,p_capability_id uuid,p_name text,p_slug text,p_description text,p_parent_id uuid,p_sort_order integer,p_source_reference text,p_version integer
) RETURNS ghm.capability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
BEGIN
 PERFORM ghm.assert_actor_gateway(p_actor_account_id);
 IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active' AND (is_system_admin=true OR role='admin')) THEN
  RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';
 END IF;
 RETURN ghm.update_capability_draft(p_actor_account_id,p_capability_id,p_name,p_slug,p_description,p_parent_id,p_sort_order,p_source_reference,p_version);
END; $$;

CREATE OR REPLACE FUNCTION ghm.gateway_transition_capability_lifecycle(
 p_actor_account_id bigint,p_capability_id uuid,p_target_status text,p_replaced_by_capability_id uuid,p_version integer
) RETURNS ghm.capability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
BEGIN
 PERFORM ghm.assert_actor_gateway(p_actor_account_id);
 IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active' AND (is_system_admin=true OR role='admin')) THEN
  RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';
 END IF;
 RETURN ghm.transition_capability_lifecycle(p_actor_account_id,p_capability_id,p_target_status,p_replaced_by_capability_id,p_version);
END; $$;

ALTER FUNCTION ghm.gateway_list_capabilities(bigint) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_create_capability_draft(bigint,text,text,text,uuid,integer,text,integer) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,uuid,text,uuid,integer) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.gateway_list_capabilities(bigint) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_create_capability_draft(bigint,text,text,text,uuid,integer,text,integer) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,uuid,text,uuid,integer) FROM PUBLIC,ghm_runtime,ghm_migrator;

GRANT EXECUTE ON FUNCTION ghm.gateway_list_capabilities(bigint) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_create_capability_draft(bigint,text,text,text,uuid,integer,text,integer) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,uuid,text,uuid,integer) TO ghm_actor_gateway;

COMMIT;
