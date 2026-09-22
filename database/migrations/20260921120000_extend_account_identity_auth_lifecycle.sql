-- Extend ghm.account_identity with durable auth lifecycle and system-admin state.
-- Construction-only. No Auth API, JWT cutover, product migration, or secrets.

ALTER TABLE ghm.account_identity
  ADD COLUMN account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN is_system_admin boolean NOT NULL DEFAULT false;

ALTER TABLE ghm.account_identity
  ADD CONSTRAINT account_identity_account_status_check
    CHECK (account_status IN ('active', 'disabled'));

-- Preserve governed system-admin from existing coarse role without deleting role.
UPDATE ghm.account_identity
   SET is_system_admin = true
 WHERE role = 'admin'
   AND is_system_admin = false;

COMMENT ON COLUMN ghm.account_identity.account_status IS
  'GHM account lifecycle: active | disabled. Disabled accounts must not authenticate.';

COMMENT ON COLUMN ghm.account_identity.is_system_admin IS
  'Governed GHM system-admin state. Not JWT authority. Distinct from business_membership.administrator.';
