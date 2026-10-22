-- Permit the runtime to lock an authenticated account row and update only profile fields.
-- PostgreSQL requires UPDATE privilege on at least one target-table column for SELECT ... FOR UPDATE.
-- The identity repository uses this lock to serialize authenticated account/business creation.
-- Keep this column-scoped: the runtime must not be able to change role or system-admin authority.
GRANT UPDATE (
  full_name,
  phone,
  avatar_ref,
  connect_role,
  business_operator_intent,
  updated_at
)
ON TABLE ghm.account_identity
TO ghm_runtime;
