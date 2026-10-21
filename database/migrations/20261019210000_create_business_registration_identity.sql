-- Store self-declared Business registration identity separately from public Business projections.
-- No registration facts are independently verified by this resource.
CREATE TABLE ghm.business_registration_identity (
  business_id bigint PRIMARY KEY
    REFERENCES ghm.business(id)
    ON DELETE CASCADE,
  registration_status text NULL,
  registration_number text NULL,
  legal_name text NULL,
  updated_by_account_id bigint NULL
    REFERENCES ghm.account_identity(id)
    ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT business_registration_identity_status_check
    CHECK (registration_status IS NULL OR registration_status IN ('registered', 'unregistered')),
  CONSTRAINT business_registration_identity_registration_number_length_check
    CHECK (registration_number IS NULL OR length(btrim(registration_number)) BETWEEN 1 AND 120),
  CONSTRAINT business_registration_identity_legal_name_length_check
    CHECK (legal_name IS NULL OR length(btrim(legal_name)) BETWEEN 1 AND 200),
  CONSTRAINT business_registration_identity_declaration_shape_check
    CHECK (
      (registration_status IS NULL AND registration_number IS NULL AND legal_name IS NULL)
      OR (
        registration_status = 'registered'
        AND registration_number IS NOT NULL
        AND legal_name IS NOT NULL
        AND length(btrim(registration_number)) BETWEEN 1 AND 120
        AND length(btrim(legal_name)) BETWEEN 1 AND 200
      )
      OR (
        registration_status = 'unregistered'
        AND registration_number IS NULL
        AND legal_name IS NULL
      )
    )
);

COMMENT ON TABLE ghm.business_registration_identity IS
  'Private self-declared Business registration identity. Not independent proof of registration and never part of public Business projections.';
COMMENT ON COLUMN ghm.business_registration_identity.registration_number IS
  'Private self-declared registration number. Do not expose in public directory or ordinary Business identity projections.';
COMMENT ON COLUMN ghm.business_registration_identity.legal_name IS
  'Private self-declared legal name. Do not expose in public directory or ordinary Business identity projections.';

ALTER TABLE ghm.business_registration_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghm.business_registration_identity OWNER TO ghm_schema_owner;

REVOKE ALL ON TABLE ghm.business_registration_identity FROM PUBLIC;
REVOKE ALL ON TABLE ghm.business_registration_identity FROM ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.read_business_registration_identity(
  p_account_id bigint,
  p_business_id bigint
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

  RETURN QUERY
    SELECT p_business_id, r.registration_status, r.registration_number, r.legal_name, r.updated_at
    FROM (VALUES (1)) AS singleton(value)
    LEFT JOIN ghm.business_registration_identity r ON r.business_id = p_business_id;
END;
$$;

ALTER FUNCTION ghm.read_business_registration_identity(bigint, bigint) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.read_business_registration_identity(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.read_business_registration_identity(bigint, bigint) TO ghm_runtime;

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
    ON CONFLICT (business_id) DO UPDATE
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
