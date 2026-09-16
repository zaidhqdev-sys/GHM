BEGIN;

-- The governed trial qualification/read path requires audit evidence from
-- commercial_event while preserving the internal-state table boundary.
-- Keep runtime access column-scoped; do not grant blanket table SELECT.
GRANT SELECT (
  id,
  business_id,
  subscription_id,
  event_type,
  actor_account_id,
  source,
  payload
)
  ON TABLE ghm.commercial_event
  TO ghm_runtime;

-- No runtime SELECT is granted for idempotency_key, occurred_at, or created_at.
-- No runtime INSERT/UPDATE/DELETE privilege is changed by this reconciliation.

COMMIT;