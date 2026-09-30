# GHM Production Replacement Foundation

**Status:** Construction — foundation slices qualified; production replacement not yet authorized.

**Purpose:** Define the non-destructive path for GHM Core Engine to become ZAID Technologies' backend while Zaid Connect and QuoteFlow remain live on their existing Supabase backends.

## Mission

GHM is being constructed as ZAID Technologies' own backend platform. It must be capable of replacing managed backend dependencies without requiring a risky production cutover.

## Non-Negotiable Production Rule

**No production product is switched from Supabase to GHM until GHM has independently passed production qualification.**

The migration must be parallel, observable, reversible, and product-by-product.

## Current State

```text
Zaid Connect  ───────► Supabase PostgreSQL/Auth/Functions/Realtime/Storage
QuoteFlow     ───────► Supabase PostgreSQL/Auth/Functions/Storage

GHM           ───────► GHM PostgreSQL + GHM-owned service boundaries
                         └── temporary storage provider may be used behind a GHM boundary
```

Zaid Connect's approved API specification explicitly describes its current interfaces as Supabase Authentication, Supabase table/view access, PostgreSQL RPC functions, and Supabase Edge Functions. QuoteFlow currently ships with `@supabase/supabase-js` and a `supabase/` directory. These facts establish migration scope, not a requirement that GHM reproduce Supabase internals.

## Target State

```text
                         ┌───────────────┐
                         │ GHM Core API  │
                         └───────┬───────┘
                                 │
                 ┌───────────────┼────────────────┐
                 ▼               ▼                ▼
              Auth/API        PostgreSQL      Storage adapter
                 │               │                │
                 └───────────────┴────────────────┘
                                 │
                         ZAID-owned backend

Zaid Connect ──► GHM adapter ──► GHM
QuoteFlow   ──► GHM adapter ──► GHM

Storage adapter ──► current provider (e.g. Supabase Storage)
                 └─► future ZAID-owned storage without product rewrites
```

## Authority Rules

1. Product repositories remain authoritative for their own application contracts.
2. Existing Supabase migrations remain authoritative for existing Zaid Connect production data until migration is explicitly approved.
3. GHM's own PostgreSQL schema must be authoritative through repository migrations, not runtime `CREATE TABLE` statements.
4. The legacy `ghm.db` SQLite file is not schema authority and must not be used to reconstruct production schema.
5. No GHM migration is generated from guesswork or by copying Zaid Connect's schema wholesale.
6. GHM implements the capabilities actually required by the products and their approved workflows.
7. Infrastructure providers may implement a GHM capability temporarily, but provider choice must remain behind an explicit GHM boundary.
8. Supabase Storage is currently treated as a replaceable storage provider, not as GHM backend authority.

## Migration Strategy

### Phase 0 — Foundation

- Establish GHM schema authority and migration mechanism. **Qualified for the current construction slice.**
- Establish deterministic configuration and startup behavior. **Qualified.**
- Establish authentication and authorization contracts. **Current construction boundaries qualified; future resource policies remain separately governed.**
- Establish health/readiness and graceful shutdown. **Qualified.**
- Establish automated tests and CI. **Construction validation passing.**
- Establish deployment qualification. **Production deployment qualification remains open.**

### Phase 1 — Product capability inventory

Inventory actual Connect and QuoteFlow backend usage:

- authentication/session flows
- domain reads/writes
- RPC/business-rule operations
- storage operations
- realtime/subscription behavior
- notifications
- server-side provider/webhook boundaries

The inventory must be evidence-based from source code and current production contracts.

### Phase 2 — GHM compatibility boundary

Build explicit product-facing adapters rather than exposing an unrestricted generic table API.

Each capability must have an owner, contract, authorization model, and test coverage.

Current construction resource slices have been qualified independently. Product-facing Connect and QuoteFlow adapters remain future work and are not authorized merely because underlying GHM resources exist.

### Phase 3 — Shadow qualification

Exercise GHM against non-production/test copies and representative workflows while production continues to use Supabase.

**Status: not started.**

### Phase 4 — Controlled cutover

Migrate one product/capability at a time behind a reversible configuration boundary. Keep Supabase available as rollback until stability is demonstrated.

**Status: not started / not authorized.**

### Phase 5 — Decommission

Only after sustained operational confidence may individual Supabase dependencies be retired. Never delete production data as part of the initial cutover.

## Current GHM Blocking Conditions

The earlier construction blockers concerning absence of a GHM catalog and unimplemented first resource slices are no longer current for the qualified construction foundation.

Current blockers to **production replacement** are:

- provider/bootstrap authority cleanup remains unresolved because the available provider path does not expose the independent bootstrap authority required to remove legacy `ghm_db_user` memberships safely;
- future GHM resource slices still require their own schema, repository, transaction, authorization, Resource API, operational, and ACL qualification;
- product-facing Connect and QuoteFlow adapters have not yet been implemented or qualified against their concrete GHM contracts;
- end-to-end shadow qualification and cutover/rollback evidence do not yet exist.

These are deliberate gates, not reasons to touch the live Connect or QuoteFlow deployments.

## Storage Provider Position

GHM does not need to own physical storage on day one. A free or otherwise available provider may be used while GHM's own storage capability is being constructed.

The architectural requirement is that product code talks to a **GHM storage boundary**, not directly to a provider. The provider can therefore be replaced later without changing Zaid Connect or QuoteFlow contracts.

Current position:

```text
Product → GHM storage boundary → Supabase Storage (temporary provider)

Future:

Product → GHM storage boundary → ZAID-owned storage
```

The temporary provider is not a production-replacement blocker by itself.

## Definition of Production-Ready Replacement

GHM is not production-ready merely because it builds or starts. It is production-ready for replacement when:

- its schema is migration-controlled and reproducible;
- authentication and authorization are independently tested;
- tenant/data isolation is proven;
- every product-facing operation is explicitly governed;
- storage and realtime contracts are owned by GHM or deliberately retained behind an adapter;
- health/readiness, shutdown, logging, and failure behavior are operationally defined;
- deployment can be reproduced and rolled back;
- Connect and QuoteFlow workflows pass against GHM without production traffic being required for qualification;
- cutover and rollback are both documented and tested.

## Immediate Construction Boundary

**Current:** continue evidence-gated reconciliation of provider/bootstrap authority and future resource/product contracts. Do not infer production readiness from the completed construction slices.

The currently qualified canonical Business Identity, Project, Enquiry, Review, Opportunity Core, Project Quote, Resource API, and Operational Boundary slices are construction-qualified. Product adapters, shadow qualification, and controlled cutover remain separately gated.
