# GHM Connect Business Provisioning and External Linking Contract

**Status:** CONSTRUCTION CONTRACT — FOUNDER-AUTHORIZED 2026-10-01
**Scope:** Connect Business UUID -> canonical GHM Business provisioning/linking
**Source:** Connect source audited at `abcffa73f893602c25310a58946bebb91fd7eeb5`
**Boundary:** Construction only. No production Connect cutover, shadow traffic, provider cleanup, or production data movement.

## 1. Purpose

Define the narrow adapter boundary required to reconcile a Connect Business identity with the canonical GHM Business identity.

The canonical relationship is:

```text
Connect Business UUID
  -> (provider = "supabase", external_business_id)
  -> ghm.business_external_mapping
  -> ghm.business.id
```

GHM Business IDs are canonical internal identifiers. Connect UUIDs remain external identifiers and must never be substituted for GHM Business IDs.

## 2. Existing authorities

This contract composes two already-qualified GHM boundaries:

1. Business Identity `business.create`
2. External Business Mapping `auth_link_business_external_mapping`

The existing mapping table and link function remain unchanged.

The link function remains LINK-ONLY. It does not create, match, merge, move, or transfer Businesses.

## 3. Provisioning operation

Conceptual operation:

```text
provisionOrResolveConnectBusiness(context, input)
```

Input:

```text
provider = "supabase"
externalBusinessId = Connect Business UUID
name = Connect Business name required only when provisioning
slug = optional only if the canonical Business creation boundary supports explicit slug input
```

The authenticated GHM account is derived from `AuthContext`. Account IDs and ownership are never caller-supplied.

## 4. Existing mapping path

Within the governed adapter boundary:

1. Authenticate the GHM principal.
2. Validate the external Business UUID.
3. Look up the canonical mapping for `(supabase, externalBusinessId)`.
4. If a mapping exists, return its canonical `businessId`.
5. Do not modify the Business, membership, mapping, verification state, or lifecycle.

An existing mapping is authoritative.

## 5. Provisioning path

If no mapping exists:

1. Authenticate the GHM principal.
2. Verify business-operator authorization.
3. Provision a canonical GHM Business through the existing Business Identity creation contract.
4. The creating account receives exactly one active owner membership.
5. Existing memberships for that account remain unchanged.
6. Link the Connect Business UUID to the newly created canonical GHM Business through the existing LINK-ONLY function.
7. Return the canonical GHM Business identity and mapping outcome.

The adapter must not bypass the canonical Business creation service/repository.

## 6. Concurrency invariant

The external Business UUID is the identity being reconciled.

Concurrent first-time provisioning requests for the same:

```text
(provider = "supabase", externalBusinessId)
```

must converge on one canonical GHM Business and one mapping.

The existing account-row lock alone is not sufficient to establish this invariant because concurrent requests may involve different authenticated GHM accounts.

The implementation must therefore use a transaction/concurrency mechanism that makes the external mapping uniqueness authoritative before exposing a second provisioned Business as the result.

A race that creates an unlinked orphan Business is not an acceptable qualified outcome.

## 7. Mapping immutability

An existing external mapping is authoritative. The adapter resolves the mapped canonical Business and never relinks, transfers, merges, or reassigns it.

The underlying LINK-ONLY function retains deterministic conflict behavior for callers that explicitly attempt to link an already-mapped external identity to a different canonical Business. This provisioning adapter does not expose such a target-selection operation.

## 8. Ownership boundary

The Connect Business UUID does not itself prove GHM ownership.

Provisioning is permitted only from an authenticated GHM business-operator context.

The resulting owner membership is established by the canonical GHM Business creation boundary.

An account's ownership of Business X does not confer management authority over Business Y.

No platform-admin elevation is permitted.

## 9. Identity matching prohibition

The adapter must never locate a canonical Business by:

- Business name;
- slug;
- email;
- phone;
- owner name;
- founder identity;
- fuzzy matching;
- similarity;
- AI inference;
- any combination of non-canonical attributes.

Only the explicit external mapping is authoritative.

## 10. Failure and rollback

Provisioning and linking must not report success unless the canonical Business and external mapping are in the required final state.

Failures must leave no falsely successful mapping.

If the implementation cannot atomically guarantee the required state across the selected database boundary, it must fail closed rather than claim provisioning success.

The implementation must distinguish at minimum:

- authentication required;
- invalid external Business identifier;
- business-operator authorization required;
- existing mapping resolved;
- Business provisioned and linked;
- conflicting explicit mapping-link attempt (outside this provisioning adapter);
- canonical Business creation failure;
- mapping/link failure;
- concurrency conflict.

Errors must not disclose unrelated Business ownership or mapping information to unauthorized callers.

## 11. Idempotency

A retry with the same authenticated account and same external Business UUID after successful provisioning must resolve to the same canonical GHM Business.

A retry must not create a second canonical Business.

Idempotency is keyed by the canonical external mapping identity, not by Business name or request payload similarity.

## 12. Provider boundary

The adapter may recognize the fixed provider identifier `supabase` for the Connect integration.

The provider identifier is metadata describing the external identity source. It is not a GHM authentication authority.

GHM must not accept a Supabase JWT as a GHM bearer token.

Supabase Auth remains the Connect production session authority until a separately authorized product-auth migration exists.

## 13. No product cutover

This contract does not authorize:

- changing Connect production routing;
- replacing Supabase production persistence;
- replacing Supabase Auth;
- shadow writes;
- backfill of existing production Businesses;
- bulk migration;
- production mapping population;
- deletion of Connect data;
- provider cleanup;
- payment/storage/realtime migration.

Construction qualification may use isolated fixtures and explicitly governed non-production evidence only.

## 14. Qualification requirements

Before this adapter is construction-qualified, evidence must demonstrate:

1. invalid external UUIDs are rejected;
2. unauthenticated requests are rejected;
3. non-business operators cannot provision;
4. an existing mapping resolves without creating a Business;
5. an absent mapping provisions exactly one canonical Business;
6. provisioning establishes exactly one active owner membership;
7. existing memberships remain intact;
8. the new external mapping points to the created canonical Business;
9. repeated requests are idempotent;
10. concurrent first-time requests converge on one canonical Business;
11. the existing LINK-ONLY mapping boundary remains immutable and rejects conflicting explicit link attempts;
12. mappings cannot be transferred;
13. no name/email/slug matching occurs;
14. Supabase JWTs are not accepted as GHM bearer credentials;
15. runtime privileges use only the existing governed Business and mapping boundaries;
16. failure cannot report a false successful provisioning result;
17. existing GHM qualification suites remain green;
18. build, tests, diff, and migration-integrity checks remain green;
19. architecture/readiness/handover documentation is reconciled.

## 15. Construction sequence

```text
contract
  -> implementation design
  -> adapter/service construction
  -> concurrency qualification
  -> runtime privilege qualification
  -> documentation reconciliation
  -> founder verification
```

No new mapping table is permitted.

No modification of `auth_link_business_external_mapping` is required unless qualification proves an existing defect in that already-qualified boundary.

## 16. Explicit founder gate

This contract records the founder's repeated `proceed` instruction on 2026-10-01 as authorization to construct this narrowly defined **Connect Business provisioning/linking boundary**.

That authorization does not extend to production cutover or any other Connect product domain.
