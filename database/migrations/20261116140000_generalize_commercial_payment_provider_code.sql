BEGIN;

ALTER TABLE ghm.commercial_payment_attempt
  DROP CONSTRAINT commercial_payment_attempt_provider_code_valid;

ALTER TABLE ghm.commercial_payment_attempt
  ADD CONSTRAINT commercial_payment_attempt_provider_code_valid
  CHECK (
    provider_code IS NULL
    OR provider_code ~ '^[a-z][a-z0-9_]{1,49}$'
  );

COMMIT;
