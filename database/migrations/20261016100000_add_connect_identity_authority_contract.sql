-- Canonical Connect identity intent and reviewer-authority read contract.
-- Null Connect role is deliberate: legacy GHM business accounts must not be
-- guessed into contractor/supplier categories during migration.
ALTER TABLE ghm.account_identity
  ADD COLUMN connect_role text,
  ADD COLUMN business_operator_intent boolean NOT NULL DEFAULT false;

ALTER TABLE ghm.account_identity
  ADD CONSTRAINT account_identity_connect_role_check
  CHECK (connect_role IS NULL OR connect_role IN ('customer', 'contractor', 'supplier'));

COMMENT ON COLUMN ghm.account_identity.connect_role IS
  'Explicit ZAID Connect product role. NULL means unresolved; never infer contractor/supplier from GHM role.';
COMMENT ON COLUMN ghm.account_identity.business_operator_intent IS
  'Explicit account-level intent to operate a business in ZAID Connect; does not grant business membership or permissions.';

CREATE TABLE ghm.connect_founder_directory_reviewer (
  account_id bigint PRIMARY KEY REFERENCES ghm.account_identity(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  granted_by_account_id bigint REFERENCES ghm.account_identity(id) ON DELETE RESTRICT,
  grant_reason text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT connect_founder_reviewer_reason_nonblank CHECK (btrim(grant_reason) <> ''),
  CONSTRAINT connect_founder_reviewer_revocation_consistent CHECK (
    (is_active = true AND revoked_at IS NULL) OR
    (is_active = false AND revoked_at IS NOT NULL)
  )
);

ALTER TABLE ghm.connect_founder_directory_reviewer OWNER TO ghm_schema_owner;
REVOKE ALL ON TABLE ghm.connect_founder_directory_reviewer FROM PUBLIC;
REVOKE ALL ON TABLE ghm.connect_founder_directory_reviewer FROM ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.auth_read_connect_identity_authority(p_account_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ghm, pg_temp
AS $$
  SELECT jsonb_build_object(
    'connectRole', ai.connect_role,
    'businessOperatorIntent', ai.business_operator_intent,
    'isSystemAdmin', ai.is_system_admin,
    'isDirectoryListingFounderReviewer', EXISTS (
      SELECT 1
      FROM ghm.connect_founder_directory_reviewer r
      WHERE r.account_id = ai.id
        AND r.is_active = true
        AND r.revoked_at IS NULL
    )
  )
  FROM ghm.account_identity ai
  WHERE ai.id = p_account_id
$$;

ALTER FUNCTION ghm.auth_read_connect_identity_authority(bigint) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_read_connect_identity_authority(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_read_connect_identity_authority(bigint) TO ghm_runtime;
