-- The Connect commercial payment-preparation route calls this lookup as
-- ghm_runtime. The migrator does not call it; its schema-owner SET ROLE is
-- the migration authority. Remove the redundant direct application grant.
REVOKE EXECUTE ON FUNCTION ghm.auth_lookup_business_external_mapping(text, text)
  FROM ghm_migrator;
