-- Establish the least-privilege Business Capability verification transition boundary.
-- Construction-only. Runtime receives EXECUTE on this narrow function, not UPDATE/DELETE.

CREATE OR REPLACE FUNCTION ghm.transition_business_capability_verification(
  p_business_capability_id bigint,
  p_expected_status text,
  p_target_status text,
  p_verifier_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS ghm.business_capability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_row ghm.business_capability%ROWTYPE;
  v_reason text;
  v_verifier_role text;
BEGIN
  IF p_business_capability_id IS NULL OR p_business_capability_id <= 0 THEN
    RAISE EXCEPTION 'Business capability ID must be a positive integer';
  END IF;

  IF p_verifier_id IS NULL OR p_verifier_id <= 0 THEN
    RAISE EXCEPTION 'Verifier ID must be a positive integer';
  END IF;

  SELECT role INTO v_verifier_role
    FROM ghm.account_identity
   WHERE id = p_verifier_id;

  IF v_verifier_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Verification authority requires admin role';
  END IF;

  v_reason = NULLIF(btrim(p_reason), '');

  SELECT *
    INTO v_row
    FROM ghm.business_capability
   WHERE id = p_business_capability_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business capability not found';
  END IF;

  IF v_row.created_by = p_verifier_id THEN
    RAISE EXCEPTION 'Self-verification is not permitted';
  END IF;

  IF v_row.verification_status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'Business capability verification state is stale';
  END IF;

  IF p_expected_status = p_target_status THEN
    RAISE EXCEPTION 'Business capability verification transition is a no-op';
  END IF;

  IF NOT (
    (p_expected_status = 'unverified' AND p_target_status = 'pending')
    OR (p_expected_status = 'pending' AND p_target_status IN ('verified', 'rejected'))
    OR (p_expected_status = 'verified' AND p_target_status IN ('revoked', 'expired'))
    OR (p_expected_status IN ('rejected', 'revoked', 'expired') AND p_target_status = 'pending')
  ) THEN
    RAISE EXCEPTION 'Unsupported Business capability verification transition';
  END IF;

  IF p_target_status IN ('rejected', 'revoked') AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Verification reason is required';
  END IF;

  IF p_target_status IN ('verified', 'rejected', 'revoked') THEN
    UPDATE ghm.business_capability
       SET verification_status = p_target_status,
           verified_by = p_verifier_id,
           verified_at = clock_timestamp(),
           verification_reason = CASE WHEN p_target_status = 'verified' THEN NULL ELSE v_reason END,
           updated_at = clock_timestamp()
     WHERE id = v_row.id
     RETURNING * INTO v_row;
  ELSIF p_target_status = 'expired' THEN
    UPDATE ghm.business_capability
       SET verification_status = 'expired',
           updated_at = clock_timestamp()
     WHERE id = v_row.id
     RETURNING * INTO v_row;
  ELSE
    UPDATE ghm.business_capability
       SET verification_status = 'pending',
           verified_by = NULL,
           verified_at = NULL,
           verification_reason = NULL,
           updated_at = clock_timestamp()
     WHERE id = v_row.id
     RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

ALTER FUNCTION ghm.transition_business_capability_verification(bigint, text, text, bigint, text)
  OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.transition_business_capability_verification(bigint, text, text, bigint, text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ghm.transition_business_capability_verification(bigint, text, text, bigint, text)
  TO ghm_runtime;

-- The transition function is the only new runtime mutation capability.
-- Direct UPDATE/DELETE on ghm.business_capability remain denied.
