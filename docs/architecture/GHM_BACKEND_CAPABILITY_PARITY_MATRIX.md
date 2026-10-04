# GHM Backend Capability Parity Matrix

## Status

**CONSTRUCTION — ARCHITECTURE / QUALIFICATION ROADMAP**

## Purpose

Define the capability boundary required for GHM to become the independent backend platform for ZAID Connect and QuoteFlow.

Supabase is treated as a historical/source platform during migration, not as the target runtime architecture.

The matrix deliberately distinguishes:

- **qualified** — evidence exists that the capability is owned and usable under a defined contract;
- **partial** — some implementation exists but the complete platform contract is not yet qualified;
- **outstanding** — construction or qualification is still required;
- **not required yet** — capability is not currently justified by product requirements.

## Canonical capability matrix

| Capability | GHM canonical owner | Current state | Next gate |
|---|---|---|---|
| PostgreSQL persistence | Database / resource repositories | QUALIFIED | Continue resource coverage |
| Schema/migrations | Migration runner + ghm_schema_owner | QUALIFIED | Continue migration authority reconciliation |
| Transactions | DB transaction boundary | QUALIFIED | Maintain across new resources |
| Authentication | Auth foundation | QUALIFIED / expanding | Production-hardening gate |
| Password recovery | Auth recovery + QuoteFlow migration ceremony | QUALIFIED | Production delivery/runtime gate |
| Sessions / refresh | Auth foundation | QUALIFIED | Production-hardening gate |
| Authorization | Resource authorization layer | PARTIAL | Durable platform security qualification |
| Tenant isolation | Resource-specific authorization | PARTIAL | Platform-wide tenant isolation contract |
| Audit logging | Resource/security audit model | OUTSTANDING | Define canonical audit ownership |
| Object/file storage | GHM storage boundary | OUTSTANDING | Define object API + metadata + access contract |
| Realtime | GHM event/realtime boundary | OUTSTANDING | Define delivery semantics and ownership |
| Server-side functions | GHM service/runtime layer | PARTIAL | Define provider-neutral function contract |
| Background jobs / queues | GHM operational layer | OUTSTANDING | Define durable job ownership/retry semantics |
| Scheduled jobs | GHM operational layer | OUTSTANDING | Define scheduler contract |
| Webhooks/integrations | GHM integration layer | PARTIAL | Define inbound/outbound delivery contracts |
| Secrets/configuration | Deployment/runtime configuration | PARTIAL | Production secret and environment qualification |
| Health/readiness | Runtime health boundary | QUALIFIED | Preserve fail-closed behavior |
| Structured errors | HTTP/application error boundary | PARTIAL | Complete safe structured-error contract |
| Observability/logging | Runtime operational boundary | PARTIAL | Durable operational observability qualification |
| Backup/recovery | Database/operations boundary | OUTSTANDING | Define RPO/RTO and restore qualification |
| Migration/import tooling | Migration tooling | QUALIFIED / expanding | Product migration completion |
| Storage backup/recovery | Storage operations | OUTSTANDING | Define retention and recovery contract |
| Security/contract CI gates | CI qualification suite | OUTSTANDING | Dedicated platform security/contract gate |

## Architectural decisions

### 1. GHM owns the backend contract

Connect and QuoteFlow must consume GHM-owned contracts rather than importing Supabase-specific runtime semantics.

A provider can be used internally only when the capability remains behind a GHM-owned boundary and does not become the product's canonical authority.

### 2. One capability, one canonical owner

Each capability must have one explicit GHM owner.

Resource implementations may consume the capability, but must not independently recreate its authority.

### 3. Historical migration is separate from runtime architecture

The inability to recover the inactive historical QuoteFlow Supabase project does not block construction of the new backend.

Historical identity provenance remains a migration gate only for the two preserved legacy users.

### 4. Storage is a first-class capability

Business profile media, product/sale-item media, before/after work, review evidence, and similar future Connect features require durable object storage.

Storage therefore cannot be treated as an incidental database column or a frontend concern.

### 5. Realtime must be justified by product contracts

GHM should not reproduce every Supabase feature merely for parity. Realtime is constructed where Connect/QuoteFlow require it, with explicit event ownership and delivery semantics.

### 6. Recovery is part of the backend

A backend is not complete merely because CRUD works. Database and object-storage recovery, migration rollback boundaries, health/readiness, and operational evidence are platform capabilities.

## Construction order

### Phase A — Foundation closure

1. Production security hardening.
2. Durable authorization/tenant-isolation contract.
3. Audit logging.
4. Structured errors and observability.
5. Security/contract CI gates.

### Phase B — Platform capabilities

6. Object/file storage.
7. Event/realtime infrastructure.
8. Background jobs/queues.
9. Scheduler.
10. Webhooks/integration delivery.

### Phase C — Recovery and operations

11. Database backup/recovery.
12. Object-storage backup/recovery.
13. Disaster-recovery qualification.
14. Migration/import/export tooling.

### Phase D — Product cutover

15. Connect capability-by-capability cutover.
16. QuoteFlow clean-start/current-user provisioning.
17. Supabase runtime dependency removal.
18. Legacy object/role retirement only after all preservation gates pass.

## Connect-specific implications

The platform must support future business-facing media without making Supabase Storage the canonical owner.

Potential GHM-owned object classes include:

- business profile media;
- product/sale-item media;
- before/after work;
- review attachments/evidence;
- other explicitly approved business content.

Each object class requires authorization, ownership, lifecycle, size/type limits, access semantics, retention, and recovery rules.

## QuoteFlow-specific implications

QuoteFlow has no meaningful existing-user migration population beyond the founder account.

Therefore:

- new/current QuoteFlow accounts should use GHM authentication directly;
- historical Supabase identity recovery is not on the critical path for backend construction;
- the existing reset/re-enrollment work remains available for the exceptional legacy account;
- no bulk migration infrastructure is justified without actual users.

## Definition of backend-ready

GHM is backend-ready for a product capability when:

1. GHM owns the canonical data and authorization contract.
2. The runtime path does not require Supabase.
3. Persistence/migration behavior is deterministic.
4. Security and tenant boundaries are qualified.
5. Failure behavior is explicit.
6. Operational health and observability exist.
7. Recovery expectations are documented and tested where applicable.
8. Documentation is reconciled with implementation and database authority.

## Explicit non-goals

- Recreating Supabase feature-for-feature without product justification.
- Keeping Supabase as a hidden runtime dependency.
- Migrating historical identities merely for cosmetic completeness.
- Building bulk QuoteFlow migration machinery without a real population.
- Reopening already qualified resource contracts.

## Documentation reconciliation

This matrix is subordinate to the canonical database authority, authentication, authorization, migration ownership, and product resource contracts.

It is a roadmap and capability ownership boundary, not authorization for database or production mutations.
