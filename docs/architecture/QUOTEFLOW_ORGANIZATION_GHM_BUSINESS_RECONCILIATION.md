# QuoteFlow Organization → GHM Business Reconciliation

## Status

**RECONCILED — NO ADAPTER AUTHORIZED YET**

This document reconciles the current QuoteFlow organization/account model against the canonical GHM Business Identity and membership model. It is an architecture/source reconciliation only. It does not authorize a migration, adapter, provider integration, Supabase mutation, production routing change, or cutover.

## Evidence basis

### QuoteFlow

Current QuoteFlow source exposes an `OrganizationContext` containing:

- organization_id
- organization_name
- onboarding_completed
- role: owner | admin | member
- membership_status: active | invited | suspended
- subscription_plan: free | pro | null
- subscription_status: inactive | active | cancelled | expired | null

QuoteFlow resolves this through the Supabase RPC `get_my_organization_context`.

QuoteFlow also has explicit organization onboarding:

- `create_my_organization(name)`
- `complete_my_organization()`

The current organization creation function reuses the owner's existing organization when one already exists. This is materially different from GHM, where one account may own or participate in multiple Businesses and explicit Business selection is required when multiple active memberships exist.

QuoteFlow's source therefore establishes an organization/workspace concept, but it does **not** establish that the QuoteFlow organization is a one-to-one replacement for the GHM Business entity.

### GHM

GHM's canonical first-slice identity model is:

- `account_identity`
- `business`
- `business_membership`

GHM membership roles are:

- owner
- administrator
- member

GHM membership statuses are:

- active
- inactive
- revoked

A Business is selected through an authenticated active membership. Multiple active Business memberships are supported and require explicit Business selection.

Business management is Business-scoped. An owner/administrator membership for one Business does not grant management of another Business.

The GHM Business Identity contract explicitly permits an account with an existing Business membership to create an additional Business.

## Reconciliation result

### 1. Account ↔ user

**Compatible at the identity boundary, not yet directly mappable.**

QuoteFlow uses the Supabase Auth user UUID as its principal.

GHM uses its provider-neutral numeric `account_identity.id` as the authenticated principal.

An eventual adapter may translate between these identities, but the current source does not authorize a cross-system identity mapping table, claim, or migration strategy.

**Decision:** defer identity mapping implementation.

### 2. Organization ↔ Business

**Conceptually adjacent, not proven identical.**

Both models represent a tenant/workspace with members and an owner. Both support owner/admin/member-style participation.

However, important semantics differ:

| Concern | QuoteFlow | GHM |
|---|---|---|
| Primary tenant noun | organization | business |
| Owner | owner_user_id | owner membership |
| Multiple owned tenants | current creation path reuses existing owner organization | explicitly supported |
| Membership owner role | owner | owner |
| Admin role | admin | administrator |
| Member role | member | member |
| Active membership | active | active |
| Non-active membership | invited / suspended | inactive / revoked |
| Tenant onboarding | explicit organization onboarding | Business creation + identity context |
| Subscription in context | organization subscription | separate commercial domain |
| Product-specific name | QuoteFlow organization | canonical GHM Business |

The role/status vocabularies are not interchangeable without a separately governed mapping contract.

**Decision:** do not rename or duplicate GHM Business as `organization`, and do not create a QuoteFlow organization resource in GHM.

### 3. Organization creation ↔ Business creation

**Not equivalent.**

QuoteFlow's current creation path is owner-account scoped and reuses the first existing owner organization.

GHM deliberately supports multiple Businesses per account and creates an owner membership atomically.

Therefore an adapter that translates `createMyOrganization()` directly into `business.create` would change QuoteFlow's current semantics unless the product source is first changed or a product-level mapping is explicitly qualified.

**Decision:** no create adapter yet.

### 4. Membership context

**Potentially bridgeable, but requires a mapping contract.**

The overlapping role vocabulary is useful evidence, but the status vocabularies differ and QuoteFlow invitation/suspension semantics are not established as equivalent to GHM inactive/revoked semantics.

The adapter must not silently map:

- invited → inactive/revoked
- suspended → inactive/revoked

without explicit product evidence.

**Decision:** no membership transition or status mapping implementation yet.

### 5. Legal acceptance

QuoteFlow legal acceptance is explicitly **account-level during onboarding** and may occur before an organization exists.

After an organization exists, an optional organization_id may be recorded. The acceptance RPC authorizes an organization only when the authenticated user is the owner or an active owner/admin member.

This means legal acceptance has at least two scopes:

1. account/onboarding acceptance
2. optional organization-associated acceptance

GHM currently has no reconciled QuoteFlow legal-acceptance resource or contract.

This should not be attached to Business Identity merely because an organization_id exists.

**Decision:** legal acceptance requires a separate ownership/source audit before any GHM resource is proposed.

### 6. Subscription / entitlement

QuoteFlow currently exposes:

- free / pro plan
- customer limit of 5 on free
- unlimited customers on pro
- subscription status in organization context

The local entitlement calculation is product behavior, while subscription state is Supabase-backed organization context.

GHM already has a provider-neutral commercial/payment preparation domain, but that does not establish that QuoteFlow's subscription model is the same commercial contract.

**Decision:** do not map QuoteFlow plan/status into GHM commercial fields yet. Reconcile the actual subscription source, lifecycle, entitlement authority, and account/business scope first.

## Canonical ownership decisions

For construction:

- **GHM Business remains the canonical tenant/business identity for GHM.**
- **GHM account_identity remains the canonical GHM principal identity.**
- **GHM business_membership remains the canonical GHM Business participation model.**
- QuoteFlow's current Supabase organization model remains the QuoteFlow product source until a deliberate migration/cutover is qualified.
- QuoteFlow legal acceptance remains a separate product domain until ownership is reconciled.
- QuoteFlow subscription/entitlement remains a separate product/commercial concern until its authority is reconciled.
- QuoteFlow's local AsyncStorage customers, quotes, invoices, items, and business profile are not affected by this document.

## Adapter gate

A future QuoteFlow adapter may only be defined after these evidence gates pass:

1. authenticated account identity mapping is explicitly defined;
2. QuoteFlow organization ↔ GHM Business equivalence or intentional translation is documented;
3. creation semantics are reconciled, including the current one-owner-organization behavior;
4. membership role/status mappings are explicitly defined;
5. legal acceptance ownership and lifecycle are reconciled;
6. subscription source, lifecycle, scope, and entitlement authority are reconciled;
7. read/write ownership and cutover direction are explicitly defined;
8. production Supabase remains authoritative until shadow qualification and controlled cutover are separately qualified.

## Explicit non-goals

This reconciliation does not authorize:

- new GHM organization tables;
- renaming Business to Organization;
- QuoteFlow organization migration;
- account identity migration;
- legal acceptance migration;
- subscription migration;
- QuoteFlow adapter code;
- new GHM migrations;
- Supabase production changes;
- production routing changes;
- shadow qualification;
- controlled cutover.

## Conclusion

**QuoteFlow is not adapter-ready.**

The correct construction boundary is to preserve the canonical GHM Business model and reconcile the remaining QuoteFlow-specific organization, legal, and commercial semantics before creating any adapter or migration.

This is a documentation/source-reconciliation closure for the current investigation, not a backend implementation.
