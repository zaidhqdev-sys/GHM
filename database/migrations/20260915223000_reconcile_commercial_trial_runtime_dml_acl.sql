BEGIN;

-- The governed trial activation operation performs identity-backed inserts
-- into trial, subscription, and commercial event state. Keep runtime access
-- column-scoped and deny UPDATE/DELETE by omission.
GRANT INSERT (
  business_id,
  plan_version_id,
  activated_by,
  activated_at,
  expires_at,
  lifecycle_status
)
  ON TABLE ghm.commercial_trial
  TO ghm_runtime;

GRANT INSERT (
  business_id,
  plan_version_id,
  price_id,
  trial_id,
  lifecycle_status,
  current_period_start,
  current_period_end
)
  ON TABLE ghm.commercial_subscription
  TO ghm_runtime;

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

GRANT USAGE ON SEQUENCE
  ghm.commercial_trial_id_seq,
  ghm.commercial_subscription_id_seq
TO ghm_runtime;

-- commercial_event is also identity-backed and is inserted by the
-- governed trial operation, so runtime requires its sequence usage.
GRANT USAGE ON SEQUENCE
  ghm.commercial_event_id_seq
TO ghm_runtime;

-- No runtime UPDATE or DELETE privilege is granted for these tables.
-- No runtime access is granted to provider events, payment transactions,
-- or founding allocations by this reconciliation.

COMMIT;
