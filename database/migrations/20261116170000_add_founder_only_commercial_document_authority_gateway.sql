BEGIN;

-- Owner-only grant/revoke boundary for commercial document approval.
-- The caller identity is authenticated by the existing GHM Actor Gateway
-- JWT verifier and independently bound to this exact operation by a one-use
-- HMAC assertion. The only permitted actor is the canonical founder account
-- recorded by the one-time founder bootstrap migration.
CREATE UNIQUE INDEX commercial_document_approval_authority_scope_unique
  ON ghm.commercial_document_approval_authority
     (authority_account_id, document_type, document_key, jurisdiction_country_id)
  NULLS NOT DISTINCT;

CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway_commercial_document_authority(
  p_actor bigint,
  p_issued bigint,
  p_nonce uuid,
  p_context text,
  p_signature text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $assertion$
DECLARE
  v_secret bytea;
  v_expected bytea;
  v_provided bytea;
  v_payload text;
  v_diff integer := 0;
  v_i integer;
  v_founder_count bigint;
  v_founder_account_id bigint;
  v_founder_email text;
  v_credential_count bigint;
BEGIN
  IF session_user <> 'ghm_actor_gateway'
     OR p_actor IS NULL OR p_actor <= 0
     OR p_issued IS NULL OR p_nonce IS NULL
     OR p_context IS NULL
     OR octet_length(convert_to(p_context, 'UTF8')) > 32768
     OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid commercial authority assertion' USING ERRCODE = '42501';
  END IF;

  IF abs(extract(epoch FROM clock_timestamp())::bigint - p_issued) > 60 THEN
    RAISE EXCEPTION 'Commercial authority assertion expired' USING ERRCODE = '42501';
  END IF;

  SELECT secret INTO v_secret
    FROM ghm.actor_gateway_capability_assertion_secret
   WHERE singleton = true;
  IF v_secret IS NULL OR octet_length(v_secret) <> 32 THEN
    RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE = '42501';
  END IF;

  v_payload := 'ghm-actor-gateway:v2|' || p_actor::text ||
               '|commercial.document.authority.manage|' ||
               p_issued::text || '|' || p_nonce::text || '|' ||
               encode(convert_to(p_context, 'UTF8'), 'hex');
  v_expected := public.hmac(convert_to(v_payload, 'UTF8'), v_secret, 'sha256');
  v_provided := decode(p_signature, 'hex');
  FOR v_i IN 0..31 LOOP
    v_diff := v_diff | (get_byte(v_expected, v_i) # get_byte(v_provided, v_i));
  END LOOP;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'Commercial authority assertion signature invalid' USING ERRCODE = '42501';
  END IF;

  -- Do not accept a caller-supplied approver. Resolve the sole permitted
  -- principal from the immutable founder bootstrap singleton.
  SELECT count(*), min(account_id), min(founder_login_email)
    INTO v_founder_count, v_founder_account_id, v_founder_email
    FROM ghm.founder_system_admin_bootstrap_state
   WHERE id = true;

  IF v_founder_count <> 1
     OR v_founder_account_id IS DISTINCT FROM p_actor
     OR v_founder_email IS DISTINCT FROM 'zaidhqdev@gmail.com' THEN
    RAISE EXCEPTION 'Canonical founder authority required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM ghm.account_identity ai
     WHERE ai.id = p_actor
       AND ai.account_status = 'active'
       AND ai.is_system_admin = true
  ) THEN
    RAISE EXCEPTION 'Active founder account required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_credential_count
    FROM ghm.account_password_credential pc
   WHERE pc.account_id = p_actor
     AND pc.login_email_normalized = 'zaidhqdev@gmail.com'
     AND pc.credential_status = 'active';
  IF v_credential_count <> 1 THEN
    RAISE EXCEPTION 'Canonical founder credential is missing or ambiguous' USING ERRCODE = '42501';
  END IF;

  DELETE FROM ghm.actor_gateway_capability_assertion_nonce
   WHERE expires_at < clock_timestamp();
  BEGIN
    INSERT INTO ghm.actor_gateway_capability_assertion_nonce(nonce, expires_at)
    VALUES (
      p_nonce,
      GREATEST(clock_timestamp(), to_timestamp(p_issued)) + interval '60 seconds'
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Commercial authority assertion replay detected' USING ERRCODE = '42501';
  END;

  RETURN p_actor;
END;
$assertion$;

CREATE OR REPLACE FUNCTION ghm.gateway_manage_commercial_document_approval_authority(
  p_actor bigint,
  p_issued bigint,
  p_nonce uuid,
  p_context text,
  p_signature text,
  p_action text,
  p_document_type text,
  p_document_key text,
  p_jurisdiction_country_id bigint,
  p_reason text
) RETURNS TABLE (
  authority_id uuid,
  authority_event_id bigint,
  event_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $manage$
DECLARE
  v_authority_id uuid;
  v_latest_event_type text;
  v_event_id bigint;
BEGIN
  IF p_context::jsonb IS DISTINCT FROM jsonb_build_object(
    'action', p_action,
    'documentType', p_document_type,
    'documentKey', p_document_key,
    'jurisdictionCountryId', p_jurisdiction_country_id,
    'reason', p_reason
  ) THEN
    RAISE EXCEPTION 'Commercial authority assertion context mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM ghm.assert_actor_gateway_commercial_document_authority(
    p_actor, p_issued, p_nonce, p_context, p_signature
  );

  IF p_action IS NULL
     OR p_document_type IS NULL
     OR p_action NOT IN ('grant', 'revoke')
     OR p_document_type NOT IN ('trial_terms', 'subscription_terms')
     OR p_document_key IS NULL
     OR p_document_key <> lower(p_document_key)
     OR p_document_key !~ '^[a-z][a-z0-9_-]{2,79}$'
     OR p_reason IS NULL
     OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000
     OR (p_jurisdiction_country_id IS NOT NULL AND p_jurisdiction_country_id <= 0) THEN
    RAISE EXCEPTION 'Invalid commercial authority scope or action' USING ERRCODE = '22023';
  END IF;

  -- Serialize grant/revoke decisions for the exact scope, including the
  -- first insert where there is not yet an authority identity row to lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_actor::text || '|' || p_document_type || '|' || p_document_key || '|' ||
    coalesce(p_jurisdiction_country_id::text, 'null'),
    0
  ));

  SELECT a.authority_id
    INTO v_authority_id
    FROM ghm.commercial_document_approval_authority a
   WHERE a.authority_account_id = p_actor
     AND a.document_type = p_document_type
     AND a.document_key = p_document_key
     AND a.jurisdiction_country_id IS NOT DISTINCT FROM p_jurisdiction_country_id
   FOR UPDATE;

  IF v_authority_id IS NULL THEN
    IF p_action = 'revoke' THEN
      RAISE EXCEPTION 'No commercial approval authority exists for this scope' USING ERRCODE = 'P0001';
    END IF;

    v_authority_id := gen_random_uuid();
    INSERT INTO ghm.commercial_document_approval_authority (
      authority_id, document_type, document_key, jurisdiction_country_id, authority_account_id
    ) VALUES (
      v_authority_id, p_document_type, p_document_key, p_jurisdiction_country_id, p_actor
    );
  END IF;

  SELECT e.event_type
    INTO v_latest_event_type
    FROM ghm.commercial_document_approval_authority_event e
   WHERE e.authority_id = v_authority_id
   ORDER BY e.occurred_at DESC, e.id DESC
   LIMIT 1;

  IF p_action = 'grant' AND v_latest_event_type = 'granted' THEN
    RAISE EXCEPTION 'Commercial approval authority is already granted' USING ERRCODE = 'P0001';
  END IF;
  IF p_action = 'revoke' AND v_latest_event_type IS DISTINCT FROM 'granted' THEN
    RAISE EXCEPTION 'No active commercial approval authority to revoke' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO ghm.commercial_document_approval_authority_event (
    authority_id, event_type, recorded_by_account_id, reason, metadata
  ) VALUES (
    v_authority_id,
    CASE WHEN p_action = 'grant' THEN 'granted' ELSE 'revoked' END,
    p_actor,
    btrim(p_reason),
    jsonb_build_object('source', 'founder_owner_authority_gateway')
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT
    v_authority_id,
    v_event_id,
    CASE WHEN p_action = 'grant' THEN 'granted' ELSE 'revoked' END;
END;
$manage$;

ALTER FUNCTION ghm.assert_actor_gateway_commercial_document_authority(bigint,bigint,uuid,text,text)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_manage_commercial_document_approval_authority(bigint,bigint,uuid,text,text,text,text,text,bigint,text)
  OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_commercial_document_authority(bigint,bigint,uuid,text,text)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_manage_commercial_document_approval_authority(bigint,bigint,uuid,text,text,text,text,text,bigint,text)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_commercial_document_authority(bigint,bigint,uuid,text,text)
  TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_manage_commercial_document_approval_authority(bigint,bigint,uuid,text,text,text,text,text,bigint,text)
  TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.gateway_manage_commercial_document_approval_authority(bigint,bigint,uuid,text,text,text,text,text,bigint,text) IS
  'Owner-only commercial document approval authority grant/revoke. Requires a signed one-use Actor Gateway assertion and derives the sole authority account from founder_system_admin_bootstrap_state; no caller-supplied approver identity is accepted.';

COMMIT;
