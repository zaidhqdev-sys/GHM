-- MANUAL ROLLBACK ONLY — never include this file in automatic migrations.
-- Restore only the legacy Resource API EXECUTE grant removed by the paired
-- supplier-classification manual cutover. PUBLIC, migrator and Gateway grants
-- remain revoked. Reapply the paired cutover after the rollback rehearsal.
BEGIN;
GRANT EXECUTE ON FUNCTION ghm.update_business_supplier_classification(bigint,bigint,boolean)
  TO ghm_runtime;
COMMIT;
