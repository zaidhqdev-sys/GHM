BEGIN;

-- Preserve Connect's existing protected featured-listing read behavior.
-- No public or Business-owner write authority is introduced.
ALTER TABLE ghm.business
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ghm.business.is_featured IS
  'Protected directory presentation state. Defaults to false; not owner-editable and not derived from subscription, verification, Trust, or reviews.';

CREATE INDEX IF NOT EXISTS business_public_directory_featured_order_idx
  ON ghm.business (is_featured DESC, rating DESC, created_at DESC, id ASC)
  WHERE is_active = true
    AND is_verified = true
    AND verification_status = 'approved';

COMMIT;
