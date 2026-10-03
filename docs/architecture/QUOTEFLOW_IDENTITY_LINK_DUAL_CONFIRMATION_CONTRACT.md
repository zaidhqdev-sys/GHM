# QuoteFlow ↔ GHM Identity Link — Dual Confirmation Authority Contract

## Status

**AUTHORITY SELECTED — DUAL CONFIRMATION; PERSISTENCE NOT YET AUTHORIZED**

This contract resolves the Founder/Product authority gate for establishing a cross-system identity link.

The selected model is **dual-sided confirmation**: neither system may unilaterally establish a trust link to an arbitrary principal or tenant in the other system.

This contract defines authority and lifecycle semantics only. It does not authorize persistence, HTTP routes, adapter implementation, production configuration, Supabase mutation, shadow qualification, or cutover.

## Selected authority model

A link may become eligible for creation only when both sides independently confirm the same proposed association.

### Account link

The two confirmations are:

1. **QuoteFlow-side confirmation**
   - the authenticated QuoteFlow principal controls the QuoteFlow user UUID being linked;
   - the confirmation is produced by the authenticated QuoteFlow identity-link ceremony.

2. **GHM-side confirmation**
   - the target GHM account identity is controlled by the authenticated GHM account;
   - the confirmation is produced from an authenticated GHM context;
   - the target GHM account ID is derived from that authenticated context and is never accepted merely from an untrusted caller payload.

The two confirmations must identify the same QuoteFlow principal and GHM account pair.

### Business link

The two confirmations are:

1. **QuoteFlow-side confirmation**
   - the authenticated QuoteFlow organization owner or active organization admin confirms the proposed QuoteFlow organization;
   - the confirmation is bound to the authenticated QuoteFlow organization context.

2. **GHM-side confirmation**
   - an active GHM owner or administrator of the target Business confirms the proposed association;
   - the GHM Business is resolved through authenticated Business membership;
   - a caller-supplied arbitrary Business ID is not proof of authority.

The two confirmations must identify the same QuoteFlow organization and GHM Business pair.

## Why dual confirmation is required

A cross-system identity link changes the trust relationship between two independently authoritative systems.

Therefore:

- QuoteFlow cannot unilaterally claim a GHM identity or Business;
- GHM cannot unilaterally claim a QuoteFlow identity or organization;
- email, phone, name, slug, role, timestamps, subscription state, and legal acceptance are not identity proof;
- GHM administrator authority alone does not establish control of a QuoteFlow principal;
- QuoteFlow organization administration alone does not establish authority over a GHM Business.

Dual confirmation preserves both systems' independent authority without creating a new universal identity owner.

## Link lifecycle

The canonical lifecycle for a future persisted link is:

1. **proposed**
   - one side has initiated a specific pair;
   - no trust link exists;
   - neither side may use the proposal as authorization.

2. **confirmed**
   - both independent confirmations exist for the exact same pair;
   - confirmation records are valid for the ceremony;
   - no production authorization is granted yet unless and until persistence is separately qualified.

3. **active**
   - a governed persistence operation has atomically recorded the link;
   - uniqueness and lifecycle invariants have passed;
   - the link may be resolved by an authorized adapter.

4. **revoked**
   - the link is no longer usable;
   - adapters must fail closed;
   - historical audit provenance remains immutable.

A failed, expired, mismatched, or revoked confirmation must never be interpreted as an active link.

## Account-link cardinality

The default authority rule is:

- one active QuoteFlow principal maps to at most one active GHM account identity;
- one GHM account identity maps to at most one active QuoteFlow principal.

No many-to-one or one-to-many active account identity mapping is authorized by this contract.

Relinking requires explicit revocation of the existing active association before a different active association may be established.

## Business-link cardinality

The default authority rule is:

- one QuoteFlow organization maps to at most one active GHM Business;
- one GHM Business maps to at most one active QuoteFlow organization.

No many-to-many active tenant mapping is authorized by this contract.

A Business/account link does not automatically create or imply an organization/Business link.

## Cross-link consistency

An account link and Business link remain separate resources.

However, a tenant-scoped operation may require:

1. an active account link;
2. an active organization/Business link;
3. active membership in the mapped QuoteFlow organization;
4. active membership in the mapped GHM Business;
5. an independently valid GHM authorization decision.

A valid account link alone does not authorize access to a Business.

A valid Business link alone does not prove that an arbitrary caller owns the mapped account.

## Confirmation invariants

A future persistence implementation must enforce:

- exact-pair matching between both confirmations;
- no acceptance of mismatched QuoteFlow/GHM identifiers;
- expiry of stale confirmation material;
- single-use ceremony material where applicable;
- idempotent replay of the same completed ceremony;
- rejection of conflicting active mappings;
- immutable provenance of the actors and confirmation timestamps;
- transactional activation;
- fail-closed behavior when either confirmation is missing or invalid.

Confirmation is proof for link establishment, not a replacement for ordinary GHM resource authorization.

## Revocation authority

Either system may request revocation of its side of the association.

A persisted link becomes unusable when its canonical lifecycle state is revoked.

Re-establishment requires a new dual-confirmation ceremony. A previous confirmation must not be reused as proof for a new association.

Revocation does not silently delete historical provenance.

## Role boundary

QuoteFlow roles and GHM roles remain product-specific.

No automatic role translation is authorized.

In particular:

- QuoteFlow `owner` is not automatically a GHM `owner`;
- QuoteFlow `admin` is not automatically a GHM `administrator`;
- QuoteFlow `member` is not automatically a GHM `member`.

After a link exists, GHM authorization continues to derive from GHM authentication and GHM Business membership.

## Interaction with the dedicated verifier

The existing QuoteFlow attestation verifier is responsible only for cryptographic verification of the QuoteFlow-side attestation.

It does not:

- decide whether the caller has GHM authority;
- create a link;
- persist confirmation state;
- establish Business membership;
- replace GHM authorization.

The future ceremony boundary is therefore:

`QuoteFlow attestation → GHM authenticated confirmation → exact-pair authority decision → persistence`

The existing verifier remains unchanged.

## Explicit non-goals

This contract does not authorize:

- `identity_link` tables;
- confirmation tables;
- mapping RPCs;
- HTTP routes;
- QuoteFlow adapter code;
- GHM credential issuance to QuoteFlow;
- UUID columns on GHM identity/business tables;
- automatic organization/Business creation;
- role translation;
- legal-acceptance migration;
- subscription migration;
- PayFast/provider integration;
- production Supabase changes;
- shadow qualification;
- cutover.

## Next construction gate

The authority decision is now closed at the architecture level.

The next construction slice is a **persistence-free dual-confirmation decision contract/service boundary** that composes:

1. the qualified QuoteFlow attestation verifier;
2. authenticated GHM-side confirmation;
3. exact-pair matching;
4. cardinality/conflict checks expressed as contract rules;
5. deterministic outcomes for missing, mismatched, expired, duplicate, and conflicting confirmations.

Only after that boundary is qualified may an identity-link persistence schema and transaction contract be considered.

## Qualification requirements

Before persistence is authorized, qualification must prove:

- QuoteFlow-side attestation verification;
- GHM-side authenticated confirmation;
- exact-pair matching;
- wrong-principal rejection;
- wrong-Business rejection;
- missing-confirmation rejection;
- expired-confirmation rejection;
- conflicting-active-link rejection;
- idempotent identical ceremony behavior;
- no role translation;
- no caller-supplied arbitrary GHM identity proof;
- fail-closed behavior.

