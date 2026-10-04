# QuoteFlow Migration Account Provisioning — Database Capability

**Status: CONSTRUCTION — DATABASE QUALIFICATION PENDING**

The migration account provisioning contract is now backed by a dedicated SECURITY
DEFINER PostgreSQL function:

ghm.auth_provision_migration_account(provider, subject, full_name, role)

## Atomic operation

For a new legacy identity, the function:

1. validates the provider is exactly `supabase`;
2. treats the subject as opaque provenance;
3. serializes the source identity key with a transaction advisory lock;
4. checks for an existing mapping;
5. creates one canonical `ghm.account_identity`;
6. creates the exact `ghm.account_external_identity` mapping;
7. returns `created`.

Because account creation and mapping are inside one database transaction, a failure
rolls back the new account. The advisory lock prevents concurrent executions for the
same source identity from creating duplicate accounts.

## Existing identity

If the exact `(provider, subject)` mapping already exists, the function returns
`already_provisioned` and the existing canonical account id.

It never resolves by email and never changes an existing mapping.

## Credential boundary

The function does not touch `ghm.account_password_credential`.

Therefore a newly provisioned migrated account has no password credential and cannot
receive a normal password-authenticated GHM session until the separately qualified
re-enrollment ceremony establishes one.

No Supabase hash, access token, or refresh token is imported.

## Privilege boundary

The function is owned by `ghm_schema_owner`, executable by `ghm_runtime`, and
direct runtime DML on the identity/mapping tables remains revoked.

## Qualification

Database-backed qualification is still pending. The next local gate must apply the
migration in the governed construction database and exercise:

- create;
- exact retry;
- concurrent/idempotent identity handling;
- invalid provider;
- mapping conflict;
- transaction rollback on failure;
- runtime privilege boundary.

No production migration is authorized.
