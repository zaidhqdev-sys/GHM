-- Reconcile Commercial payment transaction lifecycle with the
-- authoritative Commercial capability contract.
--
-- The contract explicitly permits:
--   pending
--   succeeded
--   failed
--
-- Connect's provider-result boundary also produces failed
-- payment transactions. This forward migration restores the
-- contract-defined failed state without rewriting an applied
-- migration.

ALTER TABLE ghm.commercial_payment_transaction
  DROP CONSTRAINT commercial_payment_transaction_status_valid;

ALTER TABLE ghm.commercial_payment_transaction
  ADD CONSTRAINT commercial_payment_transaction_status_valid
  CHECK (
    transaction_status IN ('pending', 'succeeded', 'failed')
  );