-- MANUAL CUTOVER ONLY — never include this file in automatic migrations.
-- Apply only after the signed business.profile.update Gateway route is
-- deployed, end-to-end verified, and rollback has been rehearsed.
BEGIN;
REVOKE ALL ON FUNCTION ghm.update_business_profile(bigint,bigint,jsonb)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;
COMMIT;
