-- Linking a provider business ID to an existing GHM business is a
-- controlled migration/operator operation. Product request paths resolve the
-- mapping read-only; no active runtime caller needs to create it.
BEGIN;

REVOKE ALL ON FUNCTION ghm.auth_link_business_external_mapping(text, text, bigint)
  FROM PUBLIC, ghm_runtime;

COMMIT;
