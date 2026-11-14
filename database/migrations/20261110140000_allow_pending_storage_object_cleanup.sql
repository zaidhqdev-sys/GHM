BEGIN;

-- A deletion request can arrive before an upload has completed. Preserve
-- available_at exactly as recorded: NULL for pending uploads and non-NULL
-- for uploads that had become available. The deletion-pending state itself
-- must not require the object to have been available.
ALTER TABLE ghm.storage_object
  DROP CONSTRAINT storage_object_lifecycle_check;

ALTER TABLE ghm.storage_object
  ADD CONSTRAINT storage_object_lifecycle_check CHECK (
    (status = 'pending' AND available_at IS NULL AND deleted_at IS NULL)
    OR (status = 'available' AND available_at IS NOT NULL AND deleted_at IS NULL)
    OR (status = 'deletion_pending' AND deleted_at IS NULL)
    OR (status = 'deleted' AND deleted_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION ghm.storage_mark_deletion_pending(
  p_object_id bigint
)
RETURNS ghm.storage_object
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.storage_object;
BEGIN
  UPDATE ghm.storage_object
     SET status = 'deletion_pending'
   WHERE id = p_object_id
     AND status IN ('pending', 'available')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage object is not pending or available, or does not exist';
  END IF;

  RETURN v_row;
END;
$$;

ALTER FUNCTION ghm.storage_mark_deletion_pending(bigint) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.storage_mark_deletion_pending(bigint) SET search_path = pg_catalog, ghm;
REVOKE ALL ON FUNCTION ghm.storage_mark_deletion_pending(bigint) FROM PUBLIC, ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_deletion_pending(bigint) TO ghm_runtime;

COMMIT;
