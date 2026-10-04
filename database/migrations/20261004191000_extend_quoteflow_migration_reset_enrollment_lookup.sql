-- Extend the already-qualified QuoteFlow migration enrollment lookup
-- with the approved enrollment email needed by the protected delivery boundary.
-- The prior migration is immutable; this migration replaces the function signature
-- through an explicit drop/create so the migration ledger remains reconciled.

DROP FUNCTION IF EXISTS ghm.auth_lookup_quoteflow_migration_reset_enrollment(text);

CREATE FUNCTION ghm.auth_lookup_quoteflow_migration_reset_enrollment(
  p_approved_email_normalized text
) RETURNS TABLE (
  enrollment_id bigint,
  account_id bigint,
  approved_email text
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
  SELECT e.id, e.account_id, e.approved_email
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
