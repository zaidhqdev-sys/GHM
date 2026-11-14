-- MANUAL CUTOVER ONLY — do not place this file in database/migrations.
-- Apply only after GHM Actor Gateway is deployed, GHM_ACTOR_GATEWAY_URL is configured,
-- and registration-identity read/write routes have passed end-to-end verification.
-- The signed gateway wrappers execute the underlying functions as ghm_schema_owner.
-- The shared runtime login must not be able to supply an arbitrary actor account ID
-- directly to these SECURITY DEFINER functions.
BEGIN;

REVOKE ALL ON FUNCTION ghm.read_business_registration_identity(bigint, bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;
REVOKE ALL ON FUNCTION ghm.update_business_registration_identity(bigint, bigint, text, text, text)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

COMMIT;
