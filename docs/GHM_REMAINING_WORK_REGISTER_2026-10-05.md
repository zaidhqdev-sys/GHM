# GHM Remaining Work Register — 2026-10-05

**Status:** CURRENT GOVERNED REMAINING-WORK REGISTER  
**Repository authority:** consolidated `main` at `3e73f69549b9f55c383e83277b97172dea9f8b67`  
**Purpose:** establish the exact work that remains before GHM can become the backend for Zaid Connect and QuoteFlow. This register is the construction/cutover planning authority after the 2026-10-05 documentation reconciliation.

## 1. Authority rule

The following order controls this register:

1. current code, migrations and qualification evidence on `main`;
2. current living contracts/evidence reconciled to that mainline;
3. this register for remaining-work classification;
4. historical handovers/source audits/gate snapshots only as provenance.

A historical document cannot reopen a qualified capability. A provider capability is not inferred from a provider-neutral contract. A product migration is not inferred from a qualified GHM resource.

## 2. Closed / qualified — do not reopen

The following are excluded from construction backlog unless a new product requirement creates a separately scoped adapter/composition need:

- Authentication construction foundation
- Authorization and transaction boundaries
- Durable tenant isolation and qualified tenant adoption sequence
- Business Identity/Profile
- Business Category
- Business Capability
- Business Hours
- Business Offering
- Opportunity Core
- Opportunity Capability Requirements
- Opportunity Participant
- Project
- Project Quote
- Enquiry
- Customer
- Quote
- Review and approved aggregate
- Trust
- Saved Business
- Notification persistence
- Support Request
- Campaign root and Founder-locked Campaign HTTP
- Commercial trial operation
- Country/currency reference-data dependency
- Connect integration lifecycle, trusted request context, governed operation resolution, GHM authorization binding, resource capability dispatch, first bounded service HTTP read, service assertion/replay protection
- Connect identity bridge/identity-adapter construction foundation
- Storage metadata schema, lifecycle persistence boundary, provider abstraction/factory/config/key boundary, and storage persistence qualification
- QuoteFlow snapshot validation, existing-account reconciliation executor, credentialless account provisioning, and related migration-boundary construction slices where explicitly marked qualified.

**Rule:** a future adapter or composed product response consumes these capabilities; it does not reopen their canonical contracts.

## 3. Genuine GHM-core remaining construction

### GHM-01 — Storage live-provider/service qualification
**Classification:** GHM core — partially qualified / open.

Already qualified:
- metadata/persistence boundary;
- lifecycle state machine;
- runtime direct-DML denial;
- provider-neutral service/repository;
- S3-compatible provider implementation boundary;
- configuration/key boundary.

Still required before production storage enablement:
1. wire the provider factory through the application composition root;
2. qualify grant expiry/enforcement;
3. qualify broader provider error mapping;
4. qualify full tenant/resource authorization at service level;
5. qualify failed-upload/deletion recovery and orphan reconciliation;
6. define and exercise backup/recovery expectations;
7. expose storage through HTTP/product paths only where explicitly selected;
8. move credentials into deployment-managed production secret/configuration;
9. perform founder-authorized production enablement/cutover.

The 2026-10-05 live qualification used Cloudflare R2 bucket zaid-ghm-production with a narrowly scoped R2 bucket-item Read/Write credential. The credential is not stored in the repository. This live test is evidence of provider capability, not production cutover authorization.

### GHM-02 — Database bootstrap authority cleanup
**Classification:** infrastructure/database gate — open and externally constrained.

Remaining:
- resolve bootstrap `ghm_db_user` memberships through the independent bootstrap/provider authority;
- complete legacy role/object dependency, ownership and disposition evidence;
- only after replacement paths and recovery access are qualified, sever the old `ghm_app_user -> ghm_db_user` path and retire unnecessary legacy authority.

Do not delete roles, revoke bootstrap-granted memberships, or alter production authority from the application runtime/migrator path.

### GHM-03 — Product-facing HTTP expansion
**Classification:** GHM transport/platform — open per capability.

Campaign HTTP and the first bounded service-to-service read are qualified. Broader HTTP is not blanket-authorized.

Remaining work is only where a product capability is explicitly selected:
- define exact semantic operation;
- define request/response/error contract;
- bind AuthContext and tenant authority;
- implement route;
- qualify runtime/negative authority/persistence;
- record evidence.

Do not build a generic table API.

### GHM-04 — Public Business/directory composition/search
**Classification:** candidate GHM product-facing capability; source evidence exists, implementation not yet authorized.

Required before construction:
- reconcile the remaining canonical public fields;
- define composed public Business projection ownership;
- define directory filter/search/sort/pagination/geo semantics;
- prove category/review/trust/hours composition does not duplicate ownership;
- authorize and qualify the smallest projection/search slice.

### GHM-05 — Commercial provider operations
**Classification:** GHM commercial integration — partially qualified / open.

The internal commercial lifecycle and provider-event ledgers already exist and must remain distinct.

Qualified foundations:
- governed commercial payment preparation boundary (PR #116 merged as `7d934e3` and runtime-qualified);
- governed commercial payment-result boundary (PR #115 merged and runtime-qualified);
- canonical Connect identity → GHM account resolution;
- active-account and business-management authorization;
- payment-preparation idempotency;
- provider-event idempotent application at the GHM boundary.

Remaining:
- PayFast checkout/redirect boundary;
- PayFast ITN callback contract and provider-specific signature verification;
- PayFast provider integration and production credential/configuration boundary;
- PayFast sandbox qualification, including checkout signature generation, ITN signature/source/amount validation, and governed payment-result application;
- runtime qualification against a non-production provider environment;
- only then production provider enablement/cutover.

**Approved provider direction:** PayFast is approved for the commercial payment path. Provider approval/configuration is not itself evidence that the provider-specific GHM integration is implemented or production-enabled.

Do not create another generic event ledger.

## 4. Product integration remaining work — not GHM resource reconstruction

### CONNECT-01 — Connect product adapter
**Classification:** product integration — open.

Required:
- operation-by-operation mapping from Connect to GHM;
- session/auth coexistence and migration plan;
- external UUID → GHM account/business mapping execution;
- public Business/directory adapter where selected;
- storage adapter where selected;
- commercial/payment adapter where selected;
- realtime ownership decision;
- edge/runtime/provider boundaries;
- atomic workflow adapter coverage;
- end-to-end qualification.

The existing Connect identity adapter/bridge qualification is a foundation, not a production session migration.

### CONNECT-02 — Connect referenced-object reconciliation
**Classification:** source/product evidence gate.

The E/F client-referenced objects must be proven in authoritative production source or retired from the product path. They must not become invented GHM tables.

### CONNECT-03 — Connect realtime ownership
**Classification:** product/provider decision.

Notification persistence is qualified. Live delivery is not. Decide whether Connect keeps provider realtime, uses polling, or receives a separately authorized GHM delivery capability. No GHM realtime platform is implied.

### CONNECT-04 — Connect server/provider runtime equivalents
**Classification:** product/provider integration.

Commercial checkout/webhook, AI proxy and other server-runtime behaviours require explicit ownership and provider-boundary contracts before any GHM implementation. PayFast is the approved commercial provider direction; provider-specific checkout/webhook implementation remains open and must terminate in the governed GHM commercial boundaries rather than create a parallel commercial ledger.

### CONNECT-05 — Connect atomic workflow parity
**Classification:** product workflow construction.

Only source-proven atomic workflows are candidates, including Project/Opportunity composition, payment prepare/apply, capability replacement/evidence and directory review where still required. Each requires its own contract and qualification.

## 5. QuoteFlow remaining work

### QF-01 — Authoritative production migration evidence
**Classification:** migration/provenance — open.

The two legacy `public.users` rows remain preserved pending authoritative QuoteFlow/source provenance. No email-only inference is allowed.

Required:
- approved authoritative source snapshot;
- deterministic provenance result for each retained legacy identity;
- explicit reviewed mapping and checksums;
- only then a separately authorized mutation/migration slice.

### QF-02 — QuoteFlow password reset/re-enrollment ceremony
**Classification:** GHM/Auth + product integration — open.

Credentialless account provisioning is qualified. The reset/re-enrollment execution remains a gate.

Required:
- deterministic reset state;
- safe one-time ceremony;
- no unsupported legacy password-hash migration;
- GHM session issuance after re-enrollment;
- synthetic non-production qualification first.

### QF-03 — QuoteFlow GHM session client
**Classification:** product integration — open.

QuoteFlow currently remains Supabase-authenticated. A GHM session client and runtime coexistence/cutover path must be separately qualified before product authentication moves.

### QF-04 — QuoteFlow organization → Business provisioning
**Classification:** migration capability — open.

The reconciliation contract is construction-qualified, but the Business provisioning contract is explicitly **not yet qualified**.

Before implementation:
- authoritative organization/owner evidence;
- deterministic create-vs-map outcome;
- idempotency/concurrency proof;
- owner membership establishment under GHM authority;
- no silent legacy-role translation.

### QF-05 — QuoteFlow production cutover
**Classification:** production migration — not started.

Requires all QF-01 through QF-04 gates, product workflow qualification, rollback evidence and founder authorization.

## 6. Production configuration / operations

### OPS-01 — Deployment qualification
**Open.**  
Prove deployable service configuration, health/readiness, secrets, database connectivity, migration authority and rollback without production product changes.

### OPS-02 — Provider/bootstrap configuration
**Open.**  
Resolve provider-managed bootstrap authority and production configuration/secrets through the appropriate infrastructure path.

### OPS-03 — Recovery/rollback
**Open.**  
Define and exercise recovery for database migration, storage provider failure, provider callback failure, and product cutover rollback. Do not treat backup/rollback as implied by successful tests.

### OPS-04 — Observability
**Open for production replacement.**  
Construction health/readiness is qualified. Production replacement still requires safe logs, correlation/diagnostic strategy, failure visibility and operational evidence. A vendor APM platform is not automatically required.

### OPS-05 — Shadow qualification
**Open / not started.**  
Exercise representative Connect and QuoteFlow workflows against non-production GHM while production remains on Supabase. Establish reconciliation, failure handling, monitoring and rollback evidence.

### OPS-06 — Controlled cutover
**Open / not authorized.**  
Product-by-product, reversible, observable cutover only after all capability and operational gates pass.

## 7. Explicitly NOT current GHM backlog

These are not construction tasks merely because they appear in older architecture/audit documents:

- generic platform audit/event ledger;
- generic job/queue platform;
- generic realtime platform;
- KBM media storage/generation infrastructure;
- arbitrary client-referenced Connect tables without authoritative source evidence;
- Supabase internals copied into GHM;
- unrestricted generic CRUD/table HTTP;
- provider-specific capability inferred from provider-neutral contracts;
- removal of qualified resource boundaries;
- replacement of Supabase production before migration evidence exists.

Commercial provider events and commercial lifecycle events remain their existing distinct ledgers.

## 8. Founder gates

The following require explicit Founder authorization before construction or production mutation:

1. each new Connect product adapter/capability;
2. directory/public projection construction beyond existing qualified resources;
3. commercial provider integration and production credentials;
4. concrete storage provider enablement;
5. QuoteFlow production migration/mutation;
6. legacy PostgreSQL role/object mutation;
7. shadow qualification against representative product workflows;
8. any production routing, DNS, environment, credential or traffic cutover.

## 9. Stop condition for construction

Before starting a new GHM-core construction slice, this register must show:

- authoritative source evidence;
- one canonical owner;
- explicit contract;
- explicit authorization;
- implementation;
- runtime/persistence/ACL qualification;
- documentation reconciliation.

If the need is already covered by a qualified capability, stop and build the adapter/composition at the product boundary instead.

## 10. Bottom line

If construction stopped at this register today, the exact blockers preventing GHM from becoming the backend for Connect + QuoteFlow are:

**GHM core:** storage live-provider/service qualification, commercial provider operations, public/directory composition where selected, broader explicitly authorized HTTP surfaces, and bootstrap authority cleanup.

**Connect:** product adapter, remaining source reconciliation, selected directory/storage/commercial/runtime/realtime workflows, atomic workflow parity, and end-to-end qualification.

**QuoteFlow:** authoritative legacy provenance, reset/re-enrollment, GHM session client, Business migration provisioning qualification, then product workflow/cutover qualification.

**Production:** deployment/secrets, recovery/rollback, observability, shadow qualification, and founder-authorized reversible cutover.

Everything else is qualified, historical/provenance, product-owned, provider-owned, or deliberately gated.
