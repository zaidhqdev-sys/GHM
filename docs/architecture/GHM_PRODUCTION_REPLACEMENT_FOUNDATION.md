# GHM Production Replacement Foundation

**Status:** Construction

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
```

Zaid Connect's approved API specification explicitly describes its current interfaces as Supabase Authentication, Supabase table/view access, PostgreSQL RPC functions, and Supabase Edge Functions. QuoteFlow currently ships with `@supabase/supabase-js` and a `supabase/` directory. These facts establish migration scope, not a requirement that GHM reproduce Supabase internals.

## Target State

```text
                         ┌───────────────┐
                         │ GHM Core API  │
                         └───────┬───────┘
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
              Auth/API        PostgreSQL      Storage/Realtime
                 │               │               │
                 └───────────────┴───────────────┘
                                 │
                         ZAID-owned backend

Zaid Connect ──► GHM adapter ──► GHM
QuoteFlow   ──► GHM adapter ──► GHM
```

## Authority Rules

1. Product repositories remain authoritative for their own application contracts.
2. Existing Supabase migrations remain authoritative for existing Zaid Connect production data until migration is explicitly approved.
3. GHM's own PostgreSQL schema must be authoritative through repository migrations, not runtime `CREATE TABLE` statements.
4. The legacy `ghm.db` SQLite file is not schema authority and must not be used to reconstruct production schema.
5. No GHM migration is generated from guesswork or by copying Zaid Connect's schema wholesale.
6. GHM implements the capabilities actually required by the products and their approved workflows.

## Migration Strategy

### Phase 0 — Foundation

- Establish GHM schema authority and migration mechanism.
- Establish deterministic configuration and startup behavior.
- Establish authentication and authorization contracts.
- Establish health/readiness and graceful shutdown.
- Establish automated tests and CI.
- Establish deployment qualification.

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

### Phase 3 — Shadow qualification

Exercise GHM against non-production/test copies and representative workflows while production continues to use Supabase.

### Phase 4 — Controlled cutover

Migrate one product/capability at a time behind a reversible configuration boundary. Keep Supabase available as rollback until stability is demonstrated.

### Phase 5 — Decommission

Only after sustained operational confidence may individual Supabase dependencies be retired. Never delete production data as part of the initial cutover.

## Current GHM Blocking Conditions

The current GHM runtime still contains architectural debt that prevents production qualification:

- runtime database/table creation instead of migration authority
- unsafe implicit admin bootstrap (`users.id = 1`)
- generic authenticated table API
- RLS context set through unawaited pool queries, which does not guarantee the settings apply to the protected query's connection
- Socket.IO wildcard CORS and missing authenticated channel authorization
- storage implementation coupled to an external provider
- missing complete operational health/readiness contract
- missing automated qualification suite and CI
- live GHM PostgreSQL endpoint has not yet been successfully inspected from the development environment

These are construction blockers, not reasons to touch the live Connect or QuoteFlow deployments.

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

**Next:** establish GHM database authority and migration foundation, without changing production product configuration.
