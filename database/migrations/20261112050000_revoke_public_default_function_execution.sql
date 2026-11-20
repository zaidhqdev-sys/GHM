-- PostgreSQL's built-in default is EXECUTE for PUBLIC on new functions.
-- A per-schema default-privilege REVOKE cannot cancel a global default grant,
-- so remove PUBLIC EXECUTE globally for functions created by ghm_schema_owner.
-- The historical ghm_runtime default is also removed at both scopes. Existing
-- per-function grants are untouched; intended runtime functions remain covered
-- by explicit grants and the runtime's exact SECURITY DEFINER allow-list.
BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Defensive cleanup for a legacy/out-of-band role default, if present.
-- This affects future functions only and does not revoke current function ACLs.
ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner
  REVOKE EXECUTE ON FUNCTIONS FROM ghm_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner IN SCHEMA ghm
  REVOKE EXECUTE ON FUNCTIONS FROM ghm_runtime;

COMMIT;
