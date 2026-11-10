BEGIN;

CREATE OR REPLACE FUNCTION ghm.create_capability_draft(
  p_actor_account_id bigint,
  p_name text,
  p_slug text,
  p_description text,
  p_parent_id uuid,
  p_sort_order integer,
  p_source_reference text,
  p_version integer
)
RETURNS ghm.capability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.capability;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ghm.account_identity
     WHERE id = p_actor_account_id
       AND account_status = 'active'
       AND (is_system_admin = true OR role = 'admin')
  ) THEN
    RAISE EXCEPTION 'System administrator permission required';
  END IF;
  IF p_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Unsupported Capability taxonomy version';
  END IF;
  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ghm.capability WHERE id = p_parent_id AND lifecycle_status <> 'retired'
  ) THEN
    RAISE EXCEPTION 'Capability parent not found or retired';
  END IF;

  INSERT INTO ghm.capability (
    id, parent_id, name, slug, description, sort_order,
    lifecycle_status, taxonomy_version, source_authority,
    source_reference, is_selectable
  ) VALUES (
    gen_random_uuid(), p_parent_id, p_name, p_slug, p_description, p_sort_order,
    'draft', p_version, 'GHM System Administration', p_source_reference, false
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION ghm.update_capability_draft(
  p_actor_account_id bigint,
  p_capability_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_parent_id uuid,
  p_sort_order integer,
  p_source_reference text,
  p_version integer
)
RETURNS ghm.capability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.capability;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ghm.account_identity
     WHERE id = p_actor_account_id
       AND account_status = 'active'
       AND (is_system_admin = true OR role = 'admin')
  ) THEN
    RAISE EXCEPTION 'System administrator permission required';
  END IF;
  IF p_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Unsupported Capability taxonomy version';
  END IF;
  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ghm.capability WHERE id = p_parent_id AND lifecycle_status <> 'retired'
  ) THEN
    RAISE EXCEPTION 'Capability parent not found or retired';
  END IF;

  UPDATE ghm.capability
     SET name = p_name,
         slug = p_slug,
         description = p_description,
         parent_id = p_parent_id,
         sort_order = p_sort_order,
         source_reference = p_source_reference
   WHERE id = p_capability_id
     AND lifecycle_status = 'draft'
     AND taxonomy_version = p_version
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Capability draft not found or version changed';
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION ghm.transition_capability_lifecycle(
  p_actor_account_id bigint,
  p_capability_id uuid,
  p_target_status text,
  p_replaced_by_capability_id uuid,
  p_version integer
)
RETURNS ghm.capability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.capability;
  v_allowed boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ghm.account_identity
     WHERE id = p_actor_account_id
       AND account_status = 'active'
       AND (is_system_admin = true OR role = 'admin')
  ) THEN
    RAISE EXCEPTION 'System administrator permission required';
  END IF;

  SELECT * INTO v_row
    FROM ghm.capability
   WHERE id = p_capability_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Capability not found';
  END IF;
  IF p_version IS DISTINCT FROM v_row.taxonomy_version THEN
    RAISE EXCEPTION 'Capability taxonomy version changed';
  END IF;

  v_allowed :=
    (v_row.lifecycle_status = 'draft' AND p_target_status = 'active')
    OR (v_row.lifecycle_status = 'active' AND p_target_status IN ('deprecated', 'retired'))
    OR (v_row.lifecycle_status = 'deprecated' AND p_target_status IN ('active', 'retired'));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid Capability lifecycle transition';
  END IF;

  IF p_target_status = 'active' AND p_replaced_by_capability_id IS NOT NULL THEN
    RAISE EXCEPTION 'Active Capability cannot identify a replacement';
  END IF;
  IF p_replaced_by_capability_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ghm.capability
     WHERE id = p_replaced_by_capability_id
       AND lifecycle_status = 'active'
       AND id <> p_capability_id
  ) THEN
    RAISE EXCEPTION 'Replacement must reference a different active Capability';
  END IF;

  UPDATE ghm.capability
     SET lifecycle_status = p_target_status,
         is_selectable = (p_target_status = 'active'),
         effective_from = CASE WHEN p_target_status = 'active' THEN COALESCE(effective_from, now()) ELSE effective_from END,
         effective_to = CASE WHEN p_target_status IN ('deprecated', 'retired') THEN now() ELSE NULL END,
         replaced_by_capability_id = p_replaced_by_capability_id
   WHERE id = p_capability_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

ALTER FUNCTION ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer) OWNER TO ghm_schema_owner;

ALTER FUNCTION ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer) SET search_path = pg_catalog, ghm;
ALTER FUNCTION ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer) SET search_path = pg_catalog, ghm;
ALTER FUNCTION ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer) SET search_path = pg_catalog, ghm;

REVOKE ALL ON FUNCTION ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer) FROM PUBLIC, ghm_migrator;
REVOKE ALL ON FUNCTION ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer) FROM PUBLIC, ghm_migrator;
REVOKE ALL ON FUNCTION ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer) FROM PUBLIC, ghm_migrator;

GRANT EXECUTE ON FUNCTION ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer) TO ghm_runtime;

COMMIT;
