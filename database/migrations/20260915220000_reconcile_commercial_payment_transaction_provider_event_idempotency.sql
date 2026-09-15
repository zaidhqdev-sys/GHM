-- Reconcile the Commercial payment transaction idempotency boundary
-- with the authoritative Commercial capability contract.
--
-- A provider event is uniquely identified by provider code plus the
-- external provider event ID. Once processed, that provider event may
-- produce at most one payment transaction.
--
-- This partial unique index preserves nullable provider_event_id for
-- transactions that do not originate from a provider event and does
-- not prevent multiple transactions for the same payment attempt when
-- those transactions represent distinct financial events.

CREATE UNIQUE INDEX commercial_payment_transaction_provider_event_uq
  ON ghm.commercial_payment_transaction (provider_event_id)
  WHERE provider_event_id IS NOT NULL;