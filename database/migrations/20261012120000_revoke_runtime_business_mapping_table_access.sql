-- Remove legacy direct runtime reads of external business mappings.
-- Payment preparation now resolves mappings through the SECURITY DEFINER lookup
-- function. Keep runtime access limited to EXECUTE on the lookup function.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE ghm.business_external_mapping
  FROM ghm_runtime;
