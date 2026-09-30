BEGIN;

-- Review/Trust-owned derived values are physically stored on Business to
-- preserve the source-of-truth public Business shape while keeping mutation
-- ownership outside ordinary Business identity/profile operations.

ALTER TABLE ghm.business
  ADD COLUMN rating numeric(3, 2) NOT NULL DEFAULT 0,
  ADD COLUMN review_count integer NOT NULL DEFAULT 0;

ALTER TABLE ghm.business
  ADD CONSTRAINT business_rating_check
  CHECK (rating BETWEEN 0 AND 5),
  ADD CONSTRAINT business_review_count_check
  CHECK (review_count >= 0);

COMMENT ON COLUMN ghm.business.rating IS
  'Review/Trust-owned derived aggregate: average rating of approved reviews only; not caller-supplied Business state.';

COMMENT ON COLUMN ghm.business.review_count IS
  'Review/Trust-owned derived aggregate: count of approved reviews only; not caller-supplied Business state.';

COMMIT;
