-- External identity bootstrap is not part of the active Connect authorization flow.
-- New identities remain unmapped until explicitly linked through the governed
-- migrator/schema-owner path; the shared runtime must not create active accounts.
BEGIN;

REVOKE ALL ON FUNCTION ghm.auth_bootstrap_external_identity(text, text, text, text)
  FROM PUBLIC, ghm_runtime;

COMMIT;
