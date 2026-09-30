-- Reconcile the Commercial subscription access path with the
-- authoritative minimum schema contract.
--
-- The contract requires subscription lookup by Business and
-- lifecycle. Existing single-column indexes do not establish
-- that composite access path.

CREATE INDEX commercial_subscription_business_lifecycle_idx
  ON ghm.commercial_subscription (
    business_id,
    lifecycle_status
  );