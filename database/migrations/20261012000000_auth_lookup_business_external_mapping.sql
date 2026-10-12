-- Least-privilege lookup for Connect external business mappings.
-- Runtime callers may resolve a mapping but cannot read or mutate the table directly.
CREATE OR REPLACE FUNCTION ghm.auth_lookup_business_external_mapping(
  p_provider text,
  p_external_business_id text
)
RETURNS TABLE (business_id bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $function$
  SELECT mapping.business_id
    FROM ghm.business_external_mapping AS mapping
   WHERE mapping.provider = p_provider
     AND mapping.external_business_id = p_external_business_id
   LIMIT 2;
$function$;

ALTER FUNCTION ghm.auth_lookup_business_external_mapping(text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_lookup_business_external_mapping(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_business_external_mapping(text, text)
  TO ghm_runtime, ghm_migrator;
