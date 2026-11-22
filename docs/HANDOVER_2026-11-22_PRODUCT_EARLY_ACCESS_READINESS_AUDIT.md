# Product Early-Access Readiness Audit — 2026-11-22

**Status:** Portfolio audit in progress; evidence-based source review completed. No product is declared GO for public early access by this document.
**Audit owner:** ZAID Technologies
**GHM baseline inspected:** `main` at `93ff3c774ce225760b0e3e2cf99a770b38e8a097`
**Audit branch:** `docs/product-early-access-readiness-audit-20261122`

## 1. Executive decision

The five products have materially different levels of completion. Connect and QuoteFlow have the strongest existing product workflows and should be prioritized for controlled early access. Tender AI is an engineered analysis slice, not a complete product. Wealth and Legal have broad UI/backend foundations but material legacy-provider, backend, workflow, and production-validation gaps.

This is a repository and handover evidence audit. It is not a live production penetration test, live database audit, live GHM route smoke test, or confirmation of deployed product binaries. A feature on a branch is not a feature on main; a passing unit/contract suite is not live end-to-end qualification; an old launch document is not current release evidence.

### Portfolio decision matrix

| Product | Source maturity | Mainline / integration state | Early-access decision |
|---|---|---|---|
| Zaid Connect | Broad product surface; directory and business workflows exist | Major GHM migration PRs #68 and #70 remain draft; current main still contains Supabase runtime/dependency surfaces | **Conditional candidate — directory-only pilot after GHM production cutover and smoke tests** |
| QuoteFlow | Released Android workflow: customers, quotes, follow-ups, invoices, PDF sharing | Main still contains Supabase SDK; GHM identity cutover PR #25 is draft; Android preview workflow failed on latest checked head | **Conditional candidate — do not distribute the GHM cutover build until Android build/device acceptance and GHM/legal gates pass** |
| Tender AI | Analysis engine and web workflow exist on feature branches | No PRs; web app branch unmerged; no live GHM or real-model verification | **Not ready — internal/demo only** |
| Zaid Wealth | Broad web UI and serverless functions exist | Main is still Supabase-backed; mock analysis; Stripe/Paystack provider logic; mock query-string subscription activation | **Not ready — rebuild/migrate before external early access** |
| ZAID Legal OS | Legal practice workspace foundation with 32 API routes and document/AI pipeline | Main has own Prisma/Postgres and Better Auth; PayStack; no GHM integration verified; important UX/security gaps | **Not ready — narrow MVP and resolve high-risk gaps first** |

## 2. Zaid Connect

**Repository:** `zaidhqdev-sys/zaid-connect`  
**Main inspected:** `84d7edb64346f1b698f9b76bcb54d2e653df1292`  
**Open relevant PRs:** #70, #69, #68, #33.

### Completed / present in source

- Public landing and business directory, search/browse, public business profiles.
- Business registration/onboarding, profile completion, categories, hours and logo support.
- Founder-controlled directory review and publication controls.
- Saved businesses, support requests, notifications and Help Centre surfaces.
- Opportunity/marketplace, enquiry, Project/Quote and Business workspace functionality.
- GHM client adapters and contract tests for directory, saved businesses, profile, review, support, notification, onboarding, analytics, capability and project/opportunity operations.
- GHM browser-auth same-origin BFF and memory-only access-token client are on main, but the feature flag is disabled by default and the browser-auth runtime configuration/cutover must be reverified.

### Incomplete / launch blockers

1. Main still contains `@supabase/supabase-js`, Supabase client/facade, Supabase functions and migrations. The GHM migration is not complete on main.
2. PR #68 (GHM core workflow migration) is draft. Its own handover lists remaining Supabase relationships/outcomes, commercial/admin, AI proxy, push subscriptions/delivery, central facade, SDK/config and other callers. It also identifies Marketplace featured-order parity, analytics entitlement/metric mapping, and push delivery as unresolved.
3. PR #70 (Projects and Opportunities through GHM) is draft. It depends on GHM PR #299 for Project detail/update endpoints and its latest recorded CI run was still running; do not call it qualified.
4. GHM PRs #243/#244 are supplier classification and analytics/engagement dependencies, both still draft in the audited GHM state. Do not enable analytics until the entitlement and metric semantics are resolved.
5. The commercial panel is intentionally read-only/fail-closed for trial and checkout until GHM exposes the approved terms/consent and provider-neutral payment lifecycle. Legacy Paystack and PayFast paths must not be mixed or silently used as fallback.
6. GHM Actor Gateway production readiness, production role separation, production migration inventory/batch selection, and deployment/cutover remain unresolved. GHM PR #298 explicitly keeps the production batch manifest empty and production migration execution fail-closed; PR #303 is a further privilege audit correction.
7. A historical Connect launch runbook still says launch authorization is not granted and includes old Supabase migration assumptions. It must be reconciled with the current GHM-only target rather than followed literally.

### Recommended early-access scope

A **directory-only controlled pilot** is the smallest useful release: public directory browsing, business registration, owner profile completion, founder review/approval, public listing, business search and safe profile views. Exclude or keep disabled until separately qualified: subscriptions/checkout, analytics requiring entitlements, unqualified supplier/featured ranking, unverified relationships/outcomes, Projects/Quotes/Opportunities until PR #70 + GHM #299 are qualified, and any remaining Supabase-backed feature.

### Required GO evidence

- Current production GHM identity and actor boundary is verified with the actual restricted runtime roles; no arbitrary actor impersonation.
- Exact directory routes used by Connect are deployed and smoke-tested against production GHM.
- Production DB migration/ACL and recovery-point status are reconciled; no assumption from local disposable DB.
- Connect mainline migration branch has current exact-head CI and no Supabase fallback for the selected directory journey.
- Founder review authority, business ownership, private/public field separation, inactive/unapproved listing exclusion, upload/storage and abuse/rate limits are tested end to end.
- Vercel production deployment SHA, environment scope and rollback path are verified.

**Assessment:** Closest web product to a directory-only early-access pilot, but not a GO on repository evidence alone.

## 3. QuoteFlow

**Repository:** `zaidhqdev-sys/QuoteFlow`  
**Main inspected:** `e4b39a8515177ed00791e6be5213765d3f054a7f`  
**Open relevant PRs:** #25, #23, #21, #20, #19, #5, #4.

### Completed / present in product

- Android-first quotation follow-up and invoicing workflow.
- Business profile, customers, saved products/services and organization-aware local storage.
- Multi-line quotes, totals, follow-up dates, local reminders, Won/Lost/Reschedule states.
- Won-quote to invoice conversion, invoice numbering, tax/terms, PDF generation and Android sharing.
- Legal agreement screen and legacy account/organization flows.
- Recoverable local storage-scope migration primitive in PR #21; it is deliberately opt-in and does not itself perform identity cutover.

### Incomplete / launch blockers

1. Main package still depends on `@supabase/supabase-js`; main README describes Supabase identity, legal acceptance, organization resolution and subscription context. Supabase is not removed from the current release branch.
2. PR #25 is the GHM-native identity cutover and removes the Supabase SDK/client/RPC adapter on its feature branch. It remains draft. CI passed on exact head `6865048a...` (TypeScript/Jest), but the Android preview APK workflow failed on that same head. Therefore Android release qualification is not complete.
3. GHM live login/session/managed-Business flow still needs end-to-end qualification against deployed mainline. Profile API is contract-only/fail-closed pending live DB reconciliation.
4. Business ownership/mapping and the legacy local-storage recovery lead remain unresolved. The known two bot identities are explicit exclusions; no inference from storage key names is permitted.
5. Legal acceptance depends on GHM PR #201, still draft. It intentionally has an empty document catalogue and fails closed until owner-approved documents are supplied, versioned, deployed and seeded through reviewed migration.
6. Subscription/entitlement is not connected; Free access only until a GHM entitlement contract is ready.
7. Device-level acceptance on supported Android versions, upgrade/install behaviour, offline/local persistence and backup/restore remain to be completed.

### Recommended early-access scope

Keep early access **Free and limited**: new GHM registration, explicit managed-Business creation/selection, customer management, quotes, reminders, invoice generation and PDF sharing. Do not activate paid subscription features. Preserve existing local data; do not attempt automatic legacy mapping or deletion. Require approved current legal documents and durable GHM acceptance before account creation/sign-in if that is the agreed legal gate.

### Required GO evidence

- Merge-ready, exact-head GHM identity cutover with no Supabase runtime dependency.
- Android preview APK build succeeds and is installed/tested on a real device.
- Register/login/refresh/logout, multiple Business selection/switching and ownership denial pass against deployed GHM.
- Legal document catalogue and versioned acceptance API are live, populated with owner-approved documents and tested.
- Local storage scope activation remains explicit, conflict-first, resumable and verified; source namespace remains preserved.
- Free entitlement behaviour is explicit and no unverified billing path is exposed.

**Assessment:** The product workflow is already real and released, but the proposed GHM-native release is not ready to distribute. It is a strong near-term candidate after the identity, legal and Android build gates.

## 4. ZAID Tender AI

**Repository:** `zaidhqdev-sys/zaid-tenderai`  
**Branches inspected:** `main` (`6ac091c...`), `feat/tender-analysis-slice` (`3de8747...`), `feat/tender-web-app` (current branch tip inspected in repository tree).

### Completed / present on feature branches

- Strict evidence-bearing tender analysis schema.
- Deterministic eligibility engine with provenance-aware statuses.
- Prompt-injection guard and untrusted document fencing.
- AI provider port and OpenAI-compatible adapter; no provider configured by default.
- Token budget and tenant-scoped analysis cache (in-memory).
- GHM client for managed Business, memberships and opportunities.
- Same-origin GHM auth proxy, sign-in/register/business selection UI, analyse-document page and results UI.
- Server-side analysis handler, bounded audit sink, request correlation and security headers.
- Feature branch handover records 189 tests passing, typecheck/lint/build passing and a real Chromium run against the built server using fake GHM. These are valuable construction tests, not live GHM/model tests.

### Incomplete / launch blockers

1. All substantial implementation is on unmerged feature branches; main is only a partial domain foundation. No PRs are open.
2. The feature handover explicitly states no real GHM integration test and no real AI model test has been run.
3. GHM persistence gaps G1–G5 remain proposed, not built: external tender notice store, saved/tracked tender pipeline, document storage, analysis persistence and deadline/reminder support. G6 browser-auth origin and G7/G8 further integration gaps need current handover review.
4. No verified tender-source decision/terms; no live tender discovery ingestion. GHM marketplace opportunities are business-posted requests, not public tender notices.
5. In-memory budgets, cache, rate limiter and audit sink reset on restart and are not shared across instances. No production rate limiting/audit sink/persistence qualification.
6. Cross-business isolation has not been tested against live GHM; no deployment configuration, production monitoring or mobile/responsive acceptance evidence.
7. AI quality is tested with fakes; real-model extraction/evidence quality and confidential-document egress controls must be validated.

### Recommended early-access scope

Internal preview only until GHM persistence and live integration are approved. A later bounded pilot could offer **analyse a user-supplied tender document only**, clearly labelled AI-assisted and non-authoritative, with verified facts separated from model extraction. Do not market external tender discovery, persistent pipeline, automated eligibility guarantees or submission drafting as available before implemented.

**Assessment:** Strong technical foundation and a coherent first slice, but not a customer-ready product yet.

## 5. Zaid Wealth / BuildLink Wealth

**Repository:** `zaidhqdev-sys/zaid-insights`  
**Main inspected:** `d43d16d7e4dbccade897d6f7b5cf3417ffea277a`  
**Open PRs:** none.

### Completed / present in source

- Next.js web application with landing, auth, dashboard, statements, analyses, fee views, adviser directory/profile, health score, retirement simulator, wealth leak and AI copilot pages.
- Supabase Auth/database/storage/edge-function architecture with schema/migrations and RLS.
- AI, statement analysis, adviser and billing service modules.
- Historical documentation claims 62/62 mock tests and a successful build; this is historical mock evidence and must not be treated as a current live-production acceptance record.

### Incomplete / launch blockers

1. Direct Supabase dependencies remain in package.json (`@supabase/ssr`, `@supabase/supabase-js`), `lib/supabase.ts`, database migrations, Edge Functions and service modules.
2. Billing hardcodes provider selection to Paystack for ZA and Stripe for international users; checkout and subscription state are Supabase-backed. This conflicts with the product/provider-independence requirement.
3. The checkout-success page accepts `?mock=true` and directly upserts an active Pro subscription in Supabase. This is an unsafe activation path and must be removed before any external test or launch.
4. AI analysis currently uses mock analysis in `lib/ai.ts`; the old docs' “production ready” claims contradict the current implementation.
5. GHM integration is not implemented/verified; identity, statements, analyses, adviser directory, subscription/entitlement, audit and storage contracts need mapping to GHM.
6. No current open PR or recent exact-head CI evidence was found in the inspected repo state.
7. Wealth handles sensitive financial data. Data access, consent, deletion/export, audit, provider egress, and claims/disclaimers require explicit product/security review before pilot.

### Recommended early-access scope

Do not launch current main. First create a provider-neutral migration plan and map each domain to GHM capabilities. Keep payment disabled. If a limited user preview is desired later, it must not collect real financial documents until storage, consent, authorization, data isolation, deletion and real analysis quality are verified.

**Assessment:** Not ready. This is a migration and product verification workstream, not a final deployment task.

## 6. ZAID Legal OS

**Repository:** `zaidhqdev-sys/zaid-legal-os`  
**Main inspected:** `67723c2d5ddf0df4ab0683b1bcd526250adc2792`  
**Open PRs:** none. No Actions runs were returned by the inspected workflow-runs endpoint.

### Completed / present in source

- Next.js 16 / Prisma 7 / PostgreSQL architecture.
- Better Auth session-based identity.
- Multi-tenant firm/matter/client/document/task/deadline/note/timeline model.
- Matter dashboards and matter workflows.
- Document upload, extraction, queued AI processing, Claude integration and object storage service.
- Billing endpoints and PayStack webhook verification/idempotency.
- Notifications, audit writes, daily cron and firm invitation APIs.
- 32 API route files listed in repository documentation.

### Incomplete / launch blockers

1. Legal is not GHM-backed in the inspected main branch. It owns a separate Prisma/Postgres database and Better Auth identity. Decide whether it is a GHM tenant/product client or a separately governed service; do not create a parallel system of record accidentally.
2. PayStack is hard-coded in billing service/schema/docs; provider-neutral commercial/payment adapter and GHM payment/entitlement contract are not present.
3. The current CTO review identifies high-priority lack of rate limiting on auth and expensive AI endpoints, write-only audit logs with no read endpoint, and no reliable retry path for failed webhook processing.
4. The same review identifies missing client-management, firm-wide task and settings pages, no original-document download/preview UI, no firm-member deactivation, and no end-to-end user journey test.
5. The README and .env example are stale/inconsistent with the current Next.js 16 / Prisma 7 / Better Auth main branch (README still describes Next.js 14/NextAuth and PayStack).
6. The .env example expects a Supabase Postgres host, plus Anthropic, R2, QStash, Redis and Resend configuration. This implies multiple external dependencies and potentially extra spend; no cost-constrained deployment plan was verified.
7. No current workflow run/deployment evidence was returned. A static architecture review is not a production launch qualification.
8. Sensitive legal client/matter documents require tenant-isolation, audit-read, download authorization, incident/retention and backup/recovery validation before customer use.

### Recommended early-access scope

Do not open to law firms yet. First choose the authoritative tenant/identity/data boundary, finish core client/matter/document user journeys, close rate-limit/audit/retry issues, verify tenant isolation and secure document handling, and prove the deployment with a real end-to-end firm journey. Payments can remain disabled for pilot.

**Assessment:** Useful application foundation, but not a complete operational legal SaaS MVP.

## 7. Shared GHM release gates

The following are shared dependencies for Connect and QuoteFlow, and later products that use GHM:

1. **Actor Gateway / runtime trust boundary:** production runtime identity and Actor Gateway isolation must be genuinely verified. The current GHM handover records the Render PostgreSQL role/ownership issue and unresolved role administration. Do not weaken strict membership/privilege guards to bypass this.
2. **Production migrations:** PR #298 has an empty reviewed execution-batch manifest and explicitly keeps production execution fail-closed. Refresh exact production ledger and derive a dependency-safe first batch only after route readiness review.
3. **ACL qualification:** PR #303 adds a column-level Business Capability INSERT privilege correction; focused tests/disposable PostgreSQL qualification are still pending in its body.
4. **Deploy state:** GHM Render auto-deploy is disabled. Do not infer live service state from main or a merged PR. Verify exact deployed SHA, health and each product route.
5. **Backup/recovery:** a current, independently verified production recovery point is required before a production schema/data cutover.
6. **Provider-neutrality:** provider integrations must sit behind GHM-owned capability contracts. PayFast is the current intended payment provider, but product code must not hard-code it as the domain model. Do not infer that PayStack is required because old Connect/Wealth/Legal code contains it.
7. **No parallel data stores:** do not revive Supabase or add another paid database/service as a shortcut. Preserve source data and perform controlled migrations only where needed.

## 8. Recommended execution order

### Release track A — Connect directory early access

1. Reconcile Connect main, PR #68 and #70, GHM #243/#244/#298/#303/#299 and all relevant handovers.
2. Define directory-only route allowlist and exact GHM dependency map.
3. Close only the P0 security/ACL/migration/deploy gates required for that slice.
4. Qualify Connect's selected journey against the deployed GHM runtime.
5. Pilot with a small invited set of businesses; keep commercial and nonessential features disabled.

### Release track B — QuoteFlow early access

1. Complete PR #25 identity cutover and resolve any conflict with PRs #20/#23/#19.
2. Resolve legal acceptance with GHM #201 and owner-approved documents.
3. Fix the Android preview workflow and complete device acceptance.
4. Verify GHM registration, multi-Business selection, Free entitlement and local storage preservation.
5. Invite a small controlled group; no paid subscription activation until entitlement/payment gates are complete.

### Parallel preparation — Tender AI

Keep work on the two feature branches; do not create more branches until current branch/PR relationship is reconciled. Finish GHM gap decisions and live GHM/real-model test plan before customer pilot.

### Later work — Wealth and Legal

Wealth: provider-neutral architecture and Supabase/Stripe/Paystack removal plan first; no mock Pro activation.
Legal: architecture decision for GHM integration and core MVP completion first; do not introduce new paid services until cost/necessity is reviewed.

## 9. Evidence limitations and follow-up

- GitHub branch, PR, source-file and handover review only; no local test execution was performed in this audit.
- No live GHM production DB query, Render configuration mutation, deploy, environment change, Vercel deployment, Android installation, payment transaction or production user journey was performed.
- Several historical documents contain stale launch-ready claims or stale PayFast pause statements. Use current owner direction and this audit for sequencing; re-verify live provider status when the payment workstream begins.
- Next task should be a **Connect + QuoteFlow GHM launch-gate reconciliation**, not broad work across all five products at once. Inspect all related PR comments, latest branch heads and the product handovers before changing code.


---

## 10. Focused Connect + QuoteFlow launch-gate reconciliation — 2026-11-22

This section supersedes any earlier preliminary statements in this audit about Connect PR #70 still running, QuoteFlow's Android APK build itself failing, or the current GHM Actor Gateway/issuer production state. It is based on the latest PR heads, exact-head workflow runs, compare results, branch handovers and GHM production-readiness documents inspected for this continuation.

### 10.1 Connect — current branch and dependency reconciliation

**Current main:** `84d7edb64346f1b698f9b76bcb54d2e653df1292`.

| Item | Latest evidence | Disposition |
|---|---|---|
| PR #68 — broad core GHM migration | Draft; head `e0df7f84b10a54f94ff3a74086a87b98c9268102`; Connect quality run `43746448569` passed. Compare is 166 commits ahead / 1 behind and reported diverged. | Do not merge wholesale yet. Reconcile the one mainline commit and split/sequence the first-launch scope. |
| PR #70 — Project/Opportunity GHM cutover | Draft; head `a9de3f88f1e0ad9e98d53e9c75493be384d520e7`; Connect quality run `44209066664` passed; Vercel preview status succeeded. Compare is 9 ahead / 0 behind. | Source-qualified for its client contracts/build, but not a directory launch dependency. Keep parked until Project/Opportunity release is needed and GHM #299 is fixed/deployed. |
| PR #243 — supplier classification | Open/draft; exact-head CI previously passed, but PR itself records outstanding direct-RPC actor-binding / integration consolidation and production compatibility/featured-parity gates. | Optional for first directory launch. Hide supplier/contractor filters until the canonical contract is qualified and on deployed GHM. |
| PR #244 — Business engagement/Analytics | Open/draft and stacked on #243. PR records unresolved Actor Gateway issuer separation, direct-write attribution and entitlement/metric semantics. | Exclude Analytics/engagement from the first directory release. |
| GHM #299 — Project detail/update API | Open/draft; exact-head CI run `44228636216` failed. | Blocks PR #70, not the free directory-only scope. |
| GHM #283 — admin commercial launch-state read | Merged to GHM main. Its runtime deployment is still not healthy/live because GHM startup requires the not-yet-deployed Actor Gateway URL. | Not a directory blocker if commercial admin UI is excluded; no production availability claim. |

**Important branch overlap:** PR #68 and PR #70 both modify the Connect Project and Opportunity service/caller files, including `projectsService.js`, `opportunityService.js` and `OpportunityRequirementsEditor.jsx`. They are separate branches with overlapping implementation. Do not merge both independently or cherry-pick blindly. Reconcile the desired Project/Opportunity implementation once, after the directory launch slice is isolated.

**Directory-only scope recommendation:** use the existing #68 work as source material, but do not merge all of #68 as the first launch unit. Create a narrow, main-based Connect release slice containing only:
- GHM authentication/session path needed for directory-owner actions;
- GHM business registration and owner membership;
- Business profile/category/hours and public listing projection;
- directory review/approve/publish authority;
- logo upload only after its GHM Storage route is production-qualified;
- public directory browse/search and safe public Business detail.

Keep out of this slice: Projects/Quotes/Opportunities, Analytics/engagement, supplier/contractor filtering unless #243 is promoted, commercial/trial/checkout, referrals, push delivery and any non-directory Supabase callers. Preserve the broad PR #68 branch and its handover; do not discard its work.

**Remaining Connect source/operational gates:**
1. PR #68 branch is not a clean, narrow release unit (166 ahead / 1 behind, and overlaps #70).
2. The branch handover records remaining Supabase relationships/outcomes, commercial/admin, AI proxy, push subscription/delivery, central facade/SDK/config and other active callers. A directory-only launch can defer unrelated callers, but selected directory routes must have zero Supabase fallback.
3. The branch handover also records that Relationships/Outcomes historical data and old Supabase logo objects were not migrated. Exclude those functions/data from the first pilot rather than implying parity.
4. Founder review, owner membership, inactive/unapproved listing exclusion, private/public field separation, storage authorization and abuse/rate limits require production end-to-end proof.
5. No current production GHM route smoke test was performed during this reconciliation. Green Connect CI and Vercel previews are not live GHM production evidence.

### 10.2 QuoteFlow — corrected exact-head status

**Main:** `e4b39a8515177ed00791e6be5213765d3f054a7f`.  
**PR #25:** draft, head `6865048a234d9700b700ea4b02c87ee4b810f9f3`.

- Exact-head TypeScript/Jest CI run `44450679464` passed.
- Exact-head Android preview run `44450679449` did **not** fail during Android compilation. Expo project generation, package-ID rewrite, Gradle `:app:assembleDebug`, and preview package-ID verification all passed. The final **Upload preview APK** step failed. Therefore the preview APK was built and package-verified but was not delivered as a GitHub Actions artifact. Do not describe this as a Gradle/build failure.
- PR #25 removes the Supabase runtime SDK/client/RPC adapter and lockfile packages on its branch, moves auth to GHM registration/login/refresh and managed-Business membership, supports explicit multi-Business selection, and keeps legacy local namespaces untouched. The branch's own handover confirms no legacy business-data mapping/import is needed for a fresh GHM account path; the two known bot accounts remain excluded.
- QuoteFlow remains draft/unmerged; no production issuer E2E, production APK distribution, installation/device acceptance or GHM production cutover is evidenced.

**Critical shared GHM dependency discovered in QuoteFlow's latest handover:** PR #25 is configured for the isolated GHM Authentication Issuer contract, not merely an arbitrary GHM Resource API URL. The latest handover explicitly records:
- no production `ghm_auth_issuer` PostgreSQL role provisioned;
- no separate production Authentication Issuer service deployed;
- no production issuer credentials/signing secrets/routing/cutover;
- no verified public HTTPS issuer origin;
- no complete approved no-additional-cost hosting/network/TLS topology;
- password-recovery delivery adapter remains absent (recovery request routes fail closed with 503).

Do not set `EXPO_PUBLIC_GHM_AUTH_ISSUER_BASE_URL` to a guessed Resource API or Render hostname. Do not co-host issuer-only signing secrets in the ordinary Resource API, repurpose sandbox services, weaken TLS, or create a new paid service. The no-cost topology must be reviewed and proven before production auth can be enabled.

**Legal acceptance:** QuoteFlow PR #25 calls the proposed GHM legal endpoints in PR #201 and remains fail-closed until approved documents are published. GHM #201 is still draft, has a stale-base/security-boundary re-review requirement (caller-supplied account ID in SECURITY DEFINER functions), and the owner previously directed that legal-document work remain parked until core systems are stable. Do not revive or merge #201, draft legal wording, or seed documents as part of this task. This remains a launch gate if mandatory legal acceptance is required for the pilot; the owner must explicitly resume the legal publication decision after core systems are stable.

**QuoteFlow next actions:**
1. Preserve PR #25; do not merge until the production issuer topology and exact live identity flow are qualified.
2. Resolve the Android artifact delivery failure using the existing workflow/local Windows Gradle delivery path without adding paid Actions storage or services. The actual Gradle build and package verification already pass.
3. After the issuer is deployed under an approved no-cost secure topology, run fresh registration, login, refresh, logout, explicit Business create/select/switch, unauthorized Business denial and Free access end-to-end tests.
4. Keep old local data untouched; no legacy data migration is a release prerequisite for fresh re-sign-up.
5. Keep paid entitlements disabled until a provider-neutral GHM entitlement/payment lifecycle is approved.

### 10.3 Shared GHM production gate — still the critical blocker

The latest GHM source/handover review does not support a production cutover yet:

- Production Actor Gateway Worker is not deployed. Its Wrangler configuration still has a placeholder Hyperdrive ID, disabled `workers_dev`, no production route/binding and no verified assertion secret/deployment.
- The existing GHM runtime's attempted deployment built but failed startup because production storage requires `GHM_ACTOR_GATEWAY_URL`. The prior live deployment was recorded as `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`; this is historical evidence, not a fresh current health check.
- The no-cost topology assessment found no existing always-on, adequately isolated, no-additional-cost host. Render Free sleep/ephemeral lifecycle and the tunnel sidecar proposal are not production-qualified; no keepalive schedule or extra paid service is approved.
- Production Render role/ownership administration remains unresolved under Amanda's support guidance. Do not improvise grants or alter roles.
- A fresh verified production backup/recovery point remains unconfirmed; the last identified archive was 4 November and predates later role work.
- PR #298 remains draft and its reviewed execution-batch manifest is intentionally empty; no production migration batch is authorized. The PR head `b6b96c44...` has no completed exact-head status evidence in the inspected Actions/status snapshot.
- PR #303 remains draft; its exact-head workflow run `44924040445` passed CI, but the PR body still called for focused qualification and review. A CI pass does not authorize production ACL changes.
- GHM #299's exact-head CI failed; Project detail/update remains unavailable until corrected and requalified.

**No-cost constraint:** do not resolve these gates by creating a paid Render Web Service, new database, separate paid database tool, keepalive schedule, or sandbox relaunch. The existing Worker/VPC/Hyperdrive/Tunnel candidate remains an architecture candidate, not an approved production topology.

### 10.4 Revised execution order — least work before early access

**P0 — shared GHM readiness, no product code shortcuts**
1. Continue Amanda/Render role-authority resolution and obtain a fresh verified backup/recovery point.
2. Complete a no-cost, isolated, strict-TLS production topology for the Actor Gateway and Authentication Issuer; prove each with the correct dedicated identities and no shared issuer secrets.
3. Refresh the production migration ledger and reconcile the exact pending inventory. Qualify the PR #303 ACL correction and PR #298 batch runner on their exact current heads. Derive only the first dependency-safe contiguous migration batch; keep execution fail-closed until the live evidence and rollback gate pass.
4. Deploy and smoke-test the exact GHM runtime/Actor Gateway/issuer route set only after the above gates. Auto-deploy remains OFF; no dummy URL or bypass of startup guards.

**P1 — Connect directory-only pilot**
1. From current Connect main, create a narrow directory-only integration slice. Use PR #68 as reference, but avoid pulling in its Projects/Opportunity and Analytics/Commercial changes.
2. Do not require GHM #243/#244 for the first pilot if supplier filters and Analytics are disabled.
3. Test registration → owner membership → profile completion → founder review → approved public listing → anonymous browse/search → public profile, including authorization denial and unpublished/inactive exclusion.
4. Pilot with invited businesses; no payment, subscription or paid offer messaging.

**P1 — QuoteFlow Free pilot**
1. Retain PR #25; repair artifact delivery without extra spend.
2. Wait for the shared production GHM issuer/Actor Gateway to be live and run the end-to-end GHM identity/multi-Business suite.
3. Keep subscription/billing disabled. Do not migrate old device namespaces; preserve them.
4. Do not bypass the legal acceptance fail-closed state. Resume legal publication only when the owner explicitly reopens it and approved content is available.

**Deferred, not launch blockers for the first two products:** Connect Projects/Opportunities (#70/#299), supplier classification (#243), Analytics/engagement (#244), Wealth Supabase/provider migration, Tender AI live model/persistence qualification and Legal OS architecture/MVP work.

### 10.5 Evidence boundary

This continuation inspected GitHub PR metadata/comments, branch comparisons, handovers, source documentation and exact-head workflow/job metadata. It did not run local tests, inspect secrets, query production databases, inspect live Render/Cloudflare/Vercel settings, deploy services, install an APK, or execute a live product journey. The next task must begin with current branch/handovers and exact production evidence, not assume these gates have changed.


---

## 11. ZAID Technologies corporate website — sixth launch workstream

**Website repository:** `zaidhqdev-sys/zaid-technologies-website`  
**Website audit PR:** [zaid-technologies-website#8](https://github.com/zaidhqdev-sys/zaid-technologies-website/pull/8)  
**Website main:** `1d3770b4f287c78931a25cda56d77c1cc723b92e`  
**Existing content-contract PR:** [website#3](https://github.com/zaidhqdev-sys/zaid-technologies-website/pull/3), draft.

The corporate website is the public front door for ZAID Technologies (brand of ZM Projects (Pty) Ltd), not simply another product page. It has a substantial corporate identity, Connect and QuoteFlow pages, Guide, Company, Contact, Privacy, Terms, Refund, Cancellation and Delivery surfaces, SEO/OG foundations, and a direct QuoteFlow APK asset.

**Readiness:** publicly accessible and structurally mature, but requires a coordinated content/release refresh before the product early-access launch.

Key findings:
- Existing website PR #3 contains the owner-directed free-directory adoption contract, but remains draft/unmerged. Current main and public crawl still show Connect 14-day trial, R199/R299 pricing and founding-offer messaging. Those must be suppressed during the free-directory adoption phase; online payments remain disabled.
- Current home page lists Connect and QuoteFlow as current products. That is consistent with the first two product workstreams, but page metadata/navigation/service hierarchy should distinguish customer products from bespoke business services and avoid implying both are fully released before their own gates pass.
- Tender AI, Wealth and Legal should not be advertised as available customer products yet. A future development/roadmap status disclosure needs owner approval first.
- Public QuoteFlow page links a 67,588,404-byte APK. This audit did not download/install/hash it or verify backend configuration. Its version, source commit, package ID, signing identity, SHA-256 and GHM-native compatibility must be proven before continuing to describe it as the current early-access release.
- The public privacy/terms pages primarily discuss Connect; they need a product-boundary review for QuoteFlow and the current early-access scope. Confirm that `hello@zaidtechnologies.co.za` is actively monitored before treating it as a reliable support route.
- Vercel custom domains are recorded verified and www redirects to apex. The recorded latest production deployment is 4 September 2026 on website main; PR #3 has a READY preview from 10 November, not a production deployment. A deployment attempt hit the Vercel free-plan API deployment limit. No plan upgrade or new project is recommended.
- Website audit PR #8 is documentation-only; no source code, DNS, Vercel settings or production deployment changed.

Detailed evidence, release gates and recommended actions are in website repo `docs/HANDOVER_2026-11-22_WEBSITE_EARLY_ACCESS_READINESS_AUDIT.md` on PR #8.

**Next website task:** complete the existing PR #3 content contract, reconcile public Home/Connect/Guide copy with free-directory adoption, verify the QuoteFlow APK provenance, run existing website tests/typecheck/build, and deploy through the existing Vercel project only after review. Do not add spend, activate payments, or create another project.
