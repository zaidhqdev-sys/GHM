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
- `GHM_CONNECT_BUSINESS_PROVISIONING_LINKING_CONTRACT.md` contains the legacy Business UUID mapping provider key and a historical sentence that Supabase Auth remains the Connect production session authority.
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
