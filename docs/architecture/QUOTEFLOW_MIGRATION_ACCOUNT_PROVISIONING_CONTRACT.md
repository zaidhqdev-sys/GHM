# QuoteFlow Migration Account Provisioning Boundary

**Status: CONSTRUCTION QUALIFIED — CREDENTIALLESS PROVISIONING CONTRACT**

## Decision

QuoteFlow existing users must enter GHM as canonical GHM accounts. Public registration
is not the migration primitive because public registration creates an active password
credential and a login session.

Migration provisioning therefore has a separate boundary:

legacy Supabase evidence → reviewed GHM account → exact legacy external identity provenance → verified credential re-enrollment

## Credential rule

For RESET_REQUIRED, GHM must create no synthetic password and must not import a
Supabase hash until its exact format and verification semantics are independently
qualified.

No access token or refresh token is migrated.

For migrate_verified_hash, the future executor may only accept a legacy hash after
a dedicated format/verification qualification. This slice does not implement that
import.

## Atomicity rule

When a new GHM account is needed, account creation and external-identity linking must
be one atomic database operation. A mapping conflict or failure must not leave an
orphaned migration account.

Already-resolved accounts may use the existing idempotent auth_link_external_identity
primitive.

## Idempotency and conflicts

The source identity key is exactly (provider=supabase, subject=<opaque Supabase UUID>).

Repeated execution must resolve to the same GHM account.

A mapping to another GHM account is a hard CONFLICT. No merge, move, overwrite,
email match, or takeover is permitted.

## Session rule

Provisioning never issues a session. A migrated user receives a GHM session only
after verified credential re-enrollment through canonical GHM Auth.

## Business rule

Business creation and membership establishment remain separate migration gates.
This account slice does not create Businesses, memberships, or translate legacy roles.

## Qualification

Synthetic qualification and database-backed construction qualification prove:

- RESET_REQUIRED can be represented without password material;
- first provisioning is created;
- retry is already_provisioned;
- BLOCKED credential disposition creates nothing;
- conflicting reviewed mappings stop as CONFLICT;
- the service requires an atomic create-and-link store boundary for new accounts.

Database-backed qualification additionally proves the governed SECURITY DEFINER primitive executes for `ghm_runtime`, direct runtime DML remains revoked, fresh creation and exact retry are idempotent, concurrent provisioning converges to one account, caller rollback removes both account and mapping, and non-`supabase` providers are rejected.

No production migration, Supabase source access, credential extraction, QuoteFlow runtime change, or cutover is included.

## Next gate

The next construction gate is the explicit password reset/re-enrollment ceremony. Database provisioning is qualified; credential migration remains separately gated.
