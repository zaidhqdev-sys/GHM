-- Controlled link of an existing ghm.business to an external (provider, external_business_id).
-- LINK-ONLY: does NOT create businesses, select by name/email/Founder, merge, move mappings,
-- create membership, or alter verification/is_active/ownership.
-- Canonical name: auth_link_business_external_mapping (not upsert).

CREATE OR REPLACE FUNCTION ghm.auth_link_business_external_mapping(
  p_provider text,
  p_external_business_id text,
  p_business_id bigint
) RETURNS TABLE (
  outcome text,
  id bigint,
  provider text,
  external_business_id text,
  business_id bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_existing ghm.business_external_mapping%ROWTYPE;
  v_mapping ghm.business_external_mapping%ROWTYPE;
  v_business_exists boolean;
BEGIN
  IF p_provider IS NULL OR btrim(p_provider) = '' THEN
    RAISE EXCEPTION 'provider must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_external_business_id IS NULL OR btrim(p_external_business_id) = '' THEN
    RAISE EXCEPTION 'external_business_id must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'business_id must be non-null' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM ghm.business b WHERE b.id = p_business_id
  ) INTO v_business_exists;

  IF NOT v_business_exists THEN
    outcome := 'business_not_found';
    id := NULL;
    provider := NULL;
    external_business_id := NULL;
    business_id := NULL;
    created_at := NULL;
    updated_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT m.* INTO v_existing
    FROM ghm.business_external_mapping m
   WHERE m.provider = p_provider
     AND m.external_business_id = p_external_business_id;

  IF FOUND THEN
    IF v_existing.business_id = p_business_id THEN
      outcome := 'already_linked';
      id := v_existing.id;
      provider := v_existing.provider;
      external_business_id := v_existing.external_business_id;
      business_id := v_existing.business_id;
      created_at := v_existing.created_at;
      updated_at := v_existing.updated_at;
      RETURN NEXT;
      RETURN;
    END IF;

    outcome := 'conflict';
    id := v_existing.id;
    provider := v_existing.provider;
    external_business_id := v_existing.external_business_id;
    business_id := v_existing.business_id;
    created_at := v_existing.created_at;
    updated_at := v_existing.updated_at;
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO ghm.business_external_mapping (provider, external_business_id, business_id)
    VALUES (p_provider, p_external_business_id, p_business_id)
    RETURNING * INTO v_mapping;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT m.* INTO v_existing
        FROM ghm.business_external_mapping m
       WHERE m.provider = p_provider
         AND m.external_business_id = p_external_business_id;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      IF v_existing.business_id = p_business_id THEN
        outcome := 'already_linked';
      ELSE
        outcome := 'conflict';
      END IF;
      id := v_existing.id;
      provider := v_existing.provider;
      external_business_id := v_existing.external_business_id;
      business_id := v_existing.business_id;
      created_at := v_existing.created_at;
      updated_at := v_existing.updated_at;
      RETURN NEXT;
      RETURN;
  END;

  outcome := 'created';
  id := v_mapping.id;
  provider := v_mapping.provider;
  external_business_id := v_mapping.external_business_id;
  business_id := v_mapping.business_id;
  created_at := v_mapping.created_at;
  updated_at := v_mapping.updated_at;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_link_business_external_mapping(text, text, bigint)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_link_business_external_mapping(text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_link_business_external_mapping(text, text, bigint) TO ghm_runtime;

COMMENT ON FUNCTION ghm.auth_link_business_external_mapping(text, text, bigint) IS
  'LINK-ONLY: attach (provider, external_business_id) to existing ghm.business.id. Outcomes: created|already_linked|conflict|business_not_found. Does not create businesses, match by name/email/Founder, merge, move mappings, or alter membership/ownership/verification/is_active. Supersedes proposed name auth_upsert_business_external_mapping.';

-- Reaffirm: runtime has no direct DML on business external mapping table.
REVOKE INSERT, UPDATE, DELETE ON TABLE ghm.business_external_mapping FROM ghm_runtime;
