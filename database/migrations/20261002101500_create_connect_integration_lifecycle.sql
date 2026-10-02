-- Connect integration lifecycle authority.
-- Construction-only. No HTTP boundary, credential issuance, deployment, or product cutover.

CREATE TABLE ghm.connect_integration (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  integration_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT connect_integration_id_nonblank_check
    CHECK (btrim(id) <> ''),
  CONSTRAINT connect_integration_status_check
    CHECK (integration_status IN ('active', 'disabled', 'revoked')),
  CONSTRAINT connect_integration_disabled_state_check
    CHECK (
      (integration_status <> 'disabled' AND disabled_at IS NULL)
      OR integration_status = 'disabled'
    ),
  CONSTRAINT connect_integration_revoked_state_check
    CHECK (
      (integration_status <> 'revoked' AND revoked_at IS NULL)
      OR integration_status = 'revoked'
    )
);

COMMENT ON TABLE ghm.connect_integration IS
  'GHM-authoritative Connect integration identity and lifecycle. Not a credential store.';

COMMENT ON COLUMN ghm.connect_integration.id IS
  'Stable Connect integration subject carried in the ES256 service assertion sub claim.';

COMMENT ON COLUMN ghm.connect_integration.integration_status IS
  'Integration lifecycle: active | disabled | revoked. Only active integrations may establish a trusted service context.';

REVOKE ALL ON TABLE ghm.connect_integration FROM PUBLIC;
GRANT SELECT ON TABLE ghm.connect_integration TO ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.connect_integration_create(
  p_id text,
  p_display_name text
) RETURNS TABLE (
  id text,
  display_name text,
  integration_status text,
  created_at timestamptz,
  updated_at timestamptz,
  disabled_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  IF p_id IS NULL OR btrim(p_id) = '' THEN
    RAISE EXCEPTION 'Connect integration id must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_id !~ '^[!-~]{1,128}$' THEN
    RAISE EXCEPTION 'Connect integration id must be printable ASCII <= 128 characters' USING ERRCODE = '22023';
  END IF;
  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'Connect integration display name must be non-blank' USING ERRCODE = '22023';
  END IF;

  INSERT INTO ghm.connect_integration (id, display_name)
  VALUES (p_id, p_display_name)
  RETURNING
    connect_integration.id,
    connect_integration.display_name,
    connect_integration.integration_status,
    connect_integration.created_at,
    connect_integration.updated_at,
    connect_integration.disabled_at,
    connect_integration.revoked_at
  INTO id, display_name, integration_status, created_at, updated_at, disabled_at, revoked_at;

  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.connect_integration_create(text, text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.connect_integration_create(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ghm.connect_integration_disable(
  p_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  UPDATE ghm.connect_integration
     SET integration_status = 'disabled',
         disabled_at = COALESCE(disabled_at, now()),
         updated_at = now()
   WHERE id = p_id
     AND integration_status <> 'revoked';

  RETURN FOUND;
END;
$$;

ALTER FUNCTION ghm.connect_integration_disable(text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.connect_integration_disable(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ghm.connect_integration_enable(
  p_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  UPDATE ghm.connect_integration
     SET integration_status = 'active',
         disabled_at = NULL,
         updated_at = now()
   WHERE id = p_id
     AND integration_status = 'disabled';

  RETURN FOUND;
END;
$$;

ALTER FUNCTION ghm.connect_integration_enable(text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.connect_integration_enable(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ghm.connect_integration_revoke(
  p_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  UPDATE ghm.connect_integration
     SET integration_status = 'revoked',
         revoked_at = COALESCE(revoked_at, now()),
         disabled_at = NULL,
         updated_at = now()
   WHERE id = p_id
     AND integration_status <> 'revoked';

  RETURN FOUND;
END;
$$;

ALTER FUNCTION ghm.connect_integration_revoke(text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.connect_integration_revoke(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ghm.connect_integration_get(
  p_id text
) RETURNS TABLE (
  id text,
  display_name text,
  integration_status text,
  created_at timestamptz,
  updated_at timestamptz,
  disabled_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, ghm
AS $$
  SELECT
    ci.id,
    ci.display_name,
    ci.integration_status,
    ci.created_at,
    ci.updated_at,
    ci.disabled_at,
    ci.revoked_at
  FROM ghm.connect_integration ci
  WHERE ci.id = p_id;
$$;

ALTER FUNCTION ghm.connect_integration_get(text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.connect_integration_get(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.connect_integration_get(text) TO ghm_runtime;
