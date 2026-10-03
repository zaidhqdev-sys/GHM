# QuoteFlow ↔ GHM Identity Link Authority Contract

## Status

**RECONCILIATION REQUIRED — DUAL CONFIRMATION IS NOT A PERMANENT RUNTIME IDENTITY AUTHORITY**

This contract defines the decision boundary for establishing cross-system identity links. The selected authority model is dual-sided confirmation; persistence remains separately gated.

## Existing evidence

The preceding persistence design used legacy QuoteFlow/Supabase identifiers as if they were durable runtime identity keys. That assumption is superseded.

The target architecture is GHM-owned:

- QuoteFlow authenticated session → GHM `account_identity.id`
- QuoteFlow Business context → GHM `business.id` → `business_membership`

Legacy Supabase identifiers may participate in a migration-only crosswalk, but do not establish ongoing GHM trust.

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

## Authority decision

The Founder/Product authority decision is resolved by the dedicated dual-confirmation contract.

Neither QuoteFlow nor GHM may unilaterally establish a cross-system link. Account and Business links require independent confirmation from both sides.

The persistence boundary is separately defined in `QUOTEFLOW_IDENTITY_LINK_PERSISTENCE_CONTRACT.md`. That document does not itself authorize migration or runtime mutation.

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

The cross-system mapping boundary and link authority are now explicitly resolved.

The dual-confirmation authority model and persistence design are separately documented. Database objects and mutation remain implementation gates and require independent qualification for schema ownership, uniqueness, transactionality, concurrency, audit provenance, and runtime least privilege.

The next construction gate is qualification of GHM-owned QuoteFlow authentication and migration provenance. Permanent identity-link persistence is not the next slice.

Until then, QuoteFlow remains Supabase-authoritative and GHM remains authoritative only for its already-qualified domains.
