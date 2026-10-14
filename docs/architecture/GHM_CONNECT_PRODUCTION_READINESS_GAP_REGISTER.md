# GHM ↔ Zaid Connect Production Readiness Gap Register

**Status:** GOVERNED GAP REGISTER — NO CONSTRUCTION AUTHORIZATION
**Source audit:** docs/architecture/GHM_CONNECT_BACKEND_READINESS_AUDIT.md
**Audited GHM tree:** historical Connect audit checkpoint; current GHM construction state is the consolidated `main` line.
**Connect source:** abcffa73f893602c25310a58946bebb91fd7eeb5
**Historical readiness checkpoint (2026-10-13; follow-up correction in review 2026-10-14):** This register remains a governed product-readiness gap record, not a live deployment snapshot. The historical dependency counts and source commit below remain provenance from the earlier audit. Later bounded construction is reconciled in the living status index and per-capability evidence. PayFast checkout/ITN/server-to-server confirmation is implemented and merged with deterministic local qualification; real sandbox/runtime end-to-end qualification, broader Connect product workflows, provider enablement, and production cutover remain open. The 2026-10-14 status/resume audit found stale PR-status statements after the earlier checkpoint; do not treat the date on this paragraph as proof of a complete current repository-wide reconciliation.
**Evidence sprint checkpoint:** see §8 (this document update)

## Purpose

This register converts the verified Connect↔GHM readiness audit into an actionable evidence boundary.

It does not authorize implementation, adapters, production migration, shadow qualification, cutover, provider cleanup, or reopening of any closed GHM capability.

## Current readiness conclusion and historical audit counts

GHM is not production-ready as the backend for Zaid Connect.

**Historical count warning:** the totals below are the classification counts from the original Connect source-audit snapshot, not a current measurement of GHM capability coverage. Later bounded construction and qualification are recorded in the current-state index and capability-specific evidence; use the current blocker states below and those living records for present status.

The original audit identified 48 concrete Connect backend dependencies and 54 coverage rows:

| Classification | Count |
|---|---:|
| ALREADY PROVIDES | 13 |
| PARTIALLY PROVIDES | 18 |
| DOES NOT YET PROVIDE | 14 |
| CONNECT-LOCAL | 2 |
| EXTERNAL PROVIDER | 6 |
| EVIDENCE INSUFFICIENT | 1 grouped set / 13 referenced objects |

The principal remaining blockers are the Connect/QuoteFlow product adapters and migration paths, public Business/directory parity where selected, commercial/provider runtime integration, storage provider/service/product exposure, realtime ownership, atomic workflow parity, unresolved source evidence, bootstrap authority cleanup, and production shadow/cutover gates.

## 1. Production-readiness blockers

| # | Blocker | Current state | Required evidence before construction | Authorization |
|---|---|---|---|---|
| 1 | Connect product adapter | **Partial — bounded identity adapter foundation and `saved_business.read` service boundary qualified; broader product adapter/workflow parity remains open** | Per-operation mapping from Connect services to GHM operations/providers/local behavior, with independent runtime and end-to-end qualification | Explicit per-capability adapter authorization |
| 2 | Auth/session compatibility | **GHM authentication foundation QUALIFIED; Connect sessions remain Supabase-owned and non-interchangeable** | Product identity adapter + session migration/cutover evidence | Separate product adapter authorization |
| 3 | UUID ↔ bigint identity mapping | **GHM mapping foundation QUALIFIED: (provider, subject) → GHM account identity; product migration still open** | Concrete Connect adapter operation + migration ownership/evidence | Separate product adapter authorization |
| 4 | Public Business + directory parity | **Partial — narrow `business.readPublic` and Directory v1 are qualified/merged; broader Connect parity remains open** | Only if selected: define and qualify additional public fields/composition, city/geo/supplier/tier/featured filters or ordering, and other behavior outside Directory v1 | Explicit authorization for each additional Business/directory capability; product cutover remains separately gated |
| 5 | Trust backend | **QUALIFIED / CLOSED** (`ghm.trust_score` + calculate) | — | Closed; Business profile input parity remains a separate blocker |
| 6 | Commercial payment operations | **Partial — governed GHM payment preparation/result boundaries are runtime-qualified; PayFast checkout/ITN/server confirmation merged; sandbox/runtime E2E remains open** | End-to-end product workflow and real provider qualification exercising the governed payment-result boundary | Separate product/provider authorization and production gate |
| 7 | Storage/media | **GHM metadata/persistence foundation QUALIFIED; provider/service/product exposure remains open** | Live provider, service authorization, HTTP/product exposure, recovery/reconciliation | Separate storage/provider authorization |
| 8 | Realtime delivery | External/absent in GHM | Ownership and delivery contract for notifications/leads | Explicit realtime authorization |
| 9 | Edge/runtime equivalents | **Partial — PayFast checkout/ITN/server-confirmation HTTP path exists in GHM; broader runtime/provider equivalents remain absent or unqualified** | Real PayFast sandbox/runtime E2E; separately define runtime placement and contracts for any additional integrations such as AI proxy | Explicit per-provider/runtime authorization |
| 10 | Missing product domains | Multiple absent | Separate source audits/contracts for each required domain | Per-domain authorization |
| 11 | Atomic workflow parity | Partial | Exact workflow contracts and qualification for Connect atomic creates | Explicit workflow authorization |
| 12 | Deferred participant / capability authorities | Deferred | Concrete transition/verification authority from source | Separate lifecycle authorization |
| 13 | Thin HTTP surface | Partial | First bounded service-to-service `saved_business.read` transport is qualified; broader per-resource HTTP exposure remains separately gated | Explicit API/adapter authorization |
| 14 | Referenced tables without migration evidence | **Partially reconciled** — see §8 / `CONNECT_REFERENCED_OBJECT_RECONCILIATION.md` | Prove or retire remaining E/F objects in production; do not build GHM tables from client fiction | Source reconciliation before construction |
| 15 | Shadow qualification/cutover | Not authorized | Shadow plan, rollback evidence, operational gates | Separate production authorization |
| 16 | Provider/bootstrap authority cleanup | Open infra gate | Independent bootstrap authority evidence | Separate infrastructure authorization |

## 2. Domains requiring contracts (class A proven) vs orphan refs (E/F)

### 2.1 Live Connect tables proven in migrations (still need GHM contracts + authorization)

These are **not** migration-missing. They remain blocked for GHM construction until separately authorized:

- `business_capability_evidence`
- `business_categories` / `business_category_assignments`
- ~~`trust_scores`~~ → GHM `trust_score` QUALIFIED / CLOSED (Business profile input parity still open)
- `account_onboarding_progress`
- `business_engagement_events` / `business_profile_view_visitors`
- `business_directory_review_events`
- relationship/outcome tables (`relationship_types`, `business_relationships`, `outcome_types`, `outcomes`)
- commercial payment operation workflows: governed GHM preparation/result boundaries exist and the PayFast checkout/ITN/server-confirmation adapter is merged; sandbox end-to-end qualification and complete product workflow parity remain open
- storage/media product integration (GHM storage foundation is now qualified; provider/product exposure remains separately gated)
- realtime delivery ownership (notifications + leads subscriptions)

### 2.2 Client-referenced objects without migration creates (do not invent GHM tables)

- `quote_analyses`
- `project_workspace` / `workspace_files`
- `suppliers` / `supplier_products`
- `admin_verification_queue`
- `audit_logs`
- `feature_access`
- `referrals` / `referral_tracking`
- `disputes`
- `business_images` / `project_images`
- `verification_documents`

The E/F group must not be turned into GHM tables until authoritative production schema proves each object or the client path is retired.

## 3. Already covered and frozen

The following remain closed and must not be reopened merely because the readiness audit exposes broader Connect gaps:

- Business Identity first slice
- Transaction boundary
- Authorization boundary
- Project private/public disclosure
- Customer
- Quote
- Enquiry / Lead
- Review + aggregate reconciliation
- Opportunity Core
- Opportunity capability requirements
- Opportunity Participation initial boundary
- Project Quote
- Capability Catalogue selectable/active read
- Business Capability read/create
- Business Offering (read/readPublic/create/update; deactivation; runtime qualification)
- Business Hours weekly schedule
- Commercial trial operation
- Notification persistence
- Support Request
- Saved Business
- Resource API first boundary
- Operational boundary

A closed capability may require a separately authorized adapter/projection layer later; that does not reopen its frozen construction contract.

## 4. Provider / ownership boundary

The following remain external or separately governed unless new evidence says otherwise:

- Supabase Auth
- Supabase Postgres/RLS production authority
- Supabase Realtime
- Supabase Storage
- Supabase Edge Functions
- Paystack
- PayFast
- Meta WhatsApp Cloud API
- AI model/provider runtime
- client-local WhatsApp deep links
- client-local PDF generation
- local AI heuristics

GHM should not absorb a provider dependency merely because Connect currently uses it.

## 5. Required evidence sequence

Evidence sprint documents now exist for items 2–9 below. Remaining work is decision/authorization quality, not blank discovery:

1. Connect adapter operation map — **started:** `CONNECT_BACKEND_OPERATION_INVENTORY.md`
2. Public Business/directory field reconciliation — **done:** `CONNECT_PUBLIC_BUSINESS_DIRECTORY_SOURCE_AUDIT.md`
3. Trust source audit — **CLOSED:** Trust QUALIFIED / CLOSED; Business profile input parity for full Connect score dimensions remains a separate blocker
4. Commercial payment workflow — **partial:** governed GHM boundaries and the PayFast adapter slice exist; sandbox end-to-end qualification and complete product workflow parity remain open
5. Storage boundary audit — **done:** `CONNECT_STORAGE_MEDIA_SOURCE_AUDIT.md`
6. Realtime delivery ownership decision — **evidence done:** `CONNECT_REALTIME_SOURCE_AUDIT.md`; ownership decision pending
7. Orphan/referenced-table reconciliation — **done:** `CONNECT_REFERENCED_OBJECT_RECONCILIATION.md`
8. Atomic workflow matrix — **done:** `CONNECT_ATOMIC_WORKFLOW_SOURCE_AUDIT.md`
9. Identity mapping design — **GHM foundation qualified:** `GHM_CONNECT_IDENTITY_BRIDGE_QUALIFICATION.md`; product adapter mapping operation still requires authorization
10. HTTP-vs-adapter decision — pending product/architecture authorization

These remain evidence/authorization gates, not implementation tasks.

## 6. Production boundary

Until separately authorized and qualified, the existing Connect source/runtime configuration remains unchanged and still contains Supabase coupling; this is a no-cutover control, **not** a claim that the hosted Supabase project is currently reachable or that Supabase remains the approved target:

- No production database changes.
- No DNS/routing changes.
- No credential changes.
- No traffic cutover.
- No provider cleanup.
- No shadow qualification.
- No adapter deployment.
- No merge of unqualified product-adapter construction branches into main.

## 7. Current construction reconciliation

**Connect identity adapter — FOUNDER-AUTHORIZED AND CONSTRUCTION-QUALIFIED.**

Founder authorization was granted on 2026-09-30 for the frozen Connect identity adapter contract. The slice was constructed on `construction/connect-identity-adapter` and locally qualified with 388/388 tests passing and a successful TypeScript build. Qualification evidence is recorded in `GHM_CONNECT_IDENTITY_ADAPTER_QUALIFICATION.md`.

This qualification is limited to the adapter seam. It does **not** authorize HTTP/service exposure, Supabase JWT acceptance, Connect session migration, membership/ownership/admin migration, business mapping migration, production routing, shadow traffic, provider cleanup, or cutover.

The Connect service-trust track now has bounded construction-qualified prerequisites covering the ES256 service-assertion cryptographic primitive, persistent Connect integration lifecycle authority, trusted request context, governed operation resolution, GHM authorization binding, resource capability dispatch, and the first service-to-service HTTP read boundary. Replay protection is now separately construction-qualified; mutation HTTP exposure, broader product adapters, and production cutover remain unqualified.

The historical next-slice statement is superseded: trusted request context, governed operation resolution, authorization binding, capability dispatch, and the first HTTP read boundary are now qualified on main.

Trusted request-context establishment, governed operation resolution, GHM authorization binding, resource capability dispatch, and the first saved_business.read service HTTP boundary are now construction-qualified bounded prerequisites. The service-trust boundary remains separately gated; the first bounded HTTP read boundary is now construction-qualified for saved_business.read. Mutation HTTP exposure, broader product adapters, and production cutover remain separately gated; replay protection is qualified by `CONNECT_SERVICE_REPLAY_PROTECTION_QUALIFICATION.md`.

A future construction capability requires:

1. authoritative source evidence;
2. an explicit capability contract;
3. explicit construction authorization;
4. implementation;
5. runtime qualification;
6. persisted reconciliation;
7. documentation and handover update.

**Bottom line:**

GHM construction progress ≠ Connect backend readiness.

The verified audit now gives the concrete gap boundary required to authorize future work without guessing or blindly copying the Connect Supabase architecture.

## 8. Evidence Sprint Results

**Sprint date:** 2026-09-18
**Connect commit audited:** `abcffa73f893602c25310a58946bebb91fd7eeb5`
**GHM code tree compared:** `cf4fc08a8331bb8ecbf43e033b71431a8d7913b3`

### Documents produced

| Track | Document |
|---|---|
| A Identity/Auth | `docs/architecture/CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md` |
| B Public Business/Directory | `docs/architecture/CONNECT_PUBLIC_BUSINESS_DIRECTORY_SOURCE_AUDIT.md` |
| C Storage/Media | `docs/architecture/CONNECT_STORAGE_MEDIA_SOURCE_AUDIT.md` |
| D Realtime | `docs/architecture/CONNECT_REALTIME_SOURCE_AUDIT.md` |
| E Server runtime | `docs/architecture/CONNECT_SERVER_RUNTIME_SOURCE_AUDIT.md` |
| F Referenced objects | `docs/architecture/CONNECT_REFERENCED_OBJECT_RECONCILIATION.md` |
| G Atomic workflows | `docs/architecture/CONNECT_ATOMIC_WORKFLOW_SOURCE_AUDIT.md` |
| H Providers | `docs/architecture/CONNECT_PROVIDER_BOUNDARY_SOURCE_AUDIT.md` |
| I Operation inventory | `docs/architecture/CONNECT_BACKEND_OPERATION_INVENTORY.md` |

### Newly confirmed requirements (evidence-backed)

- UUID Supabase Auth identity vs GHM bigint JWT identity; **GHM external-identity mapping is now qualified**
- Connect public Business allowlist (35 fields) vs GHM first-slice public (7 fields)
- Directory search/featured/nearby as Connect product behavior
- Storage logos on bucket `media` / prefix `logos/` (not `business-logos`)
- Realtime subscriptions only for notifications INSERT and leads INSERT
- Live Edge functions: Paystack checkout, Paystack webhook, AI proxy
- Atomic gaps: Project ↔ Opportunity create; payment prepare/apply; capability replace/evidence; directory founder review
**Historical 2026-09-18 Class A snapshot (not current GHM coverage):** the original audit listed Trust, offerings, categories, evidence, onboarding, engagement, and relationships/outcomes as missing at that checkpoint. Subsequent GHM construction qualified the bounded Trust, Business Category, and Business Offering resource slices; those GHM resource qualifications do not establish Connect adapter parity or cutover readiness. Capability-evidence submission/review, onboarding, engagement, and relationships/outcomes remain separate product-contract gaps to verify against the current operation inventory and migration handover.

### Requirements / assumptions disproven or corrected

- Logo bucket name `business-logos` — **false**; actual bucket is `media`
- Treating class A domain tables as migration-missing orphans — **false**; they are migration-proven
- Business Hours exceptions/booking as Connect readiness requirement — **not evidenced** in Connect
- PayFast / Meta WhatsApp API libraries as live payment/messaging paths — **no current importers at the 2026-09-18 source-audit checkpoint**. Connect source then contained Paystack checkout/webhook functions; that code-presence observation is not evidence of Paystack approval or activation. PayFast approval and implementation status are governed separately by the 2026-10-13 commercial reconciliation.
- Email provider dependency — **not evidenced**
- `createSignedUrl` usage — **not found**

### Still ambiguous / unresolved

- Production existence of E/F tables (images, workspace, suppliers, disputes, referrals, verification_documents, admin queue, audit_logs, feature_access, referral_tracking)
- Production bucket `private-docs` and non-logo `media` Storage policies
- Leads Realtime publication in migrations vs client subscription
- Whether dead client modules should be retired in Connect before GHM planning
- Product identity adapter operation and ownership
- Realtime ownership decision (provider vs GHM vs polling)
- HTTP vs adapter decision

### GHM impact

- No closed capability reopened
- Business Offering migration/resource slice is now qualified and closed; no product adapter or cutover is authorized
- Blockers 1–13, 15–16 remain production-readiness blockers
- Blocker 14 narrowed: orphans vs proven-missing-contracts now separated

### Construction authorization

**Current reconciled state:** Connect identity adapter boundary, trusted request context, governed operation resolution, and GHM authorization binding are Founder-authorized construction slices with their qualification evidence recorded in dedicated architecture documents. Business Offering is also **QUALIFIED / CLOSED** at the GHM construction boundary. Its qualification is recorded in `BUSINESS_OFFERING_OPERATION_CONTRACT.md` and the dedicated runtime evidence below.

The Business Offering qualification does not authorize a public HTTP API, product session migration, production cutover, or any other Connect product adapter. The original “next product construction capability” wording described sequencing at that qualification checkpoint; it is not a current migration work queue or authorization. The current no-Supabase caller-parity overlay below governs the documented product gaps, and each new construction slice still requires a separate evidence-backed contract and explicit authorization.


---

## Supabase removal migration overlay — 2026-10-13

This dated overlay adds a current product-level requirement to the earlier readiness record: **current ZAID Connect must have no active Supabase runtime dependency; GHM Internal Runtime is the target backend.** It does not rewrite historical coverage counts or claim that a previously qualified GHM construction slice establishes complete Connect readiness.

Confirmed cross-cutting blockers include Connect's central Supabase client and app session lifecycle, direct signup and AI Edge Function calls, the Supabase-provider assumption in the GHM Connect identity binding, and the need for a browser-safe user transport distinct from the signed server-to-server Connect service boundary. Product gaps include directory governance, capability evidence, opportunity discovery, leads, analytics, relationships/outcomes, onboarding, storage API exposure, and contract qualification for existing project/quote/support/notification/review surfaces.

Use `docs/architecture/CONNECT_GHM_MIGRATION_HANDOVER_2026-10-13.md` as the durable session-resume and gap-classification record. This overlay and handover are documentation only: no new construction, production migration, provider enablement, or cutover is authorized. The existing per-capability qualification records remain authoritative for their narrow qualified slices.


## 2026-10-13 current caller-to-contract reconciliation overlay

This overlay supersedes any implication that the historical operation rows above are a current parity measurement. The durable per-batch evidence and resume instructions are in the dated GHM/Connect migration handovers. Current confirmed classifications from source-to-source comparison:

| Current journey / operation | Current GHM contract evidence | Classification | Mandatory gate |
|---|---|---|---|
| Auth/session/signup/logout/recovery | Native auth routes exist; Connect shell and signup still directly depend on Supabase; GHM Connect binding still requires provider `supabase` | **Replace / blocker** | GHM-native user token/session, role mapping, active-account check, refresh/recovery and no Supabase identity/runtime |
| Directory search | GHM public endpoint accepts q/category/page/pageSize only; Connect uses province/city/tier/radius/sort, zero-based page and up to 100 rows | **Extend** | exact filters, output allowlist, count/paging semantics and engagement events |
| Regional configuration + directory filters | Connect actively loads default regional configuration and administrative areas; GHM directory endpoint does not accept region/province/city filters | **Extend** | Define minimal launch geography, configuration ownership, supported region/province/city filters and tests; do not rebuild legacy regional tables wholesale |
| Business profile/owner preview | GHM public + managed reads/update/create exist; Connect combines slug/ID, owner fallback, hours, reviews, capabilities and saved state | **Extend** | identity and ID mapping, owner authorization, unpublished-field privacy |
| Business-hours write | GHM service method exists, but inspected app registers GET only | **Extend** | authenticated HTTP mutation and integration tests |
| Capability evidence / directory review | Current Connect business/admin panels call submit/review/queue flows; matching GHM routes not found in inspected routers | **Extend/build** | founder/verifier authority, pending/verified/rejected/revoked transitions and audit |
| Projects/quotes | GHM project and quote routes exist | **Reuse + extend** | field/ID mapping, atomic project/opportunity creation, search filters, delete rules, quote lifecycle and ownership |
| Opportunity marketplace | GHM has detail + requirement read/replace; list/type discovery absent in inspected router | **Build/extend** | active/open time windows, type/search filter, nested requirements, count/paging |
| Support | GHM customer/admin route families match core fields/status set | **Reuse candidate** | envelope mapping, ownership, admin-only operations, message and resolution semantics |
| Reviews | GHM public/customer/admin routes exist | **Reuse + adapt** | pending-only queue, rejection reason/status mapping, reviewer identity from token |
| Onboarding | Connect flag is true; progress RPC callers exist; no GHM onboarding API identified | **Build** | per-user progress, complete/dismiss, idempotence and route gating |
| Analytics | active dashboard uses Connect RPC; no equivalent GHM contract identified | **Build** | business-scoped metrics, period semantics and permission enforcement |
| Relationships/outcomes | registered authenticated Relationships route requiring `BUSINESS_READ` and active-business context; GHM domain absent | **Build** | business scoping, lifecycle/verification semantics |
| Storage/logo | GHM service handles public logo policy but no HTTP router is registered; only business_logo object class | **Extend** | authorized API, metadata lifecycle, R2 grants and private/public policy separation |
| Engagement analytics | Connect records profile_view/save/WhatsApp/call/website/directions/share; equivalent GHM HTTP contract not established | **Build/extend** | event allowlist, rate/abuse controls, privacy and attribution |
| Quote analysis / AI | analyzer history uses Connect DB; AI transport targets Supabase Edge Function, provider gate false | **Split** | migrate history/data operations; remove Supabase transport but preserve fail-closed provider gate |
| Commercial | Connect offer/trial panel active; GHM internal commercial routes exist; payment activation remains disabled | **Reuse/extend, separately gated** | preserve all launch/payment flags; no provider activation |
| Notifications inbox/realtime/push | GHM routes exist; current UI inbox/push active caller not established | **Evidence insufficient** | only migrate producer operations proven active; don't rebuild dormant UI |
| Supplier/referral/dispute legacy services | no confirmed current mounted caller in searches | **Legacy/unconfirmed** | exclude unless reachability audit finds active caller |
| Connect `businessOfferingService` UI path | no confirmed current mounted caller; GHM `business_offering` construction contract is independently QUALIFIED / CLOSED | **Legacy/unconfirmed at Connect caller boundary; GHM resource remains closed** | do not reopen GHM construction; only assess an adapter if a mounted Connect caller is proven and separately authorized |

The numeric Connect IDs and GHM numeric IDs/UUID assumptions must never be presumed equivalent. Define explicit identity/resource mappings. The signed `POST /api/v1/connect/service` remains server-to-server only; browser code needs a secure BFF or GHM-native user-token API. This overlay is documentation only and grants no implementation, merge, production or cutover authorization.

## Identity-provider authority reconciliation — 2026-10-13

The previously qualified `(provider, subject) → GHM account identity` foundation is a generic mapping capability and its current Connect adapter qualification specifically uses `provider=supabase`. That bounded qualification remains valid for its historical scope; it does **not** qualify the no-Supabase target runtime. The active Connect authorization-binding implementation still rejects any provider other than `supabase`, so it is a cutover blocker under the current founder decision.

For target Connect runtime, GHM-native access/session credentials must establish the caller; GHM then resolves the canonical account, active state, business membership and resource authorization server-side. A source-provider/subject pair may remain as migration provenance for legacy data only, isolated from runtime authentication and not accepted as authority for new requests. Do not remove historical evidence or silently change the existing qualification's scope. Do not allow identity bootstrap or account linking as a side effect of routine requests.

