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
| Business hours | Reuse candidate | GHM read/replacement service and tests exist. Verify HTTP method/path, schema, membership authorization and Connect payload semantics. |
| Categories / offerings / capability catalogue | Reuse/extend | Existing GHM routes/services. Qualify each actual Connect operation/lifecycle; registry entries do not prove parity. |
| Capability evidence + admin review | Extend/build | Connect has business submission and admin review screens. Inspected GHM capability router exposed list/get/create, not matching evidence submission/review endpoints. Specify private evidence access, verifier authority, review transitions and audit. |
| Founder directory governance | Build | Connect calls reviewer check, submission, queue/list, owner presentation and decision operations. No equivalent complete GHM founder-review workflow identified. |
| Opportunities | Extend | GHM opportunity detail and requirements routes exist. Connect needs marketplace list/filter, types and capability-requirement operations; full discovery contract not evidenced. |
| Projects + quotes | Reuse/extend | GHM project/quote routes exist. Verify open-project discovery, owner reads/updates/deletes, atomic create-with-opportunity, quote submission/edit and accept/reject semantics. Independent endpoints may not preserve RPC transaction guarantees. |
| Leads | Extend/build | Active workspace calls `leadService.getForBusiness` and status update on a separate `leads` model/RPC. Enquiries are not automatically equivalent; define list scope, lifecycle and status mapping. |
| Analytics | Build/extend | Active screen calls `businessAnalyticsService.getDashboard(businessId, days)`; expects leads, quotes, wins, conversion, engagement and recent activity. No equivalent GHM dashboard contract found in inspected HTTP surface. |
| Relationships + outcomes | Build | Active `RelationshipOutcomeScreen.jsx` calls both business relationship and outcome services; GHM inventory has no corresponding resources. Preserve lifecycle, verification, visibility, provenance and evidence. |
| Onboarding | Build/verify | Onboarding feature exports screens/journeys; facade RPCs cover progress, record, complete, dismiss. Verify active route/caller and exact behaviour; no GHM onboarding resource found. |
| Notifications | Reuse/extend | GHM routes exist. Compare list/read/all-read/create/ownership/delivery. Treat push and realtime as separate features; confirm active callers. |
| Support | Reuse/verify | GHM support routes exist. Compare customer/admin lists, messages, replies, status and permissions. |
| Reviews + trust | Reuse/extend | GHM routes exist. Verify creation/read/moderation and aggregate behaviour. Founder directory review is a different workflow. |
| Media/storage | Extend | GHM has R2 provider path and storage service currently limited to `business_logo`; no storage HTTP router identified in app registration. Expose policy-enforcing API; separate public logo from private evidence/workspace files. |
| AI proxy / quote analysis | Extend/build | AI client calls Supabase Edge Function. Trace active UI callers and quote-analysis persistence; replace with GHM-owned endpoint, server-only keys, authorization, limits and safe errors. No paid provider without approval. |
| Regional configuration | Verify; build only if active | Facade references exist. Prove active screen/service caller and requirements before building. |
| Browser push | Verify then extend/build if active | Helper writes subscription to Supabase. Prove invocation and delivery path before making it core scope. |
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

**Next action:** continue bounded source inspection and documentation reconciliation; do not begin code work.

1. Verify active Connect callers and exact payloads for profile editor, directory, onboarding, founder directory review, capability evidence, project/quote, regional config, AI/quote analysis, push, relationships/outcomes, support and reviews.
2. Inspect GHM route methods, input/output schemas and authorization for directory/business profile/hours/support/review/notification/project/quote/opportunity. Distinguish actual HTTP routes from resource registry/service methods.
3. Produce one operation-level matrix: **Reuse / Extend / Build / Legacy-exclude / Evidence-insufficient**, source paths, endpoint contract, authorization, acceptance test, dependencies and evidence state.
4. Reconcile these existing GHM docs rather than create competing truth: `docs/architecture/GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`, `GHM_CONNECT_BACKEND_READINESS_AUDIT.md`, `CONNECT_BACKEND_OPERATION_INVENTORY.md`, `docs/GHM_CURRENT_STATE.md`; and Connect's `INTEGRATION_ARCHITECTURE.md`, `INTEGRATION_SPECIFICATION.md`, `MASTER_INDEX.md`.
5. Update this handover after each batch with inspected files, exact branch/commit/PR status and the next one or two tasks.

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
- `src/features/onboarding/OnboardingPanel.jsx` invokes onboarding progress read and action methods, but is gated by `featureFlags.guidedOnboarding`; record the feature flag and actual route reachability as an explicit activation check, not automatically as always-visible launch scope.

### Required matrix corrections

1. Business hours: GET is a reuse candidate; replacement is an HTTP-surface gap until a mutation route with authorization, schema and integration tests is present.
2. Business profile/directory: engagement tracking is an active dependency. GHM directory/profile reads must be compared with Connect's field allowlist, slug/ID semantics, owner preview fallback and the event kinds above.
3. Directory review and capability evidence are confirmed active administrative workflows, not speculative facade exports. The replacement contracts must preserve founder/verifier authority and review decisions.
4. Onboarding remains a verified feature-flagged caller; confirm flag configuration and screen mounting before assigning launch-critical priority.

No code or production changes were made. Continue the operation-by-operation audit and documentation reconciliation; no merge/cutover authorization is implied.


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

No runtime or production change was made. Next batch: compare Connect's directory query/output and support/review/notification facade contracts to these exact HTTP shapes; then reconcile the remaining source-of-truth docs and produce the operation-level matrix.


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

No code or production changes. Next batch: compare Connect notification/support request payloads and status enums against GHM route parsers, then verify all doc links and PR diffs before continuing the full repository reconciliation.

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

No code or production changes were made. Next task: inspect exact Connect support request/reply/status fields and GHM parser enums; then finalize the operation-level matrix and finish source-of-truth document reconciliation.

## 15. Support contract comparison — exact fields and status values

Connect's active customer support panel validates subject length 3–160 and description length 10–4000, creates with `category, subject, description, businessId`, lists its own requests, reads messages, and replies with message body. The admin panel lists requests, reads/replies to messages, and updates status with optional resolution summary. UI options include `open`, `in_progress`, `resolved`, and `closed`; resolution summary is supplied for resolved/closed requests.

GHM `src/http/support-request-router.ts` currently validates the same status set (`open | in_progress | resolved | closed`), create fields `businessId/category/subject/description`, admin status `status/resolutionSummary`, and message body. It exposes `GET/POST /api/v1/support-requests`, `GET /:requestId`, `PATCH /:requestId/status`, and `GET/POST /:requestId/messages`. Route-level roles distinguish customer create/reply from admin status updates; service-level membership/ownership still requires integration tests.

**Updated classification:** support is a strong **Reuse candidate**, with adapter work needed for Connect's `getMine/getAdmin/getMyMessages/getAdminMessages/replyAsCustomer/replyAsAdmin/setStatusAsAdmin` facade shape and GHM's `supportRequests/messages/message` response envelopes. Verify customer ownership, admin list defaults (Connect requests 100 records while GHM defaults/limits are parser-defined), resolution-summary rules, and request/message ID compatibility. Do not mark full parity until those tests pass.

No implementation or production changes. Resume with the operation-level contract matrix and documentation reconciliation.

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

### Classification update

- Onboarding = **Build** (active flag, no GHM contract identified).
- Analytics dashboard = **Build**, preserving Connect's metrics and authorization.
- Regional configuration + directory filters = **Extend**, limited to active filter needs.
- AI proxy = **Replace transport behind existing fail-closed gate**; provider activation remains unauthorized.
- Do not treat old provider integrations as launch approval.

No runtime or production changes. This is an audit/documentation checkpoint only.

