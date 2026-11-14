-- These account/session-ID administration operations have no active HTTP or
-- application service callers. Keep the functions available to the schema owner
-- for controlled maintenance, but remove the shared runtime execution path.
BEGIN;

REVOKE ALL ON FUNCTION ghm.auth_revoke_session(bigint, text)
  FROM PUBLIC, ghm_runtime;

REVOKE ALL ON FUNCTION ghm.auth_change_password(bigint, bigint, text, text, text, integer, integer, integer)
  FROM PUBLIC, ghm_runtime;

REVOKE ALL ON FUNCTION ghm.auth_disable_account(bigint)
  FROM PUBLIC, ghm_runtime;

COMMIT;
