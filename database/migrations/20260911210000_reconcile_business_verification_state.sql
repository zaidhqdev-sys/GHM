BEGIN;

-- Reconcile the construction Business identity with the authoritative
-- Zaid Connect distinction between verification workflow, verification flag,
-- and independent activation/publication state.

ALTER TABLE ghm.business
  ADD COLUMN is_verified boolean NOT NULL DEFAULT false;

-- The original construction-only vocabulary used `pending`. Preserve the
-- existing construction meaning while moving to the reconciled vocabulary.
UPDATE ghm.business
SET verification_status = 'unverified'
WHERE verification_status = 'pending';

ALTER TABLE ghm.business
  DROP CONSTRAINT business_verification_status_check;

ALTER TABLE ghm.business
  ADD CONSTRAINT business_verification_status_check
  CHECK (
    verification_status IN (
      'unverified',
      'under_review',
      'information_requested',
      'approved',
      'rejected'
    )
  );

ALTER TABLE ghm.business
  ADD CONSTRAINT business_verified_state_check
  CHECK (
    (verification_status = 'approved' AND is_verified = true)
    OR
    (verification_status <> 'approved' AND is_verified = false)
  );

COMMENT ON COLUMN ghm.business.verification_status IS
  'Governed Business verification workflow state.';

COMMENT ON COLUMN ghm.business.is_verified IS
  'Governed verification flag. True only for an approved Business; not ordinary owner-editable profile state.';

COMMENT ON COLUMN ghm.business.is_active IS
  'Independent Business activation/publication state; not equivalent to verification.';

COMMIT;
