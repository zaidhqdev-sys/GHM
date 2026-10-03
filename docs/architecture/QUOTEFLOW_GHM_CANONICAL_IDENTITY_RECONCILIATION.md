# QuoteFlow ↔ GHM Canonical Identity Reconciliation

## Status

**ARCHITECTURE DECISION — GHM CANONICAL IDENTITY SELECTED; SUPABASE IS LEGACY MIGRATION SOURCE ONLY**

This reconciliation supersedes the earlier assumption that QuoteFlow's Supabase Auth UUID is a durable cross-system principal identifier.

The target architecture is GHM-owned. Supabase may remain temporarily as migration/source infrastructure, but it is not part of the canonical QuoteFlow identity model.

## Repository evidence

The current QuoteFlow repository still depends directly on Supabase:

- `@supabase/supabase-js` is a runtime dependency.
- `src/lib/supabase.ts` constructs the Supabase client.
- `src/state/AuthContext.tsx` authenticates with Supabase Auth and persists the Supabase `User`.
- `src/lib/organizationContext.ts` resolves organization context through Supabase RPCs.
- QuoteFlow organization identifiers are currently typed as strings and the current organization RPCs return UUID-backed identifiers.
- QuoteFlow currently has no independent GHM-owned authentication or identity source.

Therefore the current QuoteFlow repository state is a **legacy/current implementation state**, not the target GHM identity architecture.

## Canonical target

GHM owns canonical identity for the QuoteFlow backend boundary.

### Account

The canonical authenticated principal is:

`ghm.account_identity.id`

QuoteFlow must eventually authenticate against GHM and carry the GHM account identity as its backend principal.

The QuoteFlow application may expose a product-level user object, but that object must resolve to the GHM account identity rather than creating a second authoritative identity system.

### Tenant / Business

The canonical commercial tenant for GHM-backed QuoteFlow operations is:

`ghm.business.id`

Business membership is authoritative in:

`ghm.business_membership`

QuoteFlow's current Supabase organization identifier is therefore not a future GHM identity key.

A future QuoteFlow organization/business context must resolve to the GHM Business and its GHM membership/authorization boundary.

## Supabase identifiers

Existing Supabase identifiers are migration provenance, not canonical identity.

A legacy Supabase user UUID or organization UUID may be retained temporarily where required to:

- identify a pre-cutover record during migration;
- reconcile already-migrated records;
- prove migration lineage;
- support a controlled rollback/recovery procedure.

They must not become:

- columns on canonical GHM identity or Business tables;
- the principal used by GHM authorization;
- the durable QuoteFlow identity key in the target architecture;
- a substitute for GHM authentication;
- a permanent provider dependency.

The existing GHM external-mapping resources may represent a legacy provider/source relationship where independently qualified for migration provenance. They must not be repurposed as a permanent QuoteFlow trust authority.

## Identity-link consequence

The previously contracted persistent resource:

`QuoteFlow user UUID → GHM account_identity.id`

is no longer the target identity architecture.

Likewise:

`QuoteFlow organization UUID → GHM business.id`

is not a permanent product-to-GHM trust relationship.

Those relationships are useful only as **migration crosswalks** while legacy QuoteFlow records still exist.

After QuoteFlow is migrated to GHM authentication and GHM Business identity, the canonical path is:

`QuoteFlow authenticated session → GHM account_identity.id → GHM business_membership → GHM business.id`

No permanent identity-link table is required merely to connect QuoteFlow to GHM when GHM is the canonical backend identity authority.

## Migration boundary

Migration must distinguish two different concerns:

1. **Legacy crosswalk**
   - temporary/provenance relationship from an existing QuoteFlow/Supabase record to the already-created GHM record;
   - used only to migrate/reconcile existing data;
   - never treated as proof of current GHM authorization.

2. **Canonical runtime identity**
   - GHM authentication;
   - GHM account identity;
   - GHM Business membership;
   - GHM Business authorization.

The crosswalk must never silently become the runtime authorization mechanism.

## Existing QuoteFlow attestation verifier

The already-qualified QuoteFlow identity-link verifier must be treated as a **legacy migration-boundary capability**, not as the target canonical identity protocol.

Its current contract requires a numeric QuoteFlow identity subject, while the current QuoteFlow repository still authenticates through Supabase Auth and exposes a UUID-backed user identity. This is a contract mismatch that must not be hidden by coercion or identifier casting.

Therefore:

- do not cast UUIDs to numeric IDs;
- do not invent a numeric QuoteFlow identity source;
- do not change GHM canonical identity to accommodate the legacy verifier;
- do not create persistence around the mismatched verifier contract;
- do not use the verifier as evidence that QuoteFlow identity is already GHM-owned.

If a migration ceremony still requires signed source-system proof, its subject contract must be separately reconciled to the actual legacy source identifier and explicitly scoped as migration-only.

## Organization / Business reconciliation

QuoteFlow organization and GHM Business remain distinct during migration.

The target does **not** automatically translate:

- QuoteFlow owner → GHM owner;
- QuoteFlow admin → GHM administrator;
- QuoteFlow member → GHM member.

After cutover, GHM membership and authorization remain authoritative.

A migrated QuoteFlow user does not automatically gain access to every GHM Business. Access remains a GHM membership decision.

## Authentication target

The eventual QuoteFlow runtime must remove the direct Supabase Auth dependency from its canonical path.

Target direction:

`QuoteFlow app → GHM authentication → GHM account identity → GHM authorization`

This does not authorize immediate production authentication replacement. Authentication migration remains a separately gated construction and cutover activity.

## Non-goals

This reconciliation does not authorize:

- QuoteFlow authentication migration;
- removal of the Supabase package from QuoteFlow;
- Supabase database deletion;
- production routing changes;
- identity-link tables;
- identity-link RPCs;
- new migration SQL;
- account/business data migration;
- password migration;
- subscription migration;
- legal-acceptance migration;
- role translation;
- shadow qualification;
- production cutover.

## Required next gates

Before implementing identity persistence or QuoteFlow authentication migration:

1. qualify the GHM-owned QuoteFlow authentication boundary;
2. qualify how existing QuoteFlow/Supabase users are migrated to GHM account identities;
3. define migration-only provenance/crosswalk semantics;
4. reconcile QuoteFlow organization data with GHM Business identity;
5. qualify QuoteFlow session/token handling against GHM auth;
6. migrate QuoteFlow runtime reads/writes from Supabase to GHM;
7. remove Supabase from the canonical QuoteFlow runtime path;
8. separately authorize production cutover.

**Decision:** Do not build the previously proposed permanent QuoteFlow identity-link tables. Build the GHM canonical identity path first.
