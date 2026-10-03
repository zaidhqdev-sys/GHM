CREATE TABLE ghm.quoteflow_account_identity_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quoteflow_user_id uuid NOT NULL,
  ghm_account_id bigint NOT NULL REFERENCES ghm.account_identity(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  quoteflow_confirmation_actor_id uuid NOT NULL,
  quoteflow_confirmation_actor_system text NOT NULL,
  ghm_confirmation_actor_id bigint NOT NULL,
  ghm_confirmation_actor_system text NOT NULL,
  ceremony_version integer NOT NULL,
  audit_actor_system text NOT NULL,
  audit_actor_id text NOT NULL,
  revoke_reason text,
  CONSTRAINT quoteflow_account_identity_link_state_valid
    CHECK (state IN ('active', 'revoked')),
  CONSTRAINT quoteflow_account_identity_link_timestamps_valid
    CHECK (
      activated_at >= created_at
      AND (state = 'active' AND revoked_at IS NULL OR state = 'revoked' AND revoked_at IS NOT NULL AND revoked_at >= activated_at)
    ),
  CONSTRAINT quoteflow_account_identity_link_ceremony_version_valid
    CHECK (ceremony_version > 0),
  CONSTRAINT quoteflow_account_identity_link_actor_system_valid
    CHECK (
      length(btrim(quoteflow_confirmation_actor_system)) BETWEEN 1 AND 80
      AND length(btrim(ghm_confirmation_actor_system)) BETWEEN 1 AND 80
      AND length(btrim(audit_actor_system)) BETWEEN 1 AND 80
      AND length(btrim(audit_actor_id)) BETWEEN 1 AND 200
    )
);

CREATE UNIQUE INDEX quoteflow_account_identity_link_active_user_unique
  ON ghm.quoteflow_account_identity_link (quoteflow_user_id)
  WHERE state = 'active';

CREATE UNIQUE INDEX quoteflow_account_identity_link_active_account_unique
  ON ghm.quoteflow_account_identity_link (ghm_account_id)
  WHERE state = 'active';

CREATE INDEX quoteflow_account_identity_link_account_state_idx
  ON ghm.quoteflow_account_identity_link (ghm_account_id, state);

CREATE TABLE ghm.quoteflow_business_identity_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quoteflow_organization_id uuid NOT NULL,
  ghm_business_id bigint NOT NULL REFERENCES ghm.business(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  quoteflow_confirmation_actor_id uuid NOT NULL,
  quoteflow_confirmation_actor_system text NOT NULL,
  ghm_confirmation_actor_id bigint NOT NULL,
  ghm_confirmation_actor_system text NOT NULL,
  ceremony_version integer NOT NULL,
  audit_actor_system text NOT NULL,
  audit_actor_id text NOT NULL,
  revoke_reason text,
  CONSTRAINT quoteflow_business_identity_link_state_valid
    CHECK (state IN ('active', 'revoked')),
  CONSTRAINT quoteflow_business_identity_link_timestamps_valid
    CHECK (
      activated_at >= created_at
      AND (state = 'active' AND revoked_at IS NULL OR state = 'revoked' AND revoked_at IS NOT NULL AND revoked_at >= activated_at)
    ),
  CONSTRAINT quoteflow_business_identity_link_ceremony_version_valid
    CHECK (ceremony_version > 0),
  CONSTRAINT quoteflow_business_identity_link_actor_system_valid
    CHECK (
      length(btrim(quoteflow_confirmation_actor_system)) BETWEEN 1 AND 80
      AND length(btrim(ghm_confirmation_actor_system)) BETWEEN 1 AND 80
      AND length(btrim(audit_actor_system)) BETWEEN 1 AND 80
      AND length(btrim(audit_actor_id)) BETWEEN 1 AND 200
    )
);

CREATE UNIQUE INDEX quoteflow_business_identity_link_active_org_unique
  ON ghm.quoteflow_business_identity_link (quoteflow_organization_id)
  WHERE state = 'active';

CREATE UNIQUE INDEX quoteflow_business_identity_link_active_business_unique
  ON ghm.quoteflow_business_identity_link (ghm_business_id)
  WHERE state = 'active';

CREATE INDEX quoteflow_business_identity_link_business_state_idx
  ON ghm.quoteflow_business_identity_link (ghm_business_id, state);

CREATE TABLE ghm.quoteflow_identity_link_audit (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  link_kind text NOT NULL,
  link_id uuid NOT NULL,
  event_type text NOT NULL,
  quote_flow_identifier uuid NOT NULL,
  ghm_identifier bigint NOT NULL,
  actor_system text NOT NULL,
  actor_id text NOT NULL,
  ceremony_version integer NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  CONSTRAINT quoteflow_identity_link_audit_kind_valid
    CHECK (link_kind IN ('account', 'business')),
  CONSTRAINT quoteflow_identity_link_audit_event_valid
    CHECK (event_type IN ('activated', 'revoked')),
  CONSTRAINT quoteflow_identity_link_audit_actor_valid
    CHECK (length(btrim(actor_system)) BETWEEN 1 AND 80 AND length(btrim(actor_id)) BETWEEN 1 AND 200),
  CONSTRAINT quoteflow_identity_link_audit_ceremony_version_valid
    CHECK (ceremony_version > 0)
);

CREATE INDEX quoteflow_identity_link_audit_link_idx
  ON ghm.quoteflow_identity_link_audit (link_kind, link_id, occurred_at);

CREATE OR REPLACE FUNCTION ghm.quoteflow_activate_account_identity_link(
  p_quote_flow_user_id uuid,
  p_ghm_account_id bigint,
  p_quote_flow_confirmation_actor_id uuid,
  p_quote_flow_confirmation_actor_system text,
  p_ghm_confirmation_actor_id bigint,
  p_ghm_confirmation_actor_system text,
  p_ceremony_version integer,
  p_audit_actor_system text,
  p_audit_actor_id text
) RETURNS TABLE (outcome text, link_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_existing ghm.quoteflow_account_identity_link%ROWTYPE;
  v_link_id uuid;
BEGIN
  IF p_quote_flow_user_id IS NULL OR p_ghm_account_id IS NULL
     OR p_quote_flow_confirmation_actor_id IS NULL
     OR p_ghm_confirmation_actor_id IS NULL
     OR p_ceremony_version IS NULL OR p_ceremony_version <= 0
     OR p_quote_flow_confirmation_actor_system IS NULL OR btrim(p_quote_flow_confirmation_actor_system) = ''
     OR p_ghm_confirmation_actor_system IS NULL OR btrim(p_ghm_confirmation_actor_system) = ''
     OR p_audit_actor_system IS NULL OR btrim(p_audit_actor_system) = ''
     OR p_audit_actor_id IS NULL OR btrim(p_audit_actor_id) = '' THEN
    RAISE EXCEPTION 'Invalid QuoteFlow account identity-link provenance' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
    FROM ghm.quoteflow_account_identity_link
   WHERE state = 'active'
     AND (quoteflow_user_id = p_quote_flow_user_id OR ghm_account_id = p_ghm_account_id)
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.quoteflow_user_id = p_quote_flow_user_id
       AND v_existing.ghm_account_id = p_ghm_account_id THEN
      RETURN QUERY SELECT 'already_active'::text, v_existing.id;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'conflict'::text, v_existing.id;
    RETURN;
  END IF;

  INSERT INTO ghm.quoteflow_account_identity_link (
    quoteflow_user_id, ghm_account_id,
    quoteflow_confirmation_actor_id, quoteflow_confirmation_actor_system,
    ghm_confirmation_actor_id, ghm_confirmation_actor_system,
    ceremony_version, audit_actor_system, audit_actor_id
  ) VALUES (
    p_quote_flow_user_id, p_ghm_account_id,
    p_quote_flow_confirmation_actor_id, p_quote_flow_confirmation_actor_system,
    p_ghm_confirmation_actor_id, p_ghm_confirmation_actor_system,
    p_ceremony_version, p_audit_actor_system, p_audit_actor_id
  )
  RETURNING id INTO v_link_id;

  INSERT INTO ghm.quoteflow_identity_link_audit (
    link_kind, link_id, event_type, quote_flow_identifier, ghm_identifier,
    actor_system, actor_id, ceremony_version
  ) VALUES (
    'account', v_link_id, 'activated', p_quote_flow_user_id, p_ghm_account_id,
    p_audit_actor_system, p_audit_actor_id, p_ceremony_version
  );

  RETURN QUERY SELECT 'created'::text, v_link_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM ghm.quoteflow_account_identity_link
     WHERE state = 'active'
       AND (quoteflow_user_id = p_quote_flow_user_id OR ghm_account_id = p_ghm_account_id)
     ORDER BY created_at
     LIMIT 1;
    IF FOUND AND v_existing.quoteflow_user_id = p_quote_flow_user_id
       AND v_existing.ghm_account_id = p_ghm_account_id THEN
      RETURN QUERY SELECT 'already_active'::text, v_existing.id;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'conflict'::text, COALESCE(v_existing.id, NULL::uuid);
END;
$$;

ALTER FUNCTION ghm.quoteflow_activate_account_identity_link(uuid, bigint, uuid, text, bigint, text, integer, text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.quoteflow_activate_account_identity_link(uuid, bigint, uuid, text, bigint, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.quoteflow_activate_account_identity_link(uuid, bigint, uuid, text, bigint, text, integer, text, text) TO ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.quoteflow_activate_business_identity_link(
  p_quote_flow_organization_id uuid,
  p_ghm_business_id bigint,
  p_quote_flow_confirmation_actor_id uuid,
  p_quote_flow_confirmation_actor_system text,
  p_ghm_confirmation_actor_id bigint,
  p_ghm_confirmation_actor_system text,
  p_ceremony_version integer,
  p_audit_actor_system text,
  p_audit_actor_id text
) RETURNS TABLE (outcome text, link_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_existing ghm.quoteflow_business_identity_link%ROWTYPE;
  v_link_id uuid;
BEGIN
  IF p_quote_flow_organization_id IS NULL OR p_ghm_business_id IS NULL
     OR p_quote_flow_confirmation_actor_id IS NULL
     OR p_ghm_confirmation_actor_id IS NULL
     OR p_ceremony_version IS NULL OR p_ceremony_version <= 0
     OR p_quote_flow_confirmation_actor_system IS NULL OR btrim(p_quote_flow_confirmation_actor_system) = ''
     OR p_ghm_confirmation_actor_system IS NULL OR btrim(p_ghm_confirmation_actor_system) = ''
     OR p_audit_actor_system IS NULL OR btrim(p_audit_actor_system) = ''
     OR p_audit_actor_id IS NULL OR btrim(p_audit_actor_id) = '' THEN
    RAISE EXCEPTION 'Invalid QuoteFlow Business identity-link provenance' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
    FROM ghm.quoteflow_business_identity_link
   WHERE state = 'active'
     AND (quoteflow_organization_id = p_quote_flow_organization_id OR ghm_business_id = p_ghm_business_id)
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing.quoteflow_organization_id = p_quote_flow_organization_id
       AND v_existing.ghm_business_id = p_ghm_business_id THEN
      RETURN QUERY SELECT 'already_active'::text, v_existing.id;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'conflict'::text, v_existing.id;
    RETURN;
  END IF;

  INSERT INTO ghm.quoteflow_business_identity_link (
    quoteflow_organization_id, ghm_business_id,
    quoteflow_confirmation_actor_id, quoteflow_confirmation_actor_system,
    ghm_confirmation_actor_id, ghm_confirmation_actor_system,
    ceremony_version, audit_actor_system, audit_actor_id
  ) VALUES (
    p_quote_flow_organization_id, p_ghm_business_id,
    p_quote_flow_confirmation_actor_id, p_quote_flow_confirmation_actor_system,
    p_ghm_confirmation_actor_id, p_ghm_confirmation_actor_system,
    p_ceremony_version, p_audit_actor_system, p_audit_actor_id
  )
  RETURNING id INTO v_link_id;

  INSERT INTO ghm.quoteflow_identity_link_audit (
    link_kind, link_id, event_type, quote_flow_identifier, ghm_identifier,
    actor_system, actor_id, ceremony_version
  ) VALUES (
    'business', v_link_id, 'activated', p_quote_flow_organization_id, p_ghm_business_id,
    p_audit_actor_system, p_audit_actor_id, p_ceremony_version
  );

  RETURN QUERY SELECT 'created'::text, v_link_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM ghm.quoteflow_business_identity_link
     WHERE state = 'active'
       AND (quoteflow_organization_id = p_quote_flow_organization_id OR ghm_business_id = p_ghm_business_id)
     ORDER BY created_at
     LIMIT 1;
    IF FOUND AND v_existing.quoteflow_organization_id = p_quote_flow_organization_id
       AND v_existing.ghm_business_id = p_ghm_business_id THEN
      RETURN QUERY SELECT 'already_active'::text, v_existing.id;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'conflict'::text, COALESCE(v_existing.id, NULL::uuid);
END;
$$;

ALTER FUNCTION ghm.quoteflow_activate_business_identity_link(uuid, bigint, uuid, text, bigint, text, integer, text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.quoteflow_activate_business_identity_link(uuid, bigint, uuid, text, bigint, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.quoteflow_activate_business_identity_link(uuid, bigint, uuid, text, bigint, text, integer, text, text) TO ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.quoteflow_revoke_account_identity_link(
  p_link_id uuid,
  p_audit_actor_system text,
  p_audit_actor_id text,
  p_reason text
) RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_link ghm.quoteflow_account_identity_link%ROWTYPE;
BEGIN
  SELECT * INTO v_link
    FROM ghm.quoteflow_account_identity_link
   WHERE id = p_link_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text; RETURN; END IF;
  IF v_link.state = 'revoked' THEN RETURN QUERY SELECT 'already_revoked'::text; RETURN; END IF;
  IF p_audit_actor_system IS NULL OR btrim(p_audit_actor_system) = ''
     OR p_audit_actor_id IS NULL OR btrim(p_audit_actor_id) = '' THEN
    RAISE EXCEPTION 'Invalid revocation actor provenance' USING ERRCODE = '22023';
  END IF;

  UPDATE ghm.quoteflow_account_identity_link
     SET state = 'revoked', revoked_at = now(), revoke_reason = NULLIF(btrim(p_reason), '')
   WHERE id = p_link_id;

  INSERT INTO ghm.quoteflow_identity_link_audit (
    link_kind, link_id, event_type, quote_flow_identifier, ghm_identifier,
    actor_system, actor_id, ceremony_version, reason
  ) VALUES (
    'account', v_link.id, 'revoked', v_link.quoteflow_user_id, v_link.ghm_account_id,
    p_audit_actor_system, p_audit_actor_id, v_link.ceremony_version, NULLIF(btrim(p_reason), '')
  );

  RETURN QUERY SELECT 'revoked'::text;
END;
$$;

ALTER FUNCTION ghm.quoteflow_revoke_account_identity_link(uuid, text, text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.quoteflow_revoke_account_identity_link(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.quoteflow_revoke_account_identity_link(uuid, text, text, text) TO ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.quoteflow_revoke_business_identity_link(
  p_link_id uuid,
  p_audit_actor_system text,
  p_audit_actor_id text,
  p_reason text
) RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_link ghm.quoteflow_business_identity_link%ROWTYPE;
BEGIN
  SELECT * INTO v_link
    FROM ghm.quoteflow_business_identity_link
   WHERE id = p_link_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text; RETURN; END IF;
  IF v_link.state = 'revoked' THEN RETURN QUERY SELECT 'already_revoked'::text; RETURN; END IF;
  IF p_audit_actor_system IS NULL OR btrim(p_audit_actor_system) = ''
     OR p_audit_actor_id IS NULL OR btrim(p_audit_actor_id) = '' THEN
    RAISE EXCEPTION 'Invalid revocation actor provenance' USING ERRCODE = '22023';
  END IF;

  UPDATE ghm.quoteflow_business_identity_link
     SET state = 'revoked', revoked_at = now(), revoke_reason = NULLIF(btrim(p_reason), '')
   WHERE id = p_link_id;

  INSERT INTO ghm.quoteflow_identity_link_audit (
    link_kind, link_id, event_type, quote_flow_identifier, ghm_identifier,
    actor_system, actor_id, ceremony_version, reason
  ) VALUES (
    'business', v_link.id, 'revoked', v_link.quoteflow_organization_id, v_link.ghm_business_id,
    p_audit_actor_system, p_audit_actor_id, v_link.ceremony_version, NULLIF(btrim(p_reason), '')
  );

  RETURN QUERY SELECT 'revoked'::text;
END;
$$;

ALTER FUNCTION ghm.quoteflow_revoke_business_identity_link(uuid, text, text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.quoteflow_revoke_business_identity_link(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.quoteflow_revoke_business_identity_link(uuid, text, text, text) TO ghm_runtime;

REVOKE ALL ON TABLE ghm.quoteflow_account_identity_link FROM PUBLIC, ghm_runtime;
REVOKE ALL ON TABLE ghm.quoteflow_business_identity_link FROM PUBLIC, ghm_runtime;
REVOKE ALL ON TABLE ghm.quoteflow_identity_link_audit FROM PUBLIC, ghm_runtime;
GRANT SELECT ON TABLE ghm.quoteflow_account_identity_link TO ghm_runtime;
GRANT SELECT ON TABLE ghm.quoteflow_business_identity_link TO ghm_runtime;
GRANT SELECT ON TABLE ghm.quoteflow_identity_link_audit TO ghm_runtime;

REVOKE USAGE, SELECT, UPDATE ON SEQUENCE ghm.quoteflow_identity_link_audit_id_seq FROM PUBLIC, ghm_runtime;
GRANT SELECT ON TABLE ghm.quoteflow_identity_link_audit TO ghm_runtime;
