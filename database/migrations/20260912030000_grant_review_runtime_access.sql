BEGIN;

GRANT USAGE ON SCHEMA ghm TO ghm_runtime;

GRANT SELECT
  ON TABLE ghm.review
  TO ghm_runtime;

GRANT INSERT (
  business_id,
  reviewer_id,
  reviewer_name,
  rating,
  title,
  body,
  moderation_status,
  moderation_reason,
  moderated_by,
  moderated_at
)
  ON TABLE ghm.review
  TO ghm_runtime;

GRANT UPDATE (
  moderation_status,
  moderation_reason,
  moderated_by,
  moderated_at,
  updated_at
)
  ON TABLE ghm.review
  TO ghm_runtime;

GRANT USAGE
  ON SEQUENCE ghm.review_id_seq
  TO ghm_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner IN SCHEMA ghm
  GRANT USAGE ON SEQUENCES TO ghm_runtime;

-- No DELETE privilege is granted to ghm_runtime.
-- No blanket table DML is granted.
-- Review authorization, reviewer binding, target eligibility,
-- moderation state, and aggregate ownership remain explicit
-- repository/service responsibilities.

COMMIT;
