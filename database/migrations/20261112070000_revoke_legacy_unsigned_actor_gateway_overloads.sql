-- The original Actor Gateway operations accepted an account ID directly.
-- Signed-assertion versions were added as overloads, but the old signatures
-- retained EXECUTE grants to ghm_actor_gateway. Revoke those obsolete entry
-- points from every application login and PUBLIC. Keep them owned by
-- ghm_schema_owner for controlled maintenance only.
BEGIN;

REVOKE ALL ON FUNCTION ghm.gateway_get_actor_identity(bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.gateway_read_business_registration_identity(bigint, bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.gateway_update_business_registration_identity(bigint, bigint, text, text, text)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.gateway_list_capabilities(bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.gateway_create_capability_draft(bigint, text, text, text, uuid, integer, text, integer)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.gateway_update_capability_draft(bigint, uuid, text, text, text, uuid, integer, text, integer)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.gateway_transition_capability_lifecycle(bigint, uuid, text, uuid, integer)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.gateway_update_business_supplier_classification(bigint, bigint, boolean)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE ALL ON FUNCTION ghm.gateway_update_business_profile(bigint, bigint, jsonb)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

COMMIT;
