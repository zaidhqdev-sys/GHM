-- MANUAL CUTOVER ONLY. Apply only after signed gateway routes are deployed and qualified,
-- Render's production role model is resolved, and a fresh verified production backup exists.
-- This file is intentionally excluded from automatic migration execution.
BEGIN;
REVOKE ALL ON FUNCTION ghm.replace_business_capability_assertions(bigint,bigint,jsonb)
 FROM PUBLIC,ghm_runtime,ghm_migrator,ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.transition_business_capability_verification(bigint,text,text,bigint,text)
 FROM PUBLIC,ghm_runtime,ghm_migrator,ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.transition_business_capability_evidence(bigint,text,bigint,text)
 FROM PUBLIC,ghm_runtime,ghm_migrator,ghm_actor_gateway;
COMMIT;
