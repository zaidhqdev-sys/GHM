-- MANUAL CUTOVER ONLY. Apply only after signed gateway routes are deployed and qualified,
-- Render's production role model is resolved, and a fresh verified production backup exists.
-- This file is intentionally excluded from automatic migration execution.
BEGIN;
REVOKE INSERT ON TABLE ghm.business_capability_evidence FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE INSERT (business_capability_id,evidence_type,title,description,issuer_name,reference_number,evidence_url,issued_on,expires_on,visibility,verification_status,submitted_by) ON TABLE ghm.business_capability_evidence FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE USAGE,SELECT ON SEQUENCE ghm.business_capability_evidence_id_seq FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.replace_business_capability_assertions(bigint,bigint,jsonb)
 FROM PUBLIC,ghm_runtime,ghm_migrator,ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.transition_business_capability_verification(bigint,text,text,bigint,text)
 FROM PUBLIC,ghm_runtime,ghm_migrator,ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.transition_business_capability_evidence(bigint,text,bigint,text)
 FROM PUBLIC,ghm_runtime,ghm_migrator,ghm_actor_gateway;
COMMIT;
