-- Reconcile QuoteFlow migration provisioning with GHM's canonical verification vocabulary.
-- The existing business_verification_status_check accepts unverified, not pending.
-- This is additive because the original migration has already been applied to the sandbox.

BEGIN;

CREATE OR REPLACE FUNCTION ghm.auth_provision_quoteflow_migration_business(
  p_provider text,
  p_external_business_id text,
  p_business_name text,
  p_business_slug text,
  p_owner_account_id bigint,
  p_evidence_reference text,
  p_reviewed_by text,
  p_reviewed_at timestamptz
) RETURNS TABLE (
  outcome text,
  business_id bigint,
  owner_membership_id bigint,
  reason_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $function$
DECLARE
  v_existing_business_id bigint;
  v_existing_owner_membership_id bigint;
  v_existing_evidence_reference text;
  v_existing_reviewed_by text;
  v_existing_reviewed_at timestamptz;
  v_business_id bigint;
  v_membership_id bigint;
  v_owner_status text;
  v_owner_role text;
BEGIN
  IF p_provider IS DISTINCT FROM 'supabase' THEN
    outcome := 'blocked';
    business_id := NULL;
    owner_membership_id := NULL;
    reason_code := 'SOURCE_PROVIDER_NOT_ALLOWED';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_external_business_id IS NULL OR btrim(p_external_business_id) = ''
     OR p_business_name IS NULL OR btrim(p_business_name) = ''
     OR p_business_slug IS NULL OR btrim(p_business_slug) = ''
     OR p_owner_account_id IS NULL OR p_owner_account_id <= 0
     OR p_evidence_reference IS NULL OR btrim(p_evidence_reference) = ''
     OR p_reviewed_by IS NULL OR btrim(p_reviewed_by) = ''
     OR p_reviewed_at IS NULL THEN
    outcome := 'blocked';
    business_id := NULL;
    owner_membership_id := NULL;
    reason_code := 'REQUIRED_INPUT_INVALID';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Serialize retries for this exact legacy organization and for the canonical slug.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quoteflow-org:' || p_provider || ':' || btrim(p_external_business_id), 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ghm-business-slug:' || btrim(p_business_slug), 0)
  );

  SELECT a.account_status, a.role
    INTO v_owner_status, v_owner_role
    FROM ghm.account_identity AS a
   WHERE a.id = p_owner_account_id
   FOR UPDATE;

  -- Only an active GHM business-role account may receive the migrated owner membership.
  IF NOT FOUND
     OR v_owner_status IS DISTINCT FROM 'active'
     OR v_owner_role IS DISTINCT FROM 'business' THEN
    outcome := 'blocked';
    business_id := NULL;
    owner_membership_id := NULL;
    reason_code := 'OWNER_ACCOUNT_NOT_ELIGIBLE';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT m.business_id
    INTO v_existing_business_id
    FROM ghm.business_external_mapping AS m
   WHERE m.provider = p_provider
     AND m.external_business_id = btrim(p_external_business_id);

  IF FOUND THEN
    SELECT a.evidence_reference, a.reviewed_by, a.reviewed_at
      INTO v_existing_evidence_reference, v_existing_reviewed_by, v_existing_reviewed_at
      FROM ghm.quoteflow_migration_business_provisioning_audit AS a
     WHERE a.provider = p_provider
       AND a.external_business_id = btrim(p_external_business_id)
       AND a.business_id = v_existing_business_id
       AND a.owner_account_id = p_owner_account_id;

    IF NOT FOUND THEN
      outcome := 'conflict';
      business_id := v_existing_business_id;
      owner_membership_id := NULL;
      reason_code := 'EXISTING_MAPPING_NOT_AUDITED_FOR_OWNER';
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_existing_evidence_reference IS DISTINCT FROM btrim(p_evidence_reference)
       OR v_existing_reviewed_by IS DISTINCT FROM btrim(p_reviewed_by)
       OR v_existing_reviewed_at IS DISTINCT FROM p_reviewed_at THEN
      outcome := 'conflict';
      business_id := v_existing_business_id;
      owner_membership_id := NULL;
      reason_code := 'EXISTING_PROVISIONING_EVIDENCE_MISMATCH';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT bm.id
      INTO v_existing_owner_membership_id
      FROM ghm.business_membership AS bm
     WHERE bm.business_id = v_existing_business_id
       AND bm.account_id = p_owner_account_id
       AND bm.membership_role = 'owner'
       AND bm.membership_status = 'active';

    IF v_existing_owner_membership_id IS NULL THEN
      outcome := 'conflict';
      business_id := v_existing_business_id;
      owner_membership_id := NULL;
      reason_code := 'EXISTING_MAPPING_OWNER_MISMATCH';
      RETURN NEXT;
      RETURN;
    END IF;

    outcome := 'already_provisioned';
    business_id := v_existing_business_id;
    owner_membership_id := v_existing_owner_membership_id;
    reason_code := 'EXACT_MAPPING_AND_OWNER_ALREADY_EXIST';
    RETURN NEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM ghm.business AS b WHERE b.slug = btrim(p_business_slug)
  ) THEN
    outcome := 'conflict';
    business_id := NULL;
    owner_membership_id := NULL;
    reason_code := 'BUSINESS_SLUG_COLLISION';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Nested exception block guarantees uniqueness errors roll back all four writes.
  BEGIN
    INSERT INTO ghm.business (name, slug, verification_status, is_active)
    VALUES (btrim(p_business_name), btrim(p_business_slug), 'unverified', false)
    RETURNING id INTO v_business_id;

    INSERT INTO ghm.business_membership (
      business_id, account_id, membership_role, membership_status, created_by
    )
    VALUES (v_business_id, p_owner_account_id, 'owner', 'active', p_owner_account_id)
    RETURNING id INTO v_membership_id;

    INSERT INTO ghm.business_external_mapping (provider, external_business_id, business_id)
    VALUES (p_provider, btrim(p_external_business_id), v_business_id);

    INSERT INTO ghm.quoteflow_migration_business_provisioning_audit (
      provider, external_business_id, business_id, owner_account_id,
      evidence_reference, reviewed_by, reviewed_at
    ) VALUES (
      p_provider, btrim(p_external_business_id), v_business_id, p_owner_account_id,
      btrim(p_evidence_reference), btrim(p_reviewed_by), p_reviewed_at
    );
  EXCEPTION
    WHEN unique_violation THEN
      outcome := 'conflict';
      business_id := NULL;
      owner_membership_id := NULL;
      reason_code := 'CONCURRENT_MAPPING_OR_SLUG_CONFLICT';
      RETURN NEXT;
      RETURN;
  END;

  outcome := 'created';
  business_id := v_business_id;
  owner_membership_id := v_membership_id;
  reason_code := 'CREATED_PENDING_REVIEW';
  RETURN NEXT;
END;
$function$;

ALTER FUNCTION ghm.auth_provision_quoteflow_migration_business(text, text, text, text, bigint, text, text, timestamptz)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_provision_quoteflow_migration_business(text, text, text, text, bigint, text, text, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.auth_provision_quoteflow_migration_business(text, text, text, text, bigint, text, text, timestamptz)
  FROM ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_provision_quoteflow_migration_business(text, text, text, text, bigint, text, text, timestamptz)
  TO ghm_schema_owner;

REVOKE INSERT, UPDATE, DELETE ON TABLE ghm.business_external_mapping FROM ghm_runtime;


COMMIT;
