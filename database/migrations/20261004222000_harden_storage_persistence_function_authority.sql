BEGIN;

-- The storage lifecycle functions are the deliberate persistence boundary.
-- They execute as the canonical schema owner while the runtime role retains
-- no direct table DML. The owner is a non-login, non-bypassrls role.
ALTER FUNCTION ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text)
  SECURITY DEFINER;
ALTER FUNCTION ghm.storage_mark_available(bigint,text)
  SECURITY DEFINER;
ALTER FUNCTION ghm.storage_mark_deletion_pending(bigint)
  SECURITY DEFINER;
ALTER FUNCTION ghm.storage_mark_deleted(bigint)
  SECURITY DEFINER;
ALTER FUNCTION ghm.storage_get_object(bigint)
  SECURITY DEFINER;

ALTER FUNCTION ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text)
  SET search_path = pg_catalog, ghm;
ALTER FUNCTION ghm.storage_mark_available(bigint,text)
  SET search_path = pg_catalog, ghm;
ALTER FUNCTION ghm.storage_mark_deletion_pending(bigint)
  SET search_path = pg_catalog, ghm;
ALTER FUNCTION ghm.storage_mark_deleted(bigint)
  SET search_path = pg_catalog, ghm;
ALTER FUNCTION ghm.storage_get_object(bigint)
  SET search_path = pg_catalog, ghm;

REVOKE ALL ON FUNCTION ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.storage_mark_available(bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.storage_mark_deletion_pending(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.storage_mark_deleted(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.storage_get_object(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_available(bigint,text) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_deletion_pending(bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_mark_deleted(bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.storage_get_object(bigint) TO ghm_runtime;

COMMIT;
