-- Forward correction: serialize assertion replacement per Business and reverify on validity-window changes.
-- Atomic, tenant-authorized replacement of a Business' active capability assertions.
-- Construction-only. Runtime may execute this narrow function; it receives no direct UPDATE/DELETE grants.

CREATE OR REPLACE FUNCTION ghm.replace_business_capability_assertions(
  p_business_id bigint,
  p_actor_id bigint,
  p_assertions jsonb
)
RETURNS SETOF ghm.business_capability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_membership_role text;
  v_count integer;
  v_duplicates integer;
BEGIN
  IF p_business_id IS NULL OR p_business_id <= 0 OR p_actor_id IS NULL OR p_actor_id <= 0 THEN
    RAISE EXCEPTION 'Business and actor identifiers must be positive integers';
  END IF;
  -- Serialize replacement sets for this Business before inspecting or changing assertions.
  PERFORM 1 FROM ghm.business b WHERE b.id = p_business_id AND b.is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business tenant access denied'; END IF;
  SELECT bm.membership_role INTO v_membership_role
    FROM ghm.business_membership bm
    JOIN ghm.business b ON b.id = bm.business_id
   WHERE bm.business_id = p_business_id
     AND bm.account_id = p_actor_id
     AND bm.membership_status = 'active'
     AND b.is_active = true
   LIMIT 1;
  IF v_membership_role IS NULL THEN RAISE EXCEPTION 'Business tenant access denied'; END IF;
  IF v_membership_role NOT IN ('owner','administrator') THEN
    RAISE EXCEPTION 'Business management permission required';
  END IF;
  IF p_assertions IS NULL OR jsonb_typeof(p_assertions) <> 'array' THEN
    RAISE EXCEPTION 'Assertions must be a JSON array';
  END IF;
  v_count := jsonb_array_length(p_assertions);
  IF v_count > 50 THEN RAISE EXCEPTION 'A maximum of 50 Business Capability assertions is allowed'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_assertions) item
     WHERE jsonb_typeof(item) <> 'object'
        OR (item - ARRAY['capabilityId','proficiencyLevel','description','sourceReference','effectiveUntil']) <> '{}'::jsonb
        OR COALESCE(item->>'capabilityId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR (item ? 'proficiencyLevel' AND item->>'proficiencyLevel' IS NOT NULL AND item->>'proficiencyLevel' NOT IN ('foundational','proficient','advanced','expert'))
        OR (item ? 'description' AND item->>'description' IS NOT NULL AND (char_length(btrim(item->>'description')) NOT BETWEEN 1 AND 1000))
        OR (item ? 'sourceReference' AND item->>'sourceReference' IS NOT NULL AND (char_length(btrim(item->>'sourceReference')) NOT BETWEEN 1 AND 500))
        OR (item ? 'effectiveUntil' AND item->>'effectiveUntil' IS NOT NULL AND item->>'effectiveUntil' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.*)?$')
  ) THEN RAISE EXCEPTION 'One or more Business Capability assertions are invalid'; END IF;
  SELECT count(*) - count(DISTINCT item->>'capabilityId') INTO v_duplicates
    FROM jsonb_array_elements(p_assertions) item;
  IF v_duplicates > 0 THEN RAISE EXCEPTION 'Duplicate Business Capability assertions are not allowed'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_assertions) item
    LEFT JOIN ghm.capability c ON c.id = (item->>'capabilityId')::uuid
      AND c.lifecycle_status = 'active' AND c.is_selectable = true
    WHERE c.id IS NULL
  ) THEN RAISE EXCEPTION 'Every assertion must reference an active selectable Capability'; END IF;

  UPDATE ghm.business_capability bc
     SET assertion_status = 'withdrawn',
         effective_until = COALESCE(bc.effective_until, clock_timestamp()),
         updated_at = clock_timestamp()
   WHERE bc.business_id = p_business_id
     AND bc.assertion_status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_assertions) item
        WHERE (item->>'capabilityId')::uuid = bc.capability_id
     );

  INSERT INTO ghm.business_capability (
    business_id, capability_id, proficiency_level, description, assertion_status,
    assertion_basis, verification_status, effective_from, effective_until,
    source_reference, submitted_at, verified_by, verified_at, verification_reason, created_by
  )
  SELECT p_business_id, (item->>'capabilityId')::uuid, NULLIF(item->>'proficiencyLevel',''),
         NULLIF(btrim(item->>'description'),''), 'active', 'self_declared', 'unverified',
         clock_timestamp(), NULLIF(item->>'effectiveUntil','')::timestamptz,
         NULLIF(btrim(item->>'sourceReference'),''), clock_timestamp(), NULL, NULL, NULL, p_actor_id
    FROM jsonb_array_elements(p_assertions) item
  ON CONFLICT (business_id, capability_id) DO UPDATE
    SET proficiency_level = EXCLUDED.proficiency_level,
        description = EXCLUDED.description,
        assertion_status = 'active',
        assertion_basis = CASE
          WHEN ghm.business_capability.proficiency_level IS NOT DISTINCT FROM EXCLUDED.proficiency_level
           AND ghm.business_capability.description IS NOT DISTINCT FROM EXCLUDED.description
           AND ghm.business_capability.source_reference IS NOT DISTINCT FROM EXCLUDED.source_reference
           AND ghm.business_capability.effective_until IS NOT DISTINCT FROM EXCLUDED.effective_until
          THEN ghm.business_capability.assertion_basis ELSE 'self_declared' END,
        verification_status = CASE
          WHEN ghm.business_capability.proficiency_level IS NOT DISTINCT FROM EXCLUDED.proficiency_level
           AND ghm.business_capability.description IS NOT DISTINCT FROM EXCLUDED.description
           AND ghm.business_capability.source_reference IS NOT DISTINCT FROM EXCLUDED.source_reference
           AND ghm.business_capability.effective_until IS NOT DISTINCT FROM EXCLUDED.effective_until
          THEN ghm.business_capability.verification_status ELSE 'unverified' END,
        effective_from = CASE WHEN ghm.business_capability.assertion_status = 'active'
          THEN ghm.business_capability.effective_from ELSE clock_timestamp() END,
        effective_until = EXCLUDED.effective_until,
        source_reference = EXCLUDED.source_reference,
        submitted_at = CASE
          WHEN ghm.business_capability.proficiency_level IS NOT DISTINCT FROM EXCLUDED.proficiency_level
           AND ghm.business_capability.description IS NOT DISTINCT FROM EXCLUDED.description
           AND ghm.business_capability.source_reference IS NOT DISTINCT FROM EXCLUDED.source_reference
           AND ghm.business_capability.effective_until IS NOT DISTINCT FROM EXCLUDED.effective_until
          THEN ghm.business_capability.submitted_at ELSE clock_timestamp() END,
        verified_by = CASE
          WHEN ghm.business_capability.proficiency_level IS NOT DISTINCT FROM EXCLUDED.proficiency_level
           AND ghm.business_capability.description IS NOT DISTINCT FROM EXCLUDED.description
           AND ghm.business_capability.source_reference IS NOT DISTINCT FROM EXCLUDED.source_reference
           AND ghm.business_capability.effective_until IS NOT DISTINCT FROM EXCLUDED.effective_until
          THEN ghm.business_capability.verified_by ELSE NULL END,
        verified_at = CASE
          WHEN ghm.business_capability.proficiency_level IS NOT DISTINCT FROM EXCLUDED.proficiency_level
           AND ghm.business_capability.description IS NOT DISTINCT FROM EXCLUDED.description
           AND ghm.business_capability.source_reference IS NOT DISTINCT FROM EXCLUDED.source_reference
           AND ghm.business_capability.effective_until IS NOT DISTINCT FROM EXCLUDED.effective_until
          THEN ghm.business_capability.verified_at ELSE NULL END,
        verification_reason = CASE
          WHEN ghm.business_capability.proficiency_level IS NOT DISTINCT FROM EXCLUDED.proficiency_level
           AND ghm.business_capability.description IS NOT DISTINCT FROM EXCLUDED.description
           AND ghm.business_capability.source_reference IS NOT DISTINCT FROM EXCLUDED.source_reference
           AND ghm.business_capability.effective_until IS NOT DISTINCT FROM EXCLUDED.effective_until
          THEN ghm.business_capability.verification_reason ELSE NULL END,
        updated_at = clock_timestamp();

  RETURN QUERY
    SELECT bc.* FROM ghm.business_capability bc
     WHERE bc.business_id = p_business_id AND bc.assertion_status = 'active'
     ORDER BY bc.created_at, bc.id;
END;
$$;

ALTER FUNCTION ghm.replace_business_capability_assertions(bigint,bigint,jsonb) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.replace_business_capability_assertions(bigint,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.replace_business_capability_assertions(bigint,bigint,jsonb) TO ghm_runtime;
