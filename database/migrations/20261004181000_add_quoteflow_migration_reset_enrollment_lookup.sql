-- SECURITY DEFINER lookup for QuoteFlow migration reset enrollment.
-- The caller may use the result internally; HTTP must not disclose it.

CREATE OR REPLACE FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(
  p_approved_email_normalized text
) RETURNS TABLE (
  enrollment_id bigint,
  account_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $$
BEGIN
  IF p_approved_email_normalized IS NULL OR btrim(p_approved_email_normalized) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id, e.account_id
    FROM ghm.quoteflow_migration_reset_enrollment e
    JOIN ghm.account_identity a ON a.id = e.account_id
    JOIN ghm.account_external_identity x
      ON x.account_id = e.account_id
     AND x.provider = e.source_provider
     AND x.subject = e.source_subject
   WHERE e.approved_email_normalized = btrim(p_approved_email_normalized)
     AND e.enrollment_status = 'reset_required'
     AND a.account_status = 'active'
     AND x.provider = 'supabase';
END;
$$;

ALTER FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)
  OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(text) TO ghm_runtime;
