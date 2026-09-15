-- Reconcile the already-applied Commercial schema with the
-- authoritative Commercial minimum schema contract.
--
-- The subscription current-state uniqueness boundary is already
-- established by 20260915150000_create_commercial_schema.sql and
-- is intentionally not recreated here.
--
-- This migration reconciles only the payment transaction lifecycle
-- states defined by the authoritative contract.

ALTER TABLE ghm.commercial_payment_transaction
  DROP CONSTRAINT commercial_payment_transaction_status_valid;

ALTER TABLE ghm.commercial_payment_transaction
  ADD CONSTRAINT commercial_payment_transaction_status_valid
  CHECK (
    transaction_status IN ('pending', 'succeeded')
  );
