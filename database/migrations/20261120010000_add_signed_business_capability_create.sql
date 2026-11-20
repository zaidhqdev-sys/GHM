-- Signed, append-only Business Capability creation through the Actor Gateway.
-- This does not revoke legacy Resource API INSERT/sequence grants; cutover is separate.
BEGIN;

CREATE FUNCTION ghm.gateway_create_business_capability(
  p_actor bigint,
  p_issued bigint,
  p_nonce uuid,
  p_context text,
  p_signature text,
  p_payload jsonb
) RETURNS SETOF ghm.business_capability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $gateway_create_business_capability$
DECLARE
  v_actor bigint;
  v_business bigint;
  v_capability uuid;
  v_proficiency text;
  v_description text;
  v_effective_from timestamptz;
  v_effective_until timestamptz;
  v_source_reference text;
  v_membership_role text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR (p_payload - ARRAY[
       'businessId','capabilityId','proficiencyLevel','description',
       'effectiveFrom','effectiveUntil','sourceReference'
     ]) <> '{}'::jsonb
     OR NOT (p_payload ? 'businessId')
     OR NOT (p_payload ? 'capabilityId') THEN
    RAISE EXCEPTION 'Invalid Business Capability create payload' USING ERRCODE='22023';
  END IF;

  IF p_context IS NULL OR p_context::jsonb <> p_payload THEN
    RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE='42501';
  END IF;

  v_actor := ghm.assert_actor_gateway_capability(
    p_actor, 'business.capability.create', p_issued, p_nonce, p_context, p_signature
  );

  IF jsonb_typeof(p_payload->'businessId') <> 'number'
     OR p_payload->>'businessId' !~ '^[1-9][0-9]*$'
     OR length(p_payload->>'businessId') > 16
     OR (p_payload->>'businessId')::numeric > 9007199254740991
     OR jsonb_typeof(p_payload->'capabilityId') <> 'string'
     OR p_payload->>'capabilityId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid Business or Capability identifier' USING ERRCODE='22023';
  END IF;

  v_business := (p_payload->>'businessId')::bigint;
  v_capability := (p_payload->>'capabilityId')::uuid;

  IF p_payload ? 'proficiencyLevel' AND p_payload->'proficiencyLevel' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_payload->'proficiencyLevel') <> 'string'
       OR p_payload->>'proficiencyLevel' NOT IN ('foundational','proficient','advanced','expert') THEN
      RAISE EXCEPTION 'Invalid proficiency level' USING ERRCODE='22023';
    END IF;
    v_proficiency := p_payload->>'proficiencyLevel';
  END IF;

  IF p_payload ? 'description' AND p_payload->'description' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_payload->'description') <> 'string'
       OR char_length(btrim(p_payload->>'description')) NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Invalid description' USING ERRCODE='22023';
    END IF;
    v_description := NULLIF(btrim(p_payload->>'description'),'');
  END IF;

  IF p_payload ? 'sourceReference' AND p_payload->'sourceReference' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_payload->'sourceReference') <> 'string'
       OR char_length(btrim(p_payload->>'sourceReference')) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Invalid source reference' USING ERRCODE='22023';
    END IF;
    v_source_reference := NULLIF(btrim(p_payload->>'sourceReference'),'');
  END IF;

  IF p_payload ? 'effectiveFrom' AND p_payload->'effectiveFrom' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_payload->'effectiveFrom') <> 'string' THEN
      RAISE EXCEPTION 'Invalid effective-from timestamp' USING ERRCODE='22023';
    END IF;
    v_effective_from := (p_payload->>'effectiveFrom')::timestamptz;
  END IF;

  IF p_payload ? 'effectiveUntil' AND p_payload->'effectiveUntil' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_payload->'effectiveUntil') <> 'string' THEN
      RAISE EXCEPTION 'Invalid effective-until timestamp' USING ERRCODE='22023';
    END IF;
    v_effective_until := (p_payload->>'effectiveUntil')::timestamptz;
  END IF;

  v_effective_from := COALESCE(v_effective_from, transaction_timestamp());

  IF v_effective_until IS NOT NULL
     AND v_effective_until <= v_effective_from THEN
    RAISE EXCEPTION 'Effective-until must be later than effective-from' USING ERRCODE='22023';
  END IF;

  -- Lock the business row while checking its active state and membership.
  PERFORM 1 FROM ghm.business b
   WHERE b.id = v_business AND b.is_active = true
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found or inactive' USING ERRCODE='42501';
  END IF;

  SELECT bm.membership_role INTO v_membership_role
    FROM ghm.business_membership bm
   WHERE bm.business_id = v_business
     AND bm.account_id = v_actor
     AND bm.membership_status = 'active'
   FOR SHARE;
  IF v_membership_role NOT IN ('owner','administrator') OR v_membership_role IS NULL THEN
    RAISE EXCEPTION 'Business management permission required' USING ERRCODE='42501';
  END IF;

  -- Hold the selected catalogue row stable through the insert so a concurrent
  -- deactivation/unselectable transition cannot race the authorization check.
  PERFORM 1 FROM ghm.capability c
   WHERE c.id = v_capability
     AND c.lifecycle_status = 'active'
     AND c.is_selectable = true
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Capability not found or not selectable' USING ERRCODE='42501';
  END IF;

  -- Plain INSERT is intentional: active and withdrawn duplicates both fail
  -- under business_capability_unique; never reactivate historical assertions.
  RETURN QUERY
    INSERT INTO ghm.business_capability (
      business_id, capability_id, proficiency_level, description,
      assertion_status, assertion_basis, verification_status,
      effective_from, effective_until, source_reference, submitted_at, created_by
    ) VALUES (
      v_business, v_capability, v_proficiency, v_description,
      'active', 'self_declared', 'unverified',
      v_effective_from, v_effective_until,
      v_source_reference, transaction_timestamp(), v_actor
    )
    RETURNING *;
END;
$gateway_create_business_capability$;

ALTER FUNCTION ghm.gateway_create_business_capability(bigint,bigint,uuid,text,text,jsonb)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_create_business_capability(bigint,bigint,uuid,text,text,jsonb)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.gateway_create_business_capability(bigint,bigint,uuid,text,text,jsonb)
  TO ghm_actor_gateway;

COMMIT;
