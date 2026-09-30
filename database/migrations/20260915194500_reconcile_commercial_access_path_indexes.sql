-- Reconcile Commercial access-path indexes with the
-- authoritative Commercial minimum schema contract.
--
-- The existing single-column indexes remain valid for their
-- individual access paths. These composite indexes establish
-- the required Business + chronological access paths.

CREATE INDEX commercial_payment_attempt_business_created_idx
  ON ghm.commercial_payment_attempt (business_id, created_at);

CREATE INDEX commercial_payment_transaction_business_occurred_idx
  ON ghm.commercial_payment_transaction (business_id, occurred_at);