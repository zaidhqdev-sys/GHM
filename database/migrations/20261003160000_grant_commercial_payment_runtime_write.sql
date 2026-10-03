BEGIN;

-- Commercial payment preparation is an application-governed write boundary.
-- Grant only the columns written by the provider-neutral preparation path.
-- No UPDATE/DELETE privilege is granted here.
GRANT INSERT (
  business_id,
  subscription_id,
  price_id,
  initiated_by,
  attempt_status,
  amount_minor_units,
  currency_id,
  billing_interval,
  idempotency_key,
  expires_at
)
  ON TABLE ghm.commercial_payment_attempt
  TO ghm_runtime;

GRANT USAGE
  ON SEQUENCE ghm.commercial_payment_attempt_id_seq
  TO ghm_runtime;

-- Payment preparation records its governed commercial event atomically.
-- No UPDATE/DELETE privilege is granted here.
GRANT INSERT (
  business_id,
  subscription_id,
  event_type,
  actor_account_id,
  source,
  idempotency_key,
  payload,
  occurred_at
)
  ON TABLE ghm.commercial_event
  TO ghm_runtime;

GRANT USAGE
  ON SEQUENCE ghm.commercial_event_id_seq
  TO ghm_runtime;

COMMIT;
