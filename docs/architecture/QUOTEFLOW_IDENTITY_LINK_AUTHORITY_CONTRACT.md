# QuoteFlow ↔ GHM Identity Link Authority Contract

## Status

**HISTORICAL / SUPERSEDED — DUAL CONFIRMATION IS NOT A PERMANENT RUNTIME IDENTITY AUTHORITY**

This contract records an earlier cross-system identity-link proposal and is not the current QuoteFlow migration authority. Current migration provenance is governed by `QUOTEFLOW_GHM_ACCOUNT_ONBOARDING_MIGRATION_CONTRACT.md` and its related migration qualification records. No separate permanent identity-link table or attestation-based runtime identity authority is authorized by this historical contract. All subsequent sections preserve the former proposal; any claims that identity mapping/persistence is not yet implemented are historical and must not override the qualified GHM external-identity/migration boundary.

## Existing evidence

The preceding persistence design used legacy QuoteFlow/Supabase identifiers as if they were durable runtime identity keys. That assumption is superseded.

The target architecture is GHM-owned:

- QuoteFlow authenticated session → GHM `account_identity.id`
- QuoteFlow Business context → GHM `business.id` → `business_membership`

Legacy Supabase identifiers may participate in a migration-only crosswalk, but do not establish ongoing GHM trust.

Historical proposal status: at the time this dual-confirmation proposal was written, neither crosswalk had been implemented under this proposal. Current status differs by mapping type: the GHM `(provider, subject) → account_identity.id` external-identity mapping is qualified for migration provenance; the legacy organization → GHM Business reconciliation contract is qualified only for its synthetic outcomes, while live Business-provisioning implementation remains unqualified. Neither result creates a permanent runtime identity-link resource or proves organization/Business ownership equivalence.

GHM's application authorization is Business-scoped and derives permissions from authenticated GHM context and Business membership. It does not authorize a permanent cross-system identity-link resource through this historical contract.

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

## Historical fail-closed rules from the former proposal

The rules below preserve the original dual-confirmation proposal and are not a current qualification checklist for this superseded contract. Current migration mapping and provisioning status is governed by the living migration contracts named above; the old proposal cannot reopen completed external-identity construction or authorize a permanent runtime identity-link resource.

At the historical proposal stage, the fail-closed rules were:

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

## Historical construction decision — superseded

The preceding construction sequence records the earlier dual-confirmation identity-link proposal. Its statement that GHM-owned QuoteFlow authentication/migration provenance was the next gate is stale: the bounded GHM authentication and account-onboarding/migration foundation is now construction-qualified.

The current migration authority is `QUOTEFLOW_GHM_ACCOUNT_ONBOARDING_MIGRATION_CONTRACT.md` and the exact `(provider=supabase, sourceSubject)` migration-provenance mapping. The old identity-link persistence design is not an implementation gate and does not authorize permanent runtime identity-link tables, attestation-based runtime identity, or new identity-link routes.

Still separately gated are authoritative reconciliation of both founder-owned QuoteFlow source accounts, full non-production reset/re-enrollment DB + HTTP ceremony qualification, migration-only legacy-organization-to-GHM-Business provisioning qualification, product session/runtime migration, and production cutover. QuoteFlow remains on its existing production path until those gates and founder authorization are satisfied.
