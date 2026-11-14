-- MANUAL CUTOVER ONLY.
-- Apply only after the Resource API and Actor Gateway Saved Business routes are deployed,
-- end-to-end qualified, and the production role model plus fresh verified backup gates pass.
-- This cutover is never part of the automatic migration chain.

BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE
  ON TABLE ghm.saved_business
  FROM PUBLIC, ghm_runtime;

REVOKE SELECT (id, account_id, business_id, created_at)
  ON TABLE ghm.saved_business
  FROM PUBLIC, ghm_runtime;

REVOKE ALL
  ON SEQUENCE ghm.saved_business_id_seq
  FROM PUBLIC, ghm_runtime;

REVOKE ALL
  ON FUNCTION ghm.create_saved_business(bigint, bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

REVOKE ALL
  ON FUNCTION ghm.delete_saved_business(bigint, bigint)
  FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway;

COMMIT;
