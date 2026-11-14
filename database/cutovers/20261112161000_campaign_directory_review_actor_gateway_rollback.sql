-- MANUAL ROLLBACK ONLY — do not place this file in database/migrations.
-- Use only after the Actor Gateway routes are out of traffic and the Resource
-- API has been rolled back to a version that calls the legacy functions.
-- This restores the legacy direct runtime grants and disables the three new
-- Actor Gateway wrappers. It does not roll back migration history or drop code.
BEGIN;

DO $operator_guard$
BEGIN
  IF session_user IS DISTINCT FROM 'ghm_migrator'
     OR current_user IS DISTINCT FROM 'ghm_schema_owner' THEN
    RAISE EXCEPTION 'Campaign/review gateway rollback requires session_user=ghm_migrator and current_user=ghm_schema_owner';
  END IF;
END;
$operator_guard$;

GRANT EXECUTE ON FUNCTION ghm.create_campaign(bigint,bigint,text) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.update_campaign(bigint,bigint,text,text) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.get_business_directory_review_presentation(bigint,bigint) TO ghm_runtime;

REVOKE ALL ON FUNCTION ghm.gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text) FROM ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text) FROM ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint) FROM ghm_actor_gateway;

COMMIT;
