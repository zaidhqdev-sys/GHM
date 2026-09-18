# GHM ↔ Zaid Connect Production Readiness Gap Register

**Status:** GOVERNED GAP REGISTER — NO CONSTRUCTION AUTHORIZATION  
**Source audit:** docs/architecture/GHM_CONNECT_BACKEND_READINESS_AUDIT.md  
**Audited GHM tree:** cf4fc08a8331bb8ecbf43e033b71431a8d7913b3  
**Connect source:** abcffa73f893602c25310a58946bebb91fd7eeb5  
**Audit correction checkpoint:** 38bb9a4e4868994bde8615dce77bc64051b0e7cd

## Purpose

This register converts the verified Connect↔GHM readiness audit into an actionable evidence boundary.

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
| 3 | UUID ↔ bigint identity mapping | Unresolved | Canonical mapping and migration/ownership design | Explicit identity mapping authorization |
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
| 14 | Referenced tables without migration evidence | Evidence insufficient | Locate authoritative schema or prove dead/unused | Source reconciliation before construction |
| 15 | Shadow qualification/cutover | Not authorized | Shadow plan, rollback evidence, operational gates | Separate production authorization |
| 16 | Provider/bootstrap authority cleanup | Open infra gate | Independent bootstrap authority evidence | Separate infrastructure authorization |

## 2. Domains currently requiring deeper source evidence

The readiness audit specifically identifies these as requiring reconciliation before any GHM schema is inferred:

- business_capability_evidence
- business_categories
- business_category_assignments
- business_offerings
- trust_scores
- account_onboarding_progress
- business_engagement_events
- business_profile_view_visitors
- business_directory_review_events
- relationship/outcome domains
- payment operation workflows
- storage/media contracts
- realtime delivery
- Connect-referenced objects without matching audited migration evidence: quote_analyses, project_workspace, workspace_files, suppliers, admin_verification_queue, audit_logs, feature_access, referrals, referral_tracking, disputes, business_images, project_images, verification_documents

The last group must not be turned into GHM tables until authoritative source evidence establishes that each is a live product contract.

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

Before construction authorization, the evidence work should establish:

1. Connect adapter operation map.
2. Public Business/directory field reconciliation.
3. Trust source audit.
4. Commercial payment operation contract.
5. Storage boundary audit.
6. Realtime delivery ownership decision.
7. Orphan/referenced-table reconciliation.
8. Atomic workflow matrix.
9. Identity mapping design.
10. HTTP-vs-adapter decision.

These are evidence gates, not implementation tasks.

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

GHM construction progress ≠ Connect backend readiness.

The verified audit now gives the concrete gap boundary required to authorize future work without guessing or blindly copying the Connect Supabase architecture.