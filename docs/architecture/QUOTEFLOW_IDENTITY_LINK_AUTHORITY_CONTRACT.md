# QuoteFlow ↔ GHM Identity Link Authority Contract

## Status

**AUTHORITY NOT YET QUALIFIED — NO LINK PERSISTENCE OR MUTATION AUTHORIZED**

This contract defines the decision boundary for establishing cross-system identity links. It deliberately does not select an implementation authority where product evidence is absent.

## Existing evidence

The preceding reconciliation establishes two independent mappings:

- QuoteFlow Supabase user UUID ↔ GHM `account_identity.id`
- QuoteFlow organization UUID ↔ GHM `business.id`

Neither mapping currently has an authorized persistence mechanism in GHM.

GHM's existing application authorization is Business-scoped and derives permissions from the authenticated GHM context and Business membership. It does not currently contain a cross-system identity-link resource.

## Authority distinction

A cross-system link is not ordinary Business data.

Creating a link changes the trust relationship between two independently authoritative systems. Therefore:

- a QuoteFlow user must not self-assert an arbitrary GHM account identity;
- a QuoteFlow organization must not self-assert an arbitrary GHM Business;
- GHM Business membership must not by itself prove ownership of a QuoteFlow organization;
- matching email, phone, name, slug, or other profile fields is not sufficient proof;
- ordinary Business owner/admin permission is not automatically link-management authority.

The link authority must therefore be separately governed.

## Required proof before link creation

A future link-creation workflow must establish both sides of the association:

### Account link

Proof must establish:

1. control of the authenticated QuoteFlow principal;
2. control/authorization for the target GHM account identity;
3. that neither identity is already actively linked incompatibly;
4. an auditable actor and timestamp;
5. an idempotent outcome for repeated identical requests.

### Business link

Proof must establish:

1. control of the authenticated QuoteFlow organization;
2. authority over the target GHM Business;
3. active GHM Business membership with the required management authority;
4. that the QuoteFlow organization is compatible with the target Business;
5. an auditable actor and timestamp;
6. an idempotent outcome for repeated identical requests.

Account and Business links must not be created merely because an account link exists.

## Authority is intentionally unresolved

Current GHM evidence establishes:

- `admin` as a platform-level application role;
- Business-scoped owner/administrator management;
- authenticated account identity;
- Business membership authorization.

It does **not** establish a product requirement saying that GHM administrators should be the sole operators of cross-system linking, nor does QuoteFlow source establish a corresponding integration administrator role.

Therefore this document does not invent one.

The following choices remain Founder/Product authority decisions:

- GHM-admin-controlled linking;
- dual-sided user confirmation;
- a dedicated integration-management principal;
- a one-time migration/bootstrap ceremony;
- another explicitly evidenced mechanism.

Until one is selected and documented, link mutation remains prohibited.

## Link lifecycle requirements

A future contract must define at minimum:

- proposed/pending state, if any;
- active state;
- revoked state;
- who may create;
- who may approve;
- who may revoke;
- whether relinking is allowed;
- whether one QuoteFlow principal may map to multiple GHM accounts;
- whether one GHM account may map to multiple QuoteFlow principals;
- organization/Business cardinality;
- account-to-organization consistency rules;
- revocation propagation;
- audit provenance;
- concurrency and uniqueness;
- behavior when either system is unavailable;
- recovery after partial failure;
- rollback;
- shadow-read behavior;
- cutover ownership.

## Fail-closed rules

Until the authority contract is qualified:

- no implicit mapping;
- no fallback matching;
- no caller-supplied GHM identity accepted as proof;
- no adapter bypass of GHM authorization;
- no link creation from ordinary Business create/update operations;
- no production traffic routed through an unverified mapping;
- unresolved mapping must fail closed.

## Explicit non-goals

This contract does not authorize:

- `identity_link` tables;
- external UUID columns;
- mapping RPCs;
- mapping HTTP routes;
- Supabase changes;
- QuoteFlow changes;
- account migration;
- Business migration;
- adapter implementation;
- shadow qualification;
- cutover.

## Construction decision

The cross-system mapping boundary is now fully identified, but **link authority remains a Founder/Product gate** because current repository evidence does not establish who may create or revoke a trust relationship between the two systems.

The next action requiring Founder/Product authority is to choose the link-creation model. Once selected, its exact lifecycle and persistence contract can be authored and separately qualified.

Until then, QuoteFlow remains Supabase-authoritative and GHM remains authoritative only for its already-qualified domains.
