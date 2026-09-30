# GHM Shared Platform Capabilities Boundary Audit

**Canonical owner:** GHM platform governance
**Status:** Read-only architecture audit — documentation only
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `0a9a9f7`
**Depends on:**
- [GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md](./GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md)
- [PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md](./PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md)
- [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md)
- [GHM_ERROR_SEMANTICS_AND_VERSIONING_CONTRACT.md](./GHM_ERROR_SEMANTICS_AND_VERSIONING_CONTRACT.md)

## Nature

This audit examines five potentially shared platform capabilities:

1. Object storage
2. Durable audit
3. Jobs / queues / asynchronous execution
4. Realtime / subscriptions
5. Observability / diagnostics

It does **not** decide that GHM must own all five.
It does **not** authorize implementation, provider selection, transport selection, or cloud infrastructure.

```text
NO SHARED PLATFORM CAPABILITY IMPLEMENTATION AUTHORIZED
NO STORAGE / QUEUE / REALTIME / OBSERVABILITY PROVIDER SELECTED
NO CLOUD INFRASTRUCTURE SELECTED
```

## Audit method

Evidence inspected includes: `package.json`, `src/**`, `database/migrations/**`, `scripts/**`, `docs/architecture/**`, `docs/HANDOVER_2026-09-16.md`, and Connect source audits present in this repository. Claims below cite paths. Unused dependencies are not treated as existing capabilities.

---

## 1. Object storage

### Current repository state

| Evidence | Path / finding |
|---|---|
| S3 client dependencies listed | `package.json`: `@aws-sdk/client-s3`, `@aws-sdk/client-s3-presigner` |
| Multer types listed | `package.json` `devDependencies`: `@types/multer` |
| Runtime imports of S3 / multer under `src/` | **None found** |
| GHM storage resource / HTTP upload API | **Absent** |
| Account media reference field only | `avatar_ref` on `ghm.account_identity` (`src/resources/business-identity/*`) — opaque reference string; not object storage |
| Connect storage needs audited | `docs/architecture/CONNECT_STORAGE_MEDIA_SOURCE_AUDIT.md` — Connect uses Supabase Storage; GHM has no storage resource |
| Campaign / charter forbid storage in current slices | Campaign contracts; Platform Charter; handover Media/Storage **OPEN / NOT YET AUTHORIZED** |
| Shared candidate listed | `docs/architecture/PRODUCT_BACKEND_CAPABILITY_INVENTORY.md` item 6 |

### Existing implementation

**None as a GHM object-storage capability.** Dependencies appear installed but unused. Opaque `avatar_ref` is identity metadata, not a storage platform.

### Missing capability

Governed object storage: buckets/prefixes, upload/download, signed access, retention, ACL, product-facing storage contract.

### Current product requirements

| Need | Classification |
|---|---|
| Connect logos/avatars/docs/images (if those workflows remain live on GHM) | **FUTURE / GATED** (Connect evidence; not GHM-implemented) |
| KBM generated media / working files | **PRODUCT-OWNED** (local-first; Platform Charter) |
| Campaign media children | **NOT CURRENTLY JUSTIFIED** for GHM (Campaign storage not authorized) |

### GHM ownership case

- Cross-product private documents, logos, verification files with business-scoped ACL
- Consistent least-privilege object access bound to AuthContext / membership
- Provider-neutral storage abstraction shared by Connect/QuoteFlow/future products

### Product ownership case

- KBM generation outputs, temporary artifacts, local exports
- Product-specific publishing pipelines
- Media generation itself (AI adapters)

### Shared-platform threshold

Elevate only when multiple ZAID products require the **same** governed object semantics, ownership/ACL model is clear, provider replacement is possible, local-first products are not forced to upload all artifacts, and Founder authorizes construction.

### Security implications

Tenant/business isolation, authenticated upload/download, no product DB credentials for blobs, no public exposure by default, secrets out of URLs where possible, retention/deletion authority.

### Local-first implications

KBM may keep generated media local. GHM must not require cloud object storage for KBM local operation. Future GHM storage must not automatically absorb KBM’s media pipeline.

### Provider independence

Do not lock contracts to AWS S3, R2, Supabase Storage, Azure Blob, GCS, MinIO, or others. Capability contracts must stay provider-neutral.

### Decision status

**FUTURE / GATED** (platform candidate) · KBM media **PRODUCT-OWNED** · Provider **None Selected**

---

## 2. Durable audit

### Current repository state

| Evidence | Path / finding |
|---|---|
| Resource-specific commercial provenance events | `ghm.commercial_event` (`database/migrations/20260915150000_create_commercial_schema.sql`); inserted by commercial trial path (`src/resources/commercial/repository.ts`) |
| Commercial contract classification | `COMMERCIAL_TRIAL_OPERATION_CONTRACT.md`: event is **audit evidence**, not a generic application event bus |
| Connect `audit_logs` | Readiness docs: Connect references `audit_logs` with **EVIDENCE INSUFFICIENT** migration proof; GHM platform audit **not** constructed |
| Timestamps / `created_by` fields on resources | Common resource columns — **not** a platform audit log |
| Console logging | Operational diagnostics (see §5), not durable audit |
| Platform charter / PIBC | Durable audit **FUTURE / GATED** |
| Inventory candidate | PRODUCT_BACKEND_CAPABILITY_INVENTORY item 10 |

### Existing implementation

**Resource-specific commercial event provenance** exists for commercial trial activation.
**No** platform-wide durable security/audit log product exists.

### Missing capability

Cross-resource security audit, membership change history platform, retention policy, product-facing audit query API (if ever authorized).

### Current product requirements

| Need | Classification |
|---|---|
| Commercial trial provenance | **EXISTING** (commercial-scoped) |
| Connect-style generic audit_logs | **FUTURE / GATED** / evidence incomplete |
| KBM consent/generation security trail | **PRODUCT-OWNED** initially / **UNDECIDED** whether to promote later |
| Product analytics | **PRODUCT-OWNED** |

### Distinctions (do not merge)

| Kind | Notes |
|---|---|
| A. Security audit | Platform candidate if cross-product |
| B. Authorization/membership changes | Platform candidate if required |
| C. Resource lifecycle history | Often resource-specific |
| D. Business activity/events | e.g. commercial_event — domain-scoped |
| E. Product analytics | Product-owned |
| F. Application logs | Observability (temporary/diagnostic) |

### GHM ownership case

Cross-product security/compliance trail with AuthContext binding and retention, if multiple products require the same semantics.

### Product ownership case

Product analytics; KBM generation timelines; UX activity feeds unless promoted.

### Shared-platform threshold

Multiple products need the same durable security/audit semantics; event vocabulary and retention clear; not conflated with analytics; Founder authorizes.

### Security implications

Who can read audit; PII; immutability; no secret leakage in payloads; business isolation.

### Local-first implications

Local KBM can keep product timelines local; does not require GHM audit to operate. If GHM audit is later required for governed mutations, it must not force cloud hosting of media.

### Provider independence

Audit semantics must not depend on a vendor log product.

### Decision status

**EXISTING / INTERNAL** for commercial_event provenance · **FUTURE / GATED** for platform-wide durable audit · analytics **PRODUCT-OWNED**

---

## 3. Jobs / queues / asynchronous execution

### Current repository state

| Evidence | Path / finding |
|---|---|
| Queue/job libraries in `package.json` | **None** (no Bull/BullMQ/Redis/Rabbit/SQS/pg-boss) |
| Workers / cron / schedulers under `src/` | **None found** |
| Campaign generation jobs | Explicitly **not authorized** (Campaign contracts; handover) |
| Handover | Media/Storage/Realtime/adapters open; Campaign children/jobs not authorized |
| `socket.io` listed | Unused in `src/` (not a job platform) |
| Connect admin verification queue | Product evidence only; GHM table not constructed |

### Existing implementation

**None.** GHM operations are synchronous service/repository/transaction paths.

### Missing capability

Durable job records, workers, schedules, platform retry queues.

### Current product requirements

| Need | Classification |
|---|---|
| Synchronous governed resource ops | **CURRENTLY REQUIRED** (existing GHM model) |
| KBM AI generation / media rendering async | **PRODUCT-OWNED** (KBM domain; capability ports) |
| Connect/admin queues | **FUTURE / GATED** / product-specific until evidence + Founder gate |
| Generic GHM job marketplace | **NOT CURRENTLY JUSTIFIED** |

### Distinctions

Synchronous resource ops ≠ product background work ≠ AI generation jobs ≠ media rendering ≠ scheduled jobs ≠ retryable external-provider calls ≠ durable platform jobs.

### GHM ownership case

Cross-product durable work that must share AuthContext, business isolation, and governed retries (e.g. future payment reconciliation workers) — only after evidence.

### Product ownership case

KBM generation runners; product-specific media pipelines; local async UX work.

### Shared-platform threshold

Multiple products need the same durable job semantics; security/lifecycle clear; products cannot own runners safely; Founder authorizes. Do not promote merely because AI jobs are asynchronous.

### Security implications

Job payload isolation; no privilege escalation via job injection; secrets not in job bodies; business scoping.

### Local-first implications

KBM can run generation locally without a GHM queue. A future GHM job platform must not be required for local KBM operation.

### Provider independence

Do not select Redis, BullMQ, RabbitMQ, SQS, pg-boss, Vercel Cron, etc. in this audit.

### Decision status

**NOT JUSTIFIED** as current GHM platform requirement · KBM async generation **PRODUCT-OWNED** · Generic platform jobs **FUTURE / GATED** / **UNDECIDED** until multi-product evidence

---

## 4. Realtime / subscriptions

### Current repository state

| Evidence | Path / finding |
|---|---|
| `socket.io` dependency | `package.json`; **no** `src/` import found |
| WebSocket/SSE/LISTEN/NOTIFY usage in GHM `src/` | **None found** (false-positive `listen` is HTTP server bind) |
| GHM Notification resource | Persistence qualified; **no** realtime transport in GHM (`src/resources/notification/*`) |
| Connect realtime audit | `CONNECT_REALTIME_SOURCE_AUDIT.md` — notifications/leads subscriptions; **no GHM realtime authorized**; degradeable to polling |
| Handover | Realtime **OPEN / NOT YET AUTHORIZED** |

### Existing implementation

**None** as GHM realtime infrastructure. Notification **persistence** exists separately.

### Missing capability

Platform WebSocket/SSE/pubsub, authorized channels, presence, broadcast.

### Current product requirements

| Need | Classification |
|---|---|
| Connect notification/lead live UX | **FUTURE / GATED** (product evidence; degradable) |
| GHM resource change stream | **NOT CURRENTLY JUSTIFIED** by GHM code |
| KBM realtime collaboration | **NOT CURRENTLY JUSTIFIED** / **PRODUCT-OWNED** if ever needed |
| Presence/collaboration platform | **NOT CURRENTLY JUSTIFIED** |

### GHM ownership case

Only if multiple products require the same authorized change-delivery semantics bound to GHM authz.

### Product ownership case

UX polling/refresh; product-specific push; Connect may keep provider realtime until a GHM gate exists.

### Shared-platform threshold

Hard cross-product requirement proven; authz model for channels clear; degrade path defined; Founder authorizes. Convenience alone is insufficient (`CONNECT_REALTIME_SOURCE_AUDIT.md`).

### Security implications

Channel filters must not trust client-supplied tenant ids without GHM authz; no leakage across businesses.

### Local-first implications

Local KBM does not need GHM realtime. Polling/local events remain valid.

### Provider independence

Do not select socket.io, Supabase Realtime, Ably, etc. here. Installed `socket.io` is unused evidence of dependency debt, not capability.

### Decision status

**NOT JUSTIFIED** for current GHM platform · Connect realtime **FUTURE / GATED** · Provider **None Selected**

---

## 5. Observability / diagnostics

### Current repository state

| Evidence | Path / finding |
|---|---|
| Health | `GET /healthz` (`src/http/app.ts`) |
| Readiness | `GET /readyz` (`src/server.ts`) |
| Structured error logs (partial) | `http_request_failed` JSON name-only (`src/http/app.ts`); startup/uncaught JSON (`src/server.ts`) |
| Less-bounded error dump | `enquiry-router.ts` `console.error('HTTP request failed:', error)` |
| Operational boundary construction | `CONSTRUCTION_QUALIFICATION_SEQUENCE.md` — Operational boundary **CLOSED / PASS** for construction; production qualification open |
| Request/correlation IDs | **Not found** as platform feature |
| OpenTelemetry / metrics / tracing libs | **Not found** in `package.json` / `src/` |
| Error semantics contract | Distinguishes product-facing errors vs internal diagnostics |

### Existing implementation

**EXISTING / INTERNAL** thin operational observability: health/readiness, console logging, partial structured errors. Construction operational boundary qualified for current slice.

### Missing capability

Platform metrics/tracing, correlation IDs, uniform safe logging policy, production observability qualification.

### Current product requirements

| Need | Classification |
|---|---|
| Health/readiness for GHM process | **CURRENTLY REQUIRED** (exists) |
| Safe internal diagnostics | **CURRENTLY REQUIRED** (partial) |
| Cross-product APM platform | **FUTURE / GATED** / **UNDECIDED** |
| Product-facing error semantics | Governed by Error Semantics contract — not metrics |

### Distinctions

Internal diagnostics ≠ security logging ≠ product-facing errors ≠ metrics ≠ tracing ≠ durable audit ≠ health/readiness ≠ provider diagnostics.

### GHM ownership case

Process health, safe logs for GHM runtime, future correlation across governed operations.

### Product ownership case

Product UI telemetry/analytics; KBM generation progress UX.

### Shared-platform threshold

Promote richer observability when operational burden and multi-service correlation justify it — without leaking secrets to products.

### Security implications

Keep credentials, JWTs, private keys, database URLs, secrets, and raw sensitive provider payloads out of product-facing responses and out of logs where applicable.

### Local-first implications

Local GHM/KBM still benefit from health and safe logs; does not require cloud APM.

### Provider independence

Do not select Datadog/New Relic/OTel vendor lock into domain contracts.

### Decision status

**EXISTING / INTERNAL** (thin) · richer platform observability **FUTURE / GATED** · Provider **None Selected**

---

## 6. Cross-capability ownership matrix

| Capability | Current State | GHM Ownership Status | Product Ownership Status | Provider Selected | Implementation Authorized |
|---|---|---|---|---|---|
| Object storage | Unused S3 deps; no GHM storage API | Future/Gated | KBM media Product-Owned | None Selected | Closed |
| Durable audit | commercial_event only | Existing/Internal (commercial); Future/Gated (platform-wide) | Analytics Product-Owned | None Selected | Closed |
| Jobs / queues | Absent | Not Justified now; Future/Gated if multi-product evidence | KBM generation Product-Owned | None Selected | Closed |
| Realtime | Unused socket.io; no GHM realtime | Not Justified now; Future/Gated for Connect UX | UX refresh Product-Owned | None Selected | Closed |
| Observability | healthz/readyz + console logs | Existing/Internal; Future/Gated for richer platform | Product telemetry Product-Owned | None Selected | Closed |

---

## 7. Shared platform threshold

A capability must **not** become GHM platform infrastructure merely because:

- it is technically reusable
- it might be useful someday
- another product could theoretically use it
- a third-party provider offers it
- it is common in SaaS architectures

Evidence-based promotion criteria:

1. Multiple ZAID products genuinely require the same semantic capability
2. Ownership boundary is clear
3. Security / tenant implications are understood
4. Lifecycle responsibility is clear
5. Product-independent contract can be defined
6. Provider replacement is possible
7. Local-first behavior remains possible where applicable
8. Operational burden is justified
9. Qualification can be established
10. Founder explicitly authorizes promotion

No numerical scores.

---

## 8. GHM non-goals (these capabilities)

GHM is **not** automatically:

- a media CDN
- an AI generation engine
- a generic file host
- a generic job marketplace
- a product analytics platform
- a marketing automation engine
- a generic event bus
- a WebSocket platform
- a cloud infrastructure provider
- a vendor SDK container

---

## 9. ZAID infrastructure direction

ZAID may eventually reduce dependence on external infrastructure/providers and operate more of its own software/infrastructure.

This is **strategic direction only**.

It does **NOT** authorize selecting cloud providers, private cloud, servers, Kubernetes, object storage technology, Redis, hosting platforms, or immediate provider replacement.

Architecture should preserve future replacement freedom.

---

## 10. Local-first KBM boundary

```text
KBM Web
  → KBM domain
  → GHM backend
  → GHM resources

AI providers remain parallel behind KBM capability ports.
```

Generated media may remain local.

GHM does **not** automatically own: AI generation, generated media, local work files, media rendering, social publishing.

A future shared storage capability must be separately authorized.

---

## 11. Open decisions

| Decision | Status |
|---|---|
| Whether platform-wide durable audit becomes GHM-owned | UNDECIDED |
| Whether object storage becomes GHM-owned (beyond opaque refs) | UNDECIDED |
| Whether jobs/queues become GHM-owned | UNDECIDED (not justified by current GHM evidence) |
| Whether realtime has a hard cross-product GHM requirement | UNDECIDED (Connect convenience ≠ GHM mandate) |
| Observability platform contract beyond construction operational boundary | UNDECIDED |
| Retention requirements for any future audit/storage | OPEN |
| Local-vs-hosted artifact strategy for non-KBM products | OPEN |
| Provider-neutral storage contract contents | OPEN |
| Product-owned vs shared background execution for non-AI work | OPEN |
| Future ZAID-controlled infrastructure choices | FUTURE / STRATEGIC |

---

## 12. Implementation gate

```text
NO SHARED PLATFORM CAPABILITY IMPLEMENTATION IS AUTHORIZED BY THIS AUDIT.
```

Not authorized: storage implementation, audit schema (platform-wide), queue, worker, realtime transport, observability framework, provider integration, cloud infrastructure.

Any future implementation requires:

1. explicit capability decision
2. ownership decision
3. semantic contract
4. security boundary
5. provider/transport decision if required
6. qualification plan
7. Founder authorization

---

## 13. Relationship to existing architecture

This audit refines platform capability boundaries relative to the Platform Charter, Product Integration Boundary, Authentication Issuance ADR, and Error Semantics / Versioning contract.

It:

- does not override qualified resources (including Campaign at `0a9a9f7`)
- does not select callable transport (product-facing transport is HTTP/API per separate ADR; this audit still selects no storage/queue/realtime provider)
- does not select authentication issuance
- does not authorize implementation
- does not require cloud hosting
- does not change KBM local-first architecture

---

## Final gate

GHM SHARED PLATFORM CAPABILITIES BOUNDARY AUDIT COMPLETE.

DOCUMENTATION-ONLY GATE.

NO SHARED PLATFORM CAPABILITY IMPLEMENTATION AUTHORIZED.

NO STORAGE PROVIDER SELECTED.

NO QUEUE PROVIDER SELECTED.

NO REALTIME TRANSPORT SELECTED.

NO OBSERVABILITY PROVIDER SELECTED.

NO CLOUD INFRASTRUCTURE SELECTED.

NO PRODUCT CALLABLE TRANSPORT SELECTED BY THIS AUDIT (HTTP/API selected separately).

NO AUTHENTICATION ISSUANCE SELECTED.

GHM AUTHORIZATION REMAINS AUTHORITATIVE.

DIRECT PRODUCT DATABASE ACCESS REMAINS NOT APPROVED.

KBM REMAINS LOCAL-FIRST.
