-- QuoteFlow account provisioning is a migration/operator capability, not an
-- application runtime operation. Keep it available to the schema owner; the
-- dedicated migrator can invoke it only after SET ROLE ghm_schema_owner.
BEGIN;

REVOKE ALL ON FUNCTION ghm.auth_provision_migration_account(text, text, text, text)
  FROM PUBLIC, ghm_runtime;

COMMIT;
