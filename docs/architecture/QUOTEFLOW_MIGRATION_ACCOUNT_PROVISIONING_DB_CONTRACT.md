# QuoteFlow Migration Account Provisioning — Database Capability

**Status: CONSTRUCTION QUALIFIED — PRODUCTION MIGRATION SEPARATELY GATED**

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

Database-backed qualification has passed against the governed construction database.

The qualification proved:

- fresh create returns `created`;
- exact retry returns `already_provisioned` with the same canonical account id;
- four concurrent calls for one source identity produce exactly one `created` and three `already_provisioned` results;
- the provider boundary rejects a non-`supabase` provider;
- caller transaction rollback removes both the created account and its external mapping;
- runtime can execute the SECURITY DEFINER function but cannot directly INSERT/UPDATE/DELETE either identity table;
- the deployed function contains the direct mapping insert and `created` outcome path and has no internal `unique_violation` exception handler.

Conflict semantics remain owned by the higher-level migration reconciliation executor; this
database primitive does not resolve or overwrite an existing conflicting mapping.

No production migration is authorized.
