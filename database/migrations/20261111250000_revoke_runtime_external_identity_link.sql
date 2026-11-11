-- External identity linking is an operator-controlled migration operation.
-- Application authorization resolves an existing mapping; it does not create or
-- move arbitrary (provider, subject) bindings at runtime.
BEGIN;

REVOKE ALL ON FUNCTION ghm.auth_link_external_identity(text, text, bigint)
  FROM PUBLIC, ghm_runtime;

COMMIT;
