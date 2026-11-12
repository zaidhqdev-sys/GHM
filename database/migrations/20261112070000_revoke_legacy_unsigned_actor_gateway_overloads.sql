-- The original Actor Gateway operations accepted an account ID directly.
-- Signed-assertion versions were added as overloads, but the old signatures
-- retained EXECUTE grants to ghm_actor_gateway. The original assert_actor_gateway
-- helper is also an unsigned identity probe and is not used by the current
-- typed gateway. Revoke these obsolete entry points from every application
-- login and PUBLIC. Keep them owned by ghm_schema_owner for controlled maintenance only.
BEGIN;

REVOKE ALL ON FUNCTION ghm.assert_actor_gateway(bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

COMMIT;
