# QuoteFlow Migration Account Provisioning Boundary

**Status: CONSTRUCTION QUALIFICATION — CREDENTIALLESS PROVISIONING CONTRACT ONLY**

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

Synthetic non-production qualification proves:

- RESET_REQUIRED can be represented without password material;
- first provisioning is created;
- retry is already_provisioned;
- BLOCKED credential disposition creates nothing;
- conflicting reviewed mappings stop as CONFLICT;
- the service requires an atomic create-and-link store boundary for new accounts.

No database migration, Supabase access, credential extraction, production mutation,
QuoteFlow runtime change, or cutover is included.

## Next gate

The next construction gate is the database-backed migration provisioning primitive
plus an explicit reset/re-enrollment ceremony. It must be implemented as a
migration-owned SECURITY DEFINER capability, not by reusing public registration.
