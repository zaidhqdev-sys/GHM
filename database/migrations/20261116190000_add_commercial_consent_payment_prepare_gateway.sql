BEGIN;

-- The GHM-native payment preparation boundary records explicit acceptance
-- of the exact approved document version and the payment attempt atomically.
-- No checkout redirect, provider API call, subscription activation or payment
-- settlement occurs in this function.
CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway_commercial_payment_prepare(
  p_actor bigint,
  p_issued bigint,
  p_nonce uuid,
  p_context text,
  p_signature text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $payment_assertion$
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
     OR p_context IS NULL
     OR octet_length(convert_to(p_context, 'UTF8')) > 32768
     OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid commercial payment preparation assertion' USING ERRCODE = '42501';
  END IF;

  IF abs(extract(epoch FROM clock_timestamp())::bigint - p_issued) > 60 THEN
    RAISE EXCEPTION 'Commercial payment preparation assertion expired' USING ERRCODE = '42501';
  END IF;

  SELECT secret INTO v_secret
    FROM ghm.actor_gateway_capability_assertion_secret
   WHERE singleton = true;
  IF v_secret IS NULL OR octet_length(v_secret) <> 32 THEN
    RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE = '42501';
  END IF;

  v_payload := 'ghm-actor-gateway:v2|' || p_actor::text ||
               '|commercial.payment.prepare_with_consent|' ||
               p_issued::text || '|' || p_nonce::text || '|' ||
               encode(convert_to(p_context, 'UTF8'), 'hex');
  v_expected := public.hmac(convert_to(v_payload, 'UTF8'), v_secret, 'sha256');
  v_provided := decode(p_signature, 'hex');
  FOR v_i IN 0..31 LOOP
    v_diff := v_diff | (get_byte(v_expected, v_i) # get_byte(v_provided, v_i));
  END LOOP;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'Commercial payment preparation assertion signature invalid' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM ghm.account_identity ai
     WHERE ai.id = p_actor
       AND ai.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active GHM account required' USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'Commercial payment preparation assertion replay detected' USING ERRCODE = '42501';
  END;

  RETURN p_actor;
END;
$payment_assertion$;

CREATE OR REPLACE FUNCTION ghm.gateway_prepare_commercial_payment_with_consent(
  p_actor bigint,
  p_issued bigint,
  p_nonce uuid,
  p_context text,
  p_signature text,
  p_business_id bigint,
  p_document_version_id bigint,
  p_country_id bigint,
  p_idempotency_key text,
  p_provider_code text,
  p_accepted boolean,
  p_expires_at timestamptz DEFAULT NULL,
  p_request_id text DEFAULT NULL
) RETURNS TABLE (
  payment_attempt_id bigint,
  consent_event_id bigint,
  business_id bigint,
  subscription_id bigint,
  price_id bigint,
  provider_code text,
  amount_minor_units bigint,
  currency_id bigint,
  billing_interval text,
  attempt_status text,
  idempotency_key text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm, pg_temp
AS $prepare$
DECLARE
  v_business_id bigint;
  v_subscription_id bigint;
  v_plan_version_id bigint;
  v_plan_code text;
  v_price_id bigint;
  v_amount_minor_units bigint;
  v_currency_id bigint;
  v_billing_interval text;
  v_document_type text;
  v_document_key text;
  v_document_plan_code text;
  v_document_country_id bigint;
  v_document_status text;
  v_existing_attempt ghm.commercial_payment_attempt;
  v_existing_consent ghm.commercial_consent_event;
  v_attempt ghm.commercial_payment_attempt;
  v_consent_id bigint;
  v_prepared_at timestamptz;
  v_effective_expiry timestamptz;
BEGIN
  IF p_context::jsonb IS DISTINCT FROM jsonb_build_object(
    'businessId', p_business_id,
    'documentVersionId', p_document_version_id,
    'countryId', p_country_id,
    'idempotencyKey', p_idempotency_key,
    'providerCode', p_provider_code,
    'accepted', p_accepted,
    'expiresAt', p_expires_at,
    'requestId', p_request_id
  ) THEN
    RAISE EXCEPTION 'Commercial payment preparation assertion context mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM ghm.assert_actor_gateway_commercial_payment_prepare(
    p_actor, p_issued, p_nonce, p_context, p_signature
  );

  IF p_business_id IS NULL OR p_business_id <= 0
     OR p_document_version_id IS NULL OR p_document_version_id <= 0
     OR (p_country_id IS NOT NULL AND p_country_id <= 0)
     OR p_idempotency_key IS NULL
     OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200
     OR p_provider_code IS NULL OR p_provider_code !~ '^[a-z][a-z0-9_]{1,49}
     OR p_accepted IS DISTINCT FROM true
     OR (p_expires_at IS NOT NULL AND p_expires_at <= clock_timestamp())
     OR (p_request_id IS NOT NULL AND length(btrim(p_request_id)) NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'Invalid commercial payment preparation request' USING ERRCODE = '22023';
  END IF;

  v_business_id := p_business_id;
  v_prepared_at := clock_timestamp();
  v_effective_expiry := coalesce(p_expires_at, v_prepared_at + interval '30 minutes');

  -- Lock the active owner/administrator membership so a concurrent role
  -- revocation cannot race the consent and payment-attempt write.
  PERFORM 1
    FROM ghm.business_membership m
   WHERE m.business_id = p_business_id
     AND m.account_id = p_actor
     AND m.membership_status = 'active'
     AND m.membership_role IN ('owner', 'administrator')
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Business owner or administrator membership required' USING ERRCODE = '42501';
  END IF;

  -- Serialize identical requests before looking up either immutable consent
  -- evidence or the unique payment attempt.
  PERFORM pg_advisory_xact_lock(hashtextextended('commercial-payment:' || p_idempotency_key, 0));

  SELECT * INTO v_existing_attempt
    FROM ghm.commercial_payment_attempt a
   WHERE a.idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_existing_consent
      FROM ghm.commercial_consent_event c
     WHERE c.idempotency_key = p_idempotency_key
     FOR UPDATE;

    IF NOT FOUND
       OR v_existing_attempt.business_id IS DISTINCT FROM p_business_id
       OR v_existing_attempt.initiated_by IS DISTINCT FROM p_actor
       OR v_existing_attempt.provider_code IS DISTINCT FROM p_provider_code
       OR v_existing_consent.business_id IS DISTINCT FROM p_business_id
       OR v_existing_consent.account_id IS DISTINCT FROM p_actor
       OR v_existing_consent.document_version_id IS DISTINCT FROM p_document_version_id
       OR v_existing_consent.context->>'countryId' IS DISTINCT FROM p_country_id::text THEN
      RAISE EXCEPTION 'Commercial payment preparation idempotency conflict' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT
      v_existing_attempt.id,
      v_existing_consent.id,
      v_existing_attempt.business_id,
      v_existing_attempt.subscription_id,
      v_existing_attempt.price_id,
      v_existing_attempt.provider_code,
      v_existing_attempt.amount_minor_units,
      v_existing_attempt.currency_id,
      v_existing_attempt.billing_interval,
      v_existing_attempt.attempt_status,
      v_existing_attempt.idempotency_key,
      v_existing_attempt.expires_at;
    RETURN;
  END IF;

  SELECT s.id, s.plan_version_id, p.code
    INTO v_subscription_id, v_plan_version_id, v_plan_code
    FROM ghm.commercial_subscription s
    JOIN ghm.commercial_plan_version pv ON pv.id = s.plan_version_id
    JOIN ghm.commercial_plan p ON p.id = pv.plan_id
   WHERE s.business_id = p_business_id
     AND s.lifecycle_status IN (
       'trialing', 'active', 'past_due', 'grace_period',
       'cancel_at_period_end', 'suspended'
     )
   ORDER BY s.id DESC
   LIMIT 1
   FOR SHARE OF s;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'Commercial subscription required' USING ERRCODE = 'P0001';
  END IF;

  SELECT price.id, price.amount_minor_units, price.currency_id, price.billing_interval
    INTO v_price_id, v_amount_minor_units, v_currency_id, v_billing_interval
    FROM ghm.commercial_plan_price price
   WHERE price.plan_version_id = v_plan_version_id
     AND price.lifecycle_status = 'active'
     AND price.effective_from <= v_prepared_at
     AND (price.effective_until IS NULL OR price.effective_until > v_prepared_at)
     AND price.country_id IS NOT DISTINCT FROM p_country_id
   ORDER BY CASE WHEN price.price_kind = 'founding' THEN 0 ELSE 1 END,
            price.effective_from DESC, price.id DESC
   LIMIT 1
   FOR SHARE;

  IF v_price_id IS NULL THEN
    RAISE EXCEPTION 'Eligible commercial price not found' USING ERRCODE = 'P0001';
  END IF;

  -- The exact version must be approved, current for this Business plan, and
  -- valid for the requested pricing jurisdiction (or globally applicable).
  SELECT d.document_type, d.document_key, d.plan_code, d.jurisdiction_country_id
    INTO v_document_type, v_document_key, v_document_plan_code, v_document_country_id
    FROM ghm.commercial_document_version d
   WHERE d.id = p_document_version_id
   FOR SHARE;

  IF NOT FOUND
     OR v_document_type IS DISTINCT FROM 'subscription_terms'
     OR (v_document_plan_code IS NOT NULL AND v_document_plan_code IS DISTINCT FROM v_plan_code)
     OR (v_document_country_id IS NOT NULL AND v_document_country_id IS DISTINCT FROM p_country_id) THEN
    RAISE EXCEPTION 'Approved subscription document version does not match Business plan or jurisdiction' USING ERRCODE = '42501';
  END IF;

  SELECT e.status INTO v_document_status
    FROM ghm.commercial_document_status_event e
   WHERE e.document_version_id = p_document_version_id
   ORDER BY e.occurred_at DESC, e.id DESC
   LIMIT 1
   FOR SHARE;

  IF v_document_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Exact commercial document version is not currently approved' USING ERRCODE = '42501';
  END IF;

  -- A consent event without its matching payment attempt is never accepted
  -- as a retry: both are committed in this same transaction.
  SELECT * INTO v_existing_consent
    FROM ghm.commercial_consent_event c
   WHERE c.idempotency_key = p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Commercial consent idempotency conflict' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO ghm.commercial_payment_attempt (
    business_id, subscription_id, price_id, initiated_by, provider_code,
    attempt_status, amount_minor_units, currency_id, billing_interval,
    idempotency_key, expires_at
  ) VALUES (
    p_business_id, v_subscription_id, v_price_id, p_actor, p_provider_code,
    'pending_checkout', v_amount_minor_units, v_currency_id, v_billing_interval,
    p_idempotency_key, v_effective_expiry
  )
  RETURNING * INTO v_attempt;

  INSERT INTO ghm.commercial_consent_event (
    business_id, account_id, document_version_id, consent_action,
    idempotency_key, request_id, source, context, accepted_at
  ) VALUES (
    p_business_id, p_actor, p_document_version_id, 'accepted',
    p_idempotency_key, p_request_id, 'ghm.actor_gateway.commercial_payment_prepare',
    jsonb_build_object(
      'paymentAttemptId', v_attempt.id,
      'subscriptionId', v_subscription_id,
      'planCode', v_plan_code,
      'priceId', v_price_id,
      'providerCode', p_provider_code,
      'countryId', p_country_id
    ),
    v_prepared_at
  )
  RETURNING id INTO v_consent_id;

  INSERT INTO ghm.commercial_event (
    business_id, subscription_id, event_type, actor_account_id,
    source, idempotency_key, payload, occurred_at
  ) VALUES (
    p_business_id, v_subscription_id, 'subscription_payment_prepared',
    p_actor, 'ghm.commercial', p_idempotency_key,
    jsonb_build_object(
      'paymentAttemptId', v_attempt.id,
      'consentEventId', v_consent_id,
      'documentVersionId', p_document_version_id,
      'priceId', v_price_id,
      'amountMinorUnits', v_amount_minor_units,
      'currencyId', v_currency_id,
      'billingInterval', v_billing_interval,
      'providerCode', p_provider_code,
      'expiresAt', v_effective_expiry
    ),
    v_prepared_at
  );

  RETURN QUERY SELECT
    v_attempt.id,
    v_consent_id,
    v_attempt.business_id,
    v_attempt.subscription_id,
    v_attempt.price_id,
    v_attempt.provider_code,
    v_attempt.amount_minor_units,
    v_attempt.currency_id,
    v_attempt.billing_interval,
    v_attempt.attempt_status,
    v_attempt.idempotency_key,
    v_attempt.expires_at;
END;
$prepare$;

ALTER FUNCTION ghm.assert_actor_gateway_commercial_payment_prepare(bigint,bigint,uuid,text,text)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_prepare_commercial_payment_with_consent(bigint,bigint,uuid,text,text,bigint,bigint,bigint,text,text,boolean,timestamptz,text)
  OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_commercial_payment_prepare(bigint,bigint,uuid,text,text)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_prepare_commercial_payment_with_consent(bigint,bigint,uuid,text,text,bigint,bigint,bigint,text,text,boolean,timestamptz,text)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_commercial_payment_prepare(bigint,bigint,uuid,text,text)
  TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_prepare_commercial_payment_with_consent(bigint,bigint,uuid,text,text,bigint,bigint,bigint,text,text,boolean,timestamptz,text)
  TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.gateway_prepare_commercial_payment_with_consent(bigint,bigint,uuid,text,text,bigint,bigint,bigint,text,text,boolean,timestamptz,text) IS
  'Atomically records explicit acceptance of an exact currently-approved subscription terms version and prepares one provider-neutral Business payment attempt. Does not initiate checkout or activate a subscription.';

COMMIT;

     OR p_accepted IS DISTINCT FROM true
     OR (p_expires_at IS NOT NULL AND p_expires_at <= clock_timestamp())
     OR (p_request_id IS NOT NULL AND length(btrim(p_request_id)) NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'Invalid commercial payment preparation request' USING ERRCODE = '22023';
  END IF;

  v_business_id := p_business_id;
  v_prepared_at := clock_timestamp();
  v_effective_expiry := coalesce(p_expires_at, v_prepared_at + interval '30 minutes');

  -- Serialize identical requests before looking up either immutable consent
  -- evidence or the unique payment attempt.
  PERFORM pg_advisory_xact_lock(hashtextextended('commercial-payment:' || p_idempotency_key, 0));

  SELECT * INTO v_existing_attempt
    FROM ghm.commercial_payment_attempt a
   WHERE a.idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_existing_consent
      FROM ghm.commercial_consent_event c
     WHERE c.idempotency_key = p_idempotency_key
     FOR UPDATE;

    IF NOT FOUND
       OR v_existing_attempt.business_id IS DISTINCT FROM p_business_id
       OR v_existing_attempt.initiated_by IS DISTINCT FROM p_actor
       OR v_existing_attempt.provider_code IS DISTINCT FROM p_provider_code
       OR v_existing_consent.business_id IS DISTINCT FROM p_business_id
       OR v_existing_consent.account_id IS DISTINCT FROM p_actor
       OR v_existing_consent.document_version_id IS DISTINCT FROM p_document_version_id THEN
      RAISE EXCEPTION 'Commercial payment preparation idempotency conflict' USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY SELECT
      v_existing_attempt.id,
      v_existing_consent.id,
      v_existing_attempt.business_id,
      v_existing_attempt.subscription_id,
      v_existing_attempt.price_id,
      v_existing_attempt.provider_code,
      v_existing_attempt.amount_minor_units,
      v_existing_attempt.currency_id,
      v_existing_attempt.billing_interval,
      v_existing_attempt.attempt_status,
      v_existing_attempt.idempotency_key,
      v_existing_attempt.expires_at;
    RETURN;
  END IF;

  -- Lock the active owner/administrator membership so a concurrent role
  -- revocation cannot race the consent and payment-attempt write.
  PERFORM 1
    FROM ghm.business_membership m
   WHERE m.business_id = p_business_id
     AND m.account_id = p_actor
     AND m.membership_status = 'active'
     AND m.membership_role IN ('owner', 'administrator')
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Business owner or administrator membership required' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.plan_version_id, p.code
    INTO v_subscription_id, v_plan_version_id, v_plan_code
    FROM ghm.commercial_subscription s
    JOIN ghm.commercial_plan_version pv ON pv.id = s.plan_version_id
    JOIN ghm.commercial_plan p ON p.id = pv.plan_id
   WHERE s.business_id = p_business_id
     AND s.lifecycle_status IN (
       'trialing', 'active', 'past_due', 'grace_period',
       'cancel_at_period_end', 'suspended'
     )
   ORDER BY s.id DESC
   LIMIT 1
   FOR SHARE OF s;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'Commercial subscription required' USING ERRCODE = 'P0001';
  END IF;

  SELECT price.id, price.amount_minor_units, price.currency_id, price.billing_interval
    INTO v_price_id, v_amount_minor_units, v_currency_id, v_billing_interval
    FROM ghm.commercial_plan_price price
   WHERE price.plan_version_id = v_plan_version_id
     AND price.lifecycle_status = 'active'
     AND price.effective_from <= v_prepared_at
     AND (price.effective_until IS NULL OR price.effective_until > v_prepared_at)
     AND price.country_id IS NOT DISTINCT FROM p_country_id
   ORDER BY CASE WHEN price.price_kind = 'founding' THEN 0 ELSE 1 END,
            price.effective_from DESC, price.id DESC
   LIMIT 1
   FOR SHARE;

  IF v_price_id IS NULL THEN
    RAISE EXCEPTION 'Eligible commercial price not found' USING ERRCODE = 'P0001';
  END IF;

  -- The exact version must be approved, current for this Business plan, and
  -- valid for the requested pricing jurisdiction (or globally applicable).
  SELECT d.document_type, d.document_key, d.plan_code, d.jurisdiction_country_id
    INTO v_document_type, v_document_key, v_document_plan_code, v_document_country_id
    FROM ghm.commercial_document_version d
   WHERE d.id = p_document_version_id
   FOR SHARE;

  IF NOT FOUND
     OR v_document_type IS DISTINCT FROM 'subscription_terms'
     OR (v_document_plan_code IS NOT NULL AND v_document_plan_code IS DISTINCT FROM v_plan_code)
     OR (v_document_country_id IS NOT NULL AND v_document_country_id IS DISTINCT FROM p_country_id) THEN
    RAISE EXCEPTION 'Approved subscription document version does not match Business plan or jurisdiction' USING ERRCODE = '42501';
  END IF;

  SELECT e.status INTO v_document_status
    FROM ghm.commercial_document_status_event e
   WHERE e.document_version_id = p_document_version_id
   ORDER BY e.occurred_at DESC, e.id DESC
   LIMIT 1
   FOR SHARE;

  IF v_document_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Exact commercial document version is not currently approved' USING ERRCODE = '42501';
  END IF;

  -- A consent event without its matching payment attempt is never accepted
  -- as a retry: both are committed in this same transaction.
  SELECT * INTO v_existing_consent
    FROM ghm.commercial_consent_event c
   WHERE c.idempotency_key = p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Commercial consent idempotency conflict' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO ghm.commercial_payment_attempt (
    business_id, subscription_id, price_id, initiated_by, provider_code,
    attempt_status, amount_minor_units, currency_id, billing_interval,
    idempotency_key, expires_at
  ) VALUES (
    p_business_id, v_subscription_id, v_price_id, p_actor, p_provider_code,
    'pending_checkout', v_amount_minor_units, v_currency_id, v_billing_interval,
    p_idempotency_key, v_effective_expiry
  )
  RETURNING * INTO v_attempt;

  INSERT INTO ghm.commercial_consent_event (
    business_id, account_id, document_version_id, consent_action,
    idempotency_key, request_id, source, context, accepted_at
  ) VALUES (
    p_business_id, p_actor, p_document_version_id, 'accepted',
    p_idempotency_key, p_request_id, 'ghm.actor_gateway.commercial_payment_prepare',
    jsonb_build_object(
      'paymentAttemptId', v_attempt.id,
      'subscriptionId', v_subscription_id,
      'planCode', v_plan_code,
      'priceId', v_price_id,
      'providerCode', p_provider_code
    ),
    v_prepared_at
  )
  RETURNING id INTO v_consent_id;

  INSERT INTO ghm.commercial_event (
    business_id, subscription_id, event_type, actor_account_id,
    source, idempotency_key, payload, occurred_at
  ) VALUES (
    p_business_id, v_subscription_id, 'subscription_payment_prepared',
    p_actor, 'ghm.commercial', p_idempotency_key,
    jsonb_build_object(
      'paymentAttemptId', v_attempt.id,
      'consentEventId', v_consent_id,
      'documentVersionId', p_document_version_id,
      'priceId', v_price_id,
      'amountMinorUnits', v_amount_minor_units,
      'currencyId', v_currency_id,
      'billingInterval', v_billing_interval,
      'providerCode', p_provider_code,
      'expiresAt', v_effective_expiry
    ),
    v_prepared_at
  );

  RETURN QUERY SELECT
    v_attempt.id,
    v_consent_id,
    v_attempt.business_id,
    v_attempt.subscription_id,
    v_attempt.price_id,
    v_attempt.provider_code,
    v_attempt.amount_minor_units,
    v_attempt.currency_id,
    v_attempt.billing_interval,
    v_attempt.attempt_status,
    v_attempt.idempotency_key,
    v_attempt.expires_at;
END;
$prepare$;

ALTER FUNCTION ghm.assert_actor_gateway_commercial_payment_prepare(bigint,bigint,uuid,text,text)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_prepare_commercial_payment_with_consent(bigint,bigint,uuid,text,text,bigint,bigint,bigint,text,text,boolean,timestamptz,text)
  OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_commercial_payment_prepare(bigint,bigint,uuid,text,text)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_prepare_commercial_payment_with_consent(bigint,bigint,uuid,text,text,bigint,bigint,bigint,text,text,boolean,timestamptz,text)
  FROM PUBLIC, ghm_runtime, ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_commercial_payment_prepare(bigint,bigint,uuid,text,text)
  TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_prepare_commercial_payment_with_consent(bigint,bigint,uuid,text,text,bigint,bigint,bigint,text,text,boolean,timestamptz,text)
  TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.gateway_prepare_commercial_payment_with_consent(bigint,bigint,uuid,text,text,bigint,bigint,bigint,text,text,boolean,timestamptz,text) IS
  'Atomically records explicit acceptance of an exact currently-approved subscription terms version and prepares one provider-neutral Business payment attempt. Does not initiate checkout or activate a subscription.';

COMMIT;
