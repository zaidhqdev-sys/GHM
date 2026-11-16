-- Narrow Resource API Business creation to the exact fields used by the repository.
-- Existing SELECT and sequence privileges are unchanged.
-- Construction-only: production rollout remains gated by exact-prefix qualification.
-- These grants are deliberately column-scoped; caller authorization remains in the
-- Business Identity repository until a separately qualified actor-bound DB operation exists.

REVOKE INSERT ON TABLE ghm.business FROM ghm_runtime;

GRANT INSERT (name, slug, verification_status, is_active)
  ON TABLE ghm.business
  TO ghm_runtime;

REVOKE INSERT ON TABLE ghm.business_membership FROM ghm_runtime;

GRANT INSERT (
  business_id,
  account_id,
  membership_role,
  membership_status,
  created_by
)
  ON TABLE ghm.business_membership
  TO ghm_runtime;
