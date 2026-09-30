-- Establish the dedicated GHM application namespace and relocate the
-- already-qualified first Business Identity slice out of legacy public.
-- Construction-only migration; production cutover is not part of this change.

CREATE SCHEMA IF NOT EXISTS ghm AUTHORIZATION ghm_schema_owner;

ALTER SCHEMA ghm OWNER TO ghm_schema_owner;

ALTER TABLE public.ghm_schema_migrations SET SCHEMA ghm;
ALTER TABLE public.account_identity SET SCHEMA ghm;
ALTER TABLE public.business SET SCHEMA ghm;
ALTER TABLE public.business_membership SET SCHEMA ghm;

GRANT USAGE ON SCHEMA ghm TO ghm_runtime;

GRANT SELECT, UPDATE
  ON TABLE ghm.account_identity
  TO ghm_runtime;

GRANT SELECT, INSERT, UPDATE
  ON TABLE ghm.business
  TO ghm_runtime;

GRANT SELECT, INSERT
  ON TABLE ghm.business_membership
  TO ghm_runtime;

GRANT USAGE
  ON SEQUENCE ghm.account_identity_id_seq,
               ghm.business_id_seq,
               ghm.business_membership_id_seq
  TO ghm_runtime;

-- Future application DML remains explicitly qualified per resource migration.
-- Do not grant blanket table DML to the runtime role.
ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner IN SCHEMA ghm
  GRANT USAGE ON SEQUENCES TO ghm_runtime;
