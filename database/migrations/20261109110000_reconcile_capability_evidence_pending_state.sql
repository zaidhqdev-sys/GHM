-- Preserve pending Business Capability verification while any evidence remains pending.
-- Forward correction: leave the already-released evidence table migration unchanged.

CREATE OR REPLACE FUNCTION ghm.transition_business_capability_evidence(
  p_evidence_id bigint,
  p_decision text,
  p_verifier_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS ghm.business_capability_evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_evidence ghm.business_capability_evidence%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_role text;
  v_verified_count integer;
  v_pending_count integer;
BEGIN
  IF p_evidence_id IS NULL OR p_evidence_id <= 0 OR p_verifier_id IS NULL OR p_verifier_id <= 0 THEN
    RAISE EXCEPTION 'Evidence and verifier identifiers must be positive integers';
  END IF;
  SELECT role INTO v_role FROM ghm.account_identity WHERE id = p_verifier_id;
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Capability evidence verifier authority required'; END IF;
  SELECT * INTO v_evidence FROM ghm.business_capability_evidence WHERE id = p_evidence_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capability evidence not found'; END IF;
  IF v_evidence.submitted_by = p_verifier_id THEN RAISE EXCEPTION 'Self-verification is not permitted'; END IF;
  IF p_decision NOT IN ('verified','rejected','revoked') THEN RAISE EXCEPTION 'Evidence decision is invalid'; END IF;
  IF p_decision IN ('rejected','revoked') AND (v_reason IS NULL OR char_length(v_reason) > 1000) THEN
    RAISE EXCEPTION 'A bounded reason is required for rejection or revocation';
  END IF;
  IF NOT ((v_evidence.verification_status = 'pending' AND p_decision IN ('verified','rejected'))
       OR (v_evidence.verification_status = 'verified' AND p_decision = 'revoked')) THEN
    RAISE EXCEPTION 'Evidence is not in a reviewable state';
  END IF;

  -- Serialize all evidence decisions for this assertion before aggregating its state.
  PERFORM 1
    FROM ghm.business_capability
   WHERE id = v_evidence.business_capability_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business Capability assertion not found'; END IF;

  UPDATE ghm.business_capability_evidence
     SET verification_status = p_decision,
         verified_by = p_verifier_id,
         verified_at = clock_timestamp(),
         verification_reason = CASE WHEN p_decision = 'verified' THEN NULL ELSE v_reason END,
         updated_at = clock_timestamp()
   WHERE id = p_evidence_id
   RETURNING * INTO v_evidence;

  SELECT
    count(*) FILTER (
      WHERE verification_status = 'verified'
        AND (expires_on IS NULL OR expires_on >= current_date)
    )::integer,
    count(*) FILTER (WHERE verification_status = 'pending')::integer
    INTO v_verified_count, v_pending_count
    FROM ghm.business_capability_evidence
   WHERE business_capability_id = v_evidence.business_capability_id;

  UPDATE ghm.business_capability
     SET verification_status = CASE
           WHEN v_verified_count > 0 THEN 'verified'
           WHEN v_pending_count > 0 THEN 'pending'
           WHEN p_decision = 'rejected' THEN 'rejected'
           ELSE 'revoked'
         END,
         verified_by = CASE WHEN v_pending_count > 0 AND v_verified_count = 0 THEN NULL ELSE p_verifier_id END,
         verified_at = CASE WHEN v_pending_count > 0 AND v_verified_count = 0 THEN NULL ELSE clock_timestamp() END,
         verification_reason = CASE WHEN v_verified_count > 0 OR v_pending_count > 0 THEN NULL ELSE v_reason END,
         updated_at = clock_timestamp()
   WHERE id = v_evidence.business_capability_id;

  RETURN v_evidence;
END;
$$;


ALTER FUNCTION ghm.transition_business_capability_evidence(bigint,text,bigint,text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.transition_business_capability_evidence(bigint,text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.transition_business_capability_evidence(bigint,text,bigint,text) TO ghm_runtime;
