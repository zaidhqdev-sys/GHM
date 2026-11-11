-- MANUAL CUTOVER ONLY.
-- Apply only after Actor Gateway routes are deployed and qualified, role identities
-- are verified, and a fresh independently verified production backup exists.
BEGIN;
REVOKE ALL ON FUNCTION ghm.calculate_business_trust_score(bigint,bigint) FROM PUBLIC,ghm_runtime;
REVOKE SELECT ON TABLE ghm.trust_score FROM PUBLIC,ghm_runtime;
REVOKE ALL ON SEQUENCE ghm.trust_score_id_seq FROM PUBLIC,ghm_runtime;
COMMIT;
