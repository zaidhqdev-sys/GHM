# QuoteFlow ↔ GHM Identity / Business Mapping Contract

> **Canonical identity reconciliation:** GHM is the target canonical identity authority for QuoteFlow-backed runtime operations. Supabase identifiers are legacy/source identifiers during migration only.

## Status

**RECONCILED — GHM CANONICAL IDENTITY SELECTED; LEGACY SUPABASE CROSSWALK ONLY; NO DATABASE OBJECT OR ADAPTER AUTHORIZED**

This document closes the source-reconciliation investigation for the cross-system identity boundary. It does not authorize an identity-link table, account migration, adapter, Supabase mutation, production routing, shadow qualification, or cutover.

## Evidence

### Current QuoteFlow principal (legacy implementation)

The current QuoteFlow repository is still built around Supabase Auth. The authenticated Supabase user and its identifier therefore describe the **current/legacy implementation state**, not the target GHM-owned identity architecture.

The current repository also contains a direct `@supabase/supabase-js` dependency and Supabase RPC-based organization context. This dependency must be removed from the canonical runtime path through a separately qualified migration.

Its organization context is organization-scoped and contains:

- organization UUID;
- organization membership role;
- organization membership status;
- organization subscription state.

QuoteFlow organization creation and legal acceptance RPCs derive the authenticated principal from the Supabase authentication context rather than accepting an arbitrary external account identifier.

### GHM principal

GHM uses a provider-neutral authenticated context:

```ts
interface AuthContext {
  userId: number;
  role: 'admin' | 'customer' | 'business';
}
```

The canonical Business Identity slice contains:

- `account_identity.id`;
- `business.id`;
- `business_membership.account_id`;
- `business_membership.business_id`.

GHM Business membership is the canonical relationship between an account and a Business. One account may participate in multiple Businesses, and Business selection is explicit when multiple active memberships exist.

## Fundamental boundary

The current implementations have different principal and tenant identifiers. This is a migration-state observation, not a permanent architecture:

| Boundary | QuoteFlow | GHM |
|---|---|---|
| Principal | Current legacy Supabase user identifier | GHM canonical `account_identity.id` |
| Tenant | Current legacy QuoteFlow organization identifier | GHM canonical Business numeric ID |
| Membership | organization_members | business_membership |
| Owner/admin/member | owner/admin/member | owner/administrator/member |
| Active state | active | active |
| Other states | invited/suspended | inactive/revoked |

No current source evidence provides a canonical cross-system identifier connecting these records.

## Mapping rule

A future adapter must never infer identity from:

- email;
- phone;
- organization name;
- Business name;
- slug;
- membership role;
- timestamps;
- subscription state;
- legal acceptance;
- matching profile fields.

Those fields are mutable, non-unique, product-scoped, or otherwise insufficient to establish identity.

The mapping must be an explicit, authenticated association established by a separately governed identity-link contract.

## Canonical account identity

The target runtime path is:

`QuoteFlow authenticated session → GHM account_identity.id`

A legacy Supabase user identifier may be retained only in migration provenance/crosswalk data where required to reconcile an existing QuoteFlow record. It is not a canonical GHM identity and must not become the principal used by GHM authorization.

Required properties:

- one active QuoteFlow principal maps to at most one GHM account identity;
- the GHM account identity must exist before a product adapter can issue a GHM request;
- the mapping must not be inferred from contact data;
- mapping creation must be authenticated and auditable;
- unlink/relink semantics must be explicitly defined;
- stale or revoked mappings must fail closed;
- the adapter must not accept a caller-supplied arbitrary GHM account ID as proof of identity.

No mapping persistence mechanism is authorized by this document.

## Canonical tenant identity

The target runtime path is:

`QuoteFlow business context → GHM business.id → GHM business_membership`

The current QuoteFlow organization identifier is a legacy/source identifier until QuoteFlow is migrated to GHM-owned identity and Business context. It must not be added to canonical GHM identity or Business tables.

This is intentionally **not** a consequence of account mapping.

The previous organization reconciliation established that QuoteFlow organization and GHM Business have materially different creation and membership semantics. Therefore an account mapping does not automatically prove a tenant mapping.

Required properties:

- mapping must be explicit;
- mapped GHM Business must be active;
- mapped QuoteFlow organization must be in a compatible lifecycle state;
- the authenticated user must have the required membership in both systems;
- membership role/status must not be silently translated;
- multiple GHM Businesses must remain distinguishable;
- mapping must preserve the Business-scoped authorization boundary.

## Ownership

The target canonical owners are:

- GHM: authenticated account identity, Business identity, Business membership, and GHM authorization;
- QuoteFlow: QuoteFlow product data and product-specific semantics that remain outside GHM's canonical identity/authorization domain;
- legacy Supabase: migration/source provenance only until separately retired.

Legal acceptance and subscription/entitlement ownership remain product-specific and are not transferred by this identity reconciliation.

An identity mapping is a **bridge**, not a new canonical owner for either domain.

## Adapter authentication requirements

When a future QuoteFlow adapter is constructed:

1. authenticate the QuoteFlow principal;
2. resolve the explicit account mapping;
3. resolve the explicit organization/Business mapping if the operation is tenant-scoped;
4. construct the GHM AuthContext from the mapped GHM account identity and an independently validated GHM role;
5. resolve Business membership in GHM;
6. enforce the GHM resource authorization boundary;
7. never trust QuoteFlow role text as proof of a GHM role;
8. never trust QuoteFlow organization membership as proof of GHM Business membership.

The adapter must not allow QuoteFlow claims to bypass GHM authorization.

## Mapping lifecycle requirements

Before implementation, a separate contract must define:

- link creation authority;
- verification/proof of ownership;
- uniqueness constraints;
- active/revoked states;
- relinking policy;
- unlink behavior;
- audit provenance;
- concurrency/idempotency;
- account deletion/deactivation behavior;
- organization/Business deletion/deactivation behavior;
- recovery when one system is unavailable;
- read/write direction during shadow qualification;
- cutover ownership;
- rollback.

## Explicit non-goals

This contract does not authorize:

- permanent identity-link database tables;
- UUID columns added to GHM Business or account identity;
- treating a Supabase UUID as the canonical QuoteFlow identity;
- immediate Supabase Auth removal or production authentication cutover;
- GHM credential issuance to QuoteFlow;
- email/phone matching;
- organization-to-Business automatic matching;
- role translation;
- legal-acceptance migration;
- subscription migration;
- QuoteFlow adapter code;
- production traffic changes;
- shadow qualification;
- cutover.

## Construction decision

**The identity/business mapping boundary is now explicitly identified, but its persistence and lifecycle are not yet authorized.**

This is the final prerequisite before an eventual QuoteFlow adapter can be designed safely.

The authority model is now separately qualified by dual confirmation, and the persistence boundary is separately contracted. The next construction step is **GHM-owned QuoteFlow authentication and migration-boundary qualification**, not permanent identity-link persistence.
