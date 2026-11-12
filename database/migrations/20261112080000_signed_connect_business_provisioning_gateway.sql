-- Move Connect Business creation, owner membership and provider mapping into
-- one signed Actor Gateway transaction. The old mapping helper becomes
-- schema-owner-only; ghm_runtime must not call it directly.
BEGIN;

CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway_capability(
  p_actor bigint,
  p_operation text,
  p_issued bigint,
  p_nonce uuid,
  p_context text,
  p_signature text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_secret bytea;
  v_expected bytea;
  v_provided bytea;
  v_payload text;
  v_diff integer := 0;
  v_i integer;
BEGIN
  IF session_user <> 'ghm_actor_gateway'
     OR p_actor IS NULL OR p_actor <= 0
     OR p_issued IS NULL OR p_nonce IS NULL
     OR p_context IS NULL OR octet_length(convert_to(p_context, 'UTF8')) > 32768
     OR p_operation IS NULL
     OR p_operation NOT IN (
       'capability.list','capability.create','capability.update','capability.transition',
       'supplier.classification.update','business.profile.update','actor.identity.read',
       'business.registration.read','business.registration.update',
       'business.capability.replace','business.capability.verify','business.capability.evidence.review','business.capability.evidence.submit',
       'saved_business.read','saved_business.create','saved_business.delete',
       'business.hours.replace','business.hours.read','trust.score.calculate','trust.score.read','business.logo.bind',
       'business.connect.provision'
     )
     OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid actor assertion' USING ERRCODE = '42501';
  END IF;

  IF abs(extract(epoch FROM clock_timestamp())::bigint - p_issued) > 60 THEN
    RAISE EXCEPTION 'Actor assertion expired' USING ERRCODE = '42501';
  END IF;

  SELECT secret INTO v_secret
    FROM ghm.actor_gateway_capability_assertion_secret
   WHERE singleton = true;
  IF v_secret IS NULL OR octet_length(v_secret) <> 32 THEN
    RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE = '42501';
  END IF;

  v_payload := 'ghm-actor-gateway:v2|' || p_actor::text || '|' || p_operation || '|' ||
               p_issued::text || '|' || p_nonce::text || '|' ||
               encode(convert_to(p_context, 'UTF8'), 'hex');
  v_expected := public.hmac(convert_to(v_payload, 'UTF8'), v_secret, 'sha256');
  v_provided := decode(p_signature, 'hex');
  FOR v_i IN 0..31 LOOP
    v_diff := v_diff | (get_byte(v_expected, v_i) # get_byte(v_provided, v_i));
  END LOOP;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'Actor assertion signature invalid' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ghm.account_identity
     WHERE id = p_actor AND account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active actor account required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM ghm.actor_gateway_capability_assertion_nonce
   WHERE expires_at < clock_timestamp();
  BEGIN
    INSERT INTO ghm.actor_gateway_capability_assertion_nonce(nonce, expires_at)
    VALUES (p_nonce, GREATEST(clock_timestamp(), to_timestamp(p_issued)) + interval '60 seconds');
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Actor assertion replay detected' USING ERRCODE = '42501';
  END;

  RETURN p_actor;
END;
$$;

ALTER FUNCTION ghm.assert_actor_gateway_capability(bigint, text, bigint, uuid, text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_capability(bigint, text, bigint, uuid, text, text)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_capability(bigint, text, bigint, uuid, text, text)
  TO ghm_actor_gateway;

CREATE FUNCTION ghm.gateway_provision_connect_business(
  p_actor bigint,
  p_issued bigint,
  p_nonce uuid,
  p_context text,
  p_signature text,
  p_external_business_id text,
  p_business_name text,
  p_business_slug text
) RETURNS TABLE(outcome text, business jsonb, mapping jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_role text;
  v_is_system_admin boolean;
  v_business_id bigint;
  v_mapping_id bigint;
  v_link record;
  v_business jsonb;
  v_mapping jsonb;
BEGIN
  IF p_context::jsonb <> jsonb_build_object(
    'externalBusinessId', p_external_business_id,
    'name', p_business_name,
    'slug', p_business_slug
  ) THEN
    RAISE EXCEPTION 'Actor assertion context mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM ghm.assert_actor_gateway_capability(
    p_actor, 'business.connect.provision', p_issued, p_nonce, p_context, p_signature
  );

  IF p_external_business_id IS NULL
     OR p_external_business_id <> lower(p_external_business_id)
     OR p_external_business_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Invalid Connect external Business identifier' USING ERRCODE = '22023';
  END IF;
  IF p_business_name IS NULL OR btrim(p_business_name) = '' OR length(btrim(p_business_name)) > 200 THEN
    RAISE EXCEPTION 'Invalid Connect Business name' USING ERRCODE = '22023';
  END IF;
  IF p_business_slug IS NULL OR length(p_business_slug) > 80
     OR p_business_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  THEN
    RAISE EXCEPTION 'Invalid Connect Business slug' USING ERRCODE = '22023';
  END IF;

  SELECT a.role::text, a.is_system_admin
    INTO v_role, v_is_system_admin
    FROM ghm.account_identity a
   WHERE a.id = p_actor AND a.account_status = 'active';
  IF NOT FOUND OR v_role NOT IN ('business', 'admin') THEN
    RAISE EXCEPTION 'Business provisioning role required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('connect-business:supabase:' || p_external_business_id, 0)
  );

  SELECT m.business_id, m.id
    INTO v_business_id, v_mapping_id
    FROM ghm.business_external_mapping m
   WHERE m.provider = 'supabase'
     AND m.external_business_id = p_external_business_id
   FOR UPDATE;

  IF FOUND THEN
    IF NOT v_is_system_admin AND NOT EXISTS (
      SELECT 1
        FROM ghm.business_membership bm
       WHERE bm.business_id = v_business_id
         AND bm.account_id = p_actor
         AND bm.membership_status = 'active'
    ) THEN
      RAISE EXCEPTION 'Business membership required' USING ERRCODE = '42501';
    END IF;

    SELECT to_jsonb(b), to_jsonb(m)
      INTO v_business, v_mapping
      FROM ghm.business b
      JOIN ghm.business_external_mapping m ON m.business_id = b.id
     WHERE m.id = v_mapping_id;
    RETURN QUERY SELECT 'resolved'::text, v_business, v_mapping;
    RETURN;
  END IF;

  INSERT INTO ghm.business (name, slug, verification_status, is_active)
  VALUES (btrim(p_business_name), p_business_slug, 'unverified', true)
  RETURNING id INTO v_business_id;

  INSERT INTO ghm.business_membership
    (business_id, account_id, membership_role, membership_status, created_by)
  VALUES
    (v_business_id, p_actor, 'owner', 'active', p_actor);

  SELECT * INTO v_link
    FROM ghm.auth_link_business_external_mapping('supabase', p_external_business_id, v_business_id);
  IF v_link.outcome IS DISTINCT FROM 'created'
     OR v_link.business_id IS DISTINCT FROM v_business_id
  THEN
    RAISE EXCEPTION 'Connect Business mapping conflict' USING ERRCODE = '23505';
  END IF;
  v_mapping_id := v_link.id;

  SELECT to_jsonb(b), to_jsonb(m)
    INTO v_business, v_mapping
    FROM ghm.business b
    JOIN ghm.business_external_mapping m ON m.business_id = b.id
   WHERE m.id = v_mapping_id;

  RETURN QUERY SELECT 'provisioned'::text, v_business, v_mapping;
END;
$$;

ALTER FUNCTION ghm.gateway_provision_connect_business(bigint, bigint, uuid, text, text, text, text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.gateway_provision_connect_business(bigint, bigint, uuid, text, text, text, text, text)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_auth_issuer, ghm_payment_provider;
GRANT EXECUTE ON FUNCTION ghm.gateway_provision_connect_business(bigint, bigint, uuid, text, text, text, text, text)
  TO ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.auth_link_business_external_mapping(text, text, bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway, ghm_auth_issuer, ghm_payment_provider;

COMMIT;
