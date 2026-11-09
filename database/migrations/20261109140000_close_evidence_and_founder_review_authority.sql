-- Close the evidence read boundary and remove implicit founder review authority.
-- No reviewer accounts are seeded or mapped. Founder directory review remains disabled
-- until an explicitly authorized allowlist is populated in a separately approved change.
-- Evidence expiry is display eligibility only; expired evidence cannot be newly verified.

REVOKE SELECT ON TABLE ghm.business_capability_evidence FROM ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.is_business_capability_publicly_evidence_eligible(
  p_business_capability_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $function$
  SELECT p_business_capability_id IS NOT NULL
    AND (
      NOT EXISTS (
        SELECT 1
          FROM ghm.business_capability_evidence evidence
         WHERE evidence.business_capability_id = p_business_capability_id
      )
      OR EXISTS (
        SELECT 1
          FROM ghm.business_capability_evidence evidence
         WHERE evidence.business_capability_id = p_business_capability_id
           AND evidence.visibility = 'public'
           AND evidence.verification_status = 'verified'
           AND (evidence.expires_on IS NULL OR evidence.expires_on >= current_date)
      )
    );
$function$;
ALTER FUNCTION ghm.is_business_capability_publicly_evidence_eligible(bigint)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.is_business_capability_publicly_evidence_eligible(bigint)
  SET search_path = pg_catalog, ghm;
REVOKE ALL ON FUNCTION ghm.is_business_capability_publicly_evidence_eligible(bigint)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.is_business_capability_publicly_evidence_eligible(bigint)
  TO ghm_runtime;

-- Disable founder directory review completely for this release. Preserve any
-- historical allowlist rows, but no account (including a system administrator)
-- receives review authority and the runtime cannot invoke review operations.
CREATE OR REPLACE FUNCTION ghm.is_directory_listing_founder_reviewer(p_account_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $function$
  SELECT false;
$function$;
ALTER FUNCTION ghm.is_directory_listing_founder_reviewer(bigint)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.is_directory_listing_founder_reviewer(bigint)
  SET search_path = pg_catalog, ghm;
REVOKE ALL ON FUNCTION ghm.is_directory_listing_founder_reviewer(bigint)
  FROM PUBLIC, ghm_runtime;

REVOKE ALL ON FUNCTION ghm.submit_business_directory_review(bigint, bigint)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.list_businesses_for_directory_review(bigint, text, integer, integer)
  FROM PUBLIC, ghm_runtime;
REVOKE ALL ON FUNCTION ghm.review_business_directory_listing(bigint, bigint, text, text)
  FROM PUBLIC, ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.reject_expired_capability_evidence_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, ghm
AS $function$
BEGIN
  IF NEW.verification_status = 'verified'
     AND NEW.expires_on IS NOT NULL
     AND NEW.expires_on < current_date THEN
    RAISE EXCEPTION 'Expired capability evidence cannot be verified';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION ghm.reject_expired_capability_evidence_verification()
  OWNER TO ghm_schema_owner;
DROP TRIGGER IF EXISTS business_capability_evidence_reject_expired_verification
  ON ghm.business_capability_evidence;
CREATE TRIGGER business_capability_evidence_reject_expired_verification
  BEFORE INSERT OR UPDATE OF verification_status, expires_on
  ON ghm.business_capability_evidence
  FOR EACH ROW
  EXECUTE FUNCTION ghm.reject_expired_capability_evidence_verification();
