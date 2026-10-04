BEGIN;

REVOKE ALL ON ghm.storage_object FROM ghm_runtime;
REVOKE ALL ON ghm.storage_object FROM ghm_migrator;

CREATE OR REPLACE FUNCTION ghm.storage_create_pending(
  p_tenant_business_id bigint,
  p_resource_type text,
  p_resource_id bigint,
  p_object_class text,
  p_provider_key text,
  p_content_type text,
  p_byte_size bigint,
  p_visibility text,
  p_original_filename text DEFAULT NULL
)
RETURNS ghm.storage_object
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.storage_object;
BEGIN
  IF p_tenant_business_id IS NULL
     OR p_resource_type IS NULL OR btrim(p_resource_type) = ''
     OR p_resource_id IS NULL
     OR p_object_class IS NULL OR btrim(p_object_class) = ''
     OR p_provider_key IS NULL OR btrim(p_provider_key) = ''
     OR p_content_type IS NULL OR btrim(p_content_type) = ''
     OR p_byte_size IS NULL OR p_byte_size < 0
     OR p_visibility IS NULL
  THEN
    RAISE EXCEPTION 'invalid storage object input';
  END IF;

  INSERT INTO ghm.storage_object (
    tenant_business_id, resource_type, resource_id, object_class,
    provider_key, content_type, byte_size, visibility, status, original_filename
  )
  VALUES (
    p_tenant_business_id, p_resource_type, p_resource_id, p_object_class,
    p_provider_key, p_content_type, p_byte_size, p_visibility, 'pending', p_original_filename
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION ghm.storage_mark_available(
  p_object_id bigint,
  p_checksum text
)
RETURNS ghm.storage_object
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.storage_object;
BEGIN
  UPDATE ghm.storage_object
     SET checksum = NULLIF(btrim(p_checksum), ''),
         status = 'available',
         available_at = clock_timestamp()
   WHERE id = p_object_id
     AND status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage object is not pending or does not exist';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION ghm.storage_mark_deletion_pending(
  p_object_id bigint
)
RETURNS ghm.storage_object
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.storage_object;
BEGIN
  UPDATE ghm.storage_object
     SET status = 'deletion_pending'
   WHERE id = p_object_id
     AND status = 'available'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage object is not available or does not exist';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION ghm.storage_mark_deleted(
  p_object_id bigint
)
RETURNS ghm.storage_object
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.storage_object;
BEGIN
  UPDATE ghm.storage_object
     SET status = 'deleted',
         deleted_at = clock_timestamp()
   WHERE id = p_object_id
     AND status = 'deletion_pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage object is not pending deletion or does not exist';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_available(bigint,text) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_deletion_pending(bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_deleted(bigint) TO ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.storage_get_object(
  p_object_id bigint
)
RETURNS ghm.storage_object
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, ghm
AS $
DECLARE
  v_row ghm.storage_object;
BEGIN
  SELECT * INTO v_row
    FROM ghm.storage_object
   WHERE id = p_object_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage object does not exist';
  END IF;

  RETURN v_row;
END;
$;

GRANT EXECUTE ON FUNCTION ghm.storage_get_object(bigint) TO ghm_runtime;


COMMIT;
