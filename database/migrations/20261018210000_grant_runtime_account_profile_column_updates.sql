-- Permit the runtime to lock an authenticated account row and update only profile fields.
-- SELECT ... FOR UPDATE requires UPDATE privilege on at least one column of the target table.
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
