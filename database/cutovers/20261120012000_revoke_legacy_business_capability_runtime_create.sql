-- MANUAL CUTOVER ONLY. Apply only after the signed Business Capability
-- create route is deployed and qualified, the Actor Gateway principal is
-- provisioned, Render's role model is resolved, and a fresh verified backup
-- exists. This file is intentionally excluded from automatic migrations.
BEGIN;

-- The signed SECURITY DEFINER Gateway operations own the only intended mutation
-- paths after cutover. Runtime and migrator callers must not bypass their HMAC,
-- actor, membership, catalogue and append-only checks with direct INSERT.
-- Revoke the historical column-level grant as well as any table-level grant.
REVOKE INSERT (
  business_id,
  capability_id,
  proficiency_level,
  description,
  effective_from,
  effective_until,
  source_reference,
  created_by
)
ON TABLE ghm.business_capability
FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE INSERT ON TABLE ghm.business_capability
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;
REVOKE USAGE, SELECT ON SEQUENCE ghm.business_capability_id_seq
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

COMMIT;
