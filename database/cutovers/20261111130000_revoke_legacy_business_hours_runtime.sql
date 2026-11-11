-- MANUAL CUTOVER ONLY.
-- Apply only after Actor Gateway routes are deployed and qualified, role identities
-- are verified, and a fresh independently verified production backup exists.
BEGIN;
REVOKE ALL ON FUNCTION ghm.replace_business_hours(bigint,bigint,jsonb) FROM PUBLIC,ghm_runtime;
COMMIT;
