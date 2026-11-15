-- PostgreSQL's built-in default is EXECUTE for PUBLIC on new functions.
-- A per-schema default-privilege REVOKE cannot cancel a global default grant,
-- so remove PUBLIC EXECUTE globally for functions created by ghm_schema_owner.
-- Each intended application function receives an explicit per-role grant.
BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
