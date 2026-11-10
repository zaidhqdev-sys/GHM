-- The pre-existing write function used ON CONFLICT (business_id) inside a
-- RETURNS TABLE function whose output parameter is also named business_id.
-- PostgreSQL resolves that target as ambiguous at execution time. Replace the
-- body with the named primary-key constraint; preserve the existing runtime
-- grant until the gateway cutover is separately approved.

CREATE OR REPLACE FUNCTION ghm.update_business_registration_identity(
  p_account_id bigint,
  p_business_id bigint,
  p_registration_status text,
  p_registration_number text,
  p_legal_name text
)
RETURNS TABLE (
  business_id bigint,
  registration_status text,
  registration_number text,
  legal_name text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  next_number text;
  next_legal_name text;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 OR p_business_id IS NULL OR p_business_id <= 0 THEN
    RAISE EXCEPTION 'Business registration identity request is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM ghm.business b
    JOIN ghm.business_membership bm ON bm.business_id = b.id
    WHERE b.id = p_business_id
      AND b.is_active = true
      AND bm.account_id = p_account_id
      AND bm.membership_status = 'active'
      AND bm.membership_role IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Business management permission required';
  END IF;

  IF p_registration_status IS NULL THEN
    IF p_registration_number IS NOT NULL OR p_legal_name IS NOT NULL THEN
      RAISE EXCEPTION 'Registration fields must be empty when registration status is not declared';
    END IF;
    next_number := NULL;
    next_legal_name := NULL;
  ELSIF p_registration_status = 'registered' THEN
    next_number := btrim(coalesce(p_registration_number, ''));
    next_legal_name := btrim(coalesce(p_legal_name, ''));
    IF length(next_number) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Registration number must contain between 1 and 120 characters';
    END IF;
    IF length(next_legal_name) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Legal name must contain between 1 and 200 characters';
    END IF;
  ELSIF p_registration_status = 'unregistered' THEN
    IF p_registration_number IS NOT NULL OR p_legal_name IS NOT NULL THEN
      RAISE EXCEPTION 'Registration fields must be empty for an unregistered Business';
    END IF;
    next_number := NULL;
    next_legal_name := NULL;
  ELSE
    RAISE EXCEPTION 'Registration status must be registered, unregistered, or null';
  END IF;

  RETURN QUERY
    INSERT INTO ghm.business_registration_identity AS existing (
      business_id, registration_status, registration_number, legal_name, updated_by_account_id, created_at, updated_at
    )
    VALUES (
      p_business_id, p_registration_status, next_number, next_legal_name, p_account_id, now(), now()
    )
    ON CONFLICT ON CONSTRAINT business_registration_identity_pkey DO UPDATE
      SET registration_status = EXCLUDED.registration_status,
          registration_number = EXCLUDED.registration_number,
          legal_name = EXCLUDED.legal_name,
          updated_by_account_id = EXCLUDED.updated_by_account_id,
          updated_at = now()
    RETURNING existing.business_id, existing.registration_status, existing.registration_number, existing.legal_name, existing.updated_at;
END;
$$;

ALTER FUNCTION ghm.update_business_registration_identity(bigint, bigint, text, text, text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.update_business_registration_identity(bigint, bigint, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.update_business_registration_identity(bigint, bigint, text, text, text) TO ghm_runtime;

-- Gateway-only wrapper for private Business registration identity writes.
-- The legacy runtime RPC remains available until the resource API write route
-- is migrated and the deployment/grant cutover is separately authorized.

CREATE OR REPLACE FUNCTION ghm.gateway_update_business_registration_identity(
  p_actor_account_id bigint,
  p_business_id bigint,
  p_registration_status text,
  p_registration_number text,
  p_legal_name text
) RETURNS TABLE (
  business_id bigint,
  registration_status text,
  registration_number text,
  legal_name text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  PERFORM ghm.assert_actor_gateway(p_actor_account_id);

  RETURN QUERY
    SELECT updated.business_id,
           updated.registration_status,
           updated.registration_number,
           updated.legal_name,
           updated.updated_at
      FROM ghm.update_business_registration_identity(
        p_actor_account_id,
        p_business_id,
        p_registration_status,
        p_registration_number,
        p_legal_name
      ) AS updated;
END;
$$;

ALTER FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) FROM ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text) IS
  'Private Business registration identity write for the isolated actor gateway. Requires gateway login and derives actor ID from the gateway-verified GHM token subject.';
