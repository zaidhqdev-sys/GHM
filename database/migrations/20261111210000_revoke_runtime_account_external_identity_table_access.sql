-- External person identity mappings are accessed through the governed SECURITY DEFINER
-- lookup/link/bootstrap functions. The shared runtime must not enumerate the mapping table
-- or consume its identity sequence directly.
BEGIN;

REVOKE ALL ON TABLE ghm.account_external_identity
  FROM PUBLIC, ghm_runtime;

REVOKE ALL ON SEQUENCE ghm.account_external_identity_id_seq
  FROM PUBLIC, ghm_runtime;

-- Preserve the narrow application operations; their SECURITY DEFINER owner is
-- ghm_schema_owner and retains the underlying table/sequence access.
GRANT EXECUTE ON FUNCTION ghm.auth_lookup_external_identity(text, text)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_link_external_identity(text, text, bigint)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_bootstrap_external_identity(text, text, text, text)
  TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.auth_provision_migration_account(text, text, text, text)
  TO ghm_runtime;

COMMIT;
