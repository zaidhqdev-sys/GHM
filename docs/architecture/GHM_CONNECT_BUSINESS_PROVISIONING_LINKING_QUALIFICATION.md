# GHM ↔ Zaid Connect Business Provisioning and External Linking Qualification

**Status:** CONSTRUCTION QUALIFIED — PRODUCT ADAPTER / CUTOVER NOT AUTHORIZED
**Qualified branch:** `construction/connect-business-provisioning-linking-contract`
**Qualification date:** 2026-10-01
**Connect source:** `abcffa73f893602c25310a58946bebb91fd7eeb5`
**Boundary:** Connect Business UUID → canonical GHM Business provisioning/linking only

## Purpose

Record construction qualification evidence for the narrow Connect Business provisioning/linking boundary. This document does not authorize Connect production routing, shadow traffic, production mapping population, backfill, provider replacement, or product cutover.

## Qualified implementation

The adapter:

- validates the Connect Business UUID;
- requires an authenticated GHM business-operator context;
- uses the fixed external provider identifier `supabase`;
- resolves an existing external mapping without mutation;
- provisions through the canonical Business Identity transaction-scoped creation boundary when no mapping exists;
- creates the owner membership through that canonical creation boundary;
- links the external Business UUID through the existing LINK-ONLY mapping function;
- composes Business creation and mapping inside one governed transaction;
- takes a transaction-scoped advisory lock keyed by the external provider + Business UUID;
- never matches Businesses by name, slug, email, phone, founder, similarity, or AI inference;
- never relinks an existing external mapping.

No new mapping table was introduced and the existing mapping function was not modified.

## Live PostgreSQL qualification evidence

The dedicated live qualification command was executed against the configured non-production GHM database:

`npm run qualify:connect-business-provisioning-live`

Result:

- 6 tests passed
- 0 failed
- 0 cancelled
- 0 skipped
- TypeScript build passed
- live PostgreSQL qualification completed successfully

The qualification exercised:

1. Two independent business accounts with pre-existing memberships.
2. Concurrent first-time provisioning of the same external Business UUID from those two different accounts.
3. Convergence on exactly one canonical GHM Business.
4. Exactly one external mapping for the external Business UUID.
5. Exactly one active owner membership on the provisioned Business.
6. Preservation of both accounts' pre-existing active owner memberships.
7. Retry idempotency with no second Business.
8. Existing mapping resolution without relinking or creating a replacement Business.
9. Forced mapping-link failure with atomic rollback of Business, owner membership, and mapping.

The concurrency result is particularly significant because the two requests used different authenticated accounts; therefore the invariant was exercised independently of the account-row lock used by canonical Business creation.

## Mapping semantics

An existing external mapping is authoritative for this adapter.

The adapter's operation is resolve-or-provision. It does not accept a caller-selected alternate canonical Business target, so an existing mapping is not itself a provisioning conflict.

The underlying LINK-ONLY function remains responsible for rejecting explicit attempts to associate an already-mapped external identity with a different canonical Business. That separate conflict behavior remains unchanged and governed.

## Transaction invariant

Provisioning is not reported as successful until both:

- the canonical Business and owner membership exist in the transaction; and
- the external mapping points to that canonical Business.

The live forced-link-failure test demonstrated that failure rolls back the Business, owner membership, and mapping rather than leaving an orphan Business.

## Authority and security boundary

The qualification does not make Supabase Auth a GHM authentication authority.

GHM continues to require its own authenticated context, and a Supabase JWT is not accepted as a GHM bearer credential.

The Connect Business UUID is an external identifier only. The canonical internal identifier remains `ghm.business.id`.

Provisioning does not infer ownership from the external UUID. Ownership comes from the authenticated GHM business-operator context and canonical Business creation.

## Scope explicitly not qualified

This qualification does not establish:

- Connect production adapter routing;
- automatic migration of existing Connect Businesses;
- production population of external Business mappings;
- Supabase database replacement;
- Supabase Auth replacement;
- payment migration;
- storage migration;
- realtime migration;
- shadow writes;
- production cutover or rollback;
- public Business/directory parity;
- Saved Business adapter behavior;
- other Connect product domains.

Those remain separately governed gaps.

## Construction authority

The founder's repeated `proceed` instruction on 2026-10-01 authorized this narrow Business provisioning/linking construction slice.

This qualification records successful construction evidence only. Any production use or cutover requires a separate explicit authorization and readiness gate.
