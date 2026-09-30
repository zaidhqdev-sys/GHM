-- Dedicated underlying primitive for the governed Project Quote acceptance
-- capability. This does NOT create a generic Project lifecycle operation.
GRANT UPDATE (status) ON TABLE ghm.project TO ghm_runtime;

COMMENT ON TABLE ghm.project IS
  'Project lifecycle status remains application-governed. Runtime column-level UPDATE(status) exists only as the underlying primitive for explicitly authorized Project Quote acceptance.';

