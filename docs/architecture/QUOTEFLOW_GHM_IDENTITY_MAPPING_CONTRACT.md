# QuoteFlow ↔ GHM Identity / Business Mapping Contract

## Status

**RECONCILED — MAPPING CONTRACT DEFERRED; NO IDENTITY BRIDGE AUTHORIZED**

This document closes the source-reconciliation investigation for the cross-system identity boundary. It does not authorize an identity-link table, account migration, adapter, Supabase mutation, production routing, shadow qualification, or cutover.

## Evidence

### QuoteFlow principal

QuoteFlow is built around Supabase Auth and uses the authenticated Supabase user as the principal for organization, membership, and legal-acceptance operations.

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

The two systems currently have **different principal identifiers and different tenant identifiers**:

| Boundary | QuoteFlow | GHM |
|---|---|---|
| Principal | Supabase Auth user UUID | GHM numeric account identity |
| Tenant | QuoteFlow organization UUID | GHM Business numeric ID |
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

## Account mapping

A future mapping must establish:

`QuoteFlow Supabase user UUID → GHM account_identity.id`

Required properties:

- one active QuoteFlow principal maps to at most one GHM account identity;
- the GHM account identity must exist before a product adapter can issue a GHM request;
- the mapping must not be inferred from contact data;
- mapping creation must be authenticated and auditable;
- unlink/relink semantics must be explicitly defined;
- stale or revoked mappings must fail closed;
- the adapter must not accept a caller-supplied arbitrary GHM account ID as proof of identity.

No mapping persistence mechanism is authorized by this document.

## Organization / Business mapping

A future mapping must separately establish:

`QuoteFlow organization UUID → GHM business.id`

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

The canonical owners remain:

- QuoteFlow/Supabase: QuoteFlow principal, organization, organization membership, legal acceptance, subscription state, and local entitlements until separately cut over;
- GHM: GHM account identity, Business identity, Business membership, and qualified GHM commercial foundations.

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

- identity-link database tables;
- UUID columns added to GHM Business or account identity;
- Supabase Auth migration;
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

The next construction step is therefore a dedicated **identity-link ownership/authority contract**, not adapter implementation.
