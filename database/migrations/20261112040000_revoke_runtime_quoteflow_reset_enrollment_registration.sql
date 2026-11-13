-- QuoteFlow migration reset enrollment registration is an operator/migration
-- capability. It records approved identity provenance and must not be callable
-- by the ordinary Resource API runtime or any PUBLIC role.
--
-- The migration principal may invoke it through its controlled SET ROLE
-- ghm_schema_owner path. The isolated Authentication Issuer only reads and
-- completes an already-approved enrollment through its separate allow-list.
BEGIN;

REVOKE ALL ON FUNCTION ghm.auth_register_quoteflow_migration_reset_enrollment(
  bigint, text, text, text, text, text
) FROM PUBLIC, ghm_runtime;

COMMIT;
