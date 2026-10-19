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

## 2. Repository checkpoints (verified 2026-10-13)

| Repository | Main checkpoint | Documentation branch |
|---|---|---|
| GHM `zaidhqdev-sys/GHM` | `9718890d65cd5e63a63aca4503ec41d36d8f7eca` | `construction/connect-ghm-migration-handover-20261013` |
| ZAID Connect `zaidhqdev-sys/zaid-connect` | `abcffa73f893602c25310a58946bebb91fd7eeb5` | `construction/ghm-backend-migration-handover-20261013` |

These are source checkpoints, not proof of the live Render deployment or production data. No runtime changes were made in this audit.

## 3. Why this is urgent

Connect's Supabase project (`wxabopuyqblbpxkoudxy`) became inactive/unresolvable; browser requests to its Auth endpoint failed with `ERR_NAME_NOT_RESOLVED`. The app uses a central Supabase client for session lifecycle and many data operations. Changing sign-in alone cannot restore the app.

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
| Categories / offerings / capability catalogue | **Extend / Legacy-exclude by caller evidence** | Category routes exist but UI/filter parity remains open; capability evidence submission/review is missing; offering catalogue has no confirmed mounted production caller and remains legacy/unconfirmed unless new source evidence proves otherwise. |
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

**Current checkpoint:** the targeted cross-document reconciliation and final changed-file stale-claim/scope scan are complete for the recorded classifications. The 207-file GHM Markdown relative-link scan and all changed-file link checks (30 GHM / 7 Connect) found no broken local targets. The Relationships/Outcomes route-reachability statement and regional-filter classification are consistent; the separate directory contract now distinguishes bounded current scope from the approved-to-plan **Extend** parity gap. No stale next-batch/resume instruction was found in the changed files. PR #133 and Connect PR #34 remain open drafts; their final heads and review state are recorded in the session checkpoint. No code, runtime, database, production, provider, or cutover changes were made. Do not merge without the founder's explicit authorization.

1. Reconcile the operation-level classifications in this handover against `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`, `CONNECT_BACKEND_OPERATION_INVENTORY.md`, `GHM_CONNECT_BACKEND_READINESS_AUDIT.md`, `docs/GHM_CURRENT_STATE.md`, and the living operation contracts. Keep explicit **Build / Extend / Reuse candidate / Legacy-exclude / Evidence-insufficient** distinctions.
2. **Completed link audit:** 207 tracked GHM Markdown files plus all changed-file links in both PRs (30 GHM / 7 Connect) had no broken relative/local targets. The newly clarified directory-contract sentence introduced no links. The final targeted changed-file scan found no remaining flagged stale route/regional classifications or obsolete resume instructions. If files or links change after this checkpoint, repeat the relevant checks.
3. Reconcile the matching Connect integration architecture/specification, current-state audit, master index, ownership matrix and companion handover against the same classifications.
4. Refresh PR #133 and Connect PR #34 metadata after the last documentation commit; record exact head SHAs and review status in the final audit response. Keep both drafts unmerged until the final diff review passes and the founder explicitly authorizes merge.
5. No implementation, data migration, provider activation, production changes or cutover during this documentation pass.

**Do not merge either documentation branch until all affected docs are reconciled and reviewed as a set, and the founder has been told what remains.** No implementation, migration, production changes or cutover before then.

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
- `businessOfferingService` / `catalogueService` appear as facade exports, but current repository search did not identify a production UI caller. Do not include the full offerings CRUD domain in the launch migration until an active caller is confirmed. This does not remove the separately confirmed active business-category/capability/directory needs.
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


---

## Session continuity checkpoint — 2026-10-17: sandbox forensic audit

### Why this checkpoint exists
This checkpoint preserves the exact evidence from the 2026-10-17 troubleshooting session so a new chat does not repeat the credential investigation. It supersedes guesses made before the sandbox target and role switch were verified.

### Confirmed connection and credential facts
- The active local `.env` targets main database `ghm_db` at the main Render Postgres host. It is not the sandbox audit URL.
- The sandbox is `ghm_payfast_sandbox_db`, using the external host `dpg-db4416vlk1mc73eocug0-a.frankfurt-postgres.render.com` for local-machine connections.
- Both `.env.sandbox-used-20261011` and `.env.sandbox-used-20261011.before-runtime-password-fix-20261012-215200` authenticated successfully as `ghm_migrator` to the sandbox. The tests printed only PASS/FAIL and did not print credentials.
- `.env.sandbox-used-20261011.before-role-reset-20261012111115` has a malformed duplicated hostname suffix; do not use it as-is.
- Passwords in both valid-looking sandbox backups differ from the active main `.env` password. Do not reset credentials again merely to repeat this investigation.
- The sandbox connection check used a read-only transaction and verified `current_database() = ghm_payfast_sandbox_db`, `current_user = ghm_migrator` before `SET ROLE`, and `current_user = ghm_schema_owner` / `session_user = ghm_migrator` after `SET ROLE`.

### Local checkout and audit run
- User's local branch at the time of the run: `construction/ghm-connect-payfast-business-mapping`.
- Local `scripts/forensic-migration-reconciliation.mjs` on that branch hard-coded `ghm_db` in both authority checks and therefore rejected the sandbox before reconciliation.
- A local-only patch changed both comparisons to use `process.env.GHM_MIGRATION_AUDIT_DATABASE || 'ghm_db'`. A backup was created as `scripts/forensic-migration-reconciliation.mjs.before-expected-db-fix`. This local patch is not a production change and should not be blindly copied over the reviewed PR implementation.
- With `GHM_MIGRATION_AUDIT_DATABASE=ghm_payfast_sandbox_db` and `DATABASE_SSL=true`, the local audit completed its read-only reconciliation and authority passed.

### Local audit output (pre-PR-baseline reconciliation)
- Repository migrations: 77; sandbox ledger rows: 78.
- Exact matches: 77.
- Missing: 0.
- Unexplained checksum mismatches: 0.
- Name mismatches: 0.
- Extra ledger row: version `20261012120000`, name `revoke_runtime_business_mapping_table_access`, checksum `ff68151174f28cb47f82e99a575d8ae58b9ac5198a1a200779b55cf735a545ad`, applied at `2026-10-12T17:39:04.169Z`.
- The local version reported 16 orphaned provenance exceptions and verdict `INVESTIGATE`. This is the pre-policy-fix implementation; do not assume those 16 are truly orphaned without using the reviewed policy from PR #140.
- The observed migration SQL in Git history revokes `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` on `ghm.business_external_mapping` from `ghm_runtime`, with comments saying payment preparation uses a SECURITY DEFINER lookup function.

### Branch provenance / unresolved baseline issue
- The current local branch HEAD does not contain `database/migrations/20261012120000_revoke_runtime_business_mapping_table_access.sql`.
- Git history shows it on `origin/construction/ghm-mapping-runtime-table-revoke`, commit `2c3a837` (“Revoke direct runtime access to external business mappings”).
- The command trying `origin/fix/migration-audit-checksum-policy` failed locally because that remote-tracking ref was unavailable. This does not mean the GitHub PR/branch is absent.
- GitHub confirms PR #140, [Fix forensic migration checksum reconciliation policy](https://github.com/zaidhqdev-sys/GHM/pull/140), is open and unmerged; head branch `fix/migration-audit-checksum-policy`, head SHA `e3a864f3aa90910ee91d782299f856f7570f4da5`, base `main`. The reviewed PR already makes the expected database configurable, wraps the audit in `BEGIN READ ONLY`, supports canonical/CRLF checksums, and distinguishes historical provenance from orphaned exceptions.
- The sandbox's one extra row is therefore a migration-baseline/branch discrepancy until proven otherwise. Do not delete the live ledger row, rewrite the migration ledger, or add an exception merely to force PASS.

### Required continuation — start here next session
1. Inspect PR #140's exact migration inventory and compare it with branch `construction/ghm-mapping-runtime-table-revoke` and the local branch. Establish the intended release migration baseline and whether the revocation migration should be included.
2. Do not cherry-pick or merge branches automatically; review migration dependencies and intended runtime privilege model first.
3. Once the intended migration baseline is known, run the reviewed PR #140 audit implementation against the sandbox using the known-good sandbox connection candidate, explicitly setting `GHM_MIGRATION_AUDIT_DATABASE=ghm_payfast_sandbox_db`.
4. Reassess historical exception classifications using the PR #140 implementation. Preserve exception records unless evidence and an approved review justify a change.
5. Keep all local `.env*` files untracked and out of commits. Local status showed multiple untracked environment backups and `tmp-list-sandbox-accounts.mjs`; inspect before staging anything.
6. No migration was run; no database writes, credential/role changes, production settings changes, deployments, merges, or cutover approvals were made in this session.

### Continuity and safety rule
Start from this checkpoint and the open PR #140, not from another password reset. Sandbox forensic verdict is still unresolved/INVESTIGATE until the migration baseline discrepancy is reconciled. No production launch or cutover is authorized.


## Cross-repository continuity checkpoint — 2026-10-19

QuoteFlow main has a GHM identity client (GET /api/v1/identity) and gated Android sandbox panel, but normal AuthProvider/login/signup still use Supabase and env validation still requires Supabase URL/key. Five sandbox app checks passed for one dedicated account; GHM-only logout left the Supabase session untouched. This is not a completed auth/backend migration. QuoteFlow PRs #12/#13/#14/#15/#18 are merged; provider replacement, complete Supabase caller inventory, explicit legacy-to-canonical mapping, data/RPC/storage parity and E2E acceptance remain open.

Use a product-specific operation audit rather than copying Connect gaps wholesale into QuoteFlow. For every active Supabase operation record source caller, resource/data semantics, current authorization, GHM target contract, parity gap, acceptance test and migration/rollback needs. Resolve identity from authenticated GHM context; selected business IDs are hints and membership must be verified server-side. Never infer identity mapping from email/name/slug or coincidental IDs.

Next: audit QuoteFlow auth lifecycle, organization bootstrap/context, membership/subscription/legal records, quote/customer/project persistence, RPCs, storage and all SDK imports; classify missing capabilities as Build/Extend; specify reviewed legacy UUID-to-GHM mapping and conflict reports; qualify parity in non-production with exact-head CI and route-backed negative-case E2E. Production deployment, configuration changes, database mutations, provider activation and cutover remain unauthorized by this checkpoint. Existing Connect findings are shared architecture context, not proof of QuoteFlow-specific parity gaps.


## QuoteFlow source audit update — 2026-10-19

Targeted QuoteFlow main inspection identified Supabase dependencies in five operation groups: (1) auth/session restore, callback exchange, login, signup and logout; (2) organization context/create/complete RPCs; (3) legal-document and legal-acceptance reads plus accept_quoteflow_legal RPC; (4) subscription initialization and entitlement lookup RPCs; and (5) Supabase client/config/session persistence itself.

Separately, inspected product data modules for business profile, customers, quotes, invoices and items use device-local AsyncStorage scoped through accountStorage. Dashboard surfaces a device-only storage warning when Supabase is not configured. This means data persistence strategy is mixed; do not assume these product records are currently cloud-hosted, and do not automatically migrate them to GHM without an explicit product decision and ownership/offline/conflict plan.

The identity client currently provides identity retrieval, not product-data parity. Next work is to finish the complete source/import inventory, inspect database migrations/RLS/RPC definitions, compare each operation to deployed/source GHM contracts, and write acceptance tests before implementation. These are targeted source findings only; no runtime calls, production changes or database mutations were performed.


## Critical GHM identity route availability check — 2026-10-19

Read-only comparison of GHM main source with the client contract found a release/branch mismatch:
- GHM main's src/http/app.ts does not register GET /api/v1/identity.
- GHM PR #148 (https://github.com/zaidhqdev-sys/GHM/pull/148), "authenticated QuoteFlow identity context endpoint", is still draft/unmerged at inspected head 807a41d4de9dbfaa326ab6b66b69307fb7de9416.
- GHM PR #137 (https://github.com/zaidhqdev-sys/GHM/pull/137), "expose authenticated canonical identity resolution", is also draft/unmerged at inspected head 3d394112c973a027a0e1a271f80c172b8d7385b8.
- QuoteFlow's client is merged to QuoteFlow main and the dedicated ghm-identity-qualification sandbox service has reported successful route qualification, but this does not prove that the route exists in GHM main or the main production runtime.

Treat GET /api/v1/identity as a sandbox-qualified integration contract, not an available production-main API, until the exact GHM implementation is reviewed, merged through the required documentation/security gates, deployed to a verified non-production target, and route-backed E2E is repeated. Do not switch QuoteFlow's normal provider or enable production configuration based on sandbox availability alone. Resolve this branch/deployment parity gate before production cutover.


## Branch-aware reconciliation correction — 2026-10-19

This section supersedes any earlier wording in this checkpoint that could be read as saying the identity endpoint or all related gap analysis does not exist. Re-check branch/PR state before restarting work.

### Existing integration candidate and qualification evidence
- GHM PR #142, branch integration/ghm-identity-merge-candidate-20261018, head d74d340587615939ba46b08d9b1612d3f1184ef8, is an integration candidate containing GET /api/v1/identity in src/http/app.ts, backed by canonical account/membership resolution and selected-business authorization. Its PR-triggered CI run completed successfully.
- GHM PR #148, branch feat/quoteflow-identity-context-contract-20261019, head 807a41d4de9dbfaa326ab6b66b69307fb7de9416, also contains the QuoteFlow identity-context endpoint; its PR-triggered CI run completed successfully.
- GHM PR #137, branch construction/identity-resolution-api-20261016, head 3d394112c973a027a0e1a271f80c172b8d7385b8, contains the broader canonical identity work; remains draft/unmerged.
- Connect PR #39, head feeb3d781b2ed9583b62ef84dcaf6bec8aecbb9c, contains the integrated GHM browser auth/session path, same-origin proxy, identity resolver, and first marketplace clients. Its configured auth contract workflow passed.
- Connect PR #40, head 00342050ebda4decc07d7fced25724075c6baa18, adds fail-closed role mapping and regression coverage. Its configured auth contract workflow passed.
- These branches are not merged/deployed by this evidence. GHM main still lacks the route at the inspected main SHA. Treat candidate CI as construction evidence, not hosted E2E or production readiness.

### QuoteFlow reconciliation PR dispositions
- GHM PRs #51–55 were merged: organization-to-GHM business semantics, legal-acceptance ownership analysis, subscription/entitlement analysis, identity-mapping boundary, and identity-link authority boundary.
- GHM PRs #56–62 were closed unmerged. Do not count their branch-only content as accepted/mainline decisions without recovering the relevant contracts from the branch/PR history and confirming the latest authority decisions. This set includes customer, business-profile, quote, item, invoice, notification and dual-sided identity-link work.
- The mainline capability inventory still states QuoteFlow product adapter and controlled cutover are open; production Connect and QuoteFlow remain on Supabase. Construction qualification of individual GHM resources does not establish product-level parity.

### Next execution step — continue existing work, do not restart
1. Reconcile GHM #142 with #148/#137 and the latest GHM mainline/docs. Select one integration candidate; avoid duplicating or independently rebuilding identity endpoints.
2. Compare QuoteFlow's src/lib/ghmAuthTypes.ts parser and GET /api/v1/identity request/response against the selected GHM route and exact HTTP tests. Preserve canonical numeric GHM account/business/membership IDs and fail-closed selected-business authorization; do not map to legacy UUIDs implicitly.
3. Recover and reconcile the decisions in closed-unmerged QuoteFlow ownership PRs #56–62. Keep local-only product data local unless an explicitly approved GHM resource and mapping are qualified; QuoteFlow Quote depends on Customer and Item semantics, so do not migrate Quote in isolation.
4. Continue the existing implementation branches only after exact-head contract tests; then verify deployed non-production login/restore/refresh/logout/revocation, selected-business authorization, and product journeys.
5. No merge, production deployment, data migration, provider activation, shadow traffic or cutover is authorized by this documentation update. Explicit authority gates in the original handovers remain in force.


## Authoritative QuoteFlow migration status reconciliation — 2026-10-19

Use the current GHM mainline architecture contracts below as the authority; earlier branch-only identity-link proposals are historical where the documents explicitly say they were superseded.

### Already constructed/qualified migration primitives (not product cutover)
- Canonical runtime identity is GHM ghm.account_identity.id; business context is GHM ghm.business.id plus active ghm.business_membership. Supabase user/organization UUIDs are migration provenance only, never runtime identity/authorization keys.
- GHM's (provider=supabase, subject=<exact legacy UUID>) → account_identity.id external-identity provenance mapping and credentialless account-provisioning boundary have construction qualification. Existing-account reconciliation executor and deterministic migration snapshot/dry-run manifest are also recorded as qualified in QUOTEFLOW_EXISTING_USER_MIGRATION_BOUNDARY.md.
- The migration reset/re-enrollment HTTP path is constructed, but complete DB + HTTP ceremony qualification remains open (anti-enumeration, one-time recovery, rollback, session revocation, post-reset session proof, and non-production end-to-end). Do not assume old password hashes or Supabase sessions can be imported.
- The legacy organization → GHM Business reconciliation contract is qualified only for synthetic outcomes; live Business provisioning remains unqualified. Organization creation/reuse, membership/status semantics, legal acceptance, and subscriptions do not have a safe 1:1 mapping by assumption.
- GHM's QuoteFlow identity route exists on integration branches (not main at the inspected main SHA). The candidate route returns canonical account/membership/business context and checks a selected business against authenticated active membership. Candidate CI passed; this is construction evidence, not deployment qualification.
- Earlier GHM QuoteFlow PRs #51–55 merged their architecture decisions. PRs #56–62 closed unmerged and are not themselves mainline acceptance of their branch-only content. Current mainline reconciliation contracts now supersede parts of that old identity-link proposal; use current docs such as QUOTEFLOW_GHM_CANONICAL_IDENTITY_RECONCILIATION.md, QUOTEFLOW_EXISTING_USER_MIGRATION_BOUNDARY.md, QUOTEFLOW_MIGRATION_ACCOUNT_PROVISIONING_CONTRACT.md, QUOTEFLOW_MIGRATION_BUSINESS_PROVISIONING_CONTRACT.md, and QUOTEFLOW_MIGRATION_RESET_REENROLLMENT_CEREMONY.md.

### Product ownership and parity decisions
- QuoteFlow business profile, customers, quotes, invoices and catalog items are currently local-first/device-owned through AsyncStorage. Do not auto-upload or rewrite local storage IDs. A deterministic, atomic, recoverable storage-scope transition is a cutover prerequisite.
- QuoteFlow Quote has structural overlap with GHM Quote, but QuoteFlow Customer/Item and organization/business identity are not automatically equivalent to their GHM counterparts. Quote/Customer/Item migration must be planned as a dependency graph with explicit ownership/ID mapping, not as isolated adapters.
- Legal acceptance remains QuoteFlow/Supabase-owned for now: the flow permits account-level acceptance before any organization exists; no canonical GHM legal-acceptance resource or ownership decision authorizes moving it.
- Subscription and entitlement remain QuoteFlow/Supabase/product-owned for now. GHM's commercial/payment primitives do not imply QuoteFlow subscription status, plan, entitlement, provider or webhook parity. No paid provider activation.
- Device-local notifications remain local; no server-side push delivery or notification migration is established.
- Individual GHM resource construction (Customer, Quote, Project Quote, storage, etc.) does not prove the QuoteFlow product workflow is parity-qualified or authorize product traffic.

### Exact next execution sequence
1. Reconcile GHM PR #142 integration candidate with #148 and #137 into one candidate branch, preserving the latest migration audit policy changes; don't duplicate the route or merge branches just to make the endpoint appear on main.
2. Qualify the candidate identity HTTP contract against QuoteFlow src/lib/ghmAuthTypes.ts and src/lib/ghmAuthClient.ts, including nullable account email, all-memberships response, selected-business success, invalid/inactive/unauthorized business failures, expired/revoked token, and route registry authorization. Run exact-head CI and non-production HTTP E2E.
3. Complete the migration reset/re-enrollment ceremony qualification and the live Business-provisioning qualification before using real migrated account/business state.
4. Implement an operation-by-operation QuoteFlow adapter matrix using the current GHM contracts and product ownership decisions. Keep legal acceptance/subscriptions local/source-owned until separately authorized; explicitly preserve local-only product data or design an approved mapping/migration plan for it.
5. Only then integrate the canonical GHM session into QuoteFlow's normal AuthProvider and migrate the organization context to GHM business context, with deterministic/recoverable local-storage scope migration. Do not perform a superficial provider swap while organization RPCs still require Supabase.
6. Remove Supabase runtime dependencies only after every active caller is replaced or formally excluded with source/build evidence, and exact-head CI plus route-backed product E2E pass. Production migration/cutover remains a separate explicit approval gate.

No production deployment, live database mutation, source data import, environment/routing change, provider activation, or cutover was performed by this checkpoint.


## Identity contract branch comparison — 2026-10-19

Compared QuoteFlow main's src/lib/ghmAuthTypes.ts and src/lib/ghmAuthClient.ts against GHM PR #142 and #148 source.

### Compatible contract fields
- QuoteFlow parser expects numeric canonical account/business/membership IDs, nullable account email, account fullName/phone/avatarRef/role, memberships with status/role, and nullable activeMembership/activeBusiness.
- GHM #148's AccountIdentity and ApplicationIdentity expose those fields; Date values serialize to ISO strings matching QuoteFlow's date parser. Its BusinessMembership may omit nested business summaries, which QuoteFlow's parser explicitly permits.
- QuoteFlow's client sends only optional businessId to GET /api/v1/identity and does not send an account ID. This preserves the server-authoritative identity boundary.

### Prefer the stronger parts of #148 when reconciling with #142/#137
- #148 adds getIdentityContext() to return the authenticated account's membership choices without treating ambiguous multi-business membership as an error.
- #148 rejects unknown/repeated/malformed query parameters and maps unauthorized/inactive selected businesses to 404 not_found, avoiding business-existence disclosure.
- #142's integration branch already includes the email projection, the route, and broader migration-audit policy protections. Its route uses resolveIdentity(), permits unrecognized query keys, and returns 403 for unauthorized selection. When reconciling, preserve #142's migration policy changes but carry forward #148's dedicated context operation, strict query allowlist and non-disclosing 404 behavior.
- #148's tests cover unauthenticated requests, multiple memberships without selection, explicit selection, unauthorized selection, and malformed query. Add/retain an explicit zero-membership/customer case and run the final merged candidate's exact-head suite.
- The route's presence and CI do not qualify deployed token expiry/revocation, runtime configuration, actual membership data, or QuoteFlow's full AuthProvider/product workflows.

This is a source comparison and construction recommendation, not a merge approval or deployment/cutover authorization.


## Work resumed — 2026-10-19 04:16 UTC

- Rechecked current PR metadata: #142, #148 and #152 remain open. #142 and #148 CI passed for the previously checked exact SHAs; Connect #39 and #40 auth-contract workflows passed for their checked SHAs. These are construction checks, not deployment/runtime qualification.
- Read the #148 service and HTTP tests directly. The service supports zero memberships, a sole membership, multiple memberships without implicit selection, and explicit selected-business validation. The HTTP route rejects unrecognized/repeated/malformed query values and maps unauthorized selection to 404.
- Added regression coverage on #148 branch `feat/quoteflow-identity-context-contract-20261019`, commit `18aa29c1347c498f8fddd16d0c57b4a14581447c`: invalid bearer token to `GET /api/v1/identity` returns 401 without calling the identity service. Exact-head CI was in progress at last check.
- Next: confirm exact-head CI, then reconcile #142's migration-audit protections with #148's dedicated identity-context service and stricter HTTP contract into one candidate. Avoid duplicate route registration and run the final merged candidate's complete test suite. Production deployment, live database changes, data import, runtime switches and cutover remain unauthorized/not performed.


### CI result update — 2026-10-19 04:22 UTC

- GHM #148 exact head `18aa29c1347c498f8fddd16d0c57b4a14581447c`: CI completed successfully after adding the invalid-bearer HTTP regression test (workflow run 39199110141). The test change is now CI-qualified at this exact SHA; broader runtime/deployment and cross-client contract qualification remain open.


## Identity-context reconciliation implementation — 2026-10-19 04:29 UTC

- Continued on GHM integration candidate PR #142 branch `integration/ghm-identity-merge-candidate-20261018` rather than merging the separate #148 route and creating a duplicate endpoint.
- Added `BusinessIdentityServiceImpl.getIdentityContext()` and its service contract; identity route now uses that operation, enforces the query allowlist (`businessId` only), rejects repeated/malformed/non-canonical selections, requires registered profile + business read access, and returns non-disclosing `404 not_found` for unauthorized/inactive selections.
- Added service tests for zero memberships and multiple memberships without implicit selection; replaced route tests to cover authenticated explicit selection, missing/invalid bearer authentication, malformed/unknown/repeated query parameters, and non-disclosing unauthorized selection.
- Exact candidate head after these code commits: `00273cb4e5661a89af2f504b6f15c8bc2d5258ea`. CI run [39199699582](https://github.com/zaidhqdev-sys/GHM/actions/runs/39199699582) was in progress at last check. Do not call this candidate qualified until that exact-head run completes successfully.
- This incorporates #148's relevant route/service contract into #142's broader migration-audit candidate; #148 remains a separate open draft and must not be merged independently as-is, because that would duplicate `GET /api/v1/identity`. #142 remains draft/open. No merge, deployment, production database change, or cutover occurred.
- Next: wait for exact-head CI; if passing, compare the final candidate's identity route and account email DTO with QuoteFlow's parser and add route-backed cross-client contract coverage. Then qualify non-production session expiry/revocation and the product workflow before changing QuoteFlow's normal AuthProvider.


## Follow-up verification — 2026-10-19 04:32 UTC

- GHM reconciled identity candidate PR #142 head `44d84ba582ed494105d0d93d590727c1085bf222` completed CI successfully (run [39199745905](https://github.com/zaidhqdev-sys/GHM/actions/runs/39199745905)). Its immediately preceding code head `00273cb4e5661a89af2f504b6f15c8bc2d5258ea` also passed CI (run [39199699582](https://github.com/zaidhqdev-sys/GHM/actions/runs/39199699582)). The passing head includes the identity-context route/service reconciliation and route/service regression tests. No deployed runtime or production behavior is implied.
- Opened QuoteFlow PR #20: https://github.com/zaidhqdev-sys/QuoteFlow/pull/20, branch `fix/ghm-identity-context-contract-20261019`, head `1368f65ecfe6b267eb43c462dccfcc9c1f869cc9`. It replaces the stale 409-selection-required expectation with the GHM non-disclosing 404 contract and adds a client test that multiple memberships are returned without selecting a business. QuoteFlow exact-head CI run [39199912721](https://github.com/zaidhqdev-sys/QuoteFlow/actions/runs/39199912721) was queued at last check.
- Current GHM PR #142 remains open/draft; QuoteFlow PR #20 remains open/draft. Next: confirm QuoteFlow #20 exact-head CI, then add a response-shape contract check tying GHM's route output to QuoteFlow's strict DTO parser. Keep normal QuoteFlow AuthProvider on its current path until storage-scope/data migration and remaining Supabase-backed workflows are safely addressed.


## Cross-repository contract test update — 2026-10-19 04:33 UTC

- QuoteFlow PR #20 exact head `1368f65ecfe6b267eb43c462dccfcc9c1f869cc9` passed CI (run [39199912721](https://github.com/zaidhqdev-sys/QuoteFlow/actions/runs/39199912721)). It now tests the GHM contract's non-disclosing 404 on unauthorized selected-business requests and the no-selection multi-membership response.
- Added further GHM route-level DTO-shape coverage on PR #142 branch, commit `5d8ec87a5a4abc610d968ef32960b551927cd3d9`: selected identity response includes canonical account email, numeric IDs, ISO date strings, required membership provenance fields, full Business DTO fields, and multi-membership responses remain unselected. This is aimed at QuoteFlow's strict `assertGhmIdentityResponse` parser contract. Exact-head CI for this latest GHM test change had not returned a run/result at last check; do not treat it as qualified until verified.
- GHM #142 remains open/draft. QuoteFlow #20 remains open/draft despite passing CI; it is test-only and does not enable GHM auth in the normal QuoteFlow provider. Continue to keep production cutover disabled.


### Latest exact-head CI result — 2026-10-19 04:34 UTC

- GHM PR #142 current code/test head `5d8ec87a5a4abc610d968ef32960b551927cd3d9` completed CI successfully (run [39200012152](https://github.com/zaidhqdev-sys/GHM/actions/runs/39200012152)). This head includes the identity-context service/route reconciliation and the expanded QuoteFlow-compatible DTO shape tests. It is still a draft PR and has not been deployed; runtime/session and end-to-end product qualification remain separate gates.
