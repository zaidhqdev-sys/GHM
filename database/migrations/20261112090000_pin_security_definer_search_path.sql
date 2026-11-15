-- Normalize every SECURITY DEFINER function in GHM to a pinned,
-- temporary-schema-safe search_path. PostgreSQL implicitly searches the
-- session's temporary schema before ordinary schemas when pg_temp is omitted.
-- Explicitly placing pg_temp last prevents caller-created temporary relations
-- from shadowing objects referenced by privileged functions.
DO $security_definer_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.prosecdef
       AND pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ghm_schema_owner'
  ) THEN
    RAISE EXCEPTION
      'SECURITY DEFINER ownership audit failed: every GHM privileged function must be owned by ghm_schema_owner';
  END IF;
END;
$security_definer_preflight$;

DO $security_definer_search_path$
DECLARE
  function_record record;
BEGIN
  FOR function_record IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.prosecdef
     ORDER BY p.oid::regprocedure::text
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = pg_catalog, ghm, pg_temp',
      function_record.signature
    );
  END LOOP;
END;
$security_definer_search_path$;
