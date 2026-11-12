-- Functions created by ghm_schema_owner in the application schema must
-- not become callable by PUBLIC through PostgreSQL's default function ACL.
-- Each application role receives explicit EXECUTE grants in its own migration.
BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner IN SCHEMA ghm
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
