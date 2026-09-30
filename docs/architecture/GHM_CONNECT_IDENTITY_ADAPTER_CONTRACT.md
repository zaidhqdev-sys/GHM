# GHM ↔ Zaid Connect Identity Adapter Contract

**Status:** CONTRACT DEFINED — FOUNDER CONSTRUCTION AUTHORIZATION REQUIRED
**Canonical owner:** GHM platform governance
**Current baseline:** consolidated `main` — current repository authority (2026-09-30)
**Depends on:**
- `GHM_CONNECT_IDENTITY_BRIDGE_QUALIFICATION.md`
- `GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md`
- `GHM_AUTHENTICATION_API_CONTRACT.md`
- `GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md`
- `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`
- `PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md`

## 1. Purpose

Define the **single construction boundary** required to connect Zaid Connect's existing Supabase-authenticated identity model to GHM's already-qualified canonical identity foundation.

This contract does **not** authorize implementation. It freezes the semantic boundary so that, if construction is later authorized, implementation cannot silently expand into product authentication migration, membership migration, business migration, or production cutover.

## 2. Current authority

Zaid Connect remains on its existing Supabase-backed production authentication path.

GHM's authentication foundation is construction-qualified:

`(provider, subject) → ghm.account_identity.id`

For the existing Connect population:

- `provider = supabase`
- `subject = auth.users.id` represented as text
- the mapped GHM identity is `ghm.account_identity.id`

The Supabase UUID remains an **external identity subject**. It does not become the GHM JWT `sub`.

GHM must not accept a Supabase JWT as a GHM bearer credential.

## 3. Adapter responsibility

The adapter has exactly one initial responsibility:

> Resolve a Connect external identity to its GHM canonical account identity, creating the minimum GHM identity/mapping state when controlled bootstrap is required.

Conceptual flow:

`Connect Supabase identity`
→ `{ provider: "supabase", subject: UUID }`
→ `GHM external identity mapping`
→ `ghm.account_identity.id`

The adapter may return the canonical GHM identity needed by an authorized subsequent GHM authentication/session flow.

## 4. Adapter MUST NOT do

The initial adapter boundary must not:

- accept or verify a Supabase JWT as a GHM credential;
- copy or persist Supabase JWTs as GHM credentials;
- grant business membership;
- grant business ownership;
- grant administrator/system-admin authority;
- create a business merely because a Connect identity references one;
- infer ownership from Connect client state;
- treat email as the durable identity mapping key;
- equate Connect UUIDs with GHM bigint IDs;
- migrate Connect sessions automatically;
- replace Connect's current Supabase Auth session;
- perform product data migration;
- change Connect production traffic;
- alter Supabase production schema;
- alter DNS, secrets, provider configuration, or deployment routing.

## 5. Mapping lifecycle

### Existing mapping

If `(supabase, subject)` maps to a GHM account identity:

- return the canonical GHM account identity as an identity-resolution result;
- if the mapped GHM account is disabled, the identity must not be treated as an active authenticated principal; subsequent GHM authentication/authorization must fail according to the qualified account-lifecycle rules;
- do not create another account;
- do not alter membership or ownership;
- do not elevate authorization.

### Controlled bootstrap

If no mapping exists and bootstrap is explicitly allowed by the calling product integration contract:

- create only the minimum canonical GHM identity and external mapping;
- preserve `provider=supabase`;
- preserve the external UUID as `subject`;
- do not create business membership;
- do not create business ownership;
- do not set system-admin state;
- do not manufacture a GHM privileged role;
- return the newly created canonical identity.

Bootstrap must be idempotent under repeated calls for the same provider/subject.

### Conflict

If the external subject is already mapped to a different canonical identity, the adapter must fail closed with a conflict outcome.

It must not silently relink identities.

## 6. Authorization boundary

Identity resolution is **authentication/identity provisioning**, not authorization.

After resolution:

`GHM canonical identity`
→ `GHM authentication/session boundary`
→ `GHM authorization`
→ `resource operation`

Business membership remains authoritative in GHM.

A Connect-selected business is context only. It is never proof of GHM authorization.

## 7. Business identity boundary

Connect business UUIDs and GHM business bigint IDs are separate identities.

The adapter must not infer:

`Connect business UUID = GHM business.id`

Existing GHM business external mapping is a separate governed boundary:

`(provider, external_business_id) → ghm.business.id`

That mapping does not itself create membership or ownership.

Business migration/provisioning is outside this identity adapter slice.

## 8. Session coexistence

During construction and any future migration:

- Supabase remains the Connect production session authority;
- GHM sessions remain GHM-owned;
- the two credential systems are not interchangeable;
- no automatic session conversion is implied by identity mapping;
- no Supabase JWT is accepted by GHM bearer authentication.

A later product authentication migration requires its own explicit contract, qualification, and authorization.

## 9. Failure semantics

Minimum semantic outcomes:

| Condition | Outcome |
|---|---|
| Valid existing mapping | resolved |
| Valid bootstrap-eligible unmapped identity | bootstrapped |
| Same mapping already exists during retry | resolved / idempotent |
| External subject mapped to another account | conflict / fail closed |
| Invalid provider/subject | validation failure |
| Bootstrap not permitted | unauthorized / gated |
| Persistence/provider dependency failure | dependency failure |
| Unexpected internal error | internal failure |

No outcome may disclose whether an unrelated account exists beyond the minimum contract-required semantics.

## 10. Data ownership

| Data | Authority |
|---|---|
| Supabase credential/session | Supabase Auth during coexistence |
| Connect profile | Connect |
| GHM canonical identity | GHM |
| GHM external identity mapping | GHM |
| GHM membership/ownership | GHM |
| Connect business UUID | Connect |
| GHM business ID | GHM |
| Cross-system business mapping | GHM, when separately governed |

## 11. Security invariants

Construction must preserve:

1. Provider + subject is the durable external identity key.
2. Email is not the durable cross-system mapping key.
3. Mapping does not grant authorization.
4. Bootstrap does not grant membership, ownership, or admin authority.
5. Supabase JWTs are never accepted as GHM bearer credentials.
6. Products never receive GHM database credentials.
7. Products never call arbitrary GHM SQL or SECURITY DEFINER functions.
8. Identity conflicts fail closed.
9. Repeated bootstrap is idempotent.
10. GHM authorization remains authoritative for GHM resources.

## 12. Qualification evidence required before construction slice closes

The implementation must eventually demonstrate, at minimum:

- existing mapping resolution;
- first-time controlled bootstrap;
- repeated bootstrap idempotency;
- conflicting mapping rejection;
- disabled-account behavior: mapping may resolve, but disabled account authentication/authorization must fail closed;
- no membership creation during bootstrap;
- no ownership creation during bootstrap;
- no system-admin elevation;
- no Supabase JWT acceptance as GHM bearer;
- canonical GHM identity reaches the governed authentication boundary;
- Connect production session remains unchanged;
- transaction/persistence boundary is respected;
- audit/documentation reconciliation is updated.

## 13. Explicit non-goals

This slice does not include:

- Connect login replacement;
- GHM password migration from Supabase;
- Connect session migration;
- Connect profile migration;
- Connect business migration;
- role/permission equivalence implementation;
- business membership migration;
- storage adapter;
- realtime adapter;
- payment adapter;
- directory adapter;
- shadow qualification;
- production cutover.

## 14. Construction gate

**Current state:**

`CONTRACT DEFINED`
→ `FOUNDER CONSTRUCTION AUTHORIZATION REQUIRED`
→ `IMPLEMENTATION NOT AUTHORIZED`

If Founder authorization is granted, implementation must remain limited to this contract. Any expansion requires a new authorization gate.

## 15. Final boundary

The qualified GHM identity foundation establishes the platform capability.

This document establishes the **next product-specific semantic boundary**.

Neither document authorizes production migration.

**STOP — do not implement this adapter until the Founder construction gate explicitly authorizes it.**
