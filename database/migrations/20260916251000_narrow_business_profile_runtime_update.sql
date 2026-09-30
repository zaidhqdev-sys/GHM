-- Narrow ghm.business runtime UPDATE after Business Profile Trust-input extension.
-- Table-level UPDATE cannot be narrowed by column REVOKE alone; revoke then re-grant
-- only Review-owned aggregates. Profile mutation remains function-governed.
-- Construction-only. No production cutover is authorized.

REVOKE UPDATE ON TABLE ghm.business FROM ghm_runtime;

GRANT UPDATE (rating, review_count, updated_at)
  ON TABLE ghm.business
  TO ghm_runtime;

GRANT SELECT ON TABLE ghm.business TO ghm_runtime;
