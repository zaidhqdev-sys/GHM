-- Remove the legacy Commercial runtime sequence privilege from
-- existing sequences and from the schema-owner default ACL.
--
-- The existing Commercial sequences retained USAGE because the
-- privilege was already materialized on the objects. The schema
-- owner also has a default privilege that would grant USAGE to
-- ghm_runtime on future sequences.
--
-- Commercial runtime must not receive direct sequence access.

REVOKE USAGE ON SEQUENCE
  ghm.commercial_plan_id_seq,
  ghm.commercial_plan_version_id_seq,
  ghm.commercial_plan_entitlement_id_seq,
  ghm.commercial_plan_price_id_seq,
  ghm.commercial_trial_id_seq,
  ghm.commercial_subscription_id_seq,
  ghm.commercial_provider_event_id_seq,
  ghm.commercial_payment_attempt_id_seq,
  ghm.commercial_payment_transaction_id_seq,
  ghm.commercial_event_id_seq,
  ghm.commercial_founding_allocation_id_seq
FROM ghm_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner IN SCHEMA ghm
  REVOKE USAGE ON SEQUENCES FROM ghm_runtime;