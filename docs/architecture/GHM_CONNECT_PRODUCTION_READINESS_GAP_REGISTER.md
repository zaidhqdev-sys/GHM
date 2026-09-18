# GHM â†” Zaid Connect Production Readiness Gap Register

**Status:** GOVERNED GAP REGISTER â€” NO CONSTRUCTION AUTHORIZATION
**Source audit:** docs/architecture/GHM_CONNECT_BACKEND_READINESS_AUDIT.md
**Audited GHM tree:** cf4fc08a8331bb8ecbf43e033b71431a8d7913b3
**Connect source:** abcffa73f893602c25310a58946bebb91fd7eeb5
**Audit correction checkpoint:** 38bb9a4e4868994bde8615dce77bc64051b0e7cd
**Evidence sprint checkpoint:** see Â§8 (this document update)

## Purpose

This register converts the verified Connectâ†”GHM readiness audit into an actionable evidence boundary.

It does not authorize implementation, adapters, production migration, shadow qualification, cutover, provider cleanup, or reopening of any closed GHM capability.

## Current conclusion

GHM is not production-ready as the backend for Zaid Connect.

The audit identified 48 concrete Connect backend dependencies and 54 coverage rows:

| Classification | Count |
|---|---:|
| ALREADY PROVIDES | 12 |
| PARTIALLY PROVIDES | 18 |
| DOES NOT YET PROVIDE | 15 |
| CONNECT-LOCAL | 2 |
| EXTERNAL PROVIDER | 6 |
| EVIDENCE INSUFFICIENT | 1 grouped set / 13 referenced objects |

The principal platform blockers are identity/authentication, the Connect product adapter, public Business/directory parity, storage/media, realtime delivery, provider runtime equivalents, missing product domains, atomic workflow parity, and unresolved source evidence for referenced tables.

## 1. Production-readiness blockers

| # | Blocker | Current state | Required evidence before construction | Authorization |
|---|---|---|---|---|
| 1 | Connect product adapter | Missing | Per-operation mapping from Connect services to GHM operations/providers/local behavior | Explicit adapter authorization |
| 2 | Auth/session compatibility | Not interchangeable | Identity issuance, bootstrap, token validation and session mapping | Explicit identity/auth authorization |
| 3 | UUID â†” bigint identity mapping | Unresolved | Canonical mapping and migration/ownership design | Explicit identity mapping authorization |
| 4 | Public Business + directory parity | Partial | Field-by-field public projection, search/geo/sort/featured contract | Explicit Business/directory authorization |
| 5 | Trust backend | Missing | Trust schema, calculation inputs/outputs, authorization, lifecycle and consumers | Explicit Trust authorization |
| 6 | Commercial payment operations | Partial/stubbed | Prepare/cancel/provider result/webhook contract and provider boundary | Explicit payment authorization |
| 7 | Storage/media | Missing GHM boundary | Bucket/object paths, metadata, ownership and storage authorization | Explicit storage authorization |
| 8 | Realtime delivery | External/absent in GHM | Ownership and delivery contract for notifications/leads | Explicit realtime authorization |
| 9 | Edge/runtime equivalents | External/absent in GHM | Runtime placement for checkout/webhooks/AI proxy | Explicit runtime/provider authorization |
| 10 | Missing product domains | Multiple absent | Separate source audits/contracts for each required domain | Per-domain authorization |
| 11 | Atomic workflow parity | Partial | Exact workflow contracts and qualification for Connect atomic creates | Explicit workflow authorization |
| 12 | Deferred participant / capability authorities | Deferred | Concrete transition/verification authority from source | Separate lifecycle authorization |
| 13 | Thin HTTP surface | Partial | HTTP-vs-adapter decision and per-resource authorization contracts | Explicit API/adapter authorization |
| 14 | Referenced tables without migration evidence | **Partially reconciled** â€” see Â§8 / `CONNECT_REFERENCED_OBJECT_RECONCILIATION.md` | Prove or retire remaining E/F objects in production; do not build GHM tables from client fiction | Source reconciliation before construction |
| 15 | Shadow qualification/cutover | Not authorized | Shadow plan, rollback evidence, operational gates | Separate production authorization |
| 16 | Provider/bootstrap authority cleanup | Open infra gate | Independent bootstrap authority evidence | Separate infrastructure authorization |

## 2. Domains requiring contracts (class A proven) vs orphan refs (E/F)

### 2.1 Live Connect tables proven in migrations (still need GHM contracts + authorization)

These are **not** migration-missing. They remain blocked for GHM construction until separately authorized:

- `business_capability_evidence`
- `business_categories` / `business_category_assignments`
- `business_offerings`
- `trust_scores`
- `account_onboarding_progress`
- `business_engagement_events` / `business_profile_view_visitors`
- `business_directory_review_events`
- relationship/outcome tables (`relationship_types`, `business_relationships`, `outcome_types`, `outcomes`)
- commercial payment operation workflows (tables exist; GHM ops stubbed)
- storage/media contracts (governed logo path proven; other prefixes/policies incomplete)
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

Evidence sprint documents now exist for items 2â€“9 below. Remaining work is decision/authorization quality, not blank discovery:

1. Connect adapter operation map â€” **started:** `CONNECT_BACKEND_OPERATION_INVENTORY.md`
2. Public Business/directory field reconciliation â€” **done:** `CONNECT_PUBLIC_BUSINESS_DIRECTORY_SOURCE_AUDIT.md`
3. Trust source audit â€” **partial:** provider boundary + object reconciliation confirm DB-owned Trust; full Trust operation contract still required before authorization
4. Commercial payment operation contract â€” **partial:** server runtime + atomic workflow + provider audits; formal payment operation contract still required
5. Storage boundary audit â€” **done:** `CONNECT_STORAGE_MEDIA_SOURCE_AUDIT.md`
6. Realtime delivery ownership decision â€” **evidence done:** `CONNECT_REALTIME_SOURCE_AUDIT.md`; ownership decision pending
7. Orphan/referenced-table reconciliation â€” **done:** `CONNECT_REFERENCED_OBJECT_RECONCILIATION.md`
8. Atomic workflow matrix â€” **done:** `CONNECT_ATOMIC_WORKFLOW_SOURCE_AUDIT.md`
9. Identity mapping design â€” **evidence done:** `CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md`; mapping design pending authorization
10. HTTP-vs-adapter decision â€” pending product/architecture authorization

These remain evidence/authorization gates, not implementation tasks.

## 6. Production boundary

Until separately authorized and qualified:

- Connect remains on Supabase.
- No production database changes.
- No DNS/routing changes.
- No credential changes.
- No traffic cutover.
- No provider cleanup.
- No shadow qualification.
- No adapter deployment.
- No merge of construction branches into main.

## 7. Next construction authorization

None currently authorized by this register.

A future construction capability requires:

1. authoritative source evidence;
2. an explicit capability contract;
3. explicit construction authorization;
4. implementation;
5. runtime qualification;
6. persisted reconciliation;
7. documentation and handover update.

**Bottom line:**

GHM construction progress â‰  Connect backend readiness.

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

- UUID Supabase Auth identity vs GHM bigint JWT AuthContext with **no mapping**
- Connect public Business allowlist (35 fields) vs GHM first-slice public (7 fields)
- Directory search/featured/nearby as Connect product behavior
- Storage logos on bucket `media` / prefix `logos/` (not `business-logos`)
- Realtime subscriptions only for notifications INSERT and leads INSERT
- Live Edge functions: Paystack checkout, Paystack webhook, AI proxy
- Atomic gaps: Projectâ†”Opportunity create; payment prepare/apply; capability replace/evidence; directory founder review
- Class A missing GHM domains include Trust, offerings, categories, evidence, onboarding, engagement, relationships/outcomes

### Requirements / assumptions disproven or corrected

- Logo bucket name `business-logos` â€” **false**; actual bucket is `media`
- Treating class A domain tables as migration-missing orphans â€” **false**; they are migration-proven
- Business Hours exceptions/booking as Connect readiness requirement â€” **not evidenced** in Connect
- PayFast / Meta WhatsApp API libraries as live payment/messaging paths â€” **no current importers** (deep links live; Paystack live)
- Email provider dependency â€” **not evidenced**
- `createSignedUrl` usage â€” **not found**

### Still ambiguous / unresolved

- Production existence of E/F tables (images, workspace, suppliers, disputes, referrals, verification_documents, admin queue, audit_logs, feature_access, referral_tracking)
- Production bucket `private-docs` and non-logo `media` Storage policies
- Leads Realtime publication in migrations vs client subscription
- Whether dead client modules should be retired in Connect before GHM planning
- Identity issuance ownership decision (keep Supabase Auth vs replace)
- Realtime ownership decision (provider vs GHM vs polling)
- HTTP vs adapter decision

### GHM impact

- No closed capability reopened
- No migrations/resources/adapters authorized
- Blockers 1â€“13, 15â€“16 remain production-readiness blockers
- Blocker 14 narrowed: orphans vs proven-missing-contracts now separated

### Construction authorization

**Still none.** Evidence sprint improves decision quality only.
