-- MANUAL CUTOVER ONLY.
-- Apply only after Actor Gateway routes are deployed and qualified, role identities
-- are verified, and a fresh independently verified production backup exists.
BEGIN;
REVOKE ALL ON FUNCTION ghm.set_business_logo_object(bigint,bigint,bigint) FROM PUBLIC,ghm_runtime;
COMMIT;
