# Connect → GHM Internal Runtime Migration — Durable Handover

**Status:** ACTIVE READ-ONLY AUDIT / DOCUMENTATION FIRST — NO IMPLEMENTATION OR CUTOVER AUTHORIZED  
**Created:** 2026-10-13  
**Purpose:** A new session must resume without reconstructing the conversation.  
**Companion:** ZAID Connect copy: `docs/06_Implementation/GHM_BACKEND_MIGRATION_HANDOVER_2026-10-13.md`.

## 1. Founder decision and non-negotiable rules

Target: remove **all Supabase runtime dependencies from current ZAID Connect** and make GHM Internal Runtime provide the required backend capabilities. This is not merely an auth-screen replacement: no active runtime journey may require Supabase Auth, Postgres/RPC, Edge Functions, Storage or Realtime.

- Documentation/source audit first. No code construction, data migration, shadow traffic, production change, provider activation, cutover or merge is authorized by this handover.
- Reconcile affected documentation as a set before merging. GHM documentation is source of truth for GHM; Connect documentation owns Connect-facing integration contracts. Keep one agreed status/gap register, not competing versions.
- A resource registry entry or service method is not proof of an HTTP endpoint, permission contract or product parity.
- Confirm active callers before rebuilding facade exports or old hooks.
- GHM must remain authoritative for identity, membership, authorization, lifecycle and persistence. Never trust a client-supplied Business ID as proof of access.
- No implicit identity bootstrap, silent account linking, cross-tenant fallback or role elevation.
- Never expose server signing secrets or provider keys in browser/Vite variables.
- Exclude Buildlink and its old referral/branding URLs as legacy Connect. Do not use stale legacy PayFast frontend code as current commercial truth.
- PayFast approval and PayStack status are distinct. PayFast deterministic implementation qualification is not live E2E qualification; PayStack approval/activation is not inferred.
- Keep online subscription activation and commercial launch authorization frozen until separate gates pass.
- GHM Internal Runtime is the current target; GHM Core is legacy.
- Avoid unnecessary paid spend. No paid AI provider is assumed or authorized.
- Do not instruct the founder to sync/pull local repositories unless asked. Keep work in small batches and updates concise.
- Do not create more branches without need. These handover branches are documentation-only.

## 2. Repository checkpoints — historical source baseline and current review baseline

| Repository | Historical source checkpoint (2026-10-13) | Verified `main` at status-correction review (2026-10-14) | Original handover branch |
|---|---|---|---|
| GHM `zaidhqdev-sys/GHM` | `9718890d65cd5e63a63aca4503ec41d36d8f7eca` | `20b120c7d6ecf7a86f9dc4f7a8dc61f9dee4d8dc` | `construction/connect-ghm-migration-handover-20261013` |
| ZAID Connect `zaidhqdev-sys/zaid-connect` | `abcffa73f893602c25310a58946bebb91fd7eeb5` | `e87ec1595f8ba412d37bccaa32120aa38d3d78d0` | `construction/ghm-backend-migration-handover-20261013` |

The 2026-10-13 SHAs are historical source checkpoints, not current `main` pointers and not proof of live Render deployment or production data. The 2026-10-14 SHAs identify the verified mainline bases used for this status-correction review; recheck current `main` before later work. No runtime changes were made in this audit.

## 3. Why this is urgent

At the 2026-10-13 source audit, Connect's Supabase project (`wxabopuyqblbpxkoudxy`) was observed as inactive/unresolvable: browser requests to its Auth endpoint failed with `ERR_NAME_NOT_RESOLVED`. This is dated availability evidence, not a fresh live probe of the project. The app uses a central Supabase client for session lifecycle and many data operations. Changing sign-in alone cannot restore the app.

## 4. Confirmed cross-cutting blockers

1. `src/lib/lib_supabase.js` imports `@supabase/supabase-js`, reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, configures session persistence/refresh and Realtime, and acts as a broad product-service facade.
2. `src/app/ZaidConnectApp.jsx` uses `authService.getSession`, `supabase.auth.onAuthStateChange`, and sign-out. `src/features/authentication/AuthScreen.jsx` calls `supabase.auth.signUp` directly.
3. `src/features/ai/aiProxyClient.js` directly calls Supabase Edge Function `/functions/v1/ai-proxy` using the anon key.
4. `src/lib/lib_notifications.js` writes push subscriptions to Supabase `push_subscriptions` and includes Supabase-related network logic. Confirm actual invocation/delivery before treating push as launch-critical.
5. GHM's Connect integration hardcodes provider `supabase` in trusted identity context/authorization binding. It must move to GHM-native identity/session semantics; swapping frontend login alone is insufficient.
6. GHM `POST /api/v1/connect/service` is a signed server-to-server boundary and rejects browser Origin. Browser code must not call it as a normal user API. Decide between a secure Connect BFF and a browser-facing GHM user-token API. Never put service assertion secrets in the browser.
7. Connect roles include customer/contractor/supplier/admin and business-operator intent; GHM roles include admin/customer/business plus separate membership roles/status. Explicitly map account, profile, business ownership and memberships.

## 5. Gap register

Classification: **Reuse** = likely existing GHM surface, still requires contract/authorization qualification; **Extend** = existing capability incomplete; **Build** = no adequate equivalent found; **Legacy/exclude** = don't recreate without proof of active usage.

### A. Identity and cross-cutting (blocking)
- **Extend/decision required — GHM-native identity bridge.** Remove Supabase provider assumptions from Connect identity adapter, trusted request context and authorization binding. Preserve canonical GHM account/session/membership authority; no implicit bootstrap.
- **Build/decision required — browser-safe transport.** Specify a user-token API or BFF; service-to-service assertions remain server-only.
- **Extend — session lifecycle.** Replace app bootstrap, signup, login, restore, refresh, logout, recovery and role propagation as one coherent contract.
- **Build — identity/business migration plan.** Map existing accounts and ownership/membership to GHM identities; don't assume Supabase UUID equals GHM account ID or auto-link accounts.

### B. Product journeys

| Journey | Current classification | Evidence / required next check |
|---|---|---|
| Profile + managed business + editor | Extend | GHM has profile/business reads, managed-business listing, create/update and hours. Connect also expects registration identity, logo/media, membership permissions and directory-review status. Compare IDs, fields, ownership and errors. |
| Public directory/profile | Extend | GHM public directory/search and profile routes exist. Compare category/region filters, pagination, public-field allowlist, slug/detail response and engagement/view events. |
| Business hours | **Extend** | Authenticated GET is registered; replacement service exists but no HTTP write route was found. Expose only the contract-governed replacement operation with membership authorization and HTTP acceptance tests. |
| Categories / offerings / capability catalogue | **Extend / Legacy-exclude by caller evidence** | Category routes exist but UI/filter parity remains open; capability evidence submission/review is missing. Connect's offering CRUD caller has no confirmed mounted production screen, so exclude that product adapter from first migration scope unless reachability evidence changes. This is separate from GHM's `business_offering` resource contract, which is already **QUALIFIED / CLOSED**; do not reopen that GHM slice. |
| Capability evidence + admin review | Extend/build | Connect has business submission and admin review screens. Inspected GHM capability router exposed list/get/create, not matching evidence submission/review endpoints. Specify private evidence access, verifier authority, review transitions and audit. |
| Founder directory governance | Build | Connect calls reviewer check, submission, queue/list, owner presentation and decision operations. No equivalent complete GHM founder-review workflow identified. |
| Opportunities | Extend | GHM opportunity detail and requirements routes exist. Connect needs marketplace list/filter, types and capability-requirement operations; full discovery contract not evidenced. |
| Projects + quotes | Reuse/extend | GHM project/quote routes exist. Verify open-project discovery, owner reads/updates/deletes, atomic create-with-opportunity, quote submission/edit and accept/reject semantics. Independent endpoints may not preserve RPC transaction guarantees. |
| Leads | Extend/build | Active workspace calls `leadService.getForBusiness` and status update on a separate `leads` model/RPC. Enquiries are not automatically equivalent; define list scope, lifecycle and status mapping. |
| Analytics | Build/extend | Active screen calls `businessAnalyticsService.getDashboard(businessId, days)`; expects leads, quotes, wins, conversion, engagement and recent activity. No equivalent GHM dashboard contract found in inspected HTTP surface. |
| Relationships + outcomes | Build | Active `RelationshipOutcomeScreen.jsx` calls both business relationship and outcome services; GHM inventory has no corresponding resources. Preserve lifecycle, verification, visibility, provenance and evidence. |
| Onboarding | **Build** | `featureFlags.guidedOnboarding=true` and the active onboarding panel calls progress/action methods; no equivalent GHM onboarding resource/HTTP contract was found. Preserve progress, record, complete and dismiss semantics with business-scoped authorization. |
| Notifications | **Reuse candidate / qualify active producers** | GHM list/detail/read/all-read routes exist; qualify payload and recipient authorization for confirmed active producers. Inbox/realtime/push remain excluded unless mounted caller and delivery evidence are established. |
| Support | **Reuse candidate / adapt** | Active customer and admin panels use list, messages, create/reply and status operations. Match response envelopes, limits, validation, ownership, membership and admin-only status transitions with integration tests. |
| Reviews + trust | **Reuse candidate / adapt** | GHM public/customer/admin routes exist; map review fields, pending-only queue, moderation states/rejection reason, reviewer identity and aggregates. Founder directory review is a separate missing workflow. |
| Media/storage | Extend | GHM has R2 provider path and storage service currently limited to `business_logo`; no storage HTTP router identified in app registration. Expose policy-enforcing API; separate public logo from private evidence/workspace files. |
| AI proxy / quote analysis | Extend/build | AI client calls Supabase Edge Function. Trace active UI callers and quote-analysis persistence; replace with GHM-owned endpoint, server-only keys, authorization, limits and safe errors. No paid provider without approval. |
| Regional configuration + directory filters | **Extend** | `src/features/directory/useDirectoryFilters.js` actively loads default regional configuration and administrative areas. Extend the existing directory/filter contract for confirmed active needs; define minimal launch geography and configuration ownership. Do not rebuild the legacy regional system wholesale. |
| Browser push | **Evidence-insufficient / legacy-exclude pending proof** | A helper writes subscriptions, but active invocation and delivery are not established. Do not include push in launch scope without mounted-caller and end-to-end delivery evidence. |
| Commercial/payment | Reuse/extend, gated | GHM has payment prepare and PayFast checkout/ITN/server confirmation. Keep activation/launch auth disabled. Preserve idempotency and provider separation; sandbox E2E and live enablement are separate gates. |

### C. Legacy/exclude unless active-call evidence proves otherwise
- Buildlink branding/referral URL.
- Orphaned old verification-document UI/service; this does not exclude the separate capability-evidence workflow.
- Old/unreferenced Supabase hooks or service exports with no active product caller.
- Unconfirmed supplier marketplace, referrals, disputes, workspace-file and other facade exports until active routes/screens demonstrate use.
- Legacy PayFast frontend code with stale prices/tiers.

## 6. Security and data-migration rules

- GHM is authoritative for identity, business membership, authorization, lifecycle and persistence.
- Client-supplied Business ID is a requested resource, not permission.
- No silent account linking, bootstrap mapping, cross-tenant fallback or role elevation.
- Never place service secrets/provider keys in browser variables.
- Private evidence/workspace files must not inherit public-logo policy.
- Preserve audit trails and commercial launch gates.
- Do not delete historical Supabase migrations/evidence merely to make the repo look Supabase-free. Remove active runtime dependencies only after caller/build checks; retain historical provenance.
- No destructive migration until source-target mapping, duplicates, ownership conflicts, counts, recovery and rollback are documented and approved.

## 7. Acceptance gates before production cutover

1. Source scan/build proves no active runtime import, config or network dependency on Supabase Auth, Postgres/RPC, Edge Functions, Storage or Realtime.
2. Signup/login/restore/refresh/logout/recovery work on GHM-native identity; invalid/expired/revoked credentials fail closed.
3. Account-role and active-business membership mapping is explicit, tested and tenant-isolated.
4. Every active screen/service operation has a documented GHM contract and integration test.
5. Cross-account/business/resource denial and admin/reviewer authorization are independently tested.
6. Public directory allowlist and private evidence/media access are verified.
7. Multi-step project/opportunity/quote workflows preserve transaction/atomicity semantics.
8. Migration has dry-run reconciliation, duplicate/orphan/conflict report, recovery and rollback plan, and founder approval.
9. Runtime deploy, health, logs and E2E smoke tests are qualified without premature payment/AI activation.
10. Founder explicitly authorizes cutover only after evidence is complete. This document does not authorize cutover.

## 8. Exact resume point — do not restart from zero

**Historical checkpoint (2026-10-13; superseded by the 2026-10-14 status correction):** the recorded targeted reconciliation and link checks were performed against that session's checkpoint. They did not prevent the stale PR-status statements found on 2026-10-14, so they must not be cited as proof that the current repository is fully reconciled. GHM PR #133 is merged into `main` as `20b120c7d6ecf7a86f9dc4f7a8dc61f9dee4d8dc`; this was a documentation merge only and does not qualify product parity or authorize cutover. ZAID Connect PR #34 was merged into that repository's `main` as `e87ec1595f8ba412d37bccaa32120aa38d3d78d0`. Verify the repository's current `main` before relying on later status; never infer its state from a same-numbered GHM PR. No code, runtime, database, production, provider, or cutover changes were made.

1. Reconcile the operation-level classifications in this handover against `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`, `CONNECT_BACKEND_OPERATION_INVENTORY.md`, `GHM_CONNECT_BACKEND_READINESS_AUDIT.md`, `docs/GHM_CURRENT_STATE.md`, and the living operation contracts. Keep explicit **Build / Extend / Reuse candidate / Legacy-exclude / Evidence-insufficient** distinctions.
2. **Historical link audit (2026-10-13):** the recorded 207-file GHM Markdown scan and changed-file link checks (30 GHM / 7 Connect) reported no broken relative/local targets. The status contradictions discovered on 2026-10-14 demonstrate that those checks were not a complete repository-wide semantic reconciliation. Treat the result as historical evidence only; complete the current cross-document consistency review before declaring reconciliation complete.
3. Reconcile the matching Connect integration architecture/specification, current-state audit, master index, ownership matrix and companion handover against the same classifications.
4. For future work, verify current GHM `main` and relevant ZAID Connect repository/PR state directly before relying on historical checkpoints. GHM PR #133 is already merged; do not reopen or repeat that step. Check ZAID Connect PR #34 only in its own repository and do not infer its state from a same-numbered GHM PR.
5. No implementation, data migration, provider activation, production changes or cutover during this documentation pass.

The documentation branches for GHM PR #133 and ZAID Connect PR #34 are already merged. Any new documentation PR must be reviewed as a complete affected-document set and must not be merged without the founder's explicit authorization. No implementation, migration, production changes or cutover is authorized by this handover.

## 8A. Durable continuation state — 2026-10-14

This is the current resume point for documentation reconciliation; the older audit batches below are evidence/history, not proof that repository-wide reconciliation is complete.

- **GitHub review branches:** GHM PR #135 and ZAID Connect PR #36 remain open/unmerged. The previously recorded head SHAs are historical checkpoints only; fetch current PR metadata and changed-file lists before each review. The active branches are `construction/reconcile-pr133-status-20261014` (GHM) and `construction/reconcile-handover-status-20261014` (ZAID Connect).
- **Current review scope:** reconcile the complete affected-document set, not only the files already changed in either PR. The durable handover, operation inventory, production-readiness gap register, backend readiness audit, current-state/register documents, Connect integration/data/security architecture, API/interface specifications, glossary, master index, ownership matrix, coding/engineering standards, deployment standard and product vision must agree on target architecture, source-vs-target authority, operation classifications, identity mapping, provider gates and status claims.
- **Completed targeted standards correction (2026-10-14, on Connect PR #36):** `docs/00_Foundation/PRODUCT_VISION.md` now labels Supabase-backed contracts as historical/current-source implementation and states GHM Internal Runtime is the migration target. `docs/03_Engineering/ENGINEERING_STANDARDS.md` separates legacy source/client/migration ownership from the GHM target and states that post-cutover Connect must have no active Supabase runtime dependency. These targeted corrections do not certify the full documentation set; verify them in the latest PR diff.
- **Local-repository comparison is not done:** GitHub-side file counts and link checks do not inspect the founder's local `C:\GHM` or Connect checkout. The local checkout is known to be unsynced. Do not fetch, pull, reset, switch branches or otherwise synchronize it as part of this audit. Inspect local documents read-only in a separate batch and compare them against GitHub before declaring the overall documentation set reconciled.
- **Completed in the 2026-10-14 follow-up batch on Connect PR #36:** `PRODUCT_VISION.md` and `ENGINEERING_STANDARDS.md` now distinguish legacy Supabase source evidence from the GHM Internal Runtime target. `INTEGRATION_ARCHITECTURE.md` labels its Supabase inventory historical/current-source evidence and states the no-Supabase target. `INTEGRATION_SPECIFICATION.md` no longer labels the Supabase platform simply “Implemented and active”; it records source implementation evidence, uncertain current hosted availability, and the approved target distinction. These are targeted corrections only, not a repository-wide certification.

**Completed on Connect PR #36 in the 2026-10-14 follow-up:** API, data, glossary, security/system architecture, coding/deployment standards, ownership matrix, and master index received targeted source-vs-target/status clarifications and updated revision metadata where changed. The Connect handover records the batch and remaining work. These changes do not establish full reconciliation or GHM production readiness.

**Next batch (supersedes the earlier instruction immediately above):** continue the current-branch repository-wide audit. The actual PR #135 changed-file list and the six-document readiness consistency pass have already been checked; do not repeat that batch. Current GitHub tree enumeration confirms 210 tracked Markdown files in GHM (207 under `docs/`) and 47 in ZAID Connect (`docs/`). Continue the remaining semantic/status/authority review and same-branch local Markdown-link validation, then compare both repositories' canonical docs and perform the separate read-only local-vs-GitHub comparison. The tree counts are not a reconciliation certificate. No merge until all gates are complete and the founder explicitly authorizes it.
- **Merge gate:** neither PR may be merged until GitHub-side affected documentation and the separate local-vs-GitHub comparison have been reviewed and reconciled, verification is recorded, and the founder explicitly authorizes merging. This is documentation-only; it authorizes no code, runtime, database, deployment, provider, migration or cutover changes.

## 9. Findings from the latest batch

- `RelationshipOutcomeScreen.jsx` calls both relationship and outcome services.
- `AnalyticsScreen.jsx` calls `businessAnalyticsService.getDashboard`.
- `useBusinessWorkspace.js` calls lead listing/status operations.
- `aiProxyClient.js` constructs a Supabase Edge Function endpoint from Vite Supabase environment values.
- `lib_notifications.js` contains push-subscription writes; active invocation/delivery still requires confirmation.
- Founder directory-review service is called from business profile editor and administration panel.
- GHM `opportunity-requirements-router.ts` exposes GET requirements and PUT replacement; this does not provide marketplace listing/types.
- Existing GHM readiness register and operation inventory are historical/bounded sources. Reconcile them; do not blindly replace or duplicate their qualified evidence.

## 10. Session start prompt

Read this file first and the Connect companion. Check latest main/branch/PR status rather than trusting recorded hashes. Resume at §8. Report only what the current small batch proves; do not ask the founder to re-explain. Success means repository docs make work resumable without an hour of context reconstruction.


## 11. Contract audit batch — 2026-10-13 (hours, profile and governance)

### Verified source evidence

- `src/http/app.ts:544-563` registers only **GET** `/api/v1/businesses/:businessId/hours`, guarded by resource authentication and `requireRegisteredAccess('business_hours', 'read')`; response is `{ hours }`. No replacement/write route appears in this inspected registration block.
- `src/resources/business-hours/service.ts:64-66` has `replaceBusinessHours(context, input)` with input validation (positive business ID, array up to seven entries, unique days, valid closed/open times), but a service method is not a reachable HTTP contract. Therefore classify Connect business-hours replacement as **Extend: expose authorized HTTP mutation + contract tests**, not complete reuse.
- `src/http/business-hours-http.test.ts` qualifies GET authentication, invalid ID, response envelope and access denial. The inspected tests do not establish a write endpoint.
- `src/features/business-profile/BusinessProfileScreen.jsx` imports the Supabase facade directly and actively calls directory slug/ID reads, owner-authorized business fallback, profile-view engagement, review list, business hours, capability list, saved-business state and engagement events for save/WhatsApp/call/website/directions/share. These are live screen contracts, not just facade exports.
- `src/features/administration/AdminDirectoryReviewPanel.jsx` actively invokes founder-reviewer check, review queue listing and review decision. `src/features/administration/AdminCapabilityEvidencePanel.jsx` actively invokes verifier check, evidence queue and review decisions (verified/rejected/revoked).
- `src/features/onboarding/OnboardingPanel.jsx` invokes onboarding progress read and action methods. The inspected Connect flag is `featureFlags.guidedOnboarding=true`, so treat onboarding as active in-scope functionality; preserve progress/action semantics and qualify route authorization rather than leaving activity unresolved.

### Required matrix mappings

1. Business hours: GET is a reuse candidate; replacement is an HTTP-surface gap until a mutation route with authorization, schema and integration tests is present.
2. Business profile/directory: engagement tracking is an active dependency. GHM directory/profile reads must be compared with Connect's field allowlist, slug/ID semantics, owner preview fallback and the event kinds above.
3. Directory review and capability evidence are confirmed active administrative workflows, not speculative facade exports. The replacement contracts must preserve founder/verifier authority and review decisions.
4. Onboarding is active under `featureFlags.guidedOnboarding=true`; GHM still needs a matching onboarding resource/HTTP contract and authorization tests.

No code or production changes were made. The operation-by-operation findings below supersede this historical checkpoint as the resume point; final cross-document review remains open and no merge/cutover is authorized.


## 12. Contract audit batch — directory, reviews, notifications and support

### Verified GHM HTTP contracts

- Directory `GET /api/v1/public/businesses` (`src/http/app.ts:400-465`) allows only `q`, `category`, `page`, `pageSize`; default page is 1, default page size 20, maximum 50. Unknown query keys return 400. This is narrower than a broad “directory parity” assumption: Connect filters, output fields and pagination semantics must be compared explicitly. Do not assume regional filters are supported.
- Public review routes include `GET /api/v1/public/reviews?businessId=&limit=`; authenticated customer `POST /api/v1/reviews`; own-review GET; and admin `PATCH /api/v1/reviews/:reviewId/moderation`. GHM moderation decision is approve/reject. Connect's active profile submits review fields `rating,title,body` plus reviewer name and expects moderation pending. Compare request schema, ownership and moderation statuses before classifying as reuse.
- Notifications expose authenticated list/detail/create, `PATCH /api/v1/notifications/:notificationId` with exactly `{isRead:true}`, and `POST /api/v1/notifications/read-all`. This is a concrete reuse candidate for in-app read state; Connect's notification payloads, create permissions and any realtime expectation still need matching.
- Support routes expose list/detail/create, admin status update, message list and role-specific reply. Compare Connect's RPC result shape, admin filters, status enum and message permissions; route presence alone does not establish parity.
- Active Connect relationship/outcome screen calls `businessRelationshipService.getForBusiness(businessId)` and `outcomeService.getForBusiness(businessId)`, then derives active and verified relationship counts from `lifecycle_status` and `verification_status`. GHM's current resource inventory still lacks matching relationship/outcome domains; this remains a real domain gap.

### Classification updates

- Directory = **Extend** until query/filter/field and engagement parity is qualified.
- Reviews = **Reuse candidate / contract verification required**, not “complete”.
- Notifications in-app read state = **Reuse candidate / contract verification required**; push and realtime remain separate, caller-verified scope.
- Support = **Reuse candidate / contract verification required**.
- Relationships/outcomes = **Build**, with lifecycle and verification semantics preserved.

No runtime or production change was made. Historical checkpoint superseded by the later operation-level matrix and cross-document review. Do not use this paragraph as the current resume point.


## 13. Contract audit batch — Connect directory and review parity

### Directory mismatch now confirmed

Connect `src/lib/lib_supabase.js:1529+` searches with `query`, `category`, `province`, `city`, `lat`, `lng`, `radius`, `tier`, `sort`, zero-based `page`, and `limit` up to 100. It filters approved + active businesses, searches name/description/city, optionally filters province/city/tier/category, applies sorting, and supports proximity filtering when coordinates are supplied. GHM `GET /api/v1/public/businesses` currently accepts only `q`, `category`, one-based `page`, and `pageSize` up to 50. These are concrete contract mismatches, not a generic “verify directory” note. Map zero-based vs one-based paging, filters, distance/radius semantics, sort allowlist, count/hasMore, and the 35-field Connect public projection versus GHM's narrower public projection before implementation.

Connect directory screen also loads category data, saved businesses, and records `profile_view` engagement with visitor context. Business profile additionally records `save`, `whatsapp`, `call`, `website_visit`, `direction_request`, and `share`. These event types and privacy constraints must be included in engagement parity; don't assume a directory route supplies analytics.

### Review mismatch now confirmed

Connect review service creates a row with `business_id`, `reviewer_id`, and `reviewData`; public profile reads only approved reviews, admin queue lists pending reviews, and moderation RPC receives decision plus rejection reason. GHM routes expose public list, customer create, own read, admin pending list, and admin approve/reject. This is a **reuse candidate with contract/security adaptation**, not drop-in parity: derive reviewer identity from authenticated GHM context (never trust browser-supplied reviewer ID), map Connect `approved/rejected/pending` states and rejection reason, preserve pending-only queue semantics and business name presentation, and test ownership and admin authority.

### Required classifications

- Directory discovery = **Extend** (filter, sort, paging, output projection and engagement contracts differ).
- Business engagement = **Build/extend** unless GHM has an already qualified event contract; current inspected route set does not provide the Connect event contract.
- Review create/read/moderate = **Reuse candidate / adapt and qualify**.

No code or production changes. Historical checkpoint superseded by the later operation-level matrix and cross-document review. Do not use this paragraph as the current resume point.

## 14. Contract audit batch — support and notification caller status

### Support — active caller verified

- Connect `src/features/help/SupportRequestsPanel.jsx` is imported by `HelpScreen.jsx`; it calls support list, message, create and reply methods.
- `src/features/administration/AdminSupportRequestsPanel.jsx` is imported by `AdministrationScreen.jsx`; it calls admin list/messages/reply/status methods. Support is an active user journey.
- GHM has customer/admin support route families, but compare Connect's admin filter default (status null, limit 100), status enum, create category/subject/description/businessId, message shape and reply/status semantics against GHM parsers. Enforce customer ownership and admin-only status updates.

### Notifications — separate creation from inbox UI

- Connect has notification create/read/mark-read/all-read facade methods, and creation is used by other service paths. GHM notification list/detail/create/read/all-read routes exist; qualify payloads and recipient authority against active notification-producing workflows.
- The `useNotifications` hook appears only in `src/hooks/hooks_index.js`; no active caller was found. `NotificationCenter` has no confirmed active mount. The legacy `AdminVerificationScreen` is explicitly not mounted by the founder directory-review contract test. Do not rebuild the old notification/realtime UI or that legacy screen by assumption.
- `subscribeToPush` remains helper-only in current search evidence; no active invocation was found. Push subscription/delivery is not confirmed as launch-critical.

### Classification update

- Support = **active, reuse candidate with contract adaptation and authorization tests**.
- Notification producer API = **reuse candidate with recipient/payload qualification**.
- Notification inbox/realtime/push = **evidence insufficient**, not automatically in migration build scope.

No code or production changes were made. The following sections record the support field/status comparison; the remaining task is to reconcile the resulting classification consistently across all affected documents.

## 15. Support contract comparison — exact fields and status values

Connect's active customer support panel validates subject length 3–160 and description length 10–4000, creates with `category, subject, description, businessId`, lists its own requests, reads messages, and replies with message body. The admin panel lists requests, reads/replies to messages, and updates status with optional resolution summary. UI options include `open`, `in_progress`, `resolved`, and `closed`; resolution summary is supplied for resolved/closed requests.

GHM `src/http/support-request-router.ts` currently validates the same status set (`open | in_progress | resolved | closed`), create fields `businessId/category/subject/description`, admin status `status/resolutionSummary`, and message body. It exposes `GET/POST /api/v1/support-requests`, `GET /:requestId`, `PATCH /:requestId/status`, and `GET/POST /:requestId/messages`. Route-level roles distinguish customer create/reply from admin status updates; service-level membership/ownership still requires integration tests.

**Updated classification:** support is a strong **Reuse candidate**, with adapter work needed for Connect's `getMine/getAdmin/getMyMessages/getAdminMessages/replyAsCustomer/replyAsAdmin/setStatusAsAdmin` facade shape and GHM's `supportRequests/messages/message` response envelopes. Verify customer ownership, admin list defaults (Connect requests 100 records while GHM defaults/limits are parser-defined), resolution-summary rules, and request/message ID compatibility. Do not mark full parity until those tests pass.

No implementation or production changes. The operation-level findings are recorded in the later matrix sections; final reconciliation and cross-reference review remain open.

## 16. Exact support and notification security qualification

### Support — route limits and UI validation

- Connect's UI validates subject length 3–160 and description length 10–4000, but GHM's inspected `parseCreateInput` checks types and allowed keys, not those same length bounds. GHM's service may validate further; prove that with service-level tests rather than assuming. Align the adapter so invalid input behavior remains predictable.
- GHM support list parser accepts status in `open | in_progress | resolved | closed` and limit 1–100. Connect's admin list defaults to 100 with status null, so the nominal maximum matches. Confirm service-level customer ownership, admin-only list/status/reply, request and message ID compatibility, and resolution-summary transition rules in tests.
- The active Connect UI displays `sender_kind`, `body`, `created_at`, `priority`, `resolution_summary` and request fields. Ensure GHM response records expose compatible meanings or map them in the client adapter.

### Notifications — do not assume browser may create for arbitrary recipient

- GHM notification create schema accepts `userId,type,title,body,metadata`; route middleware checks registered resource access, and service errors explicitly include recipient permission / lead identity mapping. The create contract must remain trusted-server or policy-restricted; do not expose arbitrary-recipient notification creation to a browser simply because the route is authenticated.
- The GHM list/read endpoints are scoped through authenticated context. Connect's old UI inbox/realtime/push callers remain unconfirmed, so preserve only notification-producing workflows proven active and authorize recipient selection server-side.

### Acceptance evidence still required

Support: integration tests for customer A cannot read/reply to customer B's request; non-admin cannot list all/admin-change status/reply as admin; malformed/oversized body; status transitions/resolution summary; response shape mapping; business-membership behavior when businessId is present.

Notifications: recipient cannot read/mark another user's notification; non-privileged caller cannot create a notification for arbitrary userId; all-read affects only authenticated recipient; producer identity mapping and event payload are explicit.

No runtime or production changes. These are contract findings to carry into the single operation-level gap register.

## 17. Active feature flags, analytics, regional config and AI gate

### Active callers / gating verified

- `featureFlags.guidedOnboarding` is `true` in Connect's current `src/config/featureFlags.js`; the onboarding panel returns null only if this flag is false. Treat onboarding as current in-scope functionality unless route/mount evidence contradicts it. The four progress actions still lack a GHM onboarding resource/HTTP contract.
- `src/features/analytics/AnalyticsScreen.jsx` is an active caller of `businessAnalyticsService.getDashboard(businessId, days)`, default 30 days and selectable periods. It is backed by Connect's `get_business_analytics_dashboard` RPC. No equivalent GHM analytics dashboard contract has been established; classify **Build** (or extend an explicit existing analytics contract only if source audit finds one), with tenant/business authorization and aggregation parity.
- `src/features/directory/useDirectoryFilters.js` actively loads the default regional configuration and administrative areas. Regional configuration is not just a dormant facade export. GHM directory endpoint does not accept region/province/city filters today; classify **Extend** directory configuration/filter contract. Identify the minimal supported launch geography and configuration ownership rather than rebuilding every legacy regional table.
- AI is present in active UI callers (`AISupportScreen.jsx` and quote analyzer). However `src/config/featureFlags.js` has `milestone38Approved: false`; the provider gate requires approval before proxy invocation. Preserve the fail-closed gate. AI migration scope is **replace the Supabase Edge Function transport only if/when the feature gate authorizes it**; do not enable paid providers or weaken the gate during this backend migration.
- `aiProxyClient.js` directly constructs `VITE_SUPABASE_URL/functions/v1/ai-proxy` and sends the Supabase anon key. That is a confirmed runtime coupling, even while provider access is gated. A no-Supabase build must remove this coupling and preserve the current denial behavior until explicit provider approval. Existing Buildlink-era strings in the AI support content are stale UI copy, not a reason to revive Buildlink or its backend.

### Classification update — active regional and AI findings

- Onboarding = **Build** (active flag, no GHM contract identified).
- Analytics dashboard = **Build**, preserving Connect's metrics and authorization.
- Regional configuration + directory filters = **Extend**, limited to active filter needs.
- AI proxy = **Replace transport behind existing fail-closed gate**; provider activation remains unauthorized.
- Do not treat old provider integrations as launch approval.

No runtime or production changes. This is an audit/documentation checkpoint only.

## 18. Active relationship, quote-analysis and commercial journeys

### Relationships/outcomes — active route, missing GHM domain

- `ZaidConnectApp.jsx` lazy-loads `RelationshipOutcomeScreen.jsx`, and `src/app/routes.js` registers `ROUTE_IDS.RELATIONSHIPS` as a navigable authenticated route requiring `BUSINESS_READ` and active-business context. The screen actively calls relationship and outcome services. GHM's current resource inventory has no equivalent domain: classify **Build**. Acceptance must capture the Connect data fields, create/update transitions, verification state, business scope and authorization rules; route reachability is already confirmed.

### Quote analysis — distinguish deterministic analysis from provider AI

- `AIQuoteAnalyzerScreen.jsx` actively calls `quoteAnalyzerService.getUserAnalyses(user.id)` and local/DB quote analysis methods. Connect's milestone documentation explicitly distinguishes this deterministic/local/DB heuristic path from the Milestone 38 Anthropic provider path. The data/history path is a **backend replacement requirement** (ownership-scoped analysis history and quote lookup); it does not authorize AI-provider calls.
- AI support and quote-provider transport still targets Supabase Edge Function via `aiProxyClient.js`, but `milestone38Approved=false`. Remove Supabase transport from the eventual runtime while preserving provider fail-closed behavior and deterministic/local fallback. No provider activation is approved.

### Commercial — preserve the frozen gate

- `BusinessWorkspaceScreen.jsx` imports and renders `BusinessCommercialPanel.jsx`; it calls offer lookup and trial activation and contains guarded checkout actions. This is active functionality even though online subscription activation is disabled.
- GHM has internal commercial payment-prepare, PayFast checkout and payment-result/ITN routes. Existing Connect commercial code is still Supabase-backed and includes Paystack function paths; the operation contract and provider decision must be reconciled without conflating PayFast approval with Paystack status.
- Preserve current release flags: `launchAuthorized=false`, `milestone38Approved=false`, `milestone52Approved=true`, `onlineSubscriptionActivation=false`. Backend migration must not change trial terms, prices, provider, launch authorization or activate payment. Separate offer/trial read/write parity from payment checkout and provider callbacks.

### Classification

- Relationships/outcomes = **Build** (domain absent).
- Quote analysis history/deterministic analysis = **Build/extend after schema and ownership audit**; keep distinct from provider AI.
- Commercial offer/trial = **Extend/reuse candidate pending contract parity**.
- Payment checkout/webhooks = **preserve frozen state; contract migration separately gated**.

No code, migration, provider activation or production change was made.

## 19. Caller reachability and remaining domain inventory

### Reachability and active-caller findings

- **Relationships/outcomes**: current route dispatch/reachability is confirmed, and `RelationshipOutcomeScreen.jsx` actively calls relationship and outcome services. GHM has no equivalent domain in the current resource inventory; classify this as a **Build** gap. Preserve lifecycle, verification, visibility, provenance and evidence semantics. Route reachability is not an open question.
- `businessOfferingService` / `catalogueService` appear as facade exports, but current repository search did not identify a production UI caller. Do not include an offerings product adapter in the launch migration until an active caller is confirmed. This caller-scope exclusion does **not** reopen or contradict GHM's separately qualified/closed `business_offering` resource contract; it only leaves Connect adapter need unproven. Active business-category/capability/directory needs remain in scope.
- `supplierService`, `referralTrackingService`, and `disputeService` are present in the central facade and/or test-only integration harness, but no current production screen caller was found in the searched references. Classify **legacy/unconfirmed; exclude from first migration scope unless reachability audit finds a mounted caller**. Tests that import a service are not proof of production use.
- `businessRelationshipService` and `outcomeService` have an active screen caller on a confirmed authenticated Relationships route. Prioritize the missing GHM relationship/outcome domain as a **Build** gap; acceptance must cover lifecycle, verification, business scope and authorization.

### Consolidated provisional migration classification

**Replace foundational runtime first**
1. Supabase auth/session lifecycle and direct signup.
2. Central database/RPC facade dependencies used by confirmed mounted screens.
3. GHM Connect identity binding currently requiring provider `supabase`.
4. A browser-safe authenticated API/BFF; the existing signed Connect service route is server-to-server only.
5. AI proxy URL/auth transport to remove Supabase dependency while retaining `milestone38Approved=false` fail-closed behavior.

**Extend GHM contracts**
- Directory query/output/pagination, regional filters, profile engagement events.
- Business profile identity and owner-edit contracts; business-hours write route.
- Capability evidence submission/review; founder directory listing review.
- Opportunity marketplace list/types/requirements contract.
- Support and review adapters/authorization/response-shape parity.
- Project/quote lifecycle parity and in-app notification producers, only for confirmed active producers.

**Build missing domains / APIs**
- Onboarding progress (flag currently true).
- Business analytics dashboard.
- Relationships/outcomes: the authenticated Relationships route is registered and requires `BUSINESS_READ` plus active-business context; GHM has no matching domain, so this is an active **Build** gap.
- Quote-analysis history/data operations for the active analyzer are in migration scope. Keep history/data migration separate from provider AI invocation; `milestone38Approved=false` remains fail-closed and does not authorize paid-provider activation.
- Storage HTTP API and private-object classes needed by confirmed upload journeys.
- Business engagement event contract where not already qualified.

**Keep frozen / do not silently expand**
- Commercial offer/trial parity can be migrated, but payment checkout/provider callbacks remain separately gated. Preserve `launchAuthorized=false`, `milestone38Approved=false`, `milestone52Approved=true`, `onlineSubscriptionActivation=false`; do not activate a payment provider.
- AI provider activation remains unauthorized.
- Do not rebuild dormant notification inbox/realtime/push, old verification screen, supplier marketplace, referrals, disputes, offerings catalogue or other facade-only features without active-caller evidence.
- Buildlink-era strings and old Supabase migration files are not a reason to restore legacy runtime integrations.

This matrix is **provisional, not an implementation authorization**. Final matrix must list every confirmed active operation with caller, current Supabase operation, target GHM route, exact input/output mapping, identity/role boundary, transaction/lifecycle behavior, and acceptance test. No runtime code, database, production or cutover changes were made.

## 20. Exact project, quote and opportunity API gap

### Projects and quotes — substantial routes exist, lifecycle parity is incomplete

Connect's active `projectsService.js` operations include open-project search with category/province/urgency/search and page/pageSize (up to 100), customer project list/detail, atomic project + opportunity creation, open-project update/delete (delete only when open and with no quotes), quote lists by project/business, quote create/update, and customer accept/reject. Connect project validation requires title 5–160, description 20–5000, category 2–80, province 2–80, city 2–120, urgency standard/urgent/emergency, and valid non-negative budget range. Quote contract includes amount, labour/material/total ranges, positive duration and description length 10–5000.

GHM currently exposes project and project-quote operations, including customer read-received quotes, business read-own quotes, business create/update quote, and customer accept/reject. Do not mark this as full parity yet: map each Connect operation to its GHM route, verify project discovery query fields and response envelopes, customer-scoped list/detail, project update/delete rules, project+opportunity atomicity, quote normalization/business presentation, and ID conversion. In particular, GHM's route authorization uses numeric internal IDs and role/resource checks, while Connect currently passes Supabase UUIDs; identity/data migration mapping must be explicit and never rely on matching IDs by coincidence.

### Opportunity marketplace — confirmed missing discovery endpoints

Connect's active opportunity service lists active opportunity types; lists open/responding opportunities whose open/close windows are current, with search, type filter, exact count and nested country/currency/capability requirements; reads requirements; and atomically replaces requirements. GHM's `opportunity-router.ts` currently exposes only `GET /api/v1/opportunities/:opportunityId`. GHM has requirement read/PUT routes, but **does not provide the list/types marketplace contract** in the inspected router set. Classify opportunity types and marketplace discovery as **Build/extend**. Requirements are a reuse candidate with adapter and authorization checks.

### Required acceptance gates

- Customer A cannot read/update/delete Customer B's project or decide a quote on another customer's project.
- Business A cannot create/update or read Business B's quote.
- Quote accept/reject is mutually exclusive and transitions are atomic/idempotent as specified; no double acceptance.
- Project delete fails unless project is open and has no quotes; creation of project and opportunity is atomic.
- Preserve filtering, count, pagination and normalized quote/business fields.
- Exercise ID mapping across migrated accounts, businesses, projects, opportunities and quotes; no client-supplied customerId/reviewerId is trusted as authority.
- Opportunity discovery covers active type, open/responding status, opens/closes time windows, search, type filter, nested requirements and total count. Requirement replacement preserves validation and authorized opportunity management.

No runtime, schema or production changes. This closes one contract-audit batch, not the whole migration matrix.

## 21. Identity boundary and storage exposure audit

### Identity boundary — hard blocker for no-Supabase runtime

GHM `src/integrations/connect/authorization-binding.ts` rejects any external identity unless `provider === 'supabase'`, resolves that mapping with `allowBootstrap: false`, then verifies active GHM account state and resource permission. This is deliberately fail-closed today, but it makes the existing Connect integration unusable once Supabase identity is removed. The migration must replace the external identity input with a trusted GHM-native user session/JWT (or a server-side BFF that validates the GHM token) and bind it to the same active GHM account context. Do not simply change the provider string or permit bootstrap; preserve non-escalation, active-account checks, membership/resource authorization and replay-safe server assertions where server-to-server calls remain appropriate.

Acceptance gates: no Supabase provider/subject in runtime identity schema; invalid, expired, revoked and wrong-audience GHM tokens rejected; caller cannot select another account by supplying accountId; role and active business membership resolved server-side; no identity auto-provisioning during normal requests; resource-level authorization and audit behavior remain enforced.

### Storage — service exists but no HTTP API is registered

GHM `src/storage/service.ts` currently permits only `business_logo`, with JPEG/PNG/WebP and a 2 MiB cap, public visibility, a 15-minute upload grant, available-state check, authorization hooks and up-to-one-hour download grants. It maintains pending/available/deletion lifecycle metadata. The inspected `src/http/app.ts` imports/registers product routers but no storage router. Therefore storage is not yet a usable Connect browser API. Classify **Extend: register authenticated storage endpoints and contract tests** for the confirmed business-logo journey. Do not add private workspace files, project images or verification documents until their current mounted callers and retention/privacy rules are confirmed; each needs a separate object class/policy rather than reusing public-logo permissions.

Acceptance gates: only authorized business members can upload/complete/delete logo objects; completion verifies provider metadata; expired grants fail; object metadata never lets the browser choose arbitrary provider keys; public logo access does not expose private documents; R2 failures and abandoned pending objects have a defined cleanup path.

### Business profile / ID mapping

Connect's business profile actively combines public directory lookup by slug/ID, owner-authorized fallback for unpublished listings, reviews, hours, capability list, saved-business state and engagement events. GHM has public and managed business read paths, but its numeric business IDs differ from Connect's current UUID assumptions. Establish one explicit migrated-ID/identity mapping contract for account, business, membership, project, opportunity, quote, review and storage resources; never cast or infer equivalence. Owner-preview must remain authorized and must not leak unpublished profile fields to anonymous callers.

No code or production changes. Identity and storage exposure remain prerequisites for a complete no-Supabase cutover.

## 22. Relationships route and role-mapping findings

### Relationships route registration

Connect `src/app/routes.js` registers `ROUTE_IDS.RELATIONSHIPS` as a navigable route requiring authentication, `BUSINESS_READ` permission and active-business context. `ZaidConnectApp.jsx` lazy-loads `RelationshipOutcomeScreen.jsx`, which calls relationship and outcome services. This is **in-scope active functionality**, not a dormant import. GHM lacks matching relationship/outcome resources; classify it as a **Build** gap with lifecycle, verification and business-scope authorization acceptance tests.

### Authentication and role model mismatch

Connect route definitions and signup flow support account roles `customer`, `contractor`, `supplier`, `admin`, plus `business_operator_intent`. GHM's native auth role model is `customer | business | admin`. A role conversion cannot be a blind string map: contractor/supplier users may act as business operators while still needing distinct customer-facing capabilities; Connect also has business memberships and active-business selection. Define a canonical mapping table for each existing account role and intent, plus permission/route tests for customer-only project creation, business-only quoting, admin review, analytics/trust access, and multi-business selection. Preserve the user's account identity and do not infer elevated role from signup metadata alone.

### Auth runtime replacement — explicit active operations

Connect app shell imports `supabase` and `authService`, restores session on startup, subscribes to `supabase.auth.onAuthStateChange`, and signs out through the Supabase client. `AuthScreen.jsx` calls `supabase.auth.signUp` directly and uses `authService.signIn` for login. This confirms the cutover must replace **startup session restore, auth-change subscription, signup, login, logout, refresh/expiry and password recovery**, not merely swap the sign-in form. GHM has native register/login/refresh/logout/password-recovery routes, but their response/user shape, confirmation policy and role/business-identity lifecycle need an adapter contract.

No runtime or production changes were made in this audit.

### 2026-10-14 follow-up — readiness and checkpoint consistency

Re-read the six actual changed paths in GHM PR #135 against the governed current-state index, remaining-work register, historical operation inventory, historical readiness audit, readiness gap register, and this handover. GitHub confirmed PR #135 remains open/unmerged and includes exactly those six documentation files; ZAID Connect PR #36 is separately open/unmerged. The current-state index and readiness gap register now carry explicit reconciliation checkpoints, and the Connect readiness claims continue to distinguish qualified GHM slices from product-wide readiness.

The targeted pass found no basis to change product-readiness gates: the Connect identity adapter remains Supabase-provider-bound; the browser-safe GHM user API/BFF and active journey parity remain unqualified; PayFast sandbox/runtime end-to-end qualification, production enablement, recovery/rollback, and founder-authorized cutover remain open. PayFast must remain distinct from PayStack. Historical inventory/audit counts are not current coverage measurements.

**Remaining audit gate (refreshed 2026-10-14):** this is still not the fresh repository-wide semantic and Markdown-link scan required for certification. Current GitHub tree enumeration confirms 210 tracked Markdown files in GHM (207 under `docs/`) and 47 in ZAID Connect. The latest targeted Connect canonical pass also reviewed the master index, ownership matrix, glossary, product principles, data/integration/security/system architecture, API/integration specifications, current-state audit, and migration handover. Additional source-versus-target and revision-history corrections were made on Connect PR #36 in `PLATFORM_CONSTITUTION.md`, `DOMAIN_MODEL.md`, `INTEGRATION_SPECIFICATION.md`, `REPOSITORY_STRUCTURE.md`, `ARCHITECTURAL_PRINCIPLES.md`, and `PRODUCT_PRINCIPLES.md`. These targeted checks do not prove the complete tracked sets or all links are clean. Historical full-link-scan claims in `GHM_CURRENT_STATE.md` and older registers predate PR #133 and later changes; do not reuse them as current certification. Finish same-branch local Markdown-link validation and semantic/status/authority/SHA/next-step review across the complete tracked sets, reconcile cross-repository claims, then perform the separate read-only local-vs-GitHub comparison. Do not merge until all gates are complete and the founder explicitly authorizes merge. Local repositories remain untouched.

## 27. Connect review-branch checkpoint — 2026-10-14 22:23 UTC

The active ZAID Connect review branch `construction/reconcile-handover-status-20261014` has continued documentation-only reconciliation after the previously recorded checkpoint. Its current head as verified from PR #36 is `b419a670d3e1b610facb0c115c6ccdb0ef2146df`; PR #36 remains open/unmerged with 31 changed files. Its durable handover was refetched at SHA `44f6fa585fdcc35fb8e236c110246b10fc782360` and now records sections 23–26 for product requirements, provider milestone boundaries, planning/verification metadata, and business-document source/target boundaries.

Latest targeted Connect checks resolved Product Vision to `docs/00_Foundation/PRODUCT_VISION.md` (SHA `f916f90ff3d17c2cb951dd2dbbfc26a2955d58fc`), reviewed Product Principles and Documentation Ownership Matrix, and refetched this GHM handover plus `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`. They confirm the intended source-versus-target distinction and that full Connect product parity remains unqualified. This is a bounded comparison only: full same-branch link validation, complete semantic/status/owner/history review, and claim-by-claim cross-repository reconciliation remain open.

Do not treat any historical targeted checks, branch inventory counts, or current bounded review as a complete documentation reconciliation certificate. Both PRs remain unmerged; no local repository sync, runtime/production mutation, provider activation, migration, or cutover occurred.

## 28. Connect architecture/interface audit checkpoint — 2026-10-14 22:30 UTC

The Connect review branch continued bounded documentation-only reconciliation. Current Connect architecture/interface checks reviewed the canonical architecture set and made two verified clarifications:
- `docs/04_Interfaces/INTEGRATION_SPECIFICATION.md`, blob SHA `24c3a49e618c9b118b0abc3ba5d6d409cad0d0b7`: Supabase Authentication verification is explicitly scoped to the inspected source baseline and disclaimed as GHM qualification.
- `docs/01_Architecture/SYSTEM_ARCHITECTURE.md`, blob SHA `5455f4100c16ce8b67fa6de18d7afee2f2a233e5`: the Supabase topology is explicitly titled and described as existing source implementation.

Other sampled canonical architecture/interface documents already distinguish source evidence from GHM Internal Runtime target intent and keep the browser-safe API, operation parity, target authorization and cutover gates open. This is a bounded check only; it does not certify the full Connect corpus or the GHM implementation.

Full same-branch Markdown link validation, full metadata/history/authority review, and cross-repository claim-by-claim reconciliation remain outstanding. Keep PR #36 and PR #135 unmerged; no local sync, production/runtime mutation, provider activation, migration, or cutover occurred.

## 29. Connect engineering/launch boundary checkpoint — 2026-10-14 22:33 UTC

Current Connect review-branch tree inspection confirms 47 tracked Markdown files (all under `docs/`) and canonical glossary path `docs/00_Foundation/PRODUCT_GLOSSARY.md`. A bounded link sample was run on six Foundation/Engineering/Implementation index-standard files; this is not full-corpus link certification.

Two further source/target ambiguities were corrected and verified:
- Connect `EXTRACTION_MAP.md`, SHA `a7859e518d88a9bfeac53c0eda8bc0936b438d20`: historical extraction record; Supabase authorization statements are now explicitly scoped to the source implementation, with GHM target controls separately unqualified.
- Connect `SOUTH_AFRICA_LAUNCH_RUNBOOK.md`, SHA `082f1c36ccf983a6782edfcde0ef3c075f91246d`: Supabase CLI/database/RLS instructions are conditional historical source procedures, not authorization for production mutation during the active migration audit; commercial launch remains unauthorized.

The founder authorization instrument was also checked: `EVENT_AUTHORIZED=FALSE` and `EVENT_EXECUTED=FALSE`; the narrow directory-listing event authorization is separate from commercial launch and GHM cutover. Current-state audit already identifies the September 2 snapshot as historical. Full link, metadata/history/authority, and cross-repository claim checks remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 30. Connect engineering verification/workflow checkpoint — 2026-10-14 22:35 UTC

Connect's current review branch added and verified migration-state boundaries in:
- `docs/03_Engineering/TESTING_STRATEGY.md`, SHA `9540a5ae896da6e65eae3855b928b6fed2cd318c`, version 2.1, dated 2026-10-14.
- `docs/03_Engineering/DEVELOPMENT_WORKFLOW.md`, SHA `0200248be14b8c617abc6cd6662ac98d3cdbdc49`, version 2.1, dated 2026-10-14.

The first explicitly distinguishes source Supabase tests from GHM operation-level qualification and full product parity. The second distinguishes generic/source Supabase workflow from the governed migration execution plan. Product Glossary, Deployment Standard and Coding Standards were also checked and already distinguish source implementation from target qualification. The 47-file Connect Markdown corpus remains only partially audited: full semantic/owner/history checks, full link validation and claim-by-claim cross-repo comparison are outstanding. No local sync, production mutation, provider activation, migration, cutover or merge occurred.

## 31. Connect release/planning audit checkpoint — 2026-10-14 22:37 UTC

Connect's planning review found `docs/05_Planning/RELEASE_PLAN.md` was still version 1.0 dated 2026-07-15. Its “Approved” status could be mistaken for a specific release authorization. It is now version 1.1 dated 2026-10-14, with an explicit statement that approval applies to the release-process standard only and that provider activation, release, and cutover require separate current evidence and gates. Verified SHA `e8b4b31ac9a8e4b3610f4a0e2e0f7f870ead23d2`.

`MVP_SCOPE.md` and `PRODUCT_ROADMAP.md` already distinguish intended scope/roadmap from current implementation. `IMPLEMENTATION_BACKLOG.md` remains explicitly reconciliation-in-progress and identifies its September checkpoint as historical; M52 TEST technical approval remains distinct from production LIVE verification and commercial launch authorization. `MILESTONE_52_PAYMENT_PROVIDER_INTEGRATION.md` already scopes Paystack TEST evidence to the Supabase-backed source implementation, not GHM parity. PayFast and Paystack remain distinct tracks.

This is a bounded five-document pass, not full corpus reconciliation. Full link, semantic/history/ownership, and cross-repository claim checks remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 32. Connect implementation documentation audit checkpoint — 2026-10-14 22:39 UTC

Connect's implementation-document review confirmed that `IMPLEMENTATION_BACKLOG.md` and `VERIFICATION_LOG.md` remain explicitly reconciliation-in-progress, preserve dated Supabase source evidence, and defer GHM readiness to GHM operation-level records. `CURRENT_STATE_AUDIT.md` remains explicitly a September 2 snapshot and says the source application has not been cut over. The launch runbook remains Prelaunch / Not granted.

A misleading continuity criterion in `docs/06_Implementation/README.md` was corrected: service continuity is now explicitly an acceptance objective, not proof of present hosted availability. Its current migration-state boundary and handover reference were refetched and verified at SHA `0e112c0a835cc461849217ff29ae0b6b43c22666`.

This is a bounded implementation-section pass only. Complete Connect link validation, remaining semantic/metadata/history/owner checks, and claim-by-claim comparison against GHM readiness/operation evidence remain outstanding. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 33. Connect security/data/integration checkpoint — 2026-10-14 22:42 UTC

The Connect review branch's `SECURITY_ARCHITECTURE.md`, `DATA_ARCHITECTURE.md`, `INTEGRATION_ARCHITECTURE.md`, `API_SPECIFICATION.md`, and `INTEGRATION_SPECIFICATION.md` were reviewed. The documents distinguish GHM Internal Runtime target intent from historical Supabase source evidence, keep the signed service interface server-to-server only, leave browser-safe transport and operation parity as open gates, and enumerate current caller-to-contract gaps without presuming Connect and GHM IDs are equivalent.

The Security Architecture's Directory Business Public Read Model heading/status was corrected to explicitly scope Workstream 4A and its grant/RLS description to the inspected Supabase source production baseline, rather than imply current GHM qualification. Verified SHA `7481d20644db34fbb8a0523707dffb4960029e8c`.

This is a bounded five-document review, not complete corpus reconciliation. Full link validation, remaining metadata/history/ownership checks, and cross-repository claim-by-claim comparison remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 34. Connect architecture/business-rule checkpoint — 2026-10-14 22:44 UTC

The Connect branch's `SYSTEM_ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `API_SPECIFICATION.md`, `INTEGRATION_SPECIFICATION.md`, and `BUSINESS_RULES.md` were reviewed. Two wording risks were corrected and verified:
- `SYSTEM_ARCHITECTURE.md`, SHA `4ea91b1e16bf364c8072c01e204e5f1238af217c`: opening now distinguishes inspected Supabase source architecture from approved GHM Internal Runtime target architecture, without implying current hosted availability.
- `BUSINESS_RULES.md`, SHA `da959e5ec644717186afb3f38537b8838923d0de`: protected-data authorization now scopes RLS to source implementation and requires separate qualification of equivalent GHM target enforcement.

The Domain Model and API/Integration Specifications already separate source evidence from target contracts, require explicit identity/resource mappings, and keep browser-safe transport and operation-level parity as gates. Full-corpus link, metadata/history/owner and cross-repository claim checks remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 35. Connect business requirements/journey-history checkpoint — 2026-10-14 22:46 UTC

The Connect review branch's `PRODUCT_REQUIREMENTS.md` revision history had 2.9 before 2.8; it is now ordered, current version 2.13 is recorded, and the missing 2.10/2.11 history entries are noted as a gap without inventing their content. Verified SHA `a30d895053d2318e8851cfc44ea84e8415fd821d`.

`USER_JOURNEYS.md` revision rows 2.2/2.3 are now chronological and current version 2.4 / 2026-10-14 is recorded. Verified SHA `a8ced0adc3b2b60a5280557675d563104beb651b`. Product Vision and Product Principles are current-dated and already distinguish product intent/principles from implementation state.

Full corpus link validation, remaining semantic/history/owner checks, and cross-repository evidence reconciliation remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 36. Connect personas/business-rule checkpoint — 2026-10-14 22:48 UTC

The Connect branch review found `USER_PERSONAS.md` stale at version 2.1 / 2026-07-27. It is now version 2.2 / 2026-10-14, with an explicit statement that personas and role distinctions do not prove current availability or GHM target enforcement. Verified SHA `4c5cd3fd8327cfc11282cc4434b1b2159b4964b7`.

`BUSINESS_RULES.md` metadata was already version 2.3 / 2026-10-14 but its revision table stopped at 2.2; the missing 2.3 history entry has been added and verified at SHA `99eabca443559d8f350e84ce823f569788894bfd`. Engineering Standards and Documentation Standard already distinguish source state from target state and preserve migration/readiness authority. `PRODUCT_STRATEGY.md` was not found at the expected path (404), and no replacement was inferred.

Full link validation, complete metadata/history/owner checks, and cross-repository evidence comparison remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 37. Connect engineering standards checkpoint — 2026-10-14 22:50 UTC

Reviewed Connect's `DEPLOYMENT_STANDARD.md`, `TESTING_STRATEGY.md`, `DEVELOPMENT_WORKFLOW.md`, `CODING_STANDARDS.md`, and canonical `docs/00_Foundation/REPOSITORY_STRUCTURE.md`. All are version 2.1 / 2026-10-14 and consistently distinguish legacy Supabase source procedures from GHM target qualification, require task-specific/founder gates, and prohibit interpreting generic standards or component tests as parity/cutover proof. Deployment documentation acknowledges CI/CD/staging/hosting workflow gaps. The repository-structure file exists under Foundation; the Engineering path queried during discovery was simply incorrect.

Full-corpus link validation, remaining semantic/metadata/history/ownership checks, and cross-repository evidence comparison remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 38. Connect planning and provider milestone checkpoint — 2026-10-14 22:52 UTC

Connect's generic `BACKLOG.md` and `MILESTONES.md` were stale at version 1.0 / 2026-07-15. Both now carry version 1.1 / 2026-10-14 and an explicit statement that their generic planning examples do not establish current implementation status, capability absence/completion, production readiness, or cutover authority. Verified SHAs: `BACKLOG.md` `0a9557d3c25d91cf575b74ed753573cacab43ba4`; `MILESTONES.md` `31424c71d09b9bfceab8471b5c953c70f1153e4c`.

The current Release Plan correctly limits its Approved label to the process standard. M52 is source-system Paystack TEST evidence and technical approval only; LIVE verification and commercial launch remain unauthorized. M38 remains provider-blocked/not approved, with runtime provider verification unexecuted. These are not GHM target qualification.

Full link validation, remaining semantic/metadata/history/ownership checks, and cross-repository evidence reconciliation remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 39. Connect launch authority checkpoint — 2026-10-15 00:54 SAST

The Connect operational evidence review confirmed that `CURRENT_STATE_AUDIT.md`, `IMPLEMENTATION_BACKLOG.md`, and `VERIFICATION_LOG.md` preserve dated Supabase-source evidence without certifying current hosted availability or GHM target parity; the South Africa launch runbook remains prelaunch/NO-GO and scopes source-system operations.

A material authority risk was corrected in `DIRECTORY_LAUNCH_1_BOUNDED_FOUNDER_AUTHORIZATION_INSTRUMENT.md`: the Supabase production project and Table/SQL Editor had been presented as the approved control plane without a current GHM migration boundary. The instrument now explicitly labels these as historical source-system provenance, not a current execution target, and still records `EVENT_AUTHORIZED=FALSE` / `EVENT_EXECUTED=FALSE`. Verified SHA `77fe483288a651e61c5e6fd4d9cd7ded8f92e8e0`.

Full-corpus link validation, remaining semantic/history/ownership checks, and cross-repository readiness/operation evidence comparison remain open. No local sync, listing publication, production mutation, provider activation, migration, cutover, or merge occurred.

## 40. Connect security/integration architecture checkpoint — 2026-10-15 00:56 SAST

Reviewed Connect `SECURITY_ARCHITECTURE.md` (SHA `7481d20644db34fbb8a0523707dffb4960029e8c`) and `INTEGRATION_ARCHITECTURE.md` (SHA `be85fec89c2d74873ac3c176797282a76342a39f`). Both clearly distinguish inspected Supabase source controls from GHM target security, require target operation contracts and verification, prohibit treating documentation as implementation, and preserve the no-Supabase target and payment/AI fail-closed gates. The integration overlay explicitly lists operation parity blockers and notes the signed GHM Connect endpoint is server-to-server only.

Likely security/privacy/incident/risk filenames under Engineering/Implementation were probed but returned 404; branch-tree matching found no alternate named files beyond the two architecture docs and the directory authorization instrument. No missing path was replaced by guesswork.

Full link validation, full semantic/metadata/ownership review, and cross-repository evidence comparison remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 41. Connect interface/domain contract checkpoint — 2026-10-15 00:58 SAST

Reviewed Connect's API Specification (SHA `7e36a38b235028144496e54c48fdcc6214d7dc1c`), Integration Specification (SHA `24c3a49e618c9b118b0abc3ba5d6d409cad0d0b7`), and Domain Model (SHA `f29f21fe8a29ea3adde96d440367ca037fbfe312`). These documents distinguish source Supabase evidence from the GHM target, enumerate caller/resource parity gaps, require explicit identity mapping, and preserve provider/launch gates. Event Specification was stale at version 2.0 / 2026-07-20; it is now version 2.1 / 2026-10-15 with a clear GHM migration boundary and no claim of a canonical event platform. Verified SHA `6bcb2a7d28440982f52a8b9a6a4177e52689be69`.

Full-corpus link validation, remaining semantic/metadata/ownership checks, and cross-repository readiness/operation evidence comparison remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 42. Connect foundation/data/implementation-index checkpoint — 2026-10-15 01:02 SAST

Reviewed Connect's Constitution, Glossary, Vision, Architectural Principles, Data Architecture, Product Requirements, User Journeys, MVP Scope, and Product Roadmap; all explicitly distinguish approved intent/source implementation from GHM target parity and do not grant cutover authority. `EXTRACTION_MAP.md` had metadata 2.3 but revision history ended at 2.2; missing 2.3 row added and verified SHA `29229a6f0aa132a17574e5b435cf9ac002804172`. `docs/06_Implementation/README.md` was version 1.0 with no revision history/updated date, and a success criterion was phrased as an imperative. Updated to version 1.1 / 2026-10-15, clarified hosted availability and cutover authority, made the criterion normative, and added history. Verified SHA `6377af74cd40421c445dbc0094d9ea84164538fb`.

Full-corpus link validation, remaining metadata/history/owner consistency checks, and claim-by-claim cross-repository evidence reconciliation remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 43. Connect ownership/workflow/testing/release checkpoint — 2026-10-15 01:05 SAST

Reviewed Connect product principles, repository structure, business rules, personas, coding standards, development workflow, testing strategy, deployment standard, documentation standard, master index, ownership matrix, engineering standards, and release plan. The reviewed documents consistently distinguish Supabase source procedures/evidence from the GHM Internal Runtime target, require independent operation-level qualification, and do not grant cutover or provider activation based on documentation approval or source tests. The revision histories for Business Rules (2.3) and User Personas (2.2) were already consistent with their metadata; no content changes were needed. Master Index and Ownership Matrix consistently assign migration resume authority to the Connect handover and GHM capability qualification to the GHM readiness gap register. Release Plan's Approved state is scoped to process only.

Full-corpus link validation, remaining semantic/history/ownership checks, and claim-by-claim cross-repository comparison against GHM readiness and operation evidence remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 44. Connect milestone and provider-boundary checkpoint — 2026-10-15 01:08 SAST

Reviewed Connect `BACKLOG.md`, `MILESTONES.md`, `MILESTONE_38_ENTERPRISE_AI_PROVIDER_INTEGRATION.md`, `MILESTONE_52_PAYMENT_PROVIDER_INTEGRATION.md`, ADR-002 and ADR-003. Planning documents disclaim authority over current implementation or cutover. M38 remains provider-blocked/not-approved; no paid provider access or activation was attempted. M52's Paystack TEST/LIVE track did not explicitly distinguish GHM's separate PayFast/ITN work, so the milestone now states that provider evidence/status cannot be transferred between Paystack and PayFast and neither independently authorizes launch or GHM cutover. Verified SHA `2ec6f259ca61bf0c901ac604043ecc467a2dea4c`.

Full-corpus link/anchor validation, remaining semantic/history/ownership checks, and cross-repository claim-by-claim comparison against GHM readiness and operation evidence remain open. No local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 45. ADR links and Connect/GHM authority cross-check — 2026-10-15 01:12 SAST

All six Connect ADR Markdown files were checked against the Connect review-branch tree after normalizing relative `..` segments; no missing local Markdown targets were found in that ADR set. A first probe without path normalization yielded false positives and was discarded.

Read-only comparison of GHM current-state index (SHA `31141fba21b717fcbb4494f0ffa3e8556b5498bf`), historical Connect backend operation inventory (SHA `c93e016b190330eb2b71c545bce06390701e2c08`), governed production readiness gap register, and construction qualification sequence (SHA `cc1933dd4121fbd3f8ac71023c078e1ce1a84d9c`) confirms the authority split: Connect target removes active Supabase dependencies; Supabase-bound Connect identity and browser-safe user transport remain blockers; narrow GHM construction qualification is not product parity; PayFast does not imply Paystack; and shadow qualification, rollback/recovery, provider gates and cutover remain open. Historical inventory/audit counts do not represent current capability measurement. GHM's current-state index explicitly says whole-repository semantic reconciliation is not yet certified.

This is a bounded cross-repository check, not a claim-by-claim comparison of the full Connect corpus. Full link/anchor/external URL checks and remaining semantic/metadata/history/ownership review remain open. No local sync, implementation, production mutation, provider activation, migration, cutover, or merge occurred.

## 46. Connect current-state and launch-governance checkpoint — 2026-10-15 20:42 SAST

Reviewed Connect's current-state audit, bounded directory-launch authorization instrument, implementation backlog, South Africa launch runbook, and verification log. The five documents agree that historical Supabase production evidence is dated/source-scoped; current availability and GHM parity are unproven; directory publication is separate from commercial launch; M38 remains provider-blocked/unapproved; M52 TEST technical approval does not establish LIVE verification or launch; and the runbook remains prelaunch/NO-GO pending all gates and explicit Founder decision. Older backlog/verification checkpoints are not full October migration certification.

The five-file inline Markdown-link check found no inline Markdown link targets and therefore no missing inline local targets in this batch. Inline-code repository paths were excluded from link parsing. Reference-style links, anchors, external URLs and the full corpus remain unchecked.

No local sync, implementation, production mutation, provider activation, migration, cutover, or merge occurred. Full-corpus validation and claim-by-claim cross-repository reconciliation remain open.

## 47. Connect full-corpus local Markdown target sweep — 2026-10-15 21:10 SAST

Enumerated the current Connect review-branch tree and confirmed 47 tracked Markdown files. All 47 were fetched and checked in bounded batches against that same tree. The checker normalized relative `.` / `..` segments and checked inline local Markdown destinations, explicit `[label][reference]` forms for missing definitions, and explicit inline heading fragments. No missing local Markdown targets, unresolved explicit second-bracket reference labels, or missing heading anchors were reported within this scope.

This is not complete link or documentation certification: external URL reachability, reference-definition destinations and shortcut references, every GitHub slug edge case, all semantic/metadata/history/ownership checks, and claim-by-claim cross-repository reconciliation remain separate gates. It does not establish GHM runtime behavior or authorize production actions. No local sync, implementation, production mutation, provider activation, migration, cutover, or merge occurred.

## 48. Connect semantic and release-governance checkpoint — 2026-10-15 21:55 SAST

A bounded semantic/status review covered Connect's foundation, architecture, business requirements, engineering/interface standards, planning, launch runbook, current-state audit, extraction record, implementation backlog, verification log and provider milestones. The reviewed docs consistently distinguish migration handover execution-state authority from architecture/interface ownership and GHM capability qualification; describe Supabase as historical/source implementation rather than the approved target; and do not claim GHM parity or hosted availability from old evidence.

Browser-safe authenticated transport and GHM-native identity/session binding remain gated; the signed service contract is server-to-server only. M52 is Paystack TEST technical approval only, with LIVE verification and commercial launch outstanding; PayFast/ITN is separate. M38 remains provider-blocked/unapproved. Generic planning documents do not prove current implementation or authorize release. The launch runbook remains prelaunch/unauthorized, and the Directory Launch 1 instrument is not current publication authorization.

No material cross-document contradiction requiring another content edit was found within this inspected batch. This is not a certification of all 47 Connect docs against every GHM operation-level evidence record. Claim-by-claim cross-repository comparison, remaining metadata/history/ownership checks and external URL review remain open. No local sync, implementation, production mutation, provider activation, migration, cutover, or merge occurred.

## 49. Connect revision-history and branch-state checkpoint — 2026-10-15 21:58 SAST

Re-fetched and checked Connect `PRODUCT_REQUIREMENTS.md` (SHA `a30d895053d2318e8851cfc44ea84e8415fd821d`), `API_SPECIFICATION.md` (SHA `7e36a38b235028144496e54c48fdcc6214d7dc1c`), `INTEGRATION_SPECIFICATION.md` (SHA `24c3a49e618c9b118b0abc3ba5d6d409cad0d0b7`), `MILESTONE_52_PAYMENT_PROVIDER_INTEGRATION.md` (SHA `2ec6f259ca61bf0c901ac604043ecc467a2dea4c`), and `SOUTH_AFRICA_LAUNCH_RUNBOOK.md` (SHA `082f1c36ccf983a6782edfcde0ef3c075f91246d`). The three versioned documents have latest revision rows aligned with current versions and their migration-boundary changes. M52 remains TEST technical approval only, LIVE verification outstanding and commercial launch unauthorized; the runbook remains prelaunch/not authorized; browser-safe target transport remains gated.

Current PR snapshots: Connect #36 open/unmerged at head `2d8476e518ec5deefe3f3ba8f383eb3103354712` (41 changed files); GHM #135 open/unmerged at head `7316e80fb00c188df50db0e493dea0fa1b4e5621` (6 changed files). Branch-to-main comparison shows 126 commits ahead for Connect and 65 for GHM, zero behind; this measures branch history, not documentation completeness. No merge was performed.

Claim-by-claim comparison against GHM operation-level qualification evidence, remaining metadata/history/ownership checks, and external URL review remain incomplete. No local sync, implementation, production mutation, provider activation, migration, cutover, or merge occurred.

## 50. Legacy Connect identity-contract boundary correction — 2026-10-15 22:02 SAST

### Concrete inconsistency found and corrected

A targeted read of `GHM_CURRENT_STATE.md`, `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`, `PRODUCT_CONSUMER_HTTP_CONTRACT_QUALIFICATION.md`, `CONNECT_SERVICE_HTTP_READ_BOUNDARY_QUALIFICATION.md`, and `CONNECT_GHM_AUTHORIZATION_BINDING_QUALIFICATION.md` found that the current-state/readiness records correctly require the no-Supabase Connect target, while three bounded qualification records still described a Supabase external-identity/provider input in present-tense current-Connect language. The authorization-binding qualification already stated in a later section that its provider-bound slice was not qualified for the target, but that caveat needed to be made prominent at the top-level boundary.

Added explicit migration-state boundary notes to the three qualification records:
- `PRODUCT_CONSUMER_HTTP_CONTRACT_QUALIFICATION.md`
- `CONNECT_SERVICE_HTTP_READ_BOUNDARY_QUALIFICATION.md`
- `CONNECT_GHM_AUTHORIZATION_BINDING_QUALIFICATION.md`

The notes preserve each historical construction qualification and its original evidence while expressly preventing those results from being interpreted as qualification of the GHM-native target. They point to current-state/readiness/handover authority and do not claim target implementation, browser-safe access, session migration, product parity, deployment readiness, or cutover. The three updated files were re-fetched and the new boundary headings verified.

### Remaining gate

Continue the same comparison across all Connect-relevant qualification records, contracts, operation inventory rows and source-to-target mappings. A top-level note reduces ambiguity but does not replace a line-by-line contract matrix or prove the target exists. Full semantic/metadata/history/ownership and external-link review remain open. No local sync, runtime implementation, production mutation, provider activation, migration, cutover or merge occurred.

## 51. Second identity-boundary audit batch — 2026-10-15 22:06 SAST

The next bounded review found two more source-era identity descriptions that could be mistaken for target contract: `CONNECT_TRUSTED_REQUEST_CONTEXT_QUALIFICATION.md` (its user-scoped external identity is explicitly `provider="supabase"`) and `GHM_CONNECT_IDENTITY_BRIDGE_QUALIFICATION.md` (provider-plus-subject mapping examples). Added prominent migration-state boundary notes to both. They retain original bounded qualification evidence and explicitly say it is not target identity/session qualification. Both files were updated successfully; refetch verification is the next checkpoint.

The Connect Business provisioning/linking record remains a distinct external Business UUID → canonical GHM Business mapping slice and explicitly does not authorize product cutover; do not conflate Business external mapping with runtime end-user identity authority. Continue auditing the remaining Connect trust, identity, business provisioning, product adapters, payment, storage and realtime records against the target no-Supabase contract. No runtime changes, local sync, production mutation, provider activation, migration, cutover, or merge occurred.

## 52. Trust, business mapping and operation-inventory target boundary — 2026-10-15 22:12 SAST

The next comparison batch found three more places where provider-bound source-era identity could be misread as target design:
- `GHM_CONNECT_BUSINESS_PROVISIONING_LINKING_CONTRACT.md` contains the legacy Business UUID mapping provider key. Its former sentence that Supabase Auth remains the Connect production session authority was corrected on 2026-10-15 to label it explicitly as historical source-state evidence, not the approved no-Supabase target. This handover bullet is retained as an audit trail of the stale claim and must not be read as saying the sentence remains uncorrected.
- `CONNECT_GHM_SERVICE_TRUST_BOUNDARY_CONTRACT.md` includes a legacy external identity example alongside the separate ES256 service assertion contract.
- `CONNECT_BACKEND_OPERATION_INVENTORY.md` says the existing GHM Connect binding still requires provider `supabase`, which is accurate as a limitation of the bounded adapter but can be read as target direction without its qualifier.

Added explicit target-boundary notes to all three. They preserve source-era mapping and inventory evidence, separate business mapping and integration authentication from end-user session authority, and state that the current provider-bound adapter does not satisfy the approved no-Supabase target. Refetch verification follows this update.

The separate Connect identity adapter qualification already contains a clear 2026-10-13 no-Supabase target reconciliation. The historical identity/source audits, realtime audit, storage audit and readiness register were also checked: their date/scope banners correctly retain source-era evidence while leaving active caller, product exposure, realtime ownership and cutover gates open. Continue auditing remaining product adapter contracts and operation rows; no claim is made that target parity is complete. No local sync, runtime change, production mutation, provider activation, migration, cutover or merge occurred.

## 53. Product capability, storage, realtime and atomic-workflow evidence pass — 2026-10-15 22:18 SAST

### Scope reviewed

Re-fetched and reviewed Connect Customer and Quote capability adapter qualification, resource capability dispatch qualification, public Business/Directory contracts, Enquiry/Opportunity/Opportunity Participant/Project/Project Quote capability adapter evidence, server-runtime and provider-boundary source audits, atomic-workflow source audit, storage/media and realtime source audits, backend operation inventory, backend readiness audit, and production-readiness gap register.

### Findings

- Customer, Quote, Enquiry, Opportunity, Opportunity Participant, Project and Project Quote records describe bounded resource adapters and explicitly exclude auth/session migration, provider migration, production routing or cutover as applicable. These are resource/capability construction proofs, not end-to-end Connect workflow parity.
- Directory v1 contracts preserve the source UUID only as an external identifier, disallow making Supabase the GHM identity authority, and keep search extensions and production cutover separately gated.
- The storage audit correctly reconciles the qualified persistence/R2 provider path while explicitly stating there is no registered Connect storage router and only the `business_logo` object class is qualified. Authenticated product-facing media lifecycle and other media classes remain open.
- The realtime audit says GHM realtime remains unimplemented/unauthorized, and that source subscription evidence does not prove active mounted callers. Ownership decision and active-caller reachability remain open.
- The atomic workflow audit explicitly supersedes old 2026-09-18 payment gap descriptions with later qualified preparation/result and PayFast implementation evidence, while retaining sandbox/runtime end-to-end, complete product parity, provider authorization and cutover gates.
- The provider and server-runtime audits are clearly marked historical/source-only. The gap register warns that its dependency counts are historical and current readiness remains not production-ready.
- The operation inventory separates source-era counts from current overlays; it identifies unresolved caller/contract mapping and does not present its historical rows as current parity measurements.

No further content edit was needed in this batch: the inspected documents already carry the required source/target, qualification-scope, and no-cutover caveats. This was a bounded semantic pass, not proof that every operation has a matching target contract or that all 47 Connect documents are fully reconciled.

### Remaining gates

Continue a caller-by-caller matrix from the Connect migration handover against the GHM current-state index, readiness gaps and per-operation evidence; audit the remaining document history/metadata/ownership; review external URLs; revalidate final PR heads and status. No local sync, runtime implementation, production mutation, provider activation, migration, cutover or merge occurred.


## 54. Active caller-to-contract mapping — first direct-source batch — 2026-10-15 22:25 SAST

### Direct Connect caller evidence

Re-fetched the current ZAID Connect `main` source files and verified these mounted UI/runtime call paths:

| Active caller | Direct source evidence | GHM target classification |
|---|---|---|
| App session lifecycle | `src/app/ZaidConnectApp.jsx` imports `supabase` and `authService`; calls `getSession`, `supabase.auth.onAuthStateChange`, and `signOut`. `src/features/authentication/AuthScreen.jsx` directly calls `supabase.auth.signUp`. | **Blocking Replace/Extend** — the no-Supabase GHM-native session, signup, restore/refresh, logout and recovery contract is not qualified. |
| Relationship/outcome workspace | `src/features/relationships/RelationshipOutcomeScreen.jsx` calls `outcomeService.getForBusiness(businessId)`; its relationship tab is also part of the active screen and service surface. | **Build** — GHM relationship/outcome domain and matching HTTP contract remain absent in the current inventory. Preserve business scoping, lifecycle, verification, visibility, authority and provenance. |
| Guided onboarding | `src/features/onboarding/OnboardingPanel.jsx` imports `onboardingService`, calls `getProgress(journey.id)`, and dispatches per-step actions. | **Build** — no equivalent GHM onboarding resource/HTTP contract is evidenced. Preserve progress, complete/dismiss and business/account scope. |
| Business analytics | `src/features/analytics/AnalyticsScreen.jsx` imports `businessAnalyticsService` and calls `getDashboard(businessId, days)`. | **Build/Extend** — no equivalent dashboard contract is evidenced in the inspected GHM HTTP surface; do not treat generic engagement or read endpoints as dashboard parity. |
| AI support | `src/features/ai/AISupportScreen.jsx` calls `invokeAIProxy`; the existing client transport calls the Supabase Edge Function. | **Replace/Extend, gated** — define a GHM-owned server-side equivalent only after active caller/contract and authorization review; provider stays fail-closed and no paid provider is implied. |
| Quote analysis | `src/features/ai/AIQuoteAnalyzerScreen.jsx` imports the legacy `quoteAnalyzerService`; the screen exists, but this source check did not establish its service method invocation or persisted-object authority. | **Evidence-insufficient pending focused trace** — inspect event handlers and actual runtime reachability before classifying the persistence path or inventing a GHM table. |

### Boundary and result

This batch directly verifies several previously documented gaps from current source, rather than inferring them from the historical operation inventory. It does not establish that every export in `lib_supabase.js` is actively mounted, nor does it prove that a GHM endpoint is absent solely from a resource/service file; route registration, schema, authorization and transaction behavior still require operation-level evidence.

Repository snapshots at this checkpoint: GHM has 210 tracked Markdown files (207 under `docs/`); ZAID Connect has 47 tracked Markdown files. GHM PR #135 is open/unmerged at `686fceeda2f0f2a0c81c745775ed864dbf51412a`; ZAID Connect PR #36 is open/unmerged at `eb1efc946ba5a3bfc6f33bdcd38766e7addb0b60`. Counts and SHAs are checkpoint metadata, not reconciliation proof.

### Next batch

Continue active caller mapping for profile/business editor and provisioning, directory/filtering, capability evidence and founder review, leads/enquiries, opportunity/project/quote atomic workflows, media/storage, notifications/realtime, support/reviews, and commercial payment. For each operation, capture source caller, current GHM route/method/schema, identity and tenant authorization, response/error mapping, persistence/transaction semantics, evidence status and explicit Reuse/Extend/Build/Legacy-exclude/Evidence-insufficient classification. Then complete external URL review, metadata/history/ownership checks and final same-branch link validation. No runtime implementation, local sync, production mutation, provider activation, migration, cutover or merge occurred.


## 55. Quote-analysis active caller trace — 2026-10-15 22:28 SAST

A focused source trace resolved the prior evidence-insufficient item. In Connect `main`, `src/features/ai/AIQuoteAnalyzerScreen.jsx` runs `quoteAnalyzerService.getUserAnalyses(user.id)` during its effect and calls `quoteAnalyzerService.analyzeQuote(sampleQuoteId, user.id)` from the analysis action. The corresponding service is exported from `src/lib/lib_supabase.js`; the screen is therefore not merely an unused import. The UI's analysis history and quote lookup are active backend-replacement scope.

This does **not** establish that the orphan `quote_analyses` table reference is an authoritative production schema or that the path requires paid/provider AI. Connect's milestone evidence separates this deterministic/local/DB heuristic path from the Milestone 38 provider-AI path, which remains fail-closed/unapproved. Next, trace the exact service implementation and persisted source objects, identify mounted route reachability, and compare each read/write with authoritative GHM HTTP and ownership contracts. Do not invent a table or equate the path with Anthropic/provider activation. No runtime, data, provider, deployment, migration, cutover or merge change occurred.


## 56. Business, directory, capability and enquiry caller map — 2026-10-15 22:32 SAST

### Direct-source confirmations

The current Connect `src/lib/lib_supabase.js` export surface includes active profile/business services, `directoryService.search`, capability listing/draft/evidence operations, `leadService.create/updateStatus`, project/quote services and founder review operations. The Connect integration specification (lines 494–507) explicitly records the remaining target gaps below; GHM's operation inventory and readiness register independently carry these same open boundaries.

| Caller family | Current target finding | Next qualification needed |
|---|---|---|
| Profile/business registration and management | **Extend/Replace** — GHM public/managed Business reads, create/update and identity mapping do not alone prove full Connect profile parity. | GHM-native account/session authority; owner/business mapping; owner-only updates; unpublished-field privacy; avatar/media storage router. |
| Directory search and geography | **Extend** — Connect accepts category, city, supplier and tier filters; target regional/province/city filtering is not evidenced. | Exact filter semantics, paging/sort/count, regional-config authority, deterministic tests and public-field privacy. |
| Founder directory review | **Extend/Build** — Connect submit/queue/review paths are active; the inspected GHM router inventory does not evidence matching review HTTP operations. | Founder authority, idempotency, pending/approved/rejected transitions, audit record and authorization denial tests. |
| Capability catalogue/evidence | **Extend/Build** — Connect has governed capability draft and evidence submit/review calls; matching target HTTP contracts are not established. | Separate catalogue administration from business evidence; verifier permissions, evidence lifecycle (pending/verified/rejected/revoked), versioning and audit. |
| Leads/enquiries | **Extend** — Connect lead create and status update have non-atomic and RPC paths; the inventory classifies the existing GHM enquiry slice as partial. | Caller identity, business/customer access, field mapping, notification ownership, atomic create+opportunity semantics and retry/idempotency tests. |
| Projects/opportunities/quotes | **Reuse + Extend** — GHM project and project-quote routes exist; inventory marks project↔opportunity atomic creation and opportunity discovery as incomplete/partial. | Exact request/response mapping, listing/search/time-window semantics, requirements replacement, quote lifecycle, deletion policy, authorization and transactional guarantees. |

### Evidence boundary

These findings were cross-checked against Connect's source service exports and its integration specification, and against the GHM operation inventory/readiness register on the current review branch. A source service export does not by itself prove every method is mounted in the UI; this pass establishes the legacy contract surface and existing documented GHM gaps, not a completed endpoint-by-endpoint route/test qualification. Historical source table names are not authorization to recreate the schema wholesale. No application code, database, provider, production deployment, migration, cutover or merge changed.

### Next batch

Inspect the exact route registry and contract/test evidence for profile/business, directory, founder review, capability evidence, leads/enquiries, project/opportunity/quote operations; then cover storage/media, notifications/realtime, support/reviews and payment. Finish metadata/history/ownership, external URL and final link checks only after source-level mapping has stabilized. No merge until the complete documentation set is reconciled.


## 57. Storage, realtime, notifications, support/reviews and payment boundary check — 2026-10-15 22:38 SAST

### Direct source and qualification findings

- **Storage/media:** Connect source still calls Supabase Storage for profile avatars, business logos, and verification documents. GHM `src/storage/service.ts` explicitly limits the qualified object class to `business_logo`; the current storage audit says no storage router is registered in `src/http/app.ts`. Provider/R2 qualification is not a browser-usable media API. Authenticated upload/complete/access/delete routes and contract tests for the logo path remain open; avatars, verification docs, workspace files and project images are not covered by the logo qualification.
- **Realtime:** The source audit explicitly says the old notification and leads subscription call sites are not proven mounted in a launch-active route. Do not claim they are active or build a replacement transport on assumption. Prove current component/hook reachability first; any GHM realtime transport still requires a separate ownership decision.
- **Notification persistence/API:** GHM has a registered notification HTTP router and notification service. This is not proof of realtime delivery parity or that Connect's active inbox consumer is mounted. Compare list/read/mark-read and producer/tenant authorization semantics separately from subscription transport.
- **Support and reviews:** GHM has registered support-request and review routers, so blanket claims that those domains are wholly absent would be stale. Remaining work is caller-by-caller response/schema, identity/business scope, lifecycle, moderation, and test parity—not automatic rebuild of the domain.
- **Commercial payments:** GHM has bounded PayFast HTTP/resource implementation and prior deterministic local qualification, but that does not certify live/sandbox end-to-end production readiness, provider enablement, subscription parity, or cutover. Connect's payment freeze and provider authorization gates remain authoritative.

### Result

This pass reconciles the latest router/service inventory with the storage/realtime source audits and the payment readiness boundary. No contradiction requiring a new product/architecture decision was resolved by assuming broader parity. No code/runtime implementation, production mutation, provider activation, migration, cutover or merge occurred.

### Next

Inspect the actual `src/http/app.ts` registrations and route-level tests for storage, notifications, support/reviews, payment, business/directory/governance and resource workflows. Finish remaining metadata/history/ownership and external URL checks, then rerun full-corpus internal-link validation on the final branch heads. The overall reconciliation is still open.


## 58. HTTP registration and route-test evidence — 2026-10-15 22:42 SAST

### Direct registration findings from `src/http/app.ts`

The current review-branch app factory directly registers these route families: profile read; public directory search; public and authenticated business read; managed-business list/read; business create/update; business-hours read; project create; and explicit enquiry, opportunity, saved-business, business-capability, support-request, review, project-quote, opportunity-requirements, opportunity-participant, customer, quote, notification, business-category, business-offering, auth, commercial-internal and Connect-service routers.

The same app file contains **no storage/media router registration**. No directory-listing founder review router appears among the explicit registered families; `review-router` is the customer review/moderation domain and must not be conflated with directory listing review. Thus the logo journey's GHM storage service remains inaccessible through an evidenced registered product HTTP router, and directory listing submit/queue/review remains a separate gap unless another registration is found by complete repository search.

### Route-test evidence reviewed

- `review-router.test.ts` checks public list, authenticated customer create/own-read, admin-only pending list/moderation, rejection of server-owned/arbitrary fields, and 401/403/404 behavior.
- `support-request-router.test.ts` checks authentication, customer create scope, admin-only status updates, canonical fields, message operations and invalid IDs/filters.
- `opportunity-router.test.ts` checks authentication, ID validation, visibility projections and error mapping; it does not prove project+opportunity atomic creation.
- `project-quote-router.test.ts` checks customer/business role boundaries, canonical create/update fields and explicit accept/reject operations.
- `notification-router.test.ts` covers notification read routes, including read-all count; it does not prove mounted realtime delivery or full producer semantics.
- `payfast-http-router.test.ts` covers assertion/boundary checks, browser-originated checkout rejection, normalized ITN fields, rejection and unexpected failures; this is route-boundary evidence, not full provider lifecycle qualification.

These are route-level tests using service fixtures; they are evidence for the contracts they exercise, not proof of production deployment, complete caller parity, end-to-end database behavior or cross-resource atomicity. The route inventory is an implementation snapshot of the current PR branch.

### Next

Finish complete-repository search for any indirect storage or directory-review registration, map Connect's exact caller request/response shape against these concrete routes/tests, then complete document metadata/history/ownership, external URL and final internal-link checks. Full documentation reconciliation is not yet certified; no merge or runtime/production mutation occurred.


## 59. Exact directory and enquiry/quote route comparison — 2026-10-15 22:46 SAST

### Confirmed contract mismatch

Connect `src/lib/lib_supabase.js` directory listing filters approved businesses and supports category, substring city, supplier boolean, tier, page/limit, with featured/rating ordering. GHM's `src/http/app.ts` `GET /api/v1/public/businesses` accepts only `q`, `category`, `page`, and `pageSize`; unknown query keys are rejected with `400 invalid_request`. It defaults to page 1/pageSize 20 and caps pageSize at 50. Therefore Connect's legacy `city`, `isSupplier`, and `tier` filter semantics and zero-based page convention cannot be forwarded unchanged; this is a concrete adapter/contract gap, not merely a general concern. Do not silently drop filters or change ordering without product parity tests.

### Existing GHM workflow routes verified

- Enquiry: `POST /api/v1/enquiries`, `GET /api/v1/enquiries/received`, `GET /api/v1/enquiries/received/:enquiryId`, `GET /api/v1/enquiries/:enquiryId`, and `PATCH /api/v1/enquiries/received/:enquiryId/status`. Status transitions can return conflict; access is explicitly guarded.
- Opportunity: `src/http/opportunity-router.ts` currently exposes a scoped `GET` read route, not proof of full create/list/filter parity.
- Project quotes: `GET /api/v1/projects/:projectId/quotes`, `GET /api/v1/businesses/:businessId/project-quotes`, `POST /api/v1/project-quotes`, `PATCH /api/v1/project-quotes/:quoteId`, and explicit accept/reject actions are registered in the router.

These routes are useful reuse candidates, but Connect's lead create/status service and project/quote flows still need exact field, identity, scope, error-envelope, pagination and transaction mapping. The route test suites do not establish atomic creation across enquiry/opportunity/project, nor should a legacy Supabase RPC be treated as proof of the GHM transaction contract.

### Next

Trace the Connect directory caller's actual page conversion and filter UI, then map lead creation and project/quote caller payloads one operation at a time. After caller mapping, perform the metadata/history/ownership and external URL checks, followed by final internal-link validation on the actual PR head trees. This is a verified gap record, not reconciliation completion. No implementation, migration, provider activation, cutover or merge occurred.


## 60. Directory and enquiry/quote caller mapping — 2026-10-15 22:50 SAST

### Directory semantics confirmed from Connect source

The `businessService.list({ category, city, isSupplier, tier, page = 0, limit = 20 })` method selects only the public directory allowlist, filters to approved businesses, orders featured then rating, and applies zero-based inclusive ranges. GHM's public directory route has the narrower `q/category/page/pageSize` contract and rejects unknown keys. This confirms a compatibility adapter must explicitly map zero-based `page` to one-based target `page`, `limit` to `pageSize`, and must implement or explicitly defer city/supplier/tier filtering and featured/rating ordering. Before adapting, inspect the UI's actual use of these filters so required versus dormant options are accurately classified. Never forward `isSupplier`/tier/city and silently ignore the resulting 400.

### Enquiry and quote caller boundaries

GHM enquiry creation validates a positive `businessId` and a strict allowed-field set; received enquiry read/status routes are authenticated and require registered access. Project quote creation validates positive `projectId` and `businessId`, strict quote amount/range fields, and has explicit customer/business read scopes plus empty-body accept/reject actions. GHM opportunity router exposes only `GET /api/v1/opportunities/:opportunityId` in the inspected file. This makes the current target boundary concrete, but does not yet prove Connect caller payload compatibility or a replacement for the legacy combined lead/opportunity RPC.

The Connect service source confirms lead creation takes `(businessId, customerId, leadData)`, while directory list uses the filters above. A caller-specific trace still must establish where each ID is sourced and authenticated, which UI actions are launch-reachable, and the exact lead/quote field mappings. Treat absent path evidence as unresolved rather than inventing a route. No code or data changed.

### Remaining caller mapping

1. Trace directory screen/component path and determine which category/city/supplier/tier/paging controls are actually mounted.
2. Trace the lead/enquiry create UI, legacy RPC payload, status mutations, and project/opportunity/quote UI actions to their exact service methods.
3. Compare each reachable operation against GHM's strict allowlists, identity and business scope, error envelope and transaction behavior.
4. Only then classify as Reuse, Adapt, Extend or Build; keep historical table names out of the target schema unless authoritative evidence requires them.


## 61. Mounted caller-path evidence: directory, founder review, project and opportunity — 2026-10-15 22:54 SAST

### Directory caller is launch-wired in source

Connect `src/features/directory/DirectoryScreen.jsx` uses `useDirectoryFilters` and `useDirectorySearch`; the search hook calls `directoryService.search` with query, category, province, city, optional lat/lng/radius, sort, zero-based page and limit=20. Filters default to rating sort; city/province and geographic radius are real caller inputs, not merely old service parameters. The older `businessService.list` filter signature is not the active screen's direct call. Therefore the earlier category/city/supplier/tier comparison remains valid as a legacy service-contract note, but the active screen's immediate target is `directoryService.search`, whose exact mapping must be compared separately. Do not present the older list contract as the sole live caller contract.

### Founder directory review is also wired in source

`src/features/administration/AdminDirectoryReviewPanel.jsx` calls `directoryListingReviewService.isFounderReviewer()`, lists by status/limit/offset and submits approve/reject/request-information decisions with reasons. This disproves any blanket statement that Connect lacks a founder review UI. It does not prove a matching GHM HTTP router: the inspected GHM app registration list still lacks a clearly matching directory-listing-review router. The mismatch is now specifically **active Connect review UI/service versus no evidenced matching GHM registered route**, pending a full search for indirect registration.

### Project creation has a named atomic legacy contract

`src/features/projects/ProjectRequestScreen.jsx` calls `createProject(user.id, form)`; `projectsService.createProject` calls Supabase RPC `create_project_with_opportunity` with customer ID, title, description, category, province, city, budget range and urgency. The RPC name and call shape establish the intended atomic project+opportunity contract on the legacy side. GHM's separate project create route and opportunity read route do not alone replace that transaction. A GHM atomicity contract or explicit product decision is required before parity can be claimed.

### Opportunity marketplace and requirements

Connect `opportunityService.listMarketplaceOpportunities` queries open/responding opportunities with opens/closes window checks, optional text and type filters, exact count and bounded limit; requirements replacement calls `replace_opportunity_capability_requirements` with version=1. The current GHM opportunity router inspection established a scoped single-opportunity read, while separate requirement/participant routers exist. Exact marketplace discovery semantics and atomic/versioned requirements replacement must be mapped before the routes can be called equivalent.

### Next

Compare Connect `directoryService.search`, `directoryListingReviewService`, `projectsService` and `opportunityService` directly against GHM route/service schemas and tests. Then do document metadata/history/ownership, external URL and internal-link checks against final PR heads. No code, runtime, migration, provider, production or merge change occurred.


## 62. Directory and founder-review contract recheck — 2026-10-15 22:58 SAST

### Active directory route contract

Connect `useDirectorySearch` passes `query`, `category`, `province`, `city`, optional latitude/longitude/radius, `sort`, zero-based page and limit to `directoryService.search`. GHM `GET /api/v1/public/businesses` validates a strict query-key allowlist and currently accepts `q`, `category`, `page`, `pageSize` only. It rejects the active caller's `province`, `city`, coordinates, `radius`, and `sort` parameters; this is a direct incompatibility on the active path, in addition to page-base/limit naming differences. Directory adaptation remains required and must define geo/ranking behavior instead of silently dropping inputs.

### Founder listing-review operation contract

Connect's `directoryListingReviewService` is implemented in `src/lib/lib_supabase.js` and is called by `AdminDirectoryReviewPanel.jsx`. It checks founder reviewer status, calls an RPC for listing by status/limit/offset, and submits approve/reject/request-information decisions with a reason. The UI requires a rejection reason and exposes decisions while a listing is under review. This is active source-level workflow evidence, not proof that every user can reach the panel at runtime. GHM's inspected `src/http/app.ts` still shows no clearly matching listing-review registration. A complete route/repository search and exact decision/status transition contract comparison remain necessary before calling the gap confirmed repository-wide.

### Corrections and next checks

- The earlier `businessService.list` comparison is legacy service-surface evidence, not the active directory screen contract.
- The founder review UI exists; do not describe it as absent from Connect.
- The current evidence establishes active caller inputs and GHM's strict rejection behavior, but not all deployed navigation/reachability or indirect router wiring.

Next inspect the full `directoryService.search` implementation and tests, all GHM registrations/routes matching directory-listing decisions, and status/authorization tests. Then finish metadata/history/ownership, external URL and full-corpus internal-link validation on final PR heads. Reconciliation remains open; no code/runtime/production change or merge occurred.


## 63. Full directory-search and listing-review RPC boundary check — 2026-10-15 23:02 SAST

Connect's complete `directoryService.search` filters approved and active businesses; searches name/description/city; filters category, province, substring city and tier; uses selected sort and zero-based page/limit; requests exact count; omits public registration numbers; and optionally filters/calculates distance after querying when coordinates are supplied. The active hook passes province/city/coordinates/radius/sort. GHM's public route rejects unsupported keys before invoking search, so this is a directly evidenced active-path mismatch. Matching query names alone is insufficient: compare target sort/default order, radius semantics, count and public projection.

Connect's founder listing-review service calls legacy RPCs `is_directory_listing_founder_reviewer`, `submit_business_for_directory_review`, `review_business_directory_listing`, `list_businesses_for_directory_review`, and `get_business_directory_review_presentation`. Review passes business ID, decision, reason and version (default 1); queue listing passes status/limit/offset. These are database RPC contracts, not HTTP routes.

The inspected GHM app registration area registers a generic customer `review-router`, but no clearly matching directory-listing-review route. Repository code searches also did not surface one. Because code search can be incomplete, classify this as **no matching registration evidenced after app-registration and search review**, not proof no dynamic route can exist. Customer review/moderation is not equivalent to founder directory listing review.

Directory adapter work must preserve sort/geospatial/count/projection behavior. Listing review needs an explicit target HTTP contract for founder authorization, queue status/pagination, decision allowlist, required reasons, version/concurrency behavior and audit trail. No runtime/application code or production state changed; no merge. Reconciliation remains open.


## 64. Documentation inventory, ownership metadata and hierarchy check — 2026-10-15 23:08 SAST

### Inventory evidence

The current inspected GHM construction branch tree contains 665 tracked paths, 210 Markdown files total, of which 207 are under `docs/`. No root or nested `CODEOWNERS` file was present in that tree, and no conventional `docs/README.md` or `docs/index.md` was found. The repository does, however, define a documentation hierarchy in `docs/DOCUMENTATION_RECONCILIATION_2026-10-05.md`: `docs/GHM_CURRENT_STATE.md` is the current-state index; `docs/architecture/` is living architecture; `docs/evidence/` is qualification evidence; dated handovers/source audits/decision records are historical provenance.

### Interpretation

Absence of CODEOWNERS is an ownership-policy gap only if repository policy requires GitHub CODEOWNERS; it does not establish that no named owners exist inside individual governance/contract records. Absence of a conventional docs index is not itself a broken-link finding because the reconciliation record already names the hierarchy. Historical handovers should remain historical, while living records must be checked against mainline implementation/test/evidence and not rewritten into current-state fiction.

### Scope still open

This was a tree-level metadata/hierarchy check, not a complete per-document owner/date/status audit, URL liveness crawl, or internal-link validation. The GitHub code-search queries for generic ownership/history/link terms returned no results and are not considered proof of absence. Continue with actual changed-file inventories, explicit link-target resolution across the complete docs corpus, and external URL checks where a live request is possible. Reconciliation remains open; no implementation, migration, production change or merge occurred.


## 65. PR scope and targeted canonical-document link/authority recheck — 2026-10-15

- Historical checkpoint, 2026-10-15: refetched GHM PR #135 and ZAID Connect PR #36 metadata and full changed-file patches. At that checkpoint PR #135 had 13 GHM documentation files and PR #36 had 41 Connect documentation files. Follow-up documentation additions expanded the live changed-file sets; as reverified on 2026-10-16, PR #135 has 14 files and PR #36 has 47. Do not use the historical counts as current metadata. Both PRs remain open/unmerged. Their descriptions now avoid duplicated fixed counts, distinguish source-era Supabase evidence from the approved GHM Internal Runtime target, and retain the no-merge gate.
- Refetched Connect's master index, documentation ownership matrix, integration specification, integration architecture and implementation README from the current PR branch. The checked Markdown links resolve against that branch tree. The reviewed authority wording consistently assigns the migration handover to execution/resume state, the integration specification/architecture to interface and target design, and the GHM gap register to GHM qualification. The Supabase inventory remains clearly scoped to the inspected source baseline; no statement in this sample certifies present hosted availability or target parity.
- The same review reconfirmed the provider-bound GHM identity adapter is a blocker, not qualification of the no-Supabase target. Existing source implementation and historical qualification must not be interpreted as active target authorization.
- **Scope limit:** this was a targeted canonical-document review, not a complete internal-link/anchor crawl, external URL liveness check, per-document owner/date/history audit, or full semantic scan of all 210 GHM and 47 Connect Markdown files. Path-like strings in code formatting were not counted as links. Repository-wide reconciliation remains open until those complete same-branch checks and cross-repository claim reconciliation are finished.
- No application code, runtime, database, migration, provider, production state, local checkout, cutover, or merge changed. Do not merge either PR until all GHM docs are reconciled and the founder explicitly authorizes merge.


## 66. Actionable missing-capability backlog preserved — 2026-10-15

Founder reminder acknowledged: documentation reconciliation must leave a usable implementation plan for what GHM lacks, not just corrected prose. The governed gap register now includes an action-oriented cross-check table covering each gap, closure evidence, and qualified work that must not be reopened. The same batch corrected the old Business-provisioning contract sentence that incorrectly appeared to designate Supabase Auth as the future Connect session authority; it now explicitly labels that statement as historical source-state evidence.

Known open workstreams recorded in the register include:
- GHM-native Connect authentication/session lifecycle and a browser-safe user transport (the signed Connect service endpoint remains server-to-server).
- Directory/filter/geography/profile parity beyond the qualified narrow Directory v1; founder review and capability-evidence workflows.
- Membership/ownership migration; project-plus-opportunity and other source-proven atomic workflows; opportunity marketplace discovery.
- Onboarding, analytics and relationships/outcomes only where active callers are evidenced.
- Storage/R2 object authorization and product/HTTP exposure, private-document policy and recovery; realtime delivery ownership where live subscribers are proven.
- Quote analysis/history migration and removal of Supabase Edge transport while provider gating stays fail-closed.
- PayFast real sandbox/runtime end-to-end qualification and broader commercial parity; QuoteFlow's separate integrated recovery/session/provisioning/data-transition and rollback gates.
- Product-specific end-to-end acceptance, operational visibility, failure recovery, reconciliation and rollback before any cutover.

These are existing evidence-backed gaps and required qualification outcomes, not blanket authorization to construct every row. The post-audit execution plan must turn still-open rows into sequenced work items with source caller, authoritative contract, dependencies, acceptance tests, evidence, and founder decision. Preserve already-qualified foundations as closed; distinguish "not evidenced" from "does not exist"; exclude dormant/legacy paths unless mounted-call evidence justifies them.

**Verification:** the new backlog section and the historical-source-state correction were refetched successfully from this branch. Full-corpus documentation reconciliation remains open; no implementation, migration, deployment, provider activation, production change, local checkout, cutover, or merge was performed.


## 67. Authentication contract stale-verifier claim corrected — 2026-10-15

During the Gate 2A–3B authentication document batch, `GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md` contained a current-sounding table saying the verifier did not check `aud`, although active `main` source defines `ACCESS_JWT_AUD`, `ghm-bearer.ts` verifies access tokens, and `ghm-bearer.test.ts` explicitly rejects a wrong audience. The table is now labeled as Gate 2A historical baseline evidence; a current-source note points to implemented audience enforcement. Documentation only; no verifier/config/runtime code changed.

The broader authentication-contract batch is being checked against current mainline evidence, not old Gate 2A–2F or Gate 3A snapshots. Historical decision text is retained, but present-implementation claims must be scoped as historical or traced to current evidence. Preserve the real open gates: product-facing auth transport/client integration, Connect/QuoteFlow identity/session migration, recovery delivery enablement, public product exposure, and cutover are not proven by GHM auth-foundation qualification.

**Verification:** the stale current-sounding `Does not check aud` row was removed from the active handover branch document and replaced with explicit historical-baseline language. Full authentication-family semantic review remains in progress.


## 68. Authentication-family link and current-claim batch — 2026-10-15

The 10-document `GHM_AUTHENTICATION_*` family was checked in small batches against current `main` source and same-branch path inventory. Markdown relative-link validation covered 62 relative links across these 10 documents; all resolved to tracked paths in the inspected tree, with no missing relative targets in this family. This result does not yet cover reference anchors, external URLs, non-Markdown link syntax, or the full GHM corpus.

Current-state checks confirmed the old Gate 1/2A–2F/3A statements are marked as historical or superseded and point readers to later qualification evidence. The Gate 2E API contract also correctly keeps product-client migration, public/product exposure, production email delivery, operational recovery/backup, and production cutover separately gated. **JWT distinction (reaffirmed 2026-10-15):** Connect's existing Supabase-issued JWT/session is legacy and must not be accepted directly as a GHM credential. The currently approved GHM target contract separately specifies GHM-issued ES256 access JWTs; do not conflate that target token with the legacy Supabase JWT. Any proposal to replace GHM-issued JWTs as well would conflict with the current authentication issuance decision and needs an explicit architecture/founder decision before changing contracts. Current source verification in `src/auth/foundation/access-jwt.ts` confirms ES256, issuer `ghm-auth`, audience `ghm-api`, 60-second clock tolerance and expiration validation; `src/auth/ghm-bearer.ts` checks account state and rejects disabled/missing identities. The `iat` qualification note concerns **GHM-issued access JWTs only**, not Supabase tokens: the verifier does not explicitly require `iat` or reject future `iat`; `nbf` remains unselected. Do not silently mark either claim closed without a separate decision and tests.

This batch found no reason to reopen the already-qualified bounded auth foundation. The remaining implementation plan must keep product integration/session migration and the explicitly open verifier/operational gates distinct. No runtime/source code was changed. The broader docs audit remains open.


## 69. GHM architecture/backlog document batch — 2026-10-15

A further 30 documents in the GHM `docs/` tree were inspected in small batches, including Business provisioning/linking, identity adapter/bridge, public directory, readiness gap register, error semantics/versioning, legacy-auth reconciliation, production replacement, product-facing transport, and storage boundaries. Markdown relative-link checks in this batch found no missing tracked file targets among links detected; many inspected documents had no inline relative Markdown links. This is path-target validation only, not anchor validation, external URL verification, or full-corpus completion.

**Actionable GHM gaps retained in the governed readiness register (not to be lost during reconciliation):**
- Product-facing browser-safe GHM user/session transport and Connect/QuoteFlow adapter/session migration; eliminate the Supabase-bound identity input without weakening active-account, membership/ownership, resource authorization or replay protection.
- Per-operation Connect parity, including directory province/city/geo/radius/sort behavior, founder directory-review queue/decision RPC semantics, and atomic project/opportunity workflows; do not treat the narrow qualified Directory v1 or separate routes as full parity.
- End-to-end PayFast sandbox/runtime product qualification and provider-result confirmation; local boundary tests alone do not prove end-to-end readiness. Keep PayStack status separate.
- Storage provider/service authorization, HTTP/product exposure, recovery and reconciliation; metadata persistence qualification is not full product storage readiness.
- Remaining domain/resource coverage, platform-wide semantic error/versioning contract, production deployment qualification, and explicit no-Supabase end-to-end cutover evidence.
- Authentication qualification items must refer to **GHM-issued** access tokens only where appropriate; legacy Supabase JWTs remain rejected directly by GHM. Product migration is still distinct from GHM auth-foundation qualification.

The reviewed documents mostly preserve the intended historical-versus-current distinctions; no new contradiction was confirmed in this batch that justified changing the governed contracts. Keep every gap tied to a source caller, target contract, dependency, acceptance tests, and qualification evidence before implementation is marked closed. No runtime/source changes or merges were performed; PR #135 and PR #36 remain subject to the all-documents reconciliation gate.


## 70. Storage, opportunity, project and QuoteFlow boundary batch — 2026-10-15

A further 30 GHM architecture documents were checked in small batches, covering storage qualification/provider reconciliation, historical migration-checksum provenance, Issue #1 production foundation, notification operations, opportunity core/requirements/participation, Postgres authority/role separation, product backend inventory/evidence, project/quote contracts, and QuoteFlow migration boundaries. Detected Markdown relative links in these batches resolved to tracked paths; no missing relative targets were found. Most documents have no inline relative Markdown links. This does not yet validate heading anchors, reference-style links, external URLs, or non-Markdown link forms.

**Current-state reconciliation:** many reviewed contracts correctly scope statements such as “Connect and QuoteFlow remain on Supabase” to their original construction authorization and explicitly say no production migration/cutover was authorized by that contract. These are not permission to keep Supabase as the target. The current no-Supabase target and readiness authority remain `GHM_CURRENT_STATE.md`, the current governed readiness/remaining-work registers, and the product-specific migration handovers. QuoteFlow's existing Supabase Auth, organization RPC and environment configuration are migration input only; Supabase UUIDs/JWTs/organization UUIDs must not become permanent GHM runtime identity or authorization keys. Keep `provider=supabase` source mappings only as historical provenance where the approved migration contract requires them.

**Additional backlog checks:**
- Opportunity Core/requirements/participation and Project Quote resource foundations are individually qualified; they do not close Connect's list/discovery filters, response normalization, project/quote marketplace flows, atomic project-plus-opportunity creation, or adapter/product HTTP parity.
- Notification persistence does not prove notification HTTP workflows, active realtime/push consumers, or delivery transport; confirm mounted caller reachability before building those features.
- QuoteFlow still needs the full GHM-native auth/recovery/re-enrollment ceremony, organization-to-Business plus owner-membership provisioning, deterministic local AsyncStorage scope transition, and recoverable rollback before cutover.
- Production storage/provider qualification and deployment/operational acceptance remain separate from metadata persistence or an isolated resource qualification.
- Migration checksum provenance exceptions remain historical integrity evidence; do not rewrite applied migration files or ledger rows to make hashes look uniform.

No implementation/runtime changes or merges were performed. The full corpus and external/anchor checks remain open, and all product gaps must stay attached to source-caller evidence, the authoritative target contract, acceptance tests, qualification evidence, and the required Founder decision.


## 71. QuoteFlow migration ceremony and identity backlog batch — 2026-10-15

Ten additional QuoteFlow migration/identity documents were reviewed, including existing-user manifests, canonical identity mapping, onboarding, account provisioning, Business provisioning, reset/re-enrollment, organization-to-Business reconciliation, snapshot validation, and single-user qualification. Their current-status notes generally distinguish historical proposals from the selected GHM-owned target. Detected Markdown relative links in this batch resolved to tracked paths; these documents contained no inline relative links, so the result is a path inventory check rather than substantive link coverage.

**Confirmed open implementation/qualification backlog (keep separate, do not mark closed from lower-level qualifications):**
- The GHM account identity and exact `(provider=supabase, sourceSubject) → account_identity.id` migration-provenance mapping are qualified; they do not make the Supabase UUID/JWT a GHM runtime principal or credential.
- The migration-only account-provisioning DB primitive is qualified, but the separate live legacy-organization → GHM Business creation/provisioning path remains unqualified. Its contract currently documents synthetic outcomes only; no live Business creation or owner-membership equivalence is proven.
- The request/completion building blocks for reset/re-enrollment are constructed, but the complete user-facing ceremony still needs non-production DB+HTTP qualification for anti-enumeration, single-use recovery, rollback, existing-session revocation, and post-reset GHM session issuance **for both founder-owned source accounts**.
- Approved-source snapshot validation and dry-run manifest generation do not prove production source extraction, live account/Business/membership migration, credential re-enrollment, or runtime cutover.
- QuoteFlow still needs deterministic, atomic and recoverable local AsyncStorage scope transition; the existing local data is not migrated automatically by authentication changes.
- Production recovery email delivery/provider enablement, migration execution, Supabase package/config removal, shadow qualification, rollback evidence, and founder-authorized cutover remain separate gates.

The former dual-confirmation/permanent identity-link proposal is clearly marked historical/superseded and must not be revived as a runtime bridge. Preserve only the approved migration-provenance crosswalk. No production source access, implementation, runtime change, or merge occurred in this batch.


## 72. Quote, Review, Saved Business, Support, Trust and adapter evidence batch — 2026-10-15

A further 20 documents across the GHM architecture and evidence trees were inspected: Quote and subscription/entitlement reconciliation, resource boundary, Review HTTP/operation, Saved Business, SQL privilege inventory, Support Request, transaction/runtime gates, Trust contracts and qualifications, Business Offering and Connect capability-adapter evidence. The Markdown-link scanner found no missing tracked-file targets among detected inline relative links in this batch; the inspected documents predominantly contain no inline relative Markdown links. This is not anchor/reference-style/external URL validation.

**Status distinctions confirmed:** the bounded GHM Quote, Review HTTP, Saved Business, Trust, Support Request, and selected Connect capability-adapter slices are recorded as construction-qualified in current capability/evidence indexes. Their old branch-only authorization/acceptance checklists are historical evidence, not open construction requests. They do not establish full Connect feature parity, subscription/entitlement migration, product-wide integration, production deployment, or cutover.

**Gaps retained for execution after reconciliation:**
- QuoteFlow subscription/entitlement still has no evidence-backed GHM adapter; organization-to-Business equivalence and entitlement source/ownership must be explicitly decided and qualified before product integration.
- Connect moderation parity remains open beyond the canonical Review resource, including founder/admin authority, moderation reason, hidden/public state, audit records, list projections and HTTP mapping; keep business directory listing review distinct from customer review moderation.
- Saved Business adapter qualification does not close the complete directory save/unsave journey; verify duplicate behavior, ordering, envelopes, active/approved eligibility, and exact GHM ID mapping.
- Qualified Business Offering/Enquiry/Opportunity/Project adapter seams do not close full product journeys or production traffic; atomic project-plus-opportunity semantics and exact filter/pagination/count parity remain independently evidenced.
- Trust score foundation does not close provenance/version persistence or additional authoritative evidence dimensions; do not expand scoring without explicit contract and qualification.
- Legacy SQL inventory findings do not justify copying the legacy broad `ghm_db_user` privileges; preserve capability-derived least privilege and defer destructive authority cleanup until recovery/replacement gates permit it.
- Production replacement remains gated on product-specific integration, migration/data reconciliation, shadow evidence, operational recovery, controlled rollback and Founder-authorized cutover.

No source/runtime changes, production mutations, or merges were made. Historical source references to Supabase remain provenance; construction contracts' statements that Supabase is the current live provider describe the pre-cutover operating state and must not be misread as the desired target architecture.


## 73. Final GHM docs-tree evidence batch and qualification-state reconciliation — 2026-10-15

The final nine documents in the current `docs/` Markdown inventory were checked, completing a sequential pass across the 207 Markdown files under `docs/` identified on this branch. The last batch included Connect Project Quote capability adapter evidence, construction-gate reconciliation, Opportunity Participant/Requirements HTTP qualifications, Project Quote and Review HTTP qualifications, live Storage provider qualification, and Support Request HTTP qualification. No missing tracked targets were found in the detected inline relative Markdown links in this batch; these documents contained no inline relative links. Several records explicitly clarify that former “awaiting local qualification”, “pending founder merge”, or “do not merge” notes applied to old construction branches and are historical, not live blocks on already-integrated mainline slices. They still expressly deny production/cutover authorization.

**Important limitation:** completion of a sequential Markdown-file inventory and relative-path scan is not the same as semantic reconciliation of every sentence, Markdown heading-anchor validation, reference-style/autolink parsing, external URL liveness, or non-Markdown link validation. Those checks and the Connect PR #36 41-file changed-patch review remain open; no blanket claim of complete documentation reconciliation is made here.

**Qualification boundaries reconfirmed:** storage live-provider evidence (Cloudflare R2) leaves deployment-managed production configuration, recovery/reconciliation, production enablement and founder-authorized cutover open. Opportunity Participant HTTP is intentionally read/list/create only; PATCH/update is absent because transition authority is not qualified. Project Quote, Review, Support Request, Business Offering and capability adapters are construction/test qualifications only, not production readiness or full Connect parity. The historical SQL gate still flags unresolved legacy database role/membership cleanup, which must be handled through its governed authority/recovery plan rather than by broad privilege copying or unqualified destructive changes.

No implementation, runtime, production, migration, or merge operation occurred. The implementation backlog and the all-documents/no-contradictions merge gate remain authoritative.


## 74. Connect architecture terminology checkpoint — 2026-10-16

The paired Connect review branch received a verified, documentation-only correction across five architecture documents to consistently classify the Supabase-backed source as historical and GHM Internal Runtime as the approved target. Corrected integration inventory/provider headings and the misleading “Production persistence” label; clarified historical source model/domains and explicitly rejected legacy Supabase JWT/session acceptance as GHM runtime credentials; relabeled source security controls/trust boundaries, data ownership/platform/schema-evolution, and system/browser/feature/runtime descriptions as historical evidence. Each changed Connect file was re-fetched after writing and the expected updated labels were confirmed. Connect's durable handover now records this as section 77, including the limitation that this does not complete semantic reconciliation of the entire 41-file PR or the unmodified documentation corpus.

GHM remains the system of record and its qualified resource capabilities must not be confused with complete Connect parity, current hosted availability, production readiness, or cutover authorization. The implementation backlog remains open for identity/session and browser-safe transport integration, account/business membership migration, active-caller operation parity, storage service/recovery, QuoteFlow data/recovery ceremony, entitlement ownership, payment qualification, data reconciliation/shadow/rollback and founder-authorized cutover. No GHM runtime/application/database/provider/production changes or merges occurred. The all-GHM-documents reconciliation gate remains open; continue with small, evidence-backed batches and do not merge PR #135 or PR #36 until the complete gate is satisfied.


## 75. Cross-repository inline relative-link check — 2026-10-16

The paired ZAID Connect PR #36 review branch was enumerated at exact head `e62dcf10e73b0fa67391a90aa6200c8fc3c22fcd`. Its recursive tree contains 47 tracked Markdown files; all were fetched in small batches and scanned for ordinary inline Markdown links/images with relative local paths. No missing tracked-file targets were found. Connect's durable handover records the result as section 78.

This is not a full GHM corpus link/anchor certification and does not validate heading anchors, duplicate-heading slug behavior, reference-style/autolinks, external URL liveness, code/raw-HTML links, or non-Markdown assets. GHM's own 210-Markdown tree still requires the corresponding current-head link scan and semantic cross-document reconciliation. The architecture terminology corrections on Connect PR #36 are branch-verified but unmerged. No implementation, production, runtime, database, provider, migration or cutover changes occurred; PR #135 and PR #36 remain unmerged until the complete documentation gate and explicit founder authorization.


## 76. GHM inline relative Markdown target scan — 2026-10-16

Using the exact PR #135 head commit `a07441bddb5d9d5af108fb7fa666ec0ebbb20c0c`, the recursive repository tree enumerated 210 tracked Markdown files (207 under `docs/`, plus three outside that directory). All 210 files were fetched successfully in batches of 16–18 and scanned for ordinary inline Markdown links/images with relative local paths against the complete tracked repository tree. No missing tracked-file targets were found in any batch. This is a fresh branch-head path-existence scan, not reuse of the older 209-file result.

**Limitations:** the lightweight scanner does not certify Markdown heading anchors, duplicate-heading slug behavior, reference-style links/definitions, autolinks, external URL liveness, links hidden in code/raw HTML, or non-Markdown assets. It does not replace the remaining semantic claim/authority reconciliation, ownership/metadata review, or final comparison with current `main`. The current-state index correctly remains uncertified for repository-wide semantic reconciliation. No implementation, runtime, database, provider, production, migration, or cutover changes occurred; PR #135 and PR #36 remain unmerged until the complete documentation gate is satisfied and merging is explicitly authorized.


## 77. Audit checkpoint metadata refreshed — 2026-10-16

Updated the status metadata at the top of `docs/GHM_CURRENT_STATE.md` and `docs/GHM_REMAINING_WORK_REGISTER_2026-10-05.md` to reflect the 2026-10-16 follow-up review. Both were re-fetched and verified. The wording continues to state that repository-wide semantic reconciliation is **not certified** and PR #135 remains open; it does not turn the relative-link scan into a semantic-completion claim. Historical dated checkpoints elsewhere remain historical and were not rewritten.

Current evidence still separates qualified GHM construction slices from Connect/QuoteFlow production replacement. Open work includes GHM-native product session/transport integration, source identity and membership mapping, active caller parity, storage authorization/exposure/recovery, QuoteFlow migration ceremony/local-data transition/business provisioning, subscription/entitlement ownership, provider-specific qualification, data reconciliation, shadow/rollback and founder-authorized cutover. No implementation or production changes occurred; PR #135 and PR #36 remain unmerged pending the full documentation gate and explicit merge authorization.


## 78. GHM inline Markdown fragment-link inventory — 2026-10-16

A second pass over all 210 tracked Markdown files at the PR #135 head scanned ordinary inline Markdown links/images for local fragment identifiers. No inline Markdown link containing a `#fragment` was found in any batch, so there were no inline heading-anchor targets to resolve in this syntax class. This does **not** validate reference-style link definitions, autolinks, raw HTML, fragments in URLs embedded in code, external links, or generated/duplicate heading slug rules where those syntax forms are used. Combined with section 76, the fresh branch-head checks establish: all tracked Markdown files were readable, no missing ordinary inline relative local path targets were found, and no ordinary inline local fragment links were present. Full semantic reconciliation, reference-style/non-Markdown link validation, external URL checks, ownership metadata, and final current-main comparison remain open.


## 79. PR #135 changed-file count contradiction corrected — 2026-10-16

A cross-check of the current GitHub PR metadata against `docs/GHM_REMAINING_WORK_REGISTER_2026-10-05.md` found a stale statement that “the current review” confirmed 13 changed files. PR #135 now contains 14 changed files after the follow-up audit/handover checkpoint additions. Reworded the 2026-10-14 paragraph as an explicitly historical 13-file checkpoint and recorded that the current metadata reports 14. The register was re-fetched and verified after the write. This preserves the historical count without presenting it as the current PR scope. PR #135 remains open/unmerged; the full semantic reconciliation gate remains open. No code, runtime, database, provider, production, migration or cutover change occurred.


## 80. Connect verification-log historical availability correction — 2026-10-16

The paired Connect review branch corrected a remaining present-tense statement in `docs/06_Implementation/VERIFICATION_LOG.md`: the Capability Catalogue v1 expansion is now explicitly recorded as applied/verified at the 2026-09-02 Supabase source-production checkpoint, not as current hosted availability or GHM parity. The same section no longer implies that public directory functionality is presently reachable merely because directory and commercial checkout were historically separate; it states that current hosted availability remains unverified following the dated 2026-10-13 Auth endpoint failure. The verification log was re-fetched after the change and version metadata advanced to 35.4 / 2026-10-16. Connect's handover records this as section 80.

This is a documentation-only correction; it does not modify or probe the Supabase project, production database, provider, runtime or traffic. PR #36 remains open/unmerged, and repository-wide semantic reconciliation remains open.


## 81. Connect product requirements source-state clarification — 2026-10-16

The paired Connect review branch now defines the “Implemented” requirement classification as evidence in the inspected source implementation/contracts, not proof of present hosted availability or GHM parity. The legacy `businesses.is_supplier` flag statement is also scoped to the inspected Supabase-backed source, with current hosted/database status unverified. Connect's handover records this as section 81; the changes were re-fetched and verified.

The GHM migration target remains unchanged. No implementation or production change occurred, and PR #36 remains open/unmerged while the full cross-repository semantic reconciliation gate is open.


## 82. Connect document revision metadata consistency — 2026-10-16

The paired Connect review branch aligned version, `Last Updated`, and revision-history metadata for seven materially revised documents under the repository's documentation standard: Integration Architecture 3.3, Domain Model 3.9, Security Architecture 3.5, Data Architecture 3.7, System Architecture 3.4, Product Glossary 3.3, and Product Requirements 2.14. All seven were re-fetched and the 2026-10-16 metadata/revision rows verified. Connect's handover records this as section 82.

This resolves metadata drift introduced by the source-versus-target terminology corrections; it does not certify all documents' owner/status/history metadata or complete semantic reconciliation. No implementation or production state changed. PR #36 remains open/unmerged pending the full documentation gate.


## 84. Connect documentation metadata compliance — 2026-10-16

The paired Connect review branch scanned all 47 tracked Markdown files against its Documentation Standard for title, Document Owner, Status, Version and Last Updated. Sixteen files initially lacked one or more canonical fields. Those fields were normalized and re-fetched successfully; the other 31 files passed the initial scan. This included correction of the Current State Audit owner/date metadata, the Implementation Backlog source-production wording and version/revision record, the two provider milestone records, launch runbook/governance instrument, verification log, extraction map, implementation README, durable handover, and ADR-000 through ADR-005. The detailed affected-file record is in Connect handover section 84.

This is metadata compliance evidence only, not semantic certification of every historical statement or external/reference-style link. PR #36 remains open/unmerged and the full cross-repository documentation gate remains open.


## 85. Connect full metadata recheck — 2026-10-16

The paired Connect review branch rechecked all 47 tracked Markdown files at exact head `447300aacc0c7f3cdc9963af53d70fa4972937b8` against the required title/Document Owner/Status/Version/Last Updated fields. All files were readable and no missing metadata was found in any batch. The Connect handover records this as section 85.

This is a metadata compliance result only. The semantic all-documents gate, remaining link syntax/external URL checks, and final mainline comparison remain open. PR #36 remains open/unmerged; no product/runtime changes or cutover occurred.



## 67. Audit closeout push — current review snapshot 2026-10-16

Founder direction: finish this audit promptly, avoid repeating completed checks, and leave an actionable GHM capability backlog. This entry is a durable checkpoint, not a reconciliation certificate.

### Current GitHub review state

- GHM PR #135 remains open/unmerged: https://github.com/zaidhqdev-sys/GHM/pull/135. Live metadata at this check reports 14 changed files. It corrects PR #133 status and migration handover wording; the GHM branch is still a review branch, not mainline.
- ZAID Connect PR #36 remains open/unmerged: https://github.com/zaidhqdev-sys/zaid-connect/pull/36. Live metadata at this check reports 47 changed files across the documentation corpus.
- Prior handover section 65's counts (13 GHM files / 41 Connect files) are historical checkpoint counts, not current scope. PR descriptions now avoid duplicated fixed counts.
- The Connect review branch received two additional documentation edits: the glossary's legacy “Current Production” state labels are explicitly scoped as historical source-state evidence, and the implementation index no longer implies current hosted availability. These edits do not certify the no-Supabase target.

### Remaining audit gate — do not repeat completed checks

The GHM tree currently contains 210 tracked Markdown/text documentation files and Connect contains 47 Markdown files. Existing bounded audits, link-target sweeps, metadata checks and semantic batches are evidence for their recorded scopes only. Still required before declaring the audit complete:
1. Run a fresh same-head full-corpus local Markdown path/anchor/reference-link validation for both review branches, with an explicit result artifact and no reliance on old sweep counts.
2. Finish semantic/status/authority/owner/history review across all GHM documents, using the Connect corpus for cross-repository claims where relevant; explicitly distinguish historical source state from current GHM target state.
3. Reconcile every remaining claim against GHM operation-level contracts and the actionable capability-gap register. Preserve known open gaps: GHM-native browser/session transport and identity binding; directory/filter/geography/profile parity; founder review/capability-evidence APIs; Business provisioning; storage/media exposure and recovery; Relationships/Outcomes domain and APIs; onboarding, analytics and workflow/atomicity parity; PayFast sandbox end-to-end qualification; separate Paystack live/commercial gates; data reconciliation, rollback/recovery, shadow qualification and founder-authorized cutover.
4. Re-fetch both PR heads and rerun checks after the final documentation edits; compare GitHub branches with local checkouts separately because local sync has not been established.
5. Keep both PRs unmerged until the full GHM documentation corpus is reconciled, the remaining validation results are recorded, and the founder explicitly authorizes merge.

No local checkout, implementation, database, runtime, migration, provider activation, production state, or cutover was changed by this checkpoint. Legacy Supabase JWTs remain rejected as GHM runtime credentials; Supabase is source/migration provenance only, not the approved target runtime.



## 68. Latest review-branch changed-file link/anchor verification — 2026-10-16

Freshly fetched the latest review tree at GHM commit `aa999dfdb88eae3698812a0fd4978d2c08c35050` and checked relative Markdown file targets across all 210 tracked Markdown documents against the complete repository tree. **No missing relative file targets were found in the 210-file corpus.** The 14 current PR #135 changed files were additionally checked for heading anchors where target documents were in the changed set; no missing anchors were found. Reference-style uses, HTML/autolinks, anchors into unchanged documents, external URL liveness, and complete semantic consistency are still not certified.

The same pass confirms the PR #135 current-state paragraph's old “13 files” wording is now explicitly dated as a historical checkpoint and the live count is 14. This was corrected on the review branch only; PR #135 remains open/unmerged.

### Exact remaining closeout scope

- Finish full-corpus anchor/reference-style/autolink validation across all 210 GHM Markdown documents and the 47 Connect Markdown documents. The GHM relative file-target pass is complete with zero missing targets; Connect relative file-target checks also passed across all 47 changed files at the current PR #36 head.
- Finish semantic/status/authority/owner/history review of the complete GHM corpus and cross-check relevant Connect claims against the GHM contracts.
- Re-fetch head SHAs and checks after any further edits; current review branch head is a moving pointer.
- Keep the merge gate closed until the full GHM documentation corpus is reconciled and the founder explicitly authorizes merge.

No runtime, implementation, database, provider, production or cutover changes occurred.



## 69. Full-corpus batched heading-anchor pass — 2026-10-16

On the then-current GHM review head, all 210 tracked Markdown files were divided into 14 batches of 15 files. Markdown heading/explicit-anchor references were checked for targets within each batch; no missing anchors were found in any batch. This is a bounded batch-local check: it does not prove that an anchor linking across batches resolves, and it does not cover every reference-style/autolink/HTML form or external URL liveness. Relative Markdown file targets were independently checked across all 210 files with zero missing targets.

The PR #135 branch moved during this audit as documentation evidence was recorded. Always re-fetch its current head before relying on the exact SHA or rerunning validation. Repository-wide semantic reconciliation remains open; this anchor result alone is not the closeout gate.



## 70. Cross-repository checkpoint after batched anchor review — 2026-10-16

Current recorded review state: PR #135 and PR #36 remain open/unmerged. Relative Markdown file targets were checked across 210 GHM and 47 Connect Markdown documents with zero missing targets. Batch-local heading/explicit-anchor checks found zero missing anchors within 14 GHM batches and 3 Connect batches. These checks do not establish cross-batch anchor correctness, reference-style or HTML/autolink correctness, external URL liveness, or semantic consistency. The latest GHM current-state index and governed remaining-work register now state this bounded result explicitly.

Next closeout pass: finish full link-form/anchor verification where practical, then complete semantic status/authority/owner/history review and cross-repository caller-to-contract reconciliation. Preserve the missing-capability backlog and no-merge gate. No runtime, database, provider, production or cutover change is authorized.



## 71. Superseding link-audit scope clarification — 2026-10-16

Earlier checkpoints in this handover (including section 66/related historical checklist language and section 68) correctly recorded that a full-corpus link pass was still outstanding at those times. They are historical checkpoints, not the current result. The later checks documented in sections 69–70 supersede only the relative-file-target and batch-local-anchor portions: 210/210 GHM and 47/47 Connect Markdown files had zero missing relative file targets; 14 GHM batches and 3 Connect batches had zero missing heading/explicit-anchor failures within each batch.

Still open: cross-batch anchor resolution, reference-style links, HTML/autolinks and external URL liveness; semantic status/authority/owner/history reconciliation; and claim-by-claim cross-repository caller-to-contract verification. Do not read historical “full-corpus link validation outstanding” wording as evidence that the relative-path pass has not happened, and do not read the completed bounded checks as full link or semantic certification.

## 72. Cross-repository architecture semantics reviewed — 2026-10-16

Reviewed current Connect review-branch versions of `docs/00_Foundation/PRODUCT_GLOSSARY.md`, `docs/01_Architecture/SECURITY_ARCHITECTURE.md`, `DATA_ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `INTEGRATION_ARCHITECTURE.md`, and `SYSTEM_ARCHITECTURE.md`.

Result: the checked architecture set consistently distinguishes the inspected Supabase-backed source implementation from the approved GHM Internal Runtime/no-Supabase target. The glossary explicitly scopes retained “Current Production” labels to historical source-state classification and states that this is not evidence of current hosted availability or target approval. The security/domain/data/integration/system architecture documents independently preserve the target boundary and state that target design is not proof of implementation or cutover. The checked source-era JWT descriptions do not authorize legacy Supabase JWTs as GHM credentials.

This closes only this named architecture-document semantic slice. It does not certify all Connect docs, every active source caller, runtime parity, external links, or repository-wide GHM consistency. Continue with the operation-level integration specification, active route/service caller mapping, GHM authorization contracts, and missing-capability acceptance criteria.
## 73. Operation-level interface and authentication boundary reviewed — 2026-10-16

Reviewed Connect `docs/04_Interfaces/INTEGRATION_SPECIFICATION.md` and `API_SPECIFICATION.md` against GHM `CONNECT_TRUSTED_REQUEST_CONTEXT_QUALIFICATION.md` and `GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md`.

Consistent claims found in the inspected sections: the existing signed `POST /api/v1/connect/service` is server-to-server only; it is not a browser API. The user-facing route remains a blocking design/qualification decision between a GHM-native user-token API and a secure server-side BFF. The existing `provider=supabase` request-context envelope is source-era only, and legacy Supabase JWTs are not GHM credentials. The interface specs require exact operation-level request/response, authorization, lifecycle, failure, and acceptance contracts rather than inferring parity from route/resource existence.

Actionable GHM gap retained: no qualified browser-safe end-user session transport is established by these records. Acceptance must cover token/session lifecycle and revocation, active canonical account and Business membership resolution, role/resource permission enforcement, caller-controlled identity rejection, error/failure semantics, and product operation mapping before cutover. This review does not make the architecture choice or authorize implementation.
## 74. Active caller-to-GHM contract matrix cross-check — 2026-10-16

Cross-checked the current Connect `INTEGRATION_SPECIFICATION.md` caller-to-contract overlay against the GHM production-readiness gap register, service HTTP boundary qualification, authorization-binding qualification, and product-consumer HTTP contract qualification.

**Consistency result:** the main classifications agree: (1) Connect auth/session is a replacement blocker despite GHM auth foundations being qualified; (2) directory and regional filtering require extension beyond the narrow public directory contract; (3) capability evidence/review, onboarding, analytics, and Relationships/Outcomes are real product gaps; (4) project/quote/opportunity and support/review surfaces are reuse/extend candidates, not parity-certified; (5) storage metadata qualification does not establish provider, HTTP/product exposure, or recovery; (6) notifications/realtime ownership and active caller evidence remain unresolved; (7) commercial payment implementation does not equal real sandbox end-to-end qualification or provider authorization.

**Specificity correction to preserve:** Relationships/Outcomes is confirmed active, not merely a missing resource inferred from a table. `RelationshipOutcomeScreen.jsx` is mounted through an authenticated route requiring `BUSINESS_READ` and active-business context and calls both relationship and outcome services. GHM has no matching domain/HTTP contract. This is a Build gap whose acceptance must include lifecycle/verification, visibility/provenance/evidence, canonical business scope, and authorization. Do not defer it pending another reachability search.

**Do not conflate qualification layers:** the service HTTP read, authorization-binding, and shared product-consumer envelope qualifications are narrow construction evidence. Their legacy provider-bound input does not qualify GHM-native end-user sessions, browser-safe access, mutations, broad product parity, production availability, or cutover. Keep the browser-safe transport decision and active caller operation-by-operation mapping as blockers.

This pass found no direct contradiction between the checked caller matrix and these named GHM gap/qualification records. It closes only this cross-check slice, not all GHM docs, all route registrations, every caller, full link-form validation, or the whole repository's semantic audit.
## 75. Registered-router versus active-caller verification — 2026-10-16

Read-only inspection of the current GHM review tree's `src/http/app.ts` confirms route registration for opportunity detail, opportunity requirements, business capability, review, support request, notification, project quote, quote, customer, and commercial internal operations. The app has a business-hours service and a GET read path, but the inspected app has no business-hours mutation route. The registered router set inspected contains no relationship/outcome router, onboarding API, analytics API, or storage/media API router.

Connect source verification confirms `MarketplaceOpportunitiesScreen.jsx` actively calls `listOpportunityTypes()` and `listMarketplaceOpportunities()`; its service queries `opportunity_types`, filters active types, searches opportunity title/description, filters by type, orders newest first, and loads nested capability requirements. GHM `src/http/opportunity-router.ts` exposes only a detail GET, while `opportunity-requirements-router.ts` exposes GET/PUT requirements. Therefore the opportunity marketplace list/type-discovery gap is confirmed active; do not describe this as merely unconfirmed caller reachability.

Connect `useDirectorySearch.js` actively passes province, city, radius (when location exists), sort, zero-based page and limit 20 to the Supabase-bound directory service. This corroborates the documented filter/paging mismatch with GHM's narrower public directory endpoint.

Notification routes are registered in GHM, but this does not establish the active Connect inbox/push/realtime producer-consumer mapping. Connect's `lib_notifications.js` includes a Supabase `push_subscriptions` write and legacy Supabase-specific service-worker exclusions; usage/reachability must be traced before classifying push migration scope. Preserve the existing evidence-insufficient classification until the mounted caller chain is verified.

Correction/precision note: GHM has a registered business-capability router (GET and POST routes), so capability functionality must not be described as wholly absent. The remaining gap is the Connect-specific evidence submission/review queue and lifecycle/authority contract; exact route semantics and active callers must be mapped against those existing endpoints before deciding extend versus build. This pass confirms route-registration facts only; it does not qualify end-to-end behavior or authorize implementation.
## 76. Capability evidence and notification caller-chain follow-up — 2026-10-16

Follow-up source inspection narrows the earlier capability gap classification. Connect `BusinessCapabilitiesPanel.jsx` actively loads the capability catalogue and business assertions, saves business capability assertions, and submits evidence with type/title/description/issuer/reference/URL/issue/expiry/visibility fields. `AdminCapabilityEvidencePanel.jsx` actively loads verifier authority, retrieves evidence for verification, and supports verify/reject/revoke with required reasons for rejection/revocation. Both are currently wired to `lib_supabase` services.

GHM `business-capability-router.ts` exposes catalogue/list, detail and create operations on business-capability assertions; it does not expose the Connect evidence-submission/review lifecycle represented by those screens. GHM `review-router.ts` handles customer reviews and moderation, a distinct domain; do not count it as capability-evidence parity. Classification: existing assertion/catalogue functionality is reuse/extend; evidence records, verifier queue and verify/reject/revoke lifecycle need an explicit GHM contract and authorized HTTP operations unless another existing implementation is proven. Acceptance must preserve tenant/business scope, verifier authority, evidence metadata and visibility, expiry/revocation, rejection reason, and audit history.

Notification inspection confirms `subscribeToPush(userId, supabase)` writes a browser push subscription to Supabase `push_subscriptions`, while the same utility also contains generic toast/browser notification and service-worker push handlers. This proves a source-era Supabase dependency in the utility, not yet a live mounted caller or complete push producer/consumer flow. Trace import/call sites before deciding migration scope; do not claim full push is active solely from utility presence.

These refinements supersede any overly broad reading of section 75: capability support is not wholly absent, but evidence workflow parity is not present in the inspected GHM HTTP surface; notification utility existence is not proof of active product reachability. No code or runtime change was made.
## 77. Directory, business-hours and push-helper status reconciled — 2026-10-16

Read current Connect caller code against GHM `src/http/app.ts` and prior caller-search evidence.

**Directory:** Connect's active `useDirectorySearch` calls `directoryService.search` through `lib_supabase` with query, province, city, optional radius, sort, zero-based page and `limit: 20`. The legacy `businessService.list` separately supports category, city, supplier flag, tier, featured/rating ordering and offset paging. GHM `/api/v1/public/businesses` currently accepts only `q`, `category`, one-based `page` and `pageSize` (maximum 50). Therefore this is a broader product contract mismatch than province/city alone. Decide which filters are still product-required by matching mounted screens and the intended Connect target; map sort and zero/one-based paging explicitly. Do not copy source query semantics without an approved public-data allowlist and server-side visibility policy.

**Business profile/hours:** the mounted profile editor actively loads and saves the profile and calls `businessHourService.replaceHours`. GHM registers authenticated `GET /api/v1/businesses/:businessId/hours`; the inspected `app.ts` contains no matching POST/PATCH/PUT/DELETE hours route. This is confirmed active write-path gap. Implement only after a schema/authorization contract specifies membership and role, validation (seven-day schedule, closed-day representation, time ordering/time zone), replacement atomicity and integration tests.

**Push subscriptions:** a repository-wide code search for `subscribeToPush` finds only its helper definition in `src/lib/lib_notifications.js`; the existing handover's no-active-invocation finding is corroborated. Classify browser push subscription/delivery as **not currently proven active / not a launch blocker on present evidence**, rather than a required immediate migration. Keep the helper's legacy Supabase dependency recorded for cleanup or future activation, but do not build replacement push infrastructure unless a real mounted caller/approved requirement is found. This does not erase the separate active in-app notification facade/create/read workflows; qualify those against GHM notification routes and real producers.

This supersedes section 76's generic instruction to trace the push caller chain: the present search confirms no invocation. Reopen only if new call-site evidence appears. This pass remains source/route inspection, not end-to-end qualification.
## 78. Profile, saved-business, engagement and notification contract comparison — 2026-10-16

Read the mounted Connect `BusinessProfileScreen.jsx`, the legacy `savedService` and `businessEngagementService` facade methods in `lib_supabase.js`, GHM `saved-business-router.ts`, `notification-router.ts`, and route registrations in `src/http/app.ts`.

**Saved businesses:** Connect toggles by `(userId, businessId)` and loads a user's saved business list. GHM already has authenticated list/detail/create/delete routes with registered resource authorization. This is a reuse/extend candidate, not a wholly missing resource. Before claiming parity, prove that caller identity is derived from authenticated GHM context (never trusted from a caller-supplied userId), that uniqueness/toggle idempotency and duplicate/race behavior are specified, and that returned business summaries use canonical GHM IDs and public field policy. The Connect screen's old userId/UUID assumptions must not be copied into the GHM contract.

**Business engagement:** the mounted profile screen emits `profile_view`, `save`, `whatsapp`, `call`, `website_visit`, `direction_request`, and `share`; the legacy facade writes through RPC `record_business_engagement_event`. GHM has no registered engagement HTTP router in the inspected app. Treat event intake as a real missing product HTTP contract unless a separately qualified GHM equivalent is demonstrated. Specify allowlisted event names, canonical business/account identity, optional visitor context, source, abuse/rate limits, privacy/retention, idempotency, and aggregate/read permissions. Do not expose a caller-selected user identity or treat a click event as a verified lead.

**Notifications:** GHM has authenticated list/detail/create/mark-read/read-all routes. Existing Connect notification creation is used by service paths, so route existence alone does not qualify payload and recipient authority. Match each active producer to allowed notification type, canonical recipient/account/business, origin event, duplicate behavior and authorization; verify that create cannot let a product caller target an arbitrary recipient. The legacy `useNotifications` hook and `NotificationCenter` remain unconfirmed active UI; push subscription helper remains uninvoked in current search evidence.

**Profile owner preview / IDs:** Connect's public profile path also has an owner-authorized fallback for unpublished listings. Preserve the split between public allowlisted reads and authenticated owner preview; never fall back to anonymous exposure. Numeric GHM business IDs and source UUIDs are not interchangeable; require explicit migration mapping and tests.

These findings refine the existing caller register: saved-business functionality is present in GHM and should be qualified/extended; business engagement has a confirmed route-level gap; notification routes exist but producer-to-recipient semantics remain to qualify. No runtime or data change was made.
## 79. Analytics, profile writes and review-domain boundary — 2026-10-16

**Analytics:** Connect's mounted `AnalyticsScreen.jsx` calls `businessAnalyticsService.getDashboard(businessId, days)` (default 30 days with selectable windows) backed by legacy RPC `get_business_analytics_dashboard`. It displays profile views, leads, quotes, projects won, conversion rate, engagement and recent activity. The inspected GHM HTTP application registers no analytics dashboard router/contract. Classify as a real Build gap unless a separate qualified dashboard endpoint is identified. Define metric sources, time-window inclusivity/time zone, business authorization, canonical identity, empty/partial data behavior and aggregation tests; generic engagement event intake is not analytics parity.

**Profile writes:** GHM already registers authenticated `PATCH /api/v1/businesses/:businessId` via resource authorization and `BusinessIdentityService.updateBusiness`. Profile update is therefore not wholly missing. Reuse/extend this contract against Connect's editable field set and response/error behavior; explicitly test owner/member role boundaries, allowed fields, registration data, public/private projection, logo/media handling and directory review status. Business-hours write remains a separate confirmed gap.

**Review-domain split:** GHM customer-review public/create/own/pending/moderation routes are existing reuse candidates, with reviewer identity derived from GHM auth and pending/approved/rejected mapping still needing contract qualification. They do not replace Connect's separate founder directory-listing review workflow or capability-evidence verifier workflow. Keep those as separate domains with distinct roles, queues, states and audit history.

**Audit exit discipline:** To avoid an endless loop of adding another handover section for each pass, the remaining work is now a finite closeout checklist: (1) reconcile canonical current-state/register/inventory/readiness/handover docs against the recorded active caller matrix; (2) validate all tracked Markdown local targets and anchors on the exact review branches, including reference-style links; (3) reconcile PR descriptions and changed-file counts with live metadata; (4) perform one final cross-repo semantic pass for authority, target/source status, SHAs, open gates and next steps; (5) compare local checkout with GitHub only after GitHub-side audit is closed. If any contradiction is found, fix it in the canonical owner document and re-run the affected checks, not restart broad feature discovery. Closure requires recorded results for every item and founder review; no merge is implied.

## Current release gates — 2026-10-16 20:40Z

- GHM #138 consolidated trusted-proxy/CI PR exact-head run [38970659762](https://github.com/zaidhqdev-sys/GHM/actions/runs/38970659762), commit `3d08b0667775c2f589b90f02bbae8ea7ced9f8e9`: build and disposable PostgreSQL 18 migrations passed; 563 passed, 0 failed, 0 skipped, 0 TODO; runtime-boundary verification passed. It includes the migration BOM fix previously in #139. #139 is closed as superseded, not merged. Render still deploys main commit `20b120c7d6ecf7a86f9dc4f7a8dc61f9dee4d8dc`. Proxy-hop topology/client-IP rate-limit behavior remains unverified; no deployment approved.
- GHM #137 identity API plus mapped-business membership guard latest head `6ed28a2cd9ffc0a49eefb281793bb4382a427a76`, run [38971853527](https://github.com/zaidhqdev-sys/GHM/actions/runs/38971853527): build and disposable PostgreSQL 18 migrations passed; 592 passed, 0 failed, 0 skipped, 0 TODO; runtime-boundary verification passed. It includes the guard/tests consolidated from closed PR #134 and now shares #138's migration runner with production fail-closed TLS. Endpoint/schema are not confirmed deployed. Browser-session E2E and actual canonical mapping evidence remain required.
- GHM #136 business-hours API latest head `8f11cb32271c88f54f0bc2011e7dcd74685eedcc`, run [38971913370](https://github.com/zaidhqdev-sys/GHM/actions/runs/38971913370): build and disposable PostgreSQL 18 migrations passed; 564 passed, 0 failed, 0 skipped, 0 TODO; runtime-boundary verification passed. Its migration runner now matches qualified #138. Non-production caller/mapping E2E remains required.
- Connect #39 tested head run 38958913312: 50 configured contract tests passed, 0 failed, 0 skipped, 0 TODO, web build passed. This does not certify deployed E2E or Supabase parity; auth/session, PostgREST/RPC and Storage dependencies remain documented in the Connect mapping inventory.
- GHM #135 and Connect #36 documentation PRs remain open/unmerged. Prior link scans are partial, not a full semantic/status/authority/owner/history/link closeout. Finish the finite closeout checklist above on the exact review branches before merge consideration.

These are checkpoint-specific test results, not blanket repository readiness. No production deployment, production database mutation/import, payment activation or cutover is authorized. Founder merge authorization remains required after complete documentation reconciliation.

## CI/database qualification correction — 2026-10-16 21:04Z

A closer inspection of `.github/workflows/ci.yml` shows this workflow has no PostgreSQL service container and runs only `npm run build`, `npm test`, and `npm run verify:runtime`. Its job defines a placeholder `DATABASE_URL` but no `GHM_RUNTIME_DATABASE_URL` or `GHM_MIGRATOR_DATABASE_URL`; therefore it cannot prove live PostgreSQL migration application or runtime/migrator role separation. Exact-head run 38965921128 passed build, test suite and runtime-boundary verification, but the summary is **543 passed / 0 failed / 2 skipped / 0 TODO**. Earlier statements describing that run as applying all migrations to disposable PostgreSQL were inaccurate; do not rely on them.

Read-only catalog inspection of the separate Render `ghm_payfast_sandbox_db` found the auth/session/mapping/replay objects and SECURITY DEFINER functions `auth_create_account`, `auth_link_business_external_mapping`, `auth_link_external_identity`, and `auth_rotate_refresh`. This is object-existence evidence only, not proof of migration-ledger completeness, grants, E2E behavior, or production state. No privileges were changed and no data was mutated.

Corrective next step: design a CI-only PostgreSQL 18 service fixture with separate non-superuser runtime and migrator connections, apply migrations using the repository's documented migration-owner path, and run both persistence qualifications without skip fallbacks. Do not use production credentials or point CI at Render. Keep the no-skips gate closed until an exact-head run reports zero skips and proves migration/runtime boundary checks.

## Consolidated disposable PostgreSQL CI qualification — 2026-10-16 21:41Z

The consolidated GHM PR #138 head `3d08b0667775c2f589b90f02bbae8ea7ced9f8e9` passed workflow [38970659762](https://github.com/zaidhqdev-sys/GHM/actions/runs/38970659762): build passed; all migrations applied using the isolated migrator role against disposable PostgreSQL 18; auth foundation persistence and live PostgreSQL Connect service-assertion replay executed; **563 passed / 0 failed / 0 skipped / 0 TODO**; runtime-boundary verification passed. This branch combines the trusted-proxy bound, disposable database-backed CI and migration-loader BOM handling. PR #139 is closed as superseded, not merged. TLS is disabled only for the ephemeral CI connection; production migration execution still fails closed when `DATABASE_SSL` is not true.

This is executable CI qualification evidence for this exact commit only. It does not establish production migration state, production credentials/grants, Render ingress proxy-hop count or deployed client-IP/rate-limit behavior, business/account mapping correctness, successful Connect/QuoteFlow cutover, live payment readiness, or completion of repository-wide semantic documentation reconciliation. No production data or settings were changed. Preserve the no-merge gate until the complete GHM documentation set and cross-repository contracts are reconciled.


## Current consolidation checkpoint — 2026-10-16 21:58Z

This section is the current PR-disposition checkpoint; earlier numbered audit sections remain historical snapshots.

- **#138** remains open/unmerged and owns the bounded trusted-proxy change plus the qualified PostgreSQL 18 CI/migration-loader implementation. Exact head `3d08b0667775c2f589b90f02bbae8ea7ced9f8e9`, run [38970659762](https://github.com/zaidhqdev-sys/GHM/actions/runs/38970659762): 563 passed, 0 failed, 0 skipped, 0 TODO. Render is still on main commit `20b120c7d6ecf7a86f9dc4f7a8dc61f9dee4d8dc`; no deployment or proxy-topology proof.
- **#137** remains open/unmerged and owns authenticated canonical identity, the mapped-business active-membership guard consolidated from closed #134, and the first GHM-native account-email contract. Latest head `340719c7d9a61d2f0c600edb21c89003aa3e2551`, run [38975655478](https://github.com/zaidhqdev-sys/GHM/actions/runs/38975655478): 592 passed, 0 failed, 0 skipped, 0 TODO; disposable PostgreSQL 18 migrations, DB-backed auth persistence and runtime-boundary verification passed. Tests prove an untrusted accountId query does not override authenticated account context and direct SELECT on password credentials is denied to runtime. Non-production browser/session E2E, email provenance for accounts without active password credentials, and real canonical account/business mapping remain open.
- **#136** remains open/unmerged. Exact head `8f11cb32271c88f54f0bc2011e7dcd74685eedcc`, run [38971913370](https://github.com/zaidhqdev-sys/GHM/actions/runs/38971913370): 564 passed, 0 failed, 0 skipped, 0 TODO. Connect caller wiring and non-production persisted read-after-write remain open.
- **#135** remains open/unmerged. Its previous exact-head CI had 2 skips; no waiver. It cannot truthfully be called zero-skip qualified until the current docs head is checked with the qualified CI workflow without hiding or waiving skips. The docs gate also still needs complete semantic and link/anchor reconciliation.
- GHM #134 and #139 are closed unmerged as superseded by #137 and #138. Connect #35 and #37 are closed unmerged as duplicates superseded by #39. Connect #15 and #28 are closed unmerged because their Supabase Edge Function implementation paths do not meet the GHM Internal Runtime target. Preserve branches as historical/reference material.
- Connect #39 remains unmerged/un-deployed; #33 is a disabled PayFast sandbox bridge and is distinct from Paystack. Neither status enables live payments. Website #3 is a separate website-content contract.

**Closeout is finite, not another broad audit:** reconcile current-state/register/inventory/readiness/handovers; run full Markdown target/anchor checks on both review branches; perform one final claim-by-claim authority/status/owner/history/cross-repo pass; record live PR heads/counts and results; stop and present remaining concrete blockers. No merge/deploy/cutover until the documented gate is satisfied and the founder authorizes it.


### Documentation-branch validation checkpoint — 2026-10-16 22:00Z

GHM PR #135 exact head `10cb2af53cd9a69ff8f4c4f71825449e84c22faa` passed build and runtime-boundary verification in [run 38973019692](https://github.com/zaidhqdev-sys/GHM/actions/runs/38973019692), but tests reported 543 passed / 0 failed / 2 skipped / 0 TODO. These are the known auth persistence and live Connect service-assertion replay skips from the pre-PostgreSQL-service workflow; they remain unwaived. The qualified PostgreSQL 18 fixture is currently in #138, not the docs branch. Do not mix duplicate implementation changes into #135 merely to make its check green; resolve the branch/CI dependency deliberately. Changed Markdown local-target checks found zero missing targets across 14 GHM docs and 47 Connect docs; fragment anchors and external URL liveness remain unchecked.


### Confirmed Connect identity parity gap — account email

The first implementation now exists in the review branches. GHM #137 latest head `dc3e39ee0d9fea71eed8b8e64d860008ac81a8c3` includes a SECURITY DEFINER reader over the canonical password-credential store, the account.email response field, an HTTP response assertion, a database-backed runtime-role test, and caller-ID isolation; run [38975265619](https://github.com/zaidhqdev-sys/GHM/actions/runs/38975265619) passed 592 / 592 with zero skips/TODO. Connect #39 now maps only GHM's account.email and refuses legacy caller-email fallback; exact-head run [38974932731](https://github.com/zaidhqdev-sys/zaid-connect/actions/runs/38974932731) passed 51 tests with 0 failures/skips/TODO, and the production web build passed. This remains unmerged/un-deployed. Accounts without an active password credential still receive null email, so canonical email provenance for migrated/external-only accounts, cross-account browser E2E, and affected caller verification remain open. Do not use Supabase or client-submitted email as fallback.


## Mandatory founder PowerShell command format — 2026-10-17

This is a durable working-format requirement, not an optional style preference. All local PowerShell instructions for the founder must follow the established copy-paste format used throughout the project:

- Introduce the batch briefly in prose, stating its purpose and whether it is read-only or mutating.
- Provide one complete, directly runnable PowerShell batch in a `powershell` fenced code block. The user copies the commands inside the block, not the fence.
- Start from the correct working directory, normally `Set-Location C:\GHM` for GHM work, followed by `$ErrorActionPreference = "Stop"`.
- Group related operations under numbered section headers using `Write-Host "`n=== 1. Section name ==="`.
- Keep commands grouped into one bounded batch, and finish with an explicit `Write-Host "`n=== END: ... ==="` marker.
- Use actual PowerShell syntax, with no pasted `PS C:\GHM>` prompts or `>>` continuation prompts inside the code block.
- Ask for only the output needed to make the next decision. Give one bounded batch at a time.
- Do not invent or vary the layout, send exploratory command alternatives, repeat completed checks, or ask the founder to reconstruct a known workflow. Verify the intended command against the current repository, handover, scripts and available evidence first.
- Never print, request or paste secret values from `.env` files. Prefer presence-only checks or masked identifiers where necessary.
- State explicitly what the batch changes and what it does not change. Do not perform a mutation when the stated batch is read-only.
- Use the same layout for every subsequent local-command batch and preserve this requirement in future handovers.

Canonical layout example:

```powershell
Set-Location C:\GHM
$ErrorActionPreference = "Stop"

Write-Host "`n=== 1. First bounded check ==="
# Verified command(s) for the stated purpose

Write-Host "`n=== 2. Second bounded check ==="
# Verified command(s) for the stated purpose

Write-Host "`n=== END: read-only check ==="
```

This format requirement does not authorize a repository sync, file cleanup, credential change, migration, deployment, merge or production mutation. Those remain subject to the existing project gates and explicit authorization.

## Sandbox migration-ledger qualification recovery — 2026-10-17

### Recovered historical verifier and configuration

PowerShell history has now recovered the exact original verifier (history lines 187720–187798) and confirms the sandbox environment file used on 2026-10-11 was `.env.sandbox-used-20261011`.

The verifier:
- requires `GHM_MIGRATOR_DATABASE_URL` and stops unless the URL database path is exactly `ghm_payfast_sandbox_db`;
- enumerates every migration file matching `^\\d{14}_[a-z0-9][a-z0-9_-]*\\.sql$` in `database/migrations`;
- hashes each file with SHA-256 over UTF-8 text and queries `ghm.ghm_schema_migrations` after checking `current_database() = ghm_payfast_sandbox_db` and `session_user = ghm_migrator`;
- reports local and recorded counts, missing versions, checksum mismatches, unexpected recorded versions, and `ledgerComplete`;
- does not execute migration SQL or write ledger rows. The recovered original does not explicitly start a read-only transaction, so any fresh reproduction must improve that guard and explicitly use `BEGIN READ ONLY` before the SELECT-only comparison.

**Checksum contract correction:** the original verifier's raw `sha256(sql, 'utf8')` comparison is not fully aligned with current `src/db/migration-checksum.ts`, which normalizes CRLF and CR line endings to LF and supports the documented legacy-CRLF checksum. Therefore the original script is useful historical evidence, but a fresh qualification must use the current repository checksum helper semantics (including legacy CRLF compatibility), not treat every raw-text mismatch as a migration defect.

### What is established

- The prior session record reports a successful sandbox migration-ledger qualification on 2026-10-11: target database `ghm_payfast_sandbox_db`, login role `ghm_migrator`, **76 local migration files / 76 recorded ledger entries / 0 missing / 0 mismatched / 0 unexpected**, with `ledgerComplete: true`.
- This is a historical result, not evidence that the current sandbox ledger or current local checkout still matches.
- `npm run migrate` is mutating and must not be used to discover or re-check the ledger.
- `npm run audit:migrations` / `scripts/forensic-migration-reconciliation.mjs` is not the historical sandbox verifier: its documented target expects `ghm_db`. Do not point it at the sandbox.
- `scripts/audit-commercial-migration-ledger.mjs` is not the full verifier: it queries only commercial entries from `ghm.schema_migration_ledger`.

### Fresh requalification procedure

1. Use `.env.sandbox-used-20261011` only after checking locally that its migrator URL still targets exactly `ghm_payfast_sandbox_db` and role `ghm_migrator`. Never print or copy connection strings or credentials into chat, logs, Git, or documentation.
2. Confirm the local migration-checksum implementation and source commit being qualified. Local C:\\GHM may be out of sync with GitHub; do not present a local result as qualification of GitHub `main` unless the exact commit is recorded and matches.
3. Run a reviewed read-only verifier using `BEGIN READ ONLY`, database and session-role guards, `SET LOCAL ROLE ghm_schema_owner` (or the repository-approved role-setting pattern), all local migration files, and the canonical checksum helper including its legacy-CRLF compatibility.
4. Compare all ledger versions, names, and checksums; report missing, mismatched, unexpected rows, duplicate local versions, and duplicate ledger versions. A complete ledger requires all checks to pass.
5. Record the actual run timestamp, repository commit, target database identity, session role, local file count, ledger count, all discrepancy counts, verifier source, and exit status here. Do not record credentials.

### Current status

**Historical qualification recovered; fresh requalification pending.** The original command and sandbox environment filename are known, but no fresh database comparison has been run in this recovery step. No migration, credential change, deployment, or production action is authorized by this note. The founder's established PowerShell command-format preference remains mandatory for any local command supplied.

