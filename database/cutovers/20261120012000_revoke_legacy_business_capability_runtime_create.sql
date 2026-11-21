-- MANUAL CUTOVER ONLY. Apply only after the signed Business Capability
-- create route is deployed and qualified, the Actor Gateway principal is
-- provisioned, Render's role model is resolved, and a fresh verified backup
-- exists. This file is intentionally excluded from automatic migrations.
BEGIN;

-- The signed SECURITY DEFINER Gateway operation owns the only intended create
-- path after cutover. Runtime and migrator callers must not bypass its HMAC,
-- actor, membership, catalogue and append-only checks with direct INSERT.
REVOKE INSERT ON TABLE ghm.business_capability
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;
REVOKE USAGE, SELECT ON SEQUENCE ghm.business_capability_id_seq
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

COMMIT;
