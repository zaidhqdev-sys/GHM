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
