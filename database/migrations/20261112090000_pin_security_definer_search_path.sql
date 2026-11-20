-- Normalize every SECURITY DEFINER routine in GHM to a pinned,
-- temporary-schema-safe search_path. PostgreSQL implicitly searches the
-- session's temporary schema before ordinary schemas when pg_temp is omitted.
-- Explicitly placing pg_temp last prevents caller-created temporary objects
-- from shadowing objects referenced by privileged routines.
DO $security_definer_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.prosecdef
       AND p.prokind IN ('f', 'p')
       AND pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ghm_schema_owner'
  ) THEN
    RAISE EXCEPTION
      'SECURITY DEFINER ownership audit failed: every GHM privileged function and procedure must be owned by ghm_schema_owner';
  END IF;
END;
$security_definer_preflight$;

DO $security_definer_search_path$
DECLARE
  routine_record record;
BEGIN
  FOR routine_record IN
    SELECT p.prokind,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS identity_arguments
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.prosecdef
       AND p.prokind IN ('f', 'p')
     ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I(%s) SET search_path = pg_catalog, ghm, pg_temp',
      CASE routine_record.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
      routine_record.nspname,
      routine_record.proname,
      routine_record.identity_arguments
    );
  END LOOP;
END;
$security_definer_search_path$;
