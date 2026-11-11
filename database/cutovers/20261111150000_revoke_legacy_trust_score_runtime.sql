-- MANUAL CUTOVER ONLY.
-- Apply only after Actor Gateway routes are deployed and qualified, role identities
-- are verified, and a fresh independently verified production backup exists.
BEGIN;
REVOKE ALL ON FUNCTION ghm.calculate_business_trust_score(bigint,bigint) FROM PUBLIC,ghm_runtime;
COMMIT;
