-- MANUAL CUTOVER ONLY — do not place this file in database/migrations.
-- Apply only after GHM Actor Gateway is deployed, GHM_ACTOR_GATEWAY_URL is configured,
-- and the capability administration routes have passed end-to-end verification.
-- The gateway SECURITY DEFINER wrappers remain the only callable capability write surface.
BEGIN;

REVOKE ALL ON FUNCTION ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

COMMIT;
