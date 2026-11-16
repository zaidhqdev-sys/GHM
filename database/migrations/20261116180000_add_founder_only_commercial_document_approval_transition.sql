BEGIN;

-- Separate assertion operation for approving an exact immutable document
-- version. It uses the same canonical founder bootstrap and one-use nonce
-- ledger as the authority grant/revoke operation, but has its own operation
-- name so an authority-management signature cannot be replayed as approval.
CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway_commercial_document_approval(
  p_actor bigint,
  p_issued bigint,
  p_nonce uuid,
  p_context text,
  p_signature text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $approval_assertion$
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
    RAISE EXCEPTION 'Invalid commercial approval assertion' USING ERRCODE = '42501';
  END IF;

  IF abs(extract(epoch FROM clock_timestamp())::bigint - p_issued) > 60 THEN
    RAISE EXCEPTION 'Commercial approval assertion expired' USING ERRCODE = '42501';
  END IF;

  SELECT secret INTO v_secret
    FROM ghm.actor_gateway_capability_assertion_secret
   WHERE singleton = true;
  IF v_secret IS NULL OR octet_length(v_secret) <> 32 THEN
    RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE = '42501';
  END IF;

  v_payload := 'ghm-actor-gateway:v2|' || p_actor::text ||
               '|commercial.document.status.approve|' ||
               p_issued::text || '|' || p_nonce::text || '|' ||
               encode(convert_to(p_context, 'UTF8'), 'hex');
  v_expected := public.hmac(convert_to(v_payload, 'UTF8'), v_secret, 'sha256');
  v_provided := decode(p_signature, 'hex');
  FOR v_i IN 0..31 LOOP
    v_diff := v_diff | (get_byte(v_expected, v_i) # get_byte(v_provided, v_i));
  END LOOP;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'Commercial approval assertion signature invalid' USING ERRCODE = '42501';
  END IF;

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
    RAISE EXCEPTION 'Commercial approval assertion replay detected' USING ERRCODE = '42501';
  END;

  RETURN p_actor;
END;
$approval_assertion$;

CREATE OR REPLACE FUNCTION ghm.gateway_approve_commercial_document_version(
  p_actor bigint,
  p_issued bigint,
  p_nonce uuid,
  p_context text,
  p_signature text,
  p_document_version_id bigint,
  p_reason text
) RETURNS TABLE (
  status_event_id bigint,
  document_version_id bigint,
  authority_event_id bigint,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $approve_document$
DECLARE
  v_document_type text;
  v_document_key text;
  v_jurisdiction_country_id bigint;
  v_authority_id uuid;
  v_authority_event_id bigint;
  v_authority_event_type text;
  v_latest_status text;
  v_status_event_id bigint;
BEGIN
  IF p_context::jsonb IS DISTINCT FROM jsonb_build_object(
    'documentVersionId', p_document_version_id,
    'reason', p_reason
  ) THEN
    RAISE EXCEPTION 'Commercial approval assertion context mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM ghm.assert_actor_gateway_commercial_document_approval(
    p_actor, p_issued, p_nonce, p_context, p_signature
  );

  IF p_document_version_id IS NULL OR p_document_version_id <= 0
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Invalid commercial document approval request' USING ERRCODE = '22023';
  END IF;

  SELECT d.document_type, d.document_key, d.jurisdiction_country_id
    INTO v_document_type, v_document_key, v_jurisdiction_country_id
    FROM ghm.commercial_document_version d
   WHERE d.id = p_document_version_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commercial document version not found' USING ERRCODE = 'P0002';
  END IF;

  -- Use the same scope lock as grant/revoke. Approval and revocation are
  -- serialized so approval cannot race past a completed revocation.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_actor::text || '|' || v_document_type || '|' || v_document_key || '|' ||
    coalesce(v_jurisdiction_country_id::text, 'null'),
    0
  ));

  SELECT a.authority_id
    INTO v_authority_id
    FROM ghm.commercial_document_approval_authority a
   WHERE a.authority_account_id = p_actor
     AND a.document_type = v_document_type
     AND a.document_key = v_document_key
     AND a.jurisdiction_country_id IS NOT DISTINCT FROM v_jurisdiction_country_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Founder has no authority for this document scope' USING ERRCODE = '42501';
  END IF;

  SELECT e.id, e.event_type
    INTO v_authority_event_id, v_authority_event_type
    FROM ghm.commercial_document_approval_authority_event e
   WHERE e.authority_id = v_authority_id
   ORDER BY e.occurred_at DESC, e.id DESC
   LIMIT 1;

  IF v_authority_event_type IS DISTINCT FROM 'granted' THEN
    RAISE EXCEPTION 'Commercial document approval authority is not currently granted' USING ERRCODE = '42501';
  END IF;

  SELECT s.status
    INTO v_latest_status
    FROM ghm.commercial_document_status_event s
   WHERE s.document_version_id = p_document_version_id
   ORDER BY s.occurred_at DESC, s.id DESC
   LIMIT 1
   FOR UPDATE;

  IF v_latest_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only a draft commercial document version can be approved' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO ghm.commercial_document_status_event (
    document_version_id,
    status,
    actor_account_id,
    source,
    reason,
    approval_authority_event_id,
    approval_authority_event_type,
    metadata
  ) VALUES (
    p_document_version_id,
    'approved',
    p_actor,
    'founder_owner_approval_gateway',
    btrim(p_reason),
    v_authority_event_id,
    'granted',
    jsonb_build_object(
      'authorityId', v_authority_id,
      'authorityEventId', v_authority_event_id
    )
  )
  RETURNING id INTO v_status_event_id;

  RETURN QUERY SELECT v_status_event_id, p_document_version_id, v_authority_event_id, 'approved'::text;
END;
$approve_document$;

ALTER FUNCTION ghm.assert_actor_gateway_commercial_document_approval(bigint,bigint,uuid,text,text)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_approve_commercial_document_version(bigint,bigint,uuid,text,text,bigint,text)
  OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_commercial_document_approval(bigint,bigint,uuid,text,text)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_approve_commercial_document_version(bigint,bigint,uuid,text,text,bigint,text)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_commercial_document_approval(bigint,bigint,uuid,text,text)
  TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_approve_commercial_document_version(bigint,bigint,uuid,text,text,bigint,text)
  TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.gateway_approve_commercial_document_version(bigint,bigint,uuid,text,text,bigint,text) IS
  'Atomically approves one exact immutable commercial document version. Requires the canonical founder actor, a one-use signed Actor Gateway assertion, a latest active scoped grant and latest draft status.';

COMMIT;
