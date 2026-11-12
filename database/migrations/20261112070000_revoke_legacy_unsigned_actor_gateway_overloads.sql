-- The original assert_actor_gateway helper accepts an account ID directly.
-- It is not used by the current signed/typed gateway operations and must not
-- remain executable by any application login or PUBLIC. Keep it owned by
-- ghm_schema_owner for controlled maintenance only.
BEGIN;

REVOKE ALL ON FUNCTION ghm.assert_actor_gateway(bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

COMMIT;
