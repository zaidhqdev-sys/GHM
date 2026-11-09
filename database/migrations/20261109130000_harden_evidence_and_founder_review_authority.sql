-- Tighten evidence submission privileges and bind founder review authority
-- to the canonical, one-time bootstrapped system administrator.
-- Existing explicit reviewer allowlist entries remain supported.

REVOKE INSERT (verification_status)
  ON TABLE ghm.business_capability_evidence
  FROM ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.is_directory_listing_founder_reviewer(p_account_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $function$
  SELECT p_account_id IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM ghm.directory_listing_founder_reviewer r
      WHERE r.account_id = p_account_id
    )
    OR EXISTS (
      SELECT 1
      FROM ghm.founder_system_admin_bootstrap_state f
      JOIN ghm.account_identity a ON a.id = f.account_id
      WHERE f.account_id = p_account_id
        AND a.is_system_admin = true
        AND a.account_status = 'active'
    )
  );
$function$;

ALTER FUNCTION ghm.is_directory_listing_founder_reviewer(bigint)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.is_directory_listing_founder_reviewer(bigint)
  SET search_path = pg_catalog, ghm;
REVOKE ALL ON FUNCTION ghm.is_directory_listing_founder_reviewer(bigint)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.is_directory_listing_founder_reviewer(bigint)
  TO ghm_runtime;
