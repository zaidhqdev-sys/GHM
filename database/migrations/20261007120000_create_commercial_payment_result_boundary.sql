BEGIN;

CREATE OR REPLACE FUNCTION ghm.commercial_apply_payment_result(
  p_payment_attempt_id bigint,
  p_provider_code text,
  p_external_provider_event_id text,
  p_provider_event_type text,
  p_provider_payload_hash text,
  p_transaction_kind text,
  p_transaction_status text,
  p_provider_transaction_reference text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now(),
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS ghm.commercial_payment_transaction
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_attempt ghm.commercial_payment_attempt;
  v_subscription ghm.commercial_subscription;
  v_price ghm.commercial_plan_price;
  v_plan_version ghm.commercial_plan_version;
  v_provider_event ghm.commercial_provider_event;
  v_existing ghm.commercial_payment_transaction;
  v_transaction ghm.commercial_payment_transaction;
  v_event_type text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_founding_sequence integer;
BEGIN
  IF p_payment_attempt_id IS NULL OR p_payment_attempt_id <= 0
     OR p_provider_code IS NULL OR p_provider_code !~ '^[a-z][a-z0-9_]{1,49}$'
     OR p_external_provider_event_id IS NULL OR length(p_external_provider_event_id) NOT BETWEEN 1 AND 200
     OR p_provider_event_type IS NULL OR length(p_provider_event_type) NOT BETWEEN 1 AND 100
     OR p_provider_payload_hash IS NULL OR p_provider_payload_hash !~ '^[0-9a-f]{64}$'
     OR p_transaction_kind IS NULL OR p_transaction_kind NOT IN ('payment','refund','reversal','chargeback')
     OR p_transaction_status IS NULL OR p_transaction_status NOT IN ('pending','succeeded','failed')
     OR p_occurred_at IS NULL
     OR p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid commercial payment result input';
  END IF;

  SELECT * INTO v_attempt
  FROM ghm.commercial_payment_attempt
  WHERE id = p_payment_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial payment attempt not found';
  END IF;

  IF v_attempt.subscription_id IS NULL THEN
    RAISE EXCEPTION 'commercial payment attempt has no subscription';
  END IF;

  SELECT * INTO v_subscription
  FROM ghm.commercial_subscription
  WHERE id = v_attempt.subscription_id
  FOR UPDATE;

  SELECT * INTO v_price
  FROM ghm.commercial_plan_price
  WHERE id = v_attempt.price_id;

  SELECT * INTO v_plan_version
  FROM ghm.commercial_plan_version
  WHERE id = v_subscription.plan_version_id
  FOR UPDATE;

  INSERT INTO ghm.commercial_provider_event (
    provider_code, provider_event_id, event_type, payload_hash,
    occurred_at, processing_status, processed_at, metadata
  )
  VALUES (
    p_provider_code, p_external_provider_event_id, p_provider_event_type,
    p_provider_payload_hash, p_occurred_at, 'received', NULL, p_metadata
  )
  ON CONFLICT (provider_code, provider_event_id) DO NOTHING
  RETURNING * INTO v_provider_event;

  IF v_provider_event.id IS NULL THEN
    SELECT * INTO v_provider_event
    FROM ghm.commercial_provider_event
    WHERE provider_code = p_provider_code
      AND provider_event_id = p_external_provider_event_id
    FOR UPDATE;

    SELECT * INTO v_existing
    FROM ghm.commercial_payment_transaction
    WHERE provider_event_id = v_provider_event.id;

    IF FOUND THEN
      RETURN v_existing;
    END IF;

    IF v_provider_event.payload_hash <> p_provider_payload_hash THEN
      RAISE EXCEPTION 'commercial provider event payload hash conflict';
    END IF;
  END IF;

  IF p_transaction_status = 'succeeded' AND p_transaction_kind = 'payment' THEN
    v_period_start := p_occurred_at;
    v_period_end := p_occurred_at + interval '1 month';

    UPDATE ghm.commercial_subscription
    SET lifecycle_status = 'active',
        current_period_start = v_period_start,
        current_period_end = v_period_end,
        cancel_at_period_end = false,
        cancelled_at = NULL,
        provider_reference = NULLIF(btrim(p_provider_transaction_reference), '')
    WHERE id = v_subscription.id;

    UPDATE ghm.commercial_payment_attempt
    SET attempt_status = 'succeeded',
        checkout_reference = COALESCE(checkout_reference, NULLIF(btrim(p_provider_transaction_reference), '')),
        failure_code = NULL,
        failure_message = NULL
    WHERE id = v_attempt.id;

    v_event_type := 'subscription_activated';

    IF v_price.price_kind = 'founding' AND v_plan_version.founding_limit IS NOT NULL THEN
      SELECT founding_sequence INTO v_founding_sequence
      FROM ghm.commercial_founding_allocation
      WHERE subscription_id = v_subscription.id;

      IF v_founding_sequence IS NULL THEN
        SELECT COALESCE(MAX(founding_sequence), 0) + 1
        INTO v_founding_sequence
        FROM ghm.commercial_founding_allocation
        WHERE plan_version_id = v_plan_version.id;

        IF v_founding_sequence <= v_plan_version.founding_limit THEN
          INSERT INTO ghm.commercial_founding_allocation (
            business_id, subscription_id, payment_transaction_id,
            plan_version_id, founding_sequence, protected_until, allocated_at
          )
          VALUES (
            v_subscription.business_id, v_subscription.id, 0,
            v_plan_version.id, v_founding_sequence,
            p_occurred_at + make_interval(months => COALESCE(v_plan_version.founding_protection_months, 12)),
            p_occurred_at
          );
        ELSE
          v_founding_sequence := NULL;
        END IF;
      END IF;
    END IF;
  ELSE
    UPDATE ghm.commercial_payment_attempt
    SET attempt_status = CASE WHEN p_transaction_status = 'failed' THEN 'failed' ELSE 'pending_payment' END,
        failure_code = CASE WHEN p_transaction_status = 'failed' THEN p_provider_event_type ELSE NULL END,
        failure_message = CASE WHEN p_transaction_status = 'failed' THEN 'Provider payment result failed' ELSE NULL END
    WHERE id = v_attempt.id;

    IF p_transaction_status = 'failed' AND p_transaction_kind = 'payment' THEN
      UPDATE ghm.commercial_subscription
      SET lifecycle_status = CASE
        WHEN lifecycle_status = 'trialing' THEN lifecycle_status
        ELSE 'past_due'
      END
      WHERE id = v_subscription.id;
      v_event_type := 'subscription_payment_failed';
    ELSE
      v_event_type := 'subscription_payment_failed';
    END IF;
  END IF;

  INSERT INTO ghm.commercial_payment_transaction (
    business_id, subscription_id, payment_attempt_id, provider_event_id,
    transaction_kind, transaction_status, amount_minor_units, currency_id,
    provider_transaction_reference, occurred_at, metadata
  )
  VALUES (
    v_attempt.business_id, v_attempt.subscription_id, v_attempt.id, v_provider_event.id,
    p_transaction_kind, p_transaction_status, v_attempt.amount_minor_units, v_attempt.currency_id,
    NULLIF(btrim(p_provider_transaction_reference), ''), p_occurred_at, p_metadata
  )
  RETURNING * INTO v_transaction;

  UPDATE ghm.commercial_provider_event
  SET processing_status = 'processed',
      processed_at = clock_timestamp()
  WHERE id = v_provider_event.id;

  UPDATE ghm.commercial_founding_allocation
  SET payment_transaction_id = v_transaction.id
  WHERE subscription_id = v_subscription.id
    AND payment_transaction_id = 0;

  INSERT INTO ghm.commercial_event (
    business_id, subscription_id, event_type, actor_account_id,
    source, idempotency_key, payload, occurred_at
  )
  VALUES (
    v_attempt.business_id, v_subscription.id, v_event_type, NULL,
    'ghm.commercial.provider',
    'provider:' || p_provider_code || ':' || p_external_provider_event_id,
    jsonb_build_object(
      'payment_attempt_id', v_attempt.id,
      'payment_transaction_id', v_transaction.id,
      'provider_code', p_provider_code,
      'provider_event_id', p_external_provider_event_id,
      'transaction_status', p_transaction_status
    ),
    p_occurred_at
  );

  RETURN v_transaction;
END;
$$;

ALTER FUNCTION ghm.commercial_apply_payment_result(
  bigint,text,text,text,text,text,text,text,timestamptz,jsonb
) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.commercial_apply_payment_result(
  bigint,text,text,text,text,text,text,text,timestamptz,jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ghm.commercial_apply_payment_result(
  bigint,text,text,text,text,text,text,text,timestamptz,jsonb
) TO ghm_runtime;

COMMIT;
