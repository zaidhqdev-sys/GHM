BEGIN;

-- commercial_event is internal governed state.
-- Remove the column-scoped runtime SELECT introduced by the preceding
-- reconciliation migration. Audit evidence is verified through the
-- governed schema-owner qualification path, not direct runtime access.
REVOKE SELECT (
  id,
  business_id,
  subscription_id,
  event_type,
  actor_account_id,
  source,
  payload
)
  ON TABLE ghm.commercial_event
  FROM ghm_runtime;

COMMIT;