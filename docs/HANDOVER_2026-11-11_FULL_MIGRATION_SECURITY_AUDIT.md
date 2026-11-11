# Handover — full migration security inventory (2026-11-11)

## Scope and exact source

- Repository: `zaidhqdev-sys/GHM`
- Pull request: #272 — `integration/capability-gateway-qualification-20261110`
- Audited immutable PR head: `ee753ba8c6cb4a48c3ff1d46c1fe9fde6eaadbf2`
- Inventory: recursively enumerated the repository tree (923 entries), identified 115 files under `database/migrations/`, and performed a first-pass source scan across all 115 for function definitions, `SECURITY DEFINER`, runtime EXECUTE grants and direct runtime DML grants.
- This is a first-pass inventory, not a complete effective-privilege proof. Historical grants/revokes, default privileges, role memberships, dynamic SQL, all application call sites and the production catalog still need reconciliation.

## Confirmed implemented and qualified scope

The existing PR implements signed Actor Gateway operations for self identity, Business registration identity, Business profile, supplier classification, capability catalogue governance and the four Business Capability mutation/evidence operations. Its manual cutovers are disposable-PostgreSQL qualified but remain unapplied in production.

The current PR description records exact-head CI run #3013 on the earlier code/test head and #3013 on the latest code/test batch; current PR head is now `ee753ba8c6cb4a48c3ff1d46c1fe9fde6eaadbf2`. Do not assume a previous workflow run is exact-head qualification for this newer commit. Recheck workflows before any merge decision.

## New actor-binding candidates found outside the PR's existing gateway scope

These database functions remain defined as `SECURITY DEFINER` and historically grant EXECUTE to `ghm_runtime`. They accept account IDs as ordinary parameters and rely on membership checks rather than independently proving that the supplied account ID is the authenticated actor:

- `ghm.replace_business_hours(bigint,bigint,jsonb)` — `database/migrations/20260916223000_create_business_hours.sql`; checks active owner/administrator membership for the supplied account and Business.
- `ghm.create_saved_business(bigint,bigint)` and `ghm.delete_saved_business(bigint,bigint)` — `database/migrations/20260916230000_create_saved_business.sql`; creation accepts arbitrary account ID after checking Business eligibility; deletion scopes the row to the supplied account ID. The Resource API repository currently passes `context.userId` from its verified AuthContext, but direct runtime EXECUTE is not cryptographically actor-bound.
- `ghm.create_campaign(bigint,bigint,text)` and `ghm.update_campaign(bigint,bigint,text,text)` — `database/migrations/20260918180000_create_campaign.sql`; enforce owner/administrator membership for the supplied account ID, while the Resource API repository supplies `context.userId`.
- `ghm.calculate_business_trust_score(bigint,bigint)` — `database/migrations/20260916250000_extend_business_profile_trust_inputs.sql`; enforces owner/administrator membership for the supplied account ID; Resource API supplies `context.userId`.

These are not established production exploits. The current HTTP/resource paths authenticate and pass the verified context actor. The gap is that the database SECURITY DEFINER boundary trusts the caller-supplied actor parameter when the shared runtime credential executes the function directly. These operations are candidates for a subsequent signed gateway batch, or for an explicit documented decision that their current runtime trust model is acceptable.

## Direct table DML candidate

`ghm.account_onboarding_progress` grants `SELECT, INSERT, UPDATE` directly to `ghm_runtime` in `20261110100000_create_account_onboarding_progress.sql`. Its current router and repository derive `account_id` from verified `AuthContext.userId`; the table ACL itself does not enforce per-account ownership. Decide whether to move this to actor-bound database functions/gateway wrappers or retain the application-only tenant boundary with an explicit threat-model rationale and negative tests.

## Storage persistence review

`ghm.storage_mark_deletion_pending(bigint)` is SECURITY DEFINER and executable by `ghm_runtime`. Its body changes a pending/available object to `deletion_pending` based only on object ID. The current `StorageService.deleteObject` first loads the object through actor-scoped `storage_get_object(id, context.userId)` and calls `authorization.assertCanDelete` before invoking the metadata repository mutation. This is currently an internal persistence method, not a public HTTP route accepting arbitrary object IDs directly. Do not classify it as a confirmed gap until every caller and the threat model for direct runtime SQL invocation are reconciled. Consider making the persistence mutation callable only through a database assertion bound to the authorized caller or narrowing its execution principal.

## Authentication and service-internal SECURITY DEFINER inventory

The migration scan also found runtime-executable auth lifecycle functions with account/session IDs, including `auth_set_password`, `auth_create_session_with_refresh`, `auth_validate_session`, `auth_revoke_session`, `auth_revoke_all_sessions_for_account`, `auth_change_password`, `auth_disable_account`, `auth_issue_recovery`, and recovery redemption. Current TypeScript persistence methods are server-side service methods; `GhmAuthService` exposes register/login/refresh/logout, not account disable. Trace each public call path and its provenance before deciding whether these belong behind the Actor Gateway. Do not blindly revoke auth functions: registration, login, refresh, password recovery and password reset require carefully preserved service access.

Other function families seen in the first-pass scan include commercial payment settlement, QuoteFlow migration provisioning/reset enrollment, business registration, directory review, business capability verification/evidence, founder reviewer helpers, Connect integration lifecycle, and storage metadata. Several have later migrations or manual cutovers that supersede their historical grants. Effective privileges must be computed from the complete ordered migration/cutover history rather than treating every historical GRANT as still active.

## Current call-path evidence

- Saved Business repository passes `context.userId` to create/delete functions inside `withAuthorizedTransaction`.
- Business Hours repository uses `withTenantTransaction`, checks owner/administrator tenant role, then passes `context.userId`.
- Campaign repository passes `context.userId` inside `withAuthorizedTransaction`.
- Trust Score repository passes `context.userId` inside `withAuthorizedTransaction`.
- Onboarding repository uses `withAuthorizedTransaction` and derives account ID exclusively from `context.userId`.
- Storage deletion service retrieves metadata for the caller and checks `assertCanDelete` before marking deletion pending.

These application controls are useful and must be preserved, but do not by themselves make the database function independently actor-bound.

## Next work — do not repeat completed batches

1. Reconcile the effective final ACLs for each candidate function, including later migrations, manual cutovers, PUBLIC grants, role inheritance and default privileges.
2. Trace all call sites and tests for the candidate operations above, then select a small coherent signed Actor Gateway batch. Preserve existing request/response contracts.
3. Add negative disposable-PostgreSQL tests proving the runtime principal cannot invoke legacy actor-ID RPCs after cutover, and that the signed gateway can still complete each operation with verified actor provenance.
4. Decide the onboarding direct-DML boundary and storage cleanup mutation boundary with explicit evidence.
5. Update this handover and `docs/GHM_CURRENT_STATE.md` after each completed batch; do not claim the full repository audit is complete until every migration, effective ACL and app call path is reconciled.

## Safety / release state

- No production migration, role/grant change, secret provisioning, deployment or data mutation was performed during this audit.
- No manual cutover has been applied to production.
- No paid infrastructure was introduced.
- Do not merge PR #272 merely because earlier workflow runs passed; verify exact current-head CI and reconcile the documentation/source state first.
- Production cutover remains blocked on Render support's written role-model resolution and a fresh independently verified production backup. The last known Render backup is 4 November 2026; do not assume a newer backup exists.
- PayFast remains paused until its sandbox is available. Approved legal-document work remains parked.


## Follow-up source verification — exact call paths and storage correction (2026-11-11)

### Saved Business is the strongest confirmed candidate

The SQL body of `ghm.create_saved_business(bigint,bigint)` validates positive IDs and Business eligibility but does **not** check membership or any relationship between `p_account_id` and the authenticated actor. `ghm.delete_saved_business(bigint,bigint)` deletes by both caller-supplied saved-row ID and caller-supplied account ID. Both functions are SECURITY DEFINER and explicitly executable by `ghm_runtime`; no later migration found in the inspected follow-up set revokes those grants.

The current Resource API repository correctly passes `context.userId` from AuthContext inside `withAuthorizedTransaction`. This protects the ordinary application path, but direct runtime database execution can create a saved-business row for another account (and can delete another account's row if the ID/account pair is known). Treat this as a confirmed database actor-provenance weakness, not evidence that it has been exploited. This should be the first narrow remediation target.

### Other actor-ID functions

- `ghm.replace_business_hours(bigint,bigint,jsonb)`: SECURITY DEFINER, runtime EXECUTE; validates active owner/administrator membership for supplied account/business. Repository uses `withTenantTransaction`, checks owner/administrator role, then passes `context.userId`. No database cryptographic actor binding.
- `ghm.create_campaign(bigint,bigint,text)` and `ghm.update_campaign(bigint,bigint,text,text)`: SECURITY DEFINER, runtime EXECUTE; validate owner/administrator membership for supplied account ID. Repository passes AuthContext.userId inside `withAuthorizedTransaction`. No independent actor binding.
- `ghm.calculate_business_trust_score(bigint,bigint)`: SECURITY DEFINER, runtime EXECUTE; validates owner/administrator membership for supplied account ID. Repository passes AuthContext.userId inside `withAuthorizedTransaction`. No independent actor binding.
- `ghm.set_business_logo_object(bigint,bigint,bigint)` (defined in `20261106090000_business_logo_storage_binding.sql`) also accepts a caller-supplied account ID and checks owner/administrator membership. It is runtime-executable; include it in the same effective-ACL/call-path inventory. Do not miss it when assessing storage-related actor provenance.

### Onboarding direct DML confirmed

The migration grants `SELECT, INSERT, UPDATE` on `ghm.account_onboarding_progress` to `ghm_runtime` and sequence USAGE/SELECT. The repository uses `withAuthorizedTransaction` and binds every account predicate/insert to `context.userId`; the service requires authenticated context. The table itself has no row-level ownership enforcement. This is a deliberate app-enforced tenant boundary today, but direct runtime SQL can read or mutate another account's onboarding rows. Decide whether to add signed database operations or explicitly accept this trust model with a documented threat-model decision and tests.

### Storage persistence correction and exact boundary

The earlier first-pass note that the one-argument `storage_get_object(bigint)` remained active is superseded. Migration `20261026120000_scope_storage_metadata_lookup.sql` replaces it with `storage_get_object(bigint,bigint)`, checks public-logo eligibility or active membership for the supplied account, revokes runtime EXECUTE on the one-argument overload and drops it. The current repository passes `context.userId` to the two-argument getter. The lookup is application-account-scoped, but still trusts the account ID supplied by the shared runtime credential.

The lifecycle mutators `storage_create_pending`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted` are SECURITY DEFINER and runtime-executable without an actor argument. Current StorageService calls them only after its authorization adapter checks the caller/tenant and, for deletion, calls `assertCanDelete` before state mutation. The repository transaction is AuthContext-bound. These functions are an intentionally privileged internal persistence API, but a compromised runtime credential can invoke them with arbitrary object IDs/business IDs. This should be documented as a trusted-runtime boundary; do not describe it as an unauthenticated public route or assume the object-ID-only SQL function independently authorizes the tenant. Any hardening must preserve upload completion, retryable deletion_pending recovery, provider deletion ordering and metadata lifecycle semantics.

### CI and current PR state

PR #272 exact documentation head `576c912fe99e359d1a2962f722fe67e76b8ffe61` passed GitHub Actions run #3021 (`43088196513`): both `quality` and `web-quality` completed successfully. This qualifies the documentation commit, not any future implementation commit. PR #272 remains open and unmerged.

### Updated next-batch order

1. Remediate Saved Business create/delete actor provenance first; add a signed gateway operation or equivalent database-verifiable actor binding and disposable PostgreSQL negative tests. Preserve existing Resource API contracts and row DTOs.
2. Assess whether Campaign + Business Hours + Trust Score + Business Logo object binding should be grouped into a second gateway batch; do not simply wrap every function without checking operation semantics and tests.
3. Decide the onboarding direct-DML tenant boundary explicitly.
4. Decide whether storage lifecycle mutators should remain trusted internal persistence operations or require an additional signed context. If changed, qualify the full lifecycle including retry and cleanup.
5. Reconcile effective ACLs and all later migrations/cutovers for each function before declaring a batch complete.


## Saved Business historical qualification correction (2026-11-11)

The dedicated qualification record `docs/architecture/SAVED_BUSINESS_QUALIFICATION.md` now explicitly distinguishes its historical application-path PASS from the database actor-provenance boundary that was not tested.

- Runtime table SELECT on `ghm.saved_business` permits direct cross-account reads with the shared runtime credential; repository `WHERE account_id = context.userId` does not constrain direct SQL.
- Runtime EXECUTE on the legacy SECURITY DEFINER create/delete functions permits caller-supplied account IDs; create does not independently verify actor ownership.
- Existing cross-account tests invoke the repository with a different AuthContext. They do not prove that direct SQL with a forged account ID is denied.

This is now an explicit OPEN / NOT QUALIFIED security issue, not a closed qualification. The historical functional qualification remains valid for its tested app path. No production state changed.

## Saved Business gateway design decision for implementation batch

Keep the existing resource contract unchanged: private relationship rows, the current eligibility predicate, unique `(account_id,business_id)` behavior, DTOs, list ordering, and separate read/create/delete operations. Do not introduce toggle or expose a public business projection through this API.

Required target boundary:

1. Actor Gateway authenticates the original ES256 GHM access token once and derives `actorAccountId` only from its verified subject.
2. Add gateway routes for list, get-by-ID, create, and delete. The resource API forwards the original bearer token; production routes fail closed if the gateway is missing. Never accept account IDs in request bodies, query strings, or route parameters.
3. Add HMAC assertion operations `saved_business.read`, `saved_business.create`, and `saved_business.delete`. Bind full context: list uses an explicit empty operation context; get binds savedBusinessId; create binds businessId; delete binds savedBusinessId. Use one-use nonce, timestamp, operation, actor and exact JSON context, as in the existing v2 protocol.
4. Add SECURITY DEFINER gateway wrappers owned by `ghm_schema_owner`, fixed `search_path = pg_catalog, ghm`, executable only by `ghm_actor_gateway`. Wrappers verify the signed assertion before querying or mutating rows. Create/delete call the existing domain functions only inside the wrapper after assertion validation; actor ID is supplied from the signed actor. Read/list wrappers enforce `account_id = verified actor` in SQL.
5. Manual-only cutover revokes runtime SELECT on `ghm.saved_business`, revokes legacy create/delete EXECUTE from PUBLIC/runtime/migrator/gateway as appropriate, and revokes sequence USAGE if no remaining runtime path requires it. Verify effective table/column ACLs, PUBLIC defaults and role inheritance; do not rely on source GRANT statements alone.
6. Disposable PostgreSQL qualification must demonstrate: runtime cannot SELECT rows, cannot invoke legacy create/delete, and cannot use sequence; actor gateway can list/get/create/delete its own rows; one actor cannot see or delete another actor's row; create cannot attach a row to a different account; replay/tamper/operation/target substitution is rejected; business eligibility and duplicate behavior remain unchanged; DTO/order/API compatibility remains unchanged.
7. Add Resource API gateway client/router tests for original bearer forwarding, no fallback in production, invalid/missing token, 401/403/404 mapping, and fail-closed gateway outage. Keep existing local unit tests for application services.

Implementation has not started yet. The current branch contains the corrected qualification/handover record only. Do not claim the Saved Business gateway or cutover is implemented until code and disposable PostgreSQL qualification pass.

## Latest documentation checkpoint

- Qualification correction commit: `549ba13d1c10b9165ac07b3c98c9273946c70818`.
- PR #272 remains open and unmerged.
- Exact-head CI must be checked for this commit and any subsequent code commit. Earlier run #3021 does not qualify this new commit.


## Saved Business implementation checkpoint — first code batch (2026-11-11)

The first implementation batch now exists on PR #272:

- Migration `20261111100000_add_signed_saved_business_gateway.sql`: extends the existing v2 HMAC verifier allowlist with `saved_business.read/create/delete` and defines gateway-only SECURITY DEFINER list/get/create/delete wrappers. Each wrapper verifies actor, operation, timestamp, nonce, signature and exact JSON context; list/get SQL constrain `account_id` to the signed actor. Create/delete invoke the existing domain functions with `p_actor` only after assertion verification.
- Manual cutover `20261111110000_revoke_legacy_saved_business_runtime.sql`: revokes runtime/PUBLIC table DML/read, sequence access and legacy create/delete EXECUTE. Not part of automatic migration execution.
- `src/actor-gateway/saved-business-reader.ts`: v2 assertion reader for all four operations.
- Actor Gateway app/server routes: authenticated JWT actor is used for list/get/create/delete; no account ID is accepted from caller input.
- Resource API client/router/app integration: forwards original bearer token; production is configured to fail closed if gateway is unavailable/unconfigured; legacy path remains for non-production before cutover.
- Tests: Actor Gateway route actor binding and account-field rejection; Resource API bearer-token forwarding; SQL migration/cutover contract test included in `npm test`.
- `scripts/qualify-saved-business-gateway-cutover-postgres.mjs` plus npm/CI wiring: applies manual cutover only to the disposable localhost database; checks distinct role identities, runtime direct SELECT/legacy function/sequence denial, gateway ACLs, signed CRUD, cross-account isolation, actor substitution, context substitution and replay rejection.

Implementation commits include migration `334fde36`, manual cutover `60c6065e`, reader `a715d524`, Actor Gateway routes/server, Resource API client/router/wiring, tests, qualification script and CI wiring. Latest code/CI wiring head at this checkpoint is `9e7383d26615ac5e4f04449c6f2406bf57c00528`.

**Not yet qualified:** no successful exact-head CI run has been observed at this checkpoint. The new disposable PostgreSQL qualification has not yet been observed passing. Treat this batch as IMPLEMENTED / QUALIFICATION PENDING, not closed. No production cutover or production changes were made. Do not run the manual cutover outside the CI disposable database until explicit release gates and approval.

Potential compatibility point to verify in CI: saved-business duplicate-create currently maps SQLSTATE `23505` to HTTP 409 at the Actor Gateway, while the Resource API client propagates the gateway 409; preserve existing domain error behavior if current callers expect a different response.


### Qualification runner and CI checkpoint update

The cutover qualification runner is wired into `.github/workflows/ci.yml` after the existing Business Capability gateway cutover qualification, using the same disposable PostgreSQL service and three distinct runtime/gateway/migrator roles. It applies the Saved Business cutover only to that disposable database. The script additionally checks column-level SELECT ACLs, not just table-level SELECT.

Latest implementation/test/CI wiring head: `b51e12bc684ed8e88b34815dbd128f51ec4c18e4`. GitHub Actions run #3067 (`43089884203`) is running on this exact head; both `quality` and `web-quality` were still in progress at the time of this update. No pass is claimed until the exact-head run completes, including the new Saved Business disposable PostgreSQL qualification step.


### Disposable qualification harness correction — 2026-11-11

The first run of the new Saved Business cutover qualification (`43089878554`) failed after the cutover had successfully denied runtime direct SELECT, legacy create/delete EXECUTE and sequence access. The failure was in the harness's catalog inspection: it queried privilege metadata as `ghm_migrator` after the schema-owner role had been reset, causing `permission denied for schema ghm`. This was not a security-test pass and was not treated as one.

Corrections made:
- Execute post-cutover table/column/function privilege introspection through the existing migrator connection after `SET LOCAL ROLE ghm_schema_owner`.
- Strip the cutover file's explicit BEGIN/COMMIT when running it inside the harness transaction helper, avoiding nested transaction warnings and ensuring a single controlled transaction.
- Give replay qualification a separate eligible Business fixture. The earlier replay test reused the already-saved Business and would have hit the unique constraint before testing nonce replay; the distinct fixture removes that false failure path.
- Add explicit column-level SELECT ACL checks, in addition to table-level SELECT checks.

Latest runner code commit: `55665af44e741829ff72f07580b73119339d3f53`. Exact-head GitHub Actions run #3083 (`43090261075`) is currently in progress; do not claim qualification until a run on this head completes and its new `Qualify Saved Business signed gateway cutover on disposable PostgreSQL` step passes. The previous failed run remains recorded as a harness failure; it must not be hidden or described as an implementation pass.


## Saved Business signed Actor Gateway — exact-head qualification PASS (2026-11-11)

The corrected implementation/qualification head `55665af44e741829ff72f07580b73119339d3f53` passed GitHub Actions run [#3083](https://github.com/zaidhqdev-sys/GHM/actions/runs/43090261075): both `quality` and `web-quality` succeeded. The quality job passed build, full automated test suite, complete migration chain, and the new Saved Business disposable PostgreSQL cutover qualification.

The saved-business qualification log explicitly records:

- `MANUAL SAVED BUSINESS CUTOVER APPLIED TO DISPOSABLE POSTGRESQL: PASS`
- `RUNTIME DIRECT SAVED BUSINESS SELECT DENIED: PASS`
- `RUNTIME COLUMN-LEVEL SAVED BUSINESS SELECT DENIED: PASS`
- `RUNTIME LEGACY CREATE EXECUTE DENIED: PASS`
- `RUNTIME LEGACY DELETE EXECUTE DENIED: PASS`
- `RUNTIME SAVED BUSINESS SEQUENCE ACCESS DENIED: PASS`
- `POST-CUTOVER SAVED BUSINESS PRIVILEGE MATRIX: PASS`
- `SIGNED ACTOR SUBSTITUTION DENIED: PASS`
- `SIGNED ASSERTION REPLAY DENIED: PASS`
- `SIGNED REQUEST TARGET SUBSTITUTION DENIED: PASS`
- `GHM SAVED BUSINESS SIGNED GATEWAY CUTOVER QUALIFICATION: PASS`

The gateway CRUD calls, actor provenance and cross-account get/delete isolation also passed in the script. Resource API and Actor Gateway tests cover JWT-derived actor, no caller-supplied account field, original bearer-token forwarding and fail-closed gateway behavior. SQL contract tests are included in the full suite.

**Status update:** the Saved Business database actor-provenance issue is IMPLEMENTED / QUALIFIED on code head `55665af4`. The earlier qualification harness failure was fixed and must remain recorded as a harness issue, not hidden. The manual cutover was exercised only on disposable CI PostgreSQL; production table/function/sequence permissions remain unchanged. Production rollout still requires Render role-model resolution, a fresh independently verified production backup, and explicit approval. Do not apply the manual cutover to production.

The latest PR branch documentation now includes the corrected qualification status. PR #272 remains open and unmerged; the qualification run proves the code head, while later documentation-only commits are not themselves code qualification claims.


## Follow-on database actor-provenance audit — Business Hours, Trust Score, Campaign, Business Logo (2026-11-11)

The next source review identified four existing SECURITY DEFINER mutation paths that accept caller-supplied account IDs and are directly executable by `ghm_runtime`:

| Resource | Function | Actor parameter | Runtime grant | Finding |
|---|---|---|---|---|
| Business Hours | `ghm.replace_business_hours(bigint,bigint,jsonb)` | `p_account_id` | EXECUTE granted to `ghm_runtime` | Membership check trusts supplied actor; direct caller can assert an owner/admin account ID |
| Trust Score | `ghm.calculate_business_trust_score(bigint,bigint)` | `p_account_id` | EXECUTE granted to `ghm_runtime` | Membership check trusts supplied actor; direct caller can assert an owner/admin account ID |
| Campaign | `ghm.create_campaign(bigint,bigint,text)` | `p_account_id` | EXECUTE granted to `ghm_runtime` | Business membership check trusts supplied actor |
| Campaign | `ghm.update_campaign(bigint,bigint,text,text)` | `p_account_id` | EXECUTE granted to `ghm_runtime` | Business membership check trusts supplied actor |
| Business Logo | `ghm.set_business_logo_object(bigint,bigint,bigint)` | `p_account_id` | EXECUTE granted to `ghm_runtime` | Membership check trusts supplied actor; can bind another business's eligible logo object only if target/tenant checks also pass, but actor provenance is forgeable |

The TypeScript repositories currently pass `context.userId` for these functions. That is application-level provenance, not a database-enforced actor binding: a direct caller holding the runtime DB credential can supply another account ID.

A second, distinct read-boundary finding was confirmed from the migration grants:

- `ghm.business_hours`: runtime has direct table SELECT. The application applies public-business visibility and tenant membership filters, but the table grant itself is not row-scoped.
- `ghm.trust_score`: runtime has direct table SELECT. The public repository filters to active, verified, approved businesses, but direct table SELECT bypasses that projection.
- `ghm.campaign`: runtime has direct table SELECT. Campaign is not a public-read resource; the application repository enforces membership for get/list, but direct SELECT bypasses those predicates.

Source evidence reviewed at PR head `defb828e86f0ee5cbb806222410bb2fb1400fcef`:
- `database/migrations/20260916223000_create_business_hours.sql`
- `database/migrations/20260916240000_create_trust_score.sql`
- `database/migrations/20260916250000_extend_business_profile_trust_inputs.sql`
- `database/migrations/20260918180000_create_campaign.sql`
- `database/migrations/20260918180100_fix_campaign_function_column_ambiguity.sql`
- `database/migrations/20261106090000_business_logo_storage_binding.sql`
- `src/resources/business-hours/repository.ts`
- `src/resources/trust-score/repository.ts`
- `src/resources/campaign/repository.ts`
- `src/http/campaign-router.ts`
- `src/http/trust-score-router.ts`
- `scripts/qualify-business-hours-runtime.mjs`
- `scripts/qualify-trust-score-runtime.mjs`
- `scripts/qualify-campaign-runtime.mjs`

Important distinctions:
- Existing Business Hours / Trust Score / Campaign runtime qualification proves application-path behavior and current grants, but does not prove forged actor IDs are rejected at the database boundary.
- The Campaign operation contract still contains stale historical wording that says no HTTP routes, while the current source has `src/http/campaign-router.ts` and the contract itself records a later separately authorized HTTP implementation. This must be reconciled in the docs audit; do not treat the old sentence as current policy.
- The Business Logo storage contract describes an incomplete lifecycle; the presence of `set_business_logo_object` does not mean the complete logo HTTP/storage lifecycle is qualified.

**Status:** all findings OPEN / NEED DATABASE-BOUNDARY REMEDIATION OR A DOCUMENTED, TESTED ALTERNATIVE. No code or production privileges were changed in this audit batch. Next implementation should be split into bounded resource batches: first remove direct actor-ID trust for one mutation family and prove a signed gateway actor; separately revoke broad direct table reads only after matching application reads are routed through a suitable gateway projection. Preserve intended public projections and existing product behavior. No production cutover, no merge, no production mutation.


## Business Hours signed mutation gateway — implementation checkpoint (2026-11-11)

A bounded first implementation batch has been added for Business Hours **replacement only**. It deliberately does not yet revoke direct table SELECT because authenticated member reads and approved public reads still use the Resource API repository and require a separately designed/qualified read projection.

Files added/changed:
- `database/migrations/20261111130000_add_signed_business_hours_gateway.sql`: adds `business.hours.replace` to the signed v2 assertion allowlist and creates gateway-only `ghm.gateway_replace_business_hours`. The wrapper checks exact JSON context (`businessId` + complete hours payload), verifies signed actor, and calls the existing domain function with `p_actor` as `p_account_id`.
- `database/cutovers/20261111130000_revoke_legacy_business_hours_runtime.sql`: manual-only revocation of direct runtime/PUBLIC EXECUTE on legacy `ghm.replace_business_hours`; not part of automatic migrations.
- `src/actor-gateway/business-hours-reader.ts`, `src/actor-gateway/app.ts`, `src/actor-gateway/server.ts`: signed assertion reader and JWT-derived Actor Gateway PUT route.
- `src/http/business-hours-gateway-client.ts`, `src/http/app.ts`: forwards the original bearer token to Actor Gateway for replacement; production fails closed if the gateway client is not configured. Non-production retains the legacy path until cutover.
- `src/db/actor-gateway-business-hours-migration-contract.test.ts`: static migration/cutover contract tests included in `npm test`.
- `scripts/qualify-business-hours-gateway-cutover-postgres.mjs`, package script and `.github/workflows/ci.yml`: new disposable-PostgreSQL qualification step. It refuses non-local/non-disposable database URLs, uses distinct runtime/gateway/migrator roles, applies the manual cutover only to disposable CI PostgreSQL, checks legacy runtime EXECUTE denial, signed replacement/provenance, target-substitution denial and effective function ACLs.

**Status at this checkpoint: IMPLEMENTED / QUALIFICATION PENDING.** No exact-head CI result has yet been observed. Do not call this qualified until the full exact-head quality run (including the new disposable PostgreSQL step) passes. The Business Hours direct SELECT grant remains unchanged in this batch; that read boundary remains OPEN. No production permissions or data were changed; no production cutover and no merge.


### Business Hours signed replacement gateway — qualification PASS (2026-11-11)

Implementation/qualification head: `b4663cb95e90b5f6633c871356b8c818c7a86814`.

GitHub Actions run [#3134](https://github.com/zaidhqdev-sys/GHM/actions/runs/43092443886) completed successfully; both `quality` and `web-quality` passed. The full automated test suite passed. All migrations applied to disposable PostgreSQL. The Business Hours gateway qualification step completed with these explicit log results:

- `MANUAL BUSINESS HOURS CUTOVER APPLIED TO DISPOSABLE POSTGRESQL: PASS`
- `RUNTIME LEGACY REPLACEMENT EXECUTE DENIED: PASS`
- `SIGNED BUSINESS HOURS REPLACEMENT + ACTOR PROVENANCE: PASS`
- `SIGNED BUSINESS HOURS TARGET SUBSTITUTION DENIED: PASS`
- `SIGNED BUSINESS HOURS ASSERTION REPLAY DENIED: PASS`
- `SIGNED BUSINESS HOURS ACTOR SUBSTITUTION DENIED: PASS`
- `RUNTIME GATEWAY WRAPPER EXECUTE DENIED: PASS`
- `BUSINESS HOURS POST-CUTOVER FUNCTION ACL: PASS`
- `GHM BUSINESS HOURS SIGNED GATEWAY QUALIFICATION: PASS`

The qualification applied the manual cutover only to the disposable localhost PostgreSQL database, with distinct `ghm_runtime`, `ghm_actor_gateway`, and `ghm_migrator` identities. The existing schedule replacement semantics and `created_by` provenance were preserved. The test suite also covers production fail-closed behavior when the gateway is unavailable and forwarding of the original bearer token.

The current PR head advanced afterward to `b24c820e3221e06aa85cbf9bf43a24dba6ccba35` to add the reader-level HMAC test to `npm test`; that later test-only head has its own CI run pending at the time of this note. The qualified implementation itself is `b4663cb9`; do not describe the newer head as fully qualified until its exact-head run completes.

**Business Hours status:** replacement mutation database actor provenance IMPLEMENTED / QUALIFIED. **Still OPEN:** direct runtime SELECT on `ghm.business_hours` remains unchanged because member/public read projections have not yet been migrated to the Actor Gateway. Do not revoke that table read grant until the new read path is implemented and qualified. Production manual cutover remains unapplied and requires separate rollout approval, Render role-model resolution and a fresh independently verified production backup. No production changes and no merge.


### Exact-head confirmation after reader HMAC test inclusion

The follow-up test-only head `b24c820e3221e06aa85cbf9bf43a24dba6ccba35` also passed exact-head GitHub Actions run [#3136](https://github.com/zaidhqdev-sys/GHM/actions/runs/43092456034): both `quality` and `web-quality` succeeded. This head includes `src/actor-gateway/business-hours-reader.test.ts` in the full `npm test` command, so the reader HMAC/context and rollback tests are now covered by CI as well. The Business Hours implementation and disposable cutover qualification evidence remain as recorded above. Current subsequent commits in this handover are documentation-only.


### Business Hours member/public read boundary — exact-head qualification PASS (2026-11-11)

The read-boundary implementation and full manual-cutover qualification passed on exact head `67d7049ec2f8fa8727475158558fb23f8724ab0d`, GitHub Actions run [#3166](https://github.com/zaidhqdev-sys/GHM/actions/runs/43093547768). Both `quality` and `web-quality` succeeded. The full test suite, migration chain and disposable PostgreSQL qualification all passed.

New migration `20261111140000_add_business_hours_read_projections.sql` adds:
- `business.hours.read` signed v2 operation and gateway-only `gateway_get_business_hours`, bound to the JWT-derived actor and exact Business ID, with active owner/administrator/member membership enforced in SQL;
- `get_public_business_hours`, a SECURITY DEFINER projection exposing schedule rows only for active + verified + approved businesses, executable by runtime.

The manual-only cutover `20261111130000_revoke_legacy_business_hours_runtime.sql` now revokes legacy replacement EXECUTE, direct table SELECT and sequence access from PUBLIC/runtime. The Resource API member GET/PUT routes forward the original bearer token to Actor Gateway; public repository reads use `get_public_business_hours`.

Exact qualification log evidence:
- `RUNTIME DIRECT BUSINESS HOURS SELECT DENIED: PASS`
- `RUNTIME BUSINESS HOURS SEQUENCE ACCESS DENIED: PASS`
- `SIGNED BUSINESS HOURS REPLACEMENT + ACTOR PROVENANCE: PASS`
- `SIGNED BUSINESS HOURS MEMBER READ: PASS`
- `SIGNED BUSINESS HOURS CROSS-ACCOUNT READ DENIED: PASS`
- `RUNTIME APPROVED PUBLIC BUSINESS HOURS PROJECTION: PASS`
- `SIGNED BUSINESS HOURS TARGET SUBSTITUTION DENIED: PASS`
- `SIGNED BUSINESS HOURS ASSERTION REPLAY DENIED: PASS`
- `SIGNED BUSINESS HOURS ACTOR SUBSTITUTION DENIED: PASS`
- `BUSINESS HOURS POST-CUTOVER FUNCTION/TABLE ACL: PASS`
- `GHM BUSINESS HOURS SIGNED GATEWAY QUALIFICATION: PASS`

The earlier test run #3164 failed only because the new read-contract assertions mistakenly read the replacement migration file instead of the new read-projection migration file. This was a test-target error; it did not indicate a migration or application defect. The test was corrected to load `20261111140000_add_business_hours_read_projections.sql`; exact-head run #3166 then passed.

**Business Hours status:** mutation actor provenance and member/public read database boundaries IMPLEMENTED / QUALIFIED. The manual cutover was applied only to disposable CI PostgreSQL and remains unapplied in production. Production still requires Render role-model resolution, a fresh independently verified backup and explicit approval. No production changes, no merge.


## Trust Score signed calculation gateway — implementation checkpoint (2026-11-11)

A bounded mutation-only Actor Gateway batch is now implemented for Trust Score calculation. It does not yet revoke direct runtime SELECT on `ghm.trust_score`; public/member read projections are a separate OPEN read-boundary task.

Files added/changed:
- `database/migrations/20261111150000_add_signed_trust_score_gateway.sql`: adds `trust.score.calculate` to signed v2 assertion allowlist and creates gateway-only `ghm.gateway_calculate_business_trust_score`. It binds the exact Business ID in signed context, verifies the actor and calls the existing calculation function with the verified actor.
- `database/cutovers/20261111150000_revoke_legacy_trust_score_runtime.sql`: manual-only revocation of direct runtime/PUBLIC EXECUTE on legacy `ghm.calculate_business_trust_score`.
- `src/actor-gateway/trust-score-reader.ts`, `src/actor-gateway/app.ts`, `src/actor-gateway/server.ts`: signed calculation reader and JWT-derived Actor Gateway route.
- `src/http/trust-score-gateway-client.ts`, `src/http/trust-score-router.ts`, `src/http/app.ts`: forwards original bearer token and routes calculation through Actor Gateway; production fails closed if the gateway is unavailable/unconfigured.
- `src/db/actor-gateway-trust-score-migration-contract.test.ts` and `src/actor-gateway/trust-score-reader.test.ts`: migration/ACL and HMAC/context/rollback tests included in `npm test`.
- `scripts/qualify-trust-score-gateway-cutover-postgres.mjs`, package script and CI wiring: disposable-localhost-only qualification with distinct runtime/gateway/migrator roles, manual cutover, signed calculation, actor/target substitution, nonce replay and runtime-wrapper denial checks.

**Status: IMPLEMENTED / QUALIFICATION PENDING.** Latest CI is running on implementation head `34172a7057a56ed027a0baead9640a3a835f7b59` (run #3198 pending). Do not mark Trust Score calculation qualified until the exact-head quality job passes the full suite and the new disposable PostgreSQL step. Direct runtime SELECT remains unchanged/open. No production changes, no manual production cutover, no merge.


## Campaign contract contradiction corrected (2026-11-11)

The follow-on audit found stale contradictory wording in `docs/architecture/CAMPAIGN_OPERATION_CONTRACT.md`: section 2 already recorded that a bounded authenticated HTTP surface was separately approved and implemented, but section 12 still said there were no HTTP routes and section 14 listed campaign HTTP routes as an unqualified non-goal. This was inconsistent with the current `src/http/campaign-router.ts` and `CAMPAIGN_HTTP_FOUNDER_DECISION_RECORD.md`.

Corrected section 12 to state accurately that there is no public/anonymous read, while the bounded authenticated `read` / `create` / `update` HTTP surface is separately approved and implemented. Corrected section 14 to prohibit additional routes beyond that bounded surface. No runtime code changed in this documentation correction.


### Trust Score signed calculation gateway — exact-head qualification PASS (2026-11-11)

Implementation head `34172a7057a56ed027a0baead9640a3a835f7b59` passed GitHub Actions run [#3198](https://github.com/zaidhqdev-sys/GHM/actions/runs/43094248583). Both `quality` and `web-quality` succeeded, including build, full automated suite, complete migrations and the new disposable PostgreSQL Trust Score cutover qualification.

The qualification logs explicitly confirm:
- `MANUAL TRUST SCORE CUTOVER APPLIED TO DISPOSABLE POSTGRESQL: PASS`
- `RUNTIME LEGACY TRUST SCORE EXECUTE DENIED: PASS`
- `SIGNED TRUST SCORE CALCULATION + ACTOR PROVENANCE: PASS`
- `SIGNED TRUST SCORE TARGET SUBSTITUTION DENIED: PASS`
- `SIGNED TRUST SCORE ASSERTION REPLAY DENIED: PASS`
- `SIGNED TRUST SCORE ACTOR SUBSTITUTION DENIED: PASS`
- `RUNTIME TRUST SCORE GATEWAY EXECUTE DENIED: PASS`
- `TRUST SCORE POST-CUTOVER FUNCTION ACL: PASS`
- `GHM TRUST SCORE SIGNED GATEWAY QUALIFICATION: PASS`

The manual cutover ran only against disposable localhost PostgreSQL. The Trust Score calculation mutation is IMPLEMENTED / QUALIFIED. Direct runtime SELECT on `ghm.trust_score` remains OPEN and unchanged pending safe public list/get and authorised-member read projections. Full durable record: `docs/architecture/TRUST_SCORE_QUALIFICATION.md`. No production changes, no production cutover and no merge.


## Business Logo binding signed gateway — implementation checkpoint (2026-11-11)

The Business Logo routes are active in `src/http/storage-router.ts`; the binding path calls `ghm.set_business_logo_object(p_account_id,p_business_id,p_storage_object_id)` directly under the runtime DB credential. This is another caller-supplied actor ID boundary. A signed gateway binding path has now been implemented:

- Migration `20261111160000_add_signed_business_logo_gateway.sql`: adds `business.logo.bind` to the signed v2 assertion allowlist and creates gateway-only `ghm.gateway_set_business_logo_object`, binding actor, Business ID and nullable storage object ID in the signed context before calling the existing domain function.
- Manual cutover `20261111160000_revoke_legacy_business_logo_runtime.sql`: revokes runtime/PUBLIC EXECUTE on the legacy binding function only. The public logo getter remains available; it is a separate SECURITY DEFINER projection enforcing active + verified + approved Business visibility.
- Actor Gateway reader/route/server wiring: `src/actor-gateway/business-logo-reader.ts`, `/v1/businesses/:businessId/logo`, and `src/actor-gateway/server.ts`.
- Resource API client/storage router wiring: `src/http/business-logo-gateway-client.ts` and `src/http/storage-router.ts` forward the original bearer token; production fails closed if the gateway is unavailable/unconfigured. Existing upload, replacement, unbind and cleanup semantics are preserved.
- Tests: migration contract, reader HMAC/context/rollback, storage route bearer forwarding and fail-closed tests.
- Disposable PostgreSQL qualification script and CI wiring: `scripts/qualify-business-logo-gateway-cutover-postgres.mjs`.

**Status: IMPLEMENTED / QUALIFICATION PENDING.** CI has been wired; exact-head qualification is pending. Do not close until the full test suite and disposable PostgreSQL step pass. No production changes and no production cutover.


## Trust Score direct-read boundary — implementation checkpoint (2026-11-11)

A second bounded batch now replaces direct runtime reads on `ghm.trust_score`:

- Migration `20261111170000_add_trust_score_read_projections.sql` adds signed `trust.score.read` operations for member get/list, preserving public visibility plus active owner/administrator membership. It also adds `get_public_trust_score` and `list_public_trust_scores` SECURITY DEFINER projections for runtime public reads, filtered to active + verified + approved Businesses.
- Manual cutover `20261111150000_revoke_legacy_trust_score_runtime.sql` now revokes direct runtime/PUBLIC table SELECT and sequence access in addition to legacy calculation EXECUTE.
- `PostgresTrustScoreGatewayReader` now implements signed get/list/calculate; Actor Gateway exposes authenticated GET `/v1/trust-scores` and `/v1/trust-scores/:businessId` as well as calculation.
- Resource API `TrustScoreGatewayClient` and router forward the original bearer token for authenticated get/list/calculate; production fails closed if gateway unavailable/unconfigured. Public Resource API reads now call the governed public SQL projections.
- Reader HMAC tests, migration/ACL contract tests, HTTP gateway/fail-closed tests and the disposable PostgreSQL qualification runner have been expanded to prove public/private visibility and no direct runtime reads.

**Status: IMPLEMENTED / QUALIFICATION PENDING.** Exact-head CI for this read-boundary expansion is queued/pending; no pass is claimed. The earlier mutation-only Trust Score qualification (#3198) remains valid for the calculation boundary, but does not qualify these new read functions or the table/sequence revocations. Do not apply the expanded manual cutover to production until exact-head CI and the new disposable PostgreSQL read checks pass. No production changes.


## Storage metadata database-boundary findings — separate OPEN workstream (2026-11-11)

Tracing the active Business Logo lifecycle exposed a broader shared-runtime trust assumption in the storage metadata layer. Existing migrations and call paths:

- `ghm.storage_get_object(bigint,bigint)` is SECURITY DEFINER and accepts a caller-supplied `p_account_id`; it checks membership/public logo eligibility against that supplied ID. The migration comment explicitly says this is defense in depth and that the shared runtime role is trusted because PostgreSQL cannot derive the end-user identity from the shared credential. A direct runtime caller can supply another account ID to probe/read storage metadata.
- `ghm.storage_create_pending(...)` is SECURITY DEFINER and accepts caller-supplied tenant Business/resource fields; it has no signed actor assertion or DB membership check.
- `ghm.storage_mark_available(bigint,text)`, `ghm.storage_mark_deletion_pending(bigint)` and `ghm.storage_mark_deleted(bigint)` are SECURITY DEFINER and accept only an object ID (plus checksum for mark-available); they do not establish which authenticated actor is authorizing the transition.
- `src/storage/repository.ts` invokes these functions through `withAuthorizedTransaction`, while `src/storage/authorization-adapter.ts` applies application-level owner/admin or tenant-membership checks. Those application checks do not make the database function boundary independently actor-bound.
- `src/http/storage-router.ts` uses `metadataFor(context).getById(...)` in logo binding, upload completion, object access and object deletion. The current metadata store passes `context.userId` to `storage_get_object`; this remains application-derived but is not cryptographically bound at the database boundary.

The existing storage qualification (`scripts/qualify-storage-persistence.mjs` and CI storage lifecycle qualification) proves direct table DML denial, lifecycle transitions, tenant behavior for the supplied account ID and public-logo visibility. It does **not** prove that a caller cannot substitute another account ID or directly invoke lifecycle functions against another tenant/object.

**Disposition:** OPEN / NOT CLOSED by the Business Logo binding gateway. The new signed `business.logo.bind` wrapper only closes the canonical logo-reference mutation path. A separate bounded storage metadata gateway design must bind actor, operation, tenant Business, resource identity, object ID and lifecycle transition to signed JWT-derived assertions, while preserving the upload-complete/cleanup lifecycle. Do not revoke existing storage lifecycle EXECUTE privileges until all storage HTTP flows have replacement gateway routes and disposable PostgreSQL qualification. No production changes.


## Saved Business product semantics clarification (2026-11-11)

The product meaning of Saved Business is the user's personal favourites/bookmarks list: users save a Business for quick access later. It is not a Business-owned list or an administrative directory feature. The signed gateway work must preserve that exact user-facing behaviour: save/remove a favourite and list/retrieve the user's own saved Businesses, with strict account isolation. No product semantics were changed by the security remediation.


## Full migration marker inventory checkpoint — 2026-11-11

The complete current branch migration inventory contains 121 SQL migration files and 7 manual cutover files (recursive Git tree at `62138be186f3510158d56b3af541e219ace51ec2`). A source scan across all 121 migration files searched for `SECURITY DEFINER`, function ownership changes and runtime EXECUTE grants. This was a marker/inventory scan, not yet a complete effective-ACL audit against a live database.

### Findings grouped by current disposition

- **Previously migrated to signed Actor Gateway:** capability catalogue governance; supplier classification; Business profile; registration identity/self identity; capability mutation/evidence; Saved Business favourites; Business Hours; Trust Score calculation; Business Logo reference binding. These have signed wrappers and separate manual cutovers. Their current feature-specific qualification status remains as documented above; new Trust Score reads and Business Logo/storage flows are still pending exact-head qualification.
- **Storage metadata lifecycle — OPEN:** `storage_create_pending`, `storage_mark_available`, `storage_mark_deletion_pending`, `storage_mark_deleted`, and `storage_get_object(bigint,bigint)` remain SECURITY DEFINER functions granted to `ghm_runtime`. The getter accepts caller-supplied account ID. Create/complete/delete accept tenant/object identifiers without signed actor assertions. New signed wrappers and a separate manual cutover were designed in this session but **not committed** because the GitHub write operation returned a retriable tool error. Do not treat them as implemented. No existing storage grants were changed.
- **Campaign — OPEN / product-scope decision required:** `create_campaign(bigint,bigint,text)` and `update_campaign(bigint,bigint,text,text)` are SECURITY DEFINER and granted to `ghm_runtime`. Both accept caller-supplied account IDs and use them for owner/administrator membership checks. The live Campaign HTTP router derives the account ID from authenticated `AuthContext`, so the public HTTP body does not directly select it; however the database boundary itself does not verify that ID. Campaign table SELECT is also granted to runtime while membership filtering is implemented in the repository. The original migration describes this as KBM AI Marketing, and Campaign is not part of the user's current GHM focus. Preserve this as an explicit open risk for founder scope decision; do not silently expand product scope or revoke grants without replacement and qualification.
- **Authentication service functions — SPECIAL TRUST BOUNDARY / OPEN AUDIT:** the original auth migration grants runtime EXECUTE on SECURITY DEFINER operations including password credential writes, session creation/validation/revocation, account disable, recovery issue/redeem, external identity bootstrap/linking. These operations are called by the internal Auth persistence/service layer for unauthenticated login, registration, refresh, logout and password recovery. They cannot simply be converted to user-JWT Actor Gateway calls because several run before a user access JWT exists. Audit must trace each function to its exact service call, prove its input is derived from password verification, one-time recovery/refresh token, or a privileged internal action, and identify unused dangerous entry points (notably direct account-ID revoke/disable methods). Do not revoke auth function grants until a distinct internal-auth authority design preserves login/recovery.
- **Provider/payment and Connect integration functions:** commercial settlement mutations are isolated to the payment-provider principal in later migrations; Connect integration management functions do not show runtime EXECUTE grants except the runtime getter and service assertion replay consumer. Verify final ACLs/callers before closing these groups.
- **Directory review and capability legacy functions:** historical migrations grant runtime EXECUTE, but later authority/cutover migrations revoke or disable legacy paths. Verify final effective grants against all later cutovers and the actual role memberships; historical GRANT lines alone do not establish current access.
- **Founder/system-admin bootstrap functions and trigger helpers:** inspect exact final EXECUTE grants and deployment-only invocation paths separately; a SECURITY DEFINER marker alone is not evidence of runtime exposure.

### Audit completeness statement

The 121-file scan is now the migration-source inventory baseline. It does not yet establish effective production ACLs, PUBLIC inheritance, role memberships, function owners, default privileges, extension function exposure, application call reachability or dynamic SQL paths. The next phase must reconcile each historically runtime-granted SECURITY DEFINER function against all later migrations/manual cutovers and current application callers, then compare the resulting expected ACL matrix to disposable PostgreSQL. No production ACL query or mutation was performed in this session.

### Tool failure / implementation status

Attempted to create `20261111200000_add_signed_storage_metadata_gateway.sql` and its manual cutover, but GitHub write calls returned a retriable tool exception and the branch head did not advance. Therefore neither file exists on the branch. The design is recorded as proposed only; the storage work remains OPEN. No code or database mutation was made for this proposed storage batch.


## Session-resumption checkpoint — 2026-11-11 21:00 UTC

This checkpoint was added after recovering from an unavailable prior chat. It records only facts re-verified against GitHub in this session.

### Live repository / PR state re-verified

- Repository: `zaidhqdev-sys/GHM`.
- PR #272 remains OPEN, unmerged, base `main`.
- PR branch: `integration/capability-gateway-qualification-20261110`.
- Exact current PR head returned by GitHub: `1ee5e91d247bb315df43f532a3beea7d10c1a344`.
- PR metadata reports 559 commits and 138 changed files.
- GitHub Actions run `43097925792` (CI) is QUEUED for that exact head. No result is claimed. Recheck this run before treating any current-head quality gate as passed.
- The handover file currently fetched from the PR branch has blob SHA `91bcbe59ddd9bb2a41e70a60878ebbc55db1ab4f` before this checkpoint update.
- No production database, Render service, production deployment, secret, role, grant, migration or application data was changed in this session.

### Confirmed existing work — do not repeat

- Saved Business is the user's personal favourites/bookmarks feature: save/remove a Business and list/retrieve the user's own saved Businesses for quick access. It is not a Business-owned collection, administrative directory, or toggle operation.
- Saved Business signed gateway and manual cutover qualification passed on `55665af44e741829ff72f07580b73119339d3f53`, run #3083. Its manual cutover was exercised only on disposable PostgreSQL; production remains unchanged.
- Business Hours signed mutation and read projections have exact-head disposable PostgreSQL qualification recorded in this handover.
- Trust Score calculation mutation passed on `34172a7057a56ed027a0baead9640a3a835f7b59`, run #3198; the later Trust Score read-projection/direct-read expansion is separately recorded as IMPLEMENTED / QUALIFICATION PENDING.
- Business Logo binding is recorded as IMPLEMENTED / QUALIFICATION PENDING; it does not close the broader storage metadata lifecycle boundary.
- Storage metadata functions remain OPEN; the proposed `20261111200000_add_signed_storage_metadata_gateway.sql` and manual cutover were not committed. Do not represent that proposal as implementation.
- Campaign actor-ID functions/direct table read remain an explicitly scoped OPEN risk; do not expand KBM/Campaign work without founder scope approval.
- Internal authentication SECURITY DEFINER functions remain a SPECIAL TRUST BOUNDARY / OPEN AUDIT. Do not revoke their grants or blindly route pre-authentication login/recovery flows through user-JWT Actor Gateway operations.

### Next execution sequence — resume here

1. Continue the legacy database RPC audit from the existing 121-migration inventory. For every runtime-executable SECURITY DEFINER function accepting account, session, object, tenant or resource identifiers, trace: exact SQL definition; all later GRANT/REVOKE/cutover effects; PUBLIC and inherited role access; all TypeScript callers; caller authentication state; provenance of each supplied identifier; and whether the function is externally reachable or internal-only.
2. Prioritize the internal authentication family as a distinct trust boundary: `auth_set_password`, `auth_create_session_with_refresh`, `auth_validate_session`, `auth_revoke_session`, `auth_revoke_all_sessions_for_account`, `auth_change_password`, `auth_disable_account`, `auth_issue_recovery`, and recovery redemption. Identify exact SQL migration/file paths and TypeScript implementations before proposing changes. Separate unauthenticated login/registration/refresh/recovery paths from authenticated account-scoped actions and privileged internal actions. Identify unused or unnecessarily broad direct account-ID entry points.
3. Continue storage metadata lifecycle audit separately: `storage_get_object`, `storage_create_pending`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`. Trace all upload completion, logo bind/unbind, download/read, retry, deletion and cleanup call paths before designing any replacement. Preserve cleanup/retry behavior.
4. For each function, classify the result as (a) confirmed database-boundary weakness, (b) application-path guarded but database credential trusted, (c) internal service operation with justified pre-auth provenance, or (d) effectively revoked/unreachable after later cutovers. Do not infer effective privileges from historical GRANT lines.
5. Update this handover and the relevant feature qualification document after each bounded investigation/fix. Record exact commit, PR head, workflow run and explicit disposable PostgreSQL log markers. Keep implementation, qualification and production release status distinct.

### Current next action

Begin with source-level tracing of the internal authentication RPC family and its exact callers; do not change auth grants yet. If the source/migration paths cannot be established from the branch, record that retrieval limitation and use repository tree/commit evidence rather than guessing filenames. After that, reconcile the storage lifecycle call graph. Keep PR #272 open and unmerged until all required documentation is reconciled and current-head validation is verified.



## Internal authentication RPC audit — source/call-path pass 1 (2026-11-11)

This is a source-level audit checkpoint, not a live effective-ACL qualification and not a remediation. No auth migration, grant, function, service or route was changed.

### Exact source locations inspected

- Auth function definitions and original runtime grants: `database/migrations/20260921130000_create_auth_runtime_functions.sql` (872 lines).
- Follow-on refresh semantics: `database/migrations/20260921130100_fix_auth_rotate_refresh_ambiguity.sql`, `20260921130200_auth_rotate_refresh_replay_outcome.sql`.
- Logout-by-refresh-token: `database/migrations/20260921130300_auth_revoke_by_refresh_hash.sql`.
- External identity link operations: `20260921130400_auth_link_external_identity.sql`, `20260921130500_auth_link_business_external_mapping.sql`.
- Canonical password registration: `20261004020000_create_auth_account_registration.sql`.
- Persistence and internal service: `src/auth/foundation/persistence.ts`, `src/auth/ghm-auth-service.ts`, `src/auth/password-recovery.ts`, `src/auth/password-reset.ts`.
- Public HTTP routes and wiring: `src/http/auth-router.ts`, `src/http/app.ts`.

### Confirmed original migration grants

The 20260921130000 migration explicitly revokes PUBLIC and grants EXECUTE to `ghm_runtime` on these SECURITY DEFINER functions:

- `auth_set_password`
- `auth_lookup_password_by_normalized_email`
- `auth_create_session_with_refresh`
- `auth_validate_session`
- `auth_rotate_refresh`
- `auth_revoke_session`
- `auth_revoke_all_sessions_for_account`
- `auth_change_password`
- `auth_disable_account`
- `auth_issue_recovery`
- `auth_redeem_recovery`
- `auth_lookup_external_identity`
- `auth_bootstrap_external_identity`

The two `auth_internal_*` helpers are explicitly revoked from PUBLIC and are not granted to runtime in that migration. Separate migrations grant runtime EXECUTE on `auth_create_account`, `auth_link_external_identity`, and `auth_link_business_external_mapping`. This is the historical/source grant set only; the final effective ACL after every later migration, default privilege and role membership has not yet been established.

### Public HTTP authentication flows observed

`src/http/auth-router.ts` registers unauthenticated routes for:
- register and login (including browser-cookie variants);
- refresh and logout (including browser-cookie variants);
- password recovery request and password recovery reset;
- QuoteFlow migration-reset request and completion.

The ordinary registration/login/refresh/logout service is `GhmAuthService`. Login first looks up the credential by normalized email, verifies the password hash, checks active account/credential status, optionally rehashes, then creates a session. Registration hashes the submitted password before calling account creation and session creation. Refresh derives the presented token hash from the opaque refresh token and rotates it; logout derives a hash from the presented refresh token and revokes the matching session family.

Password recovery request looks up an account by normalized email and only issues a recovery token for an active account/credential; delivery receives the raw token. Reset redeems the supplied opaque recovery token inside a transaction, obtains the account ID from the redeemed credential (not from the HTTP body), sets the new password and revokes that account's other sessions in the same transaction. The route does not accept an account ID.

The HTTP router receives recovery/reset service dependencies from `src/http/app.ts`; the default app wiring creates the password-reset service, while the password-recovery and QuoteFlow migration-reset services are injected dependencies. Do not assume those optional services are active in every deployment without inspecting deployment composition/configuration.

### High-risk database entry points requiring distinct internal-auth authority analysis

The SQL bodies accept identifiers without proving the end-user actor at the database boundary:

- `auth_set_password(account_id,...)`: accepts arbitrary account ID. Current service callers include login password rehash after password verification and recovery reset after one-time recovery-token redemption. The direct persistence method also accepts account ID. The database function itself does not prove either precondition.
- `auth_create_session_with_refresh(account_id, token_hash)`: accepts arbitrary account ID and caller-provided refresh hash. Normal registration/login callers derive account ID from new account creation or verified password credentials, but SQL itself only checks account existence and active status.
- `auth_validate_session(session_id)`: accepts a raw session ID and returns its account/session state. It is exposed by the persistence interface; exact non-test production caller still needs tracing.
- `auth_revoke_session(session_id, reason)`: accepts raw session ID and revokes its family. `AuthPersistence.revokeSession` calls it; no public route in the inspected AuthRouter/GhmAuthService exposes this method. Treat as an unused-or-internal candidate until all repository call sites are checked.
- `auth_revoke_all_sessions_for_account(account_id, reason)`: accepts raw account ID. The public recovery-reset transaction calls it only with the account ID returned by successful recovery-token redemption. A separate persistence method accepts arbitrary account ID and is not exposed by the inspected public AuthService.
- `auth_change_password(account_id, keep_session_id,...)`: accepts both account and session IDs without checking that the keep-session belongs to that account or that the caller controls it. The persistence interface/method exists; no public HTTP route or GhmAuthService method was found in the inspected route/service files. Treat as a high-priority unused/internal entry point, not as a demonstrated public exploit.
- `auth_disable_account(account_id)`: can disable any account and revoke its sessions. The persistence interface/method exists, but no public route or GhmAuthService method was found in the inspected files. This is a particularly sensitive broad runtime EXECUTE grant; trace all non-HTTP callers before deciding to remove/narrow it.
- `auth_issue_recovery(account_id, token_hash, expires_at)`: accepts arbitrary account ID. The current recovery service derives the ID from an email lookup and controls the raw token delivery; SQL does not enforce this call provenance.
- `auth_redeem_recovery(token_hash)`: accepts only a pepper-protected token hash; the reset path derives it from the supplied opaque recovery token. This is a stronger capability-shaped input than raw account/session IDs, but effective secret custody and direct runtime invocation still need assessment.
- `auth_rotate_refresh(presented_hash, successor_hash)` and `auth_revoke_by_refresh_hash(token_hash, reason)`: operate by protected refresh-token hash rather than caller-supplied account/session ID. Preserve replay handling and session-family semantics; do not replace with account-ID operations.
- `auth_bootstrap_external_identity(provider, subject,...)`: creates an account/mapping based on provider+subject. It has no account ID parameter, but its safety depends on the caller proving the provider subject is authentic. Caller and provider verification path remain untraced.
- `auth_link_external_identity(provider, subject, account_id)`: accepts arbitrary account ID and can attach an external identity to an existing account. Caller and provider-verification/administrative authorization path remain untraced.
- `auth_link_business_external_mapping(provider, external_business_id, business_id)`: accepts arbitrary Business ID and can attach an external mapping. Caller and provider/Business authorization path remain untraced.

### Important distinction — not yet an exploit finding

The above SQL functions execute under a shared runtime database credential. Application service methods currently impose some provenance checks before calling them, but those checks are not independently enforced by PostgreSQL. This creates a database-boundary trust gap if the runtime credential or an arbitrary SQL execution path is compromised. It does not prove that an unauthenticated HTTP caller can directly supply another account/session ID: the inspected HTTP contracts do not expose these IDs for the ordinary register/login/refresh/logout/recovery/reset routes.

Do not route these pre-JWT flows through user-JWT Actor Gateway. The required design is a distinct, tightly controlled internal-auth authority (or equivalent database-verifiable proof) that preserves password verification, one-time refresh/recovery token validation, registration, external provider verification, and privileged account administration.

### Audit items still OPEN

1. Trace every production caller of the persistence methods `validateSession`, `revokeSession`, `revokeAllSessionsForAccount`, `changePassword`, `disableAccount`, `issueRecovery`, `redeemRecovery`, `bootstrapExternalIdentity`, `linkExternalIdentity`, and `linkBusinessExternalMapping`. Search tests separately from runtime call sites.
2. Inspect all later migrations/cutovers for function-level grants/revokes, including `auth_create_account`, auth external identity functions and any role-wide privilege changes. Historical grants above are not a final ACL matrix.
3. Inspect all authentication migration bodies in full, including refresh and recovery constraints, token pepper/key custody, and QuoteFlow migration-reset special handling.
4. Determine whether the production auth service has any other internal callers or deployment wiring beyond `src/http/app.ts`.
5. Build a disposable PostgreSQL final effective-ACL matrix for every auth SECURITY DEFINER function, PUBLIC, runtime, migrator, gateway, owner and any inherited roles. No such qualification has yet been run for this audit.
6. Only after caller and ACL reconciliation, decide which unused broad methods/functions can be revoked, which should be split into narrow internal operations, and how a dedicated internal-auth DB principal can be provisioned without paid infrastructure or production disruption.

### Next action

Continue tracing external identity/bootstrap/link call sites and QuoteFlow migration-reset callers, then audit all later auth-related grants/cutovers and the complete storage lifecycle call graph. Keep this audit read-only until the internal-auth authority design is supported by full caller and ACL evidence. No auth grant has been revoked; no production changes; PR #272 remains open and unmerged.


## Storage metadata lifecycle audit — source/call-path pass 1 (2026-11-11)

This is a source-level trust-boundary audit. No storage code, SQL grants, object metadata, provider object, production data or service configuration was changed.

### Exact source locations inspected

- Storage lifecycle table/function creation: `database/migrations/20261004220000_create_storage_object.sql`, `20261004221000_establish_storage_persistence_boundary.sql`.
- SECURITY DEFINER hardening and runtime grants: `database/migrations/20261004222000_harden_storage_persistence_function_authority.sql`.
- Account-aware metadata getter: `database/migrations/20261026120000_scope_storage_metadata_lookup.sql`.
- Logo binding and public logo projection: `database/migrations/20261106090000_business_logo_storage_binding.sql`.
- Pending-object cleanup transition: `database/migrations/20261110140000_allow_pending_storage_object_cleanup.sql`.
- Signed logo-binding wrapper: `database/migrations/20261111160000_add_signed_business_logo_gateway.sql`; manual cutover `database/cutovers/20261111160000_revoke_legacy_business_logo_runtime.sql`.
- Application lifecycle: `src/storage/repository.ts`, `src/storage/authorization-adapter.ts`, `src/storage/service.ts`, `src/http/storage-router.ts`.

### Final source-level runtime grant disposition

The ordered source history establishes these current intended function signatures and runtime grants; this is not yet a disposable PostgreSQL effective-ACL query:

| Function | Current signature | Source-level runtime EXECUTE |
|---|---|---|
| `storage_create_pending` | `(bigint,text,bigint,text,text,text,bigint,text,text)` | Granted; SECURITY DEFINER after 20261004222000 |
| `storage_mark_available` | `(bigint,text)` | Granted; SECURITY DEFINER after 20261004222000 |
| `storage_mark_deletion_pending` | `(bigint)` | Reaffirmed by 20261110140000; SECURITY DEFINER |
| `storage_mark_deleted` | `(bigint)` | Granted; SECURITY DEFINER after 20261004222000 |
| `storage_get_object` | `(bigint,bigint)` | Granted to runtime by 20261026120000; SECURITY DEFINER |
| `storage_get_public_business_logo` | `(bigint)` | Runtime projection grant in 20261106090000; separately governed public projection |

The earlier one-argument `storage_get_object(bigint)` was explicitly revoked and dropped in 20261026120000. The two-argument replacement accepts object ID plus account ID. Its migration comment explicitly states that the shared runtime is trusted and PostgreSQL cannot derive end-user identity from that shared credential. The SQL applies public-business-logo visibility or active membership for the supplied account ID, but a direct runtime SQL caller can supply another account ID. This is an acknowledged shared-credential trust assumption, not a database-enforced actor boundary.

The Business Logo gateway migration adds a signed wrapper only for `set_business_logo_object`; its paired manual cutover revokes only that legacy binding function from PUBLIC/runtime. It does not revoke or replace the five storage metadata lifecycle functions above. Do not treat Business Logo binding gateway implementation as closure of the storage lifecycle.

### Application call graph and authorization order

- `TransactionalPostgresStorageMetadataStore` in `src/storage/repository.ts` wraps each operation in `withAuthorizedTransaction(context,...)`.
- `createStorageService.createUpload`: validates content type and byte size; calls `authorization.assertCanManage`; then `metadata.createPending`; then requests the provider upload grant.
- `completeUpload`: reads metadata with `getById(objectId)`; reconstructs its resource; calls `assertCanManage`; verifies provider HEAD metadata and downloads/checks actual bytes; validates the business-logo image; only then calls `markAvailable`.
- `getAccess`: reads metadata with `getById`; requires status `available`; calls `assertCanRead`; only then creates a provider download grant.
- `deleteObject`: reads metadata; accepts `pending`, `available`, or `deletion_pending`; calls `assertCanDelete`; marks `deletion_pending` if needed; deletes the provider object; finally marks metadata `deleted`.
- `createPostgresStorageAuthorization` binds the supplied caller user ID to the `AuthContext`, requires Business owner/administrator membership for management/deletion, and requires active membership for non-public reads. Public Business logo read has a separate active-Business check.
- `src/http/storage-router.ts` applies auth middleware to upload, completion, access and delete routes. It derives the caller from AuthContext and performs metadata lookup before completion/access/delete. Logo replacement paths also call the storage service to delete the previous object.

### Confirmed database-boundary gaps

These functions are SECURITY DEFINER and callable by the shared runtime, while their SQL bodies accept object/tenant IDs without independently proving the authenticated actor or the preceding provider/authorization checks:

1. `storage_create_pending(...)`: inserts caller-supplied tenant Business/resource and provider metadata. SQL validates nonblank/positive-shaped fields and status defaults but does not establish active owner/administrator membership or actor provenance.
2. `storage_mark_available(object_id, checksum)`: transitions a pending object to available based only on object ID. The application normally checks the caller's Business management rights and verifies provider bytes first; the SQL function does not prove either.
3. `storage_mark_deletion_pending(object_id)`: latest body allows pending or available objects to enter deletion_pending based only on object ID. This was broadened in 20261110140000 to support cleanup of abandoned pending uploads. The SQL function does not prove actor authorization.
4. `storage_mark_deleted(object_id)`: transitions deletion_pending to deleted based only on object ID. The application normally calls the provider delete first; SQL does not prove provider deletion occurred.
5. `storage_get_object(object_id, account_id)`: uses the supplied account ID for tenant membership checks. A direct runtime caller can substitute an account ID that has membership in the target Business; PostgreSQL does not derive it from the end-user JWT.

These are confirmed database-boundary trust gaps under the shared runtime credential. The normal HTTP/service path performs additional checks; this audit does not claim an unauthenticated HTTP caller can directly select arbitrary account IDs or bypass the application route. A compromised/misused runtime SQL path can bypass those application checks.

### Lifecycle invariants that any replacement must preserve

- Upload grants are short-lived; provider key is generated server-side from Business ID and object UUID.
- Completion verifies provider HEAD size/content type, retrieves bytes, checks byte count and validates image bytes before making metadata available.
- Only available objects can be read/downloaded.
- Delete is intentionally retryable: a failed provider delete or failed final metadata update leaves `deletion_pending`; a later authorized retry must be able to delete again and complete metadata transition.
- Abandoned pending uploads must be eligible for cleanup. The 20261110140000 migration intentionally broadened `storage_mark_deletion_pending` from available-only to pending-or-available.
- Public Business logo reads remain through the separately governed `storage_get_public_business_logo` projection; do not replace this with unrestricted metadata access.
- Business Logo binding is a distinct signed operation and must preserve replacement/unbind/cleanup semantics.

### Disposition and next work

**OPEN / CONFIRMED DATABASE ACTOR-PROVENANCE GAP.** Do not revoke current storage lifecycle grants yet. First design the complete signed storage metadata boundary and route all create, complete, get, delete, retry and cleanup operations through it, or provide a separately justified narrow internal authority for provider-confirmed lifecycle transitions. Bind actor, tenant Business, resource identity, object ID, operation and lifecycle transition to verified JWT-derived assertions wherever an end-user actor exists. For provider/system cleanup without an end-user JWT, use a distinct narrowly scoped internal storage authority and prove it cannot perform arbitrary tenant operations.

Next qualification must use disposable PostgreSQL with distinct runtime, Actor Gateway, internal storage authority (if needed), and migrator roles. Prove runtime direct function EXECUTE denial after cutover; signed actor/tenant/object substitution and replay denial; upload completion cannot mark available without matching provider verification path; only authorized actors can read/delete; public logo projection remains constrained; and deletion retry/pending cleanup still works end-to-end. Compare final effective ACLs including PUBLIC and memberships. No production cutover, no production mutation, no paid service.


## Internal authentication caller trace — follow-up pass (2026-11-11)

Additional source paths inspected:
- `src/auth/foundation/persistence.test.ts`
- `src/migrations/quoteflow-migration-reset-recovery.ts`
- `src/migrations/quoteflow-migration-reset-completion.ts`
- `src/migrations/quoteflow-migration-reset-enrollment.ts`
- `src/migrations/quoteflow-migration-account-provisioning.ts`
- `src/migrations/quoteflow-migration-reconciliation.ts`

### Caller classification refined

- `issueRecovery(accountId)` has two identified service callers: normal password recovery after normalized-email credential lookup, and QuoteFlow migration-reset recovery after a dedicated migration-enrollment lookup. Both deliver the raw one-time token to the approved email address; the account ID comes from the server-side lookup result, not the HTTP request body. The SQL function itself still trusts a supplied account ID.
- `resetPasswordWithRecovery(token,email,password)` derives account ID from `auth_redeem_recovery(token_hash)` inside the same transaction, then sets the password and revokes all sessions. The public reset route accepts token/email/password, not account ID. This is the correct provenance pattern to preserve.
- `completeQuoteFlowMigrationReset(token,password)` delegates to a dedicated atomic persistence operation and the public completion route subsequently calls login with the returned email/password. The dedicated SQL function and its full grant/ACL/call contract remain to be inspected.
- `linkExternalIdentity(provider,subject,accountId)` is used by the explicit QuoteFlow migration provisioning/reconciliation services. Those services require a resolved target account and use the fixed source provider `supabase`; this is a controlled migration operation, not a public login/register HTTP route. The migration provisioning contract explicitly avoids creating sessions or inventing credentials. The account ID is still an input to the persistence/database function and must be protected by a narrow migration authority rather than assumed safe because the TypeScript service is internal.
- `lookupExternalIdentity` supports that migration provisioning flow. The SQL lookup is keyed by provider+subject.
- `linkBusinessExternalMapping(provider,externalBusinessId,businessId)` is part of the QuoteFlow Business migration provisioning store contract; the concrete store implementation/caller authority still needs locating. Its SQL function accepts a Business ID and does not independently prove migration authority.
- `bootstrapExternalIdentity(provider,subject,...)` is covered by persistence tests, but no public OAuth/provider HTTP route or production service caller was found in the inspected `src/auth`, `src/http`, and `src/migrations` paths. Treat as no production caller identified, not proof of global non-use.
- `disableAccount(accountId)`, `changePassword(accountId,keepSessionId,...)`, `revokeSession(sessionId,...)`, and `revokeAllSessionsForAccount(accountId,...)` appear as persistence interface/class methods and are exercised in persistence tests. No corresponding public HTTP route or `GhmAuthService` method was found in the inspected source. `revokeAllSessionsForAccount` is also used internally by the recovery-reset transaction through SQL. The direct persistence convenience method remains a separate broad entry point.
- `validateSession(sessionId)` is used in persistence tests and available as a persistence method; no production route/service caller was identified in the inspected AuthService/AuthRouter. Verify all repository references before removing or changing it.

### Consequence

The audit now separates three classes that must not be conflated:

1. **Pre-authentication credential/capability flows:** register, password-verified login, refresh-token rotation, logout by refresh token, password recovery/reset. These need a dedicated internal-auth DB authority that can prove or derive account/session identity from verified credentials or one-time tokens. A user-JWT gateway is not appropriate before token issuance.
2. **Founder/migration-only identity linking:** QuoteFlow external identity and Business mapping operations. These need a migration-only authority with explicit approval/provenance, not broad permanent runtime EXECUTE merely because a TypeScript migration service calls them.
3. **Unexposed or test-only persistence methods:** direct account disable, direct session revoke, direct account-wide revoke, direct password change and external bootstrap. Confirm all repository references and remove/restrict unused methods/functions only after a complete caller search and compatibility check.

### Remaining internal-auth checks

- Locate the concrete QuoteFlow migration persistence adapters and their execution entry points; prove how migration manifest/resolution inputs are approved and how the runtime credential is selected.
- Inspect `auth_complete_quoteflow_migration_reset` definition, grants, enrollment constraints and token semantics.
- Reconcile every later migration for final auth function grants/revokes and role inheritance; the list of original grants above is not a final ACL result.
- Confirm whether `auth_bootstrap_external_identity` has any active non-HTTP provider caller outside the inspected directories.
- No auth grant revocation or internal-auth implementation is authorized by this source audit alone.


## QuoteFlow migration authentication boundary — special-function review (2026-11-11)

Additional migration files inspected:
- `database/migrations/20261004030000_create_quoteflow_migration_account_provisioning.sql`
- `database/migrations/20261004040000_reconcile_quoteflow_migration_account_provisioning.sql`
- `database/migrations/20261004181000_add_quoteflow_migration_reset_enrollment_lookup.sql`
- `database/migrations/20261004190000_add_quoteflow_migration_reset_completion.sql`
- `database/migrations/20261004191000_extend_quoteflow_migration_reset_enrollment_lookup.sql`
- `src/migrations/quoteflow-migration-account-provisioning.ts`
- `src/migrations/quoteflow-migration-reconciliation.ts`
- `src/migrations/quoteflow-migration-reset-recovery.ts`
- `src/migrations/quoteflow-migration-reset-completion.ts`

### Migration-only operations still exposed to the runtime role in source history

- `auth_provision_migration_account(provider,subject,full_name,role)`: SECURITY DEFINER; restricted to provider `supabase`, creates a credentialless account and external mapping atomically, creates no password credential/session/business/membership, but grants EXECUTE to `ghm_runtime`. It accepts caller-supplied external subject and has no database-verifiable founder/migration approval proof.
- `auth_link_external_identity(provider,subject,account_id)`: SECURITY DEFINER and runtime-executable. The QuoteFlow account provisioning/reconciliation service calls it only for an already-resolved target account with fixed provider `supabase`. The SQL itself does not prove that the mapping request came from an approved migration operation.
- `auth_link_business_external_mapping(provider,external_business_id,business_id)`: SECURITY DEFINER and runtime-executable. The QuoteFlow Business provisioning service contract uses a fixed `supabase` provider and validated nonblank source organization/business fields, but the SQL itself only verifies that the target Business exists; it does not prove migration approval or Business ownership. The concrete production store/entry point still needs locating.
- `auth_lookup_quoteflow_migration_reset_enrollment(normalized_email)`: SECURITY DEFINER and runtime-executable; returns enrollment/account details only for a reset_required enrollment, active account and matching Supabase external identity. The HTTP recovery endpoint does not return this lookup result directly.
- `auth_complete_quoteflow_migration_reset(token_hash,password_hash,...)`: SECURITY DEFINER and runtime-executable. It locks a reset_required enrollment, requires a valid unexpired unused recovery token for that same account, requires active account and matching external identity mapping, consumes the token, sets password to the enrollment's approved email, revokes all sessions, and marks enrollment completed in one transaction. The public completion route accepts token/password, not account ID; it then performs a normal password login to issue a new session. This is a token-bound special case and its invariants must be preserved.

The QuoteFlow reset recovery service derives account ID from the server-side enrollment lookup and sends the opaque token to the enrollment's approved email. The completion SQL derives the account from the matching token/enrollment; it does not trust an HTTP-supplied account ID. This is materially stronger than raw account-ID revocation or disable functions.

### Concrete caller discovery status

- The QuoteFlow migration account-provisioning and reconciliation services are present as TypeScript service contracts and orchestration logic. Their store interfaces are defined, but the concrete runtime store/approved execution entry point was not located in the inspected `src/migrations` directory.
- `src/migrations/quoteflow-migration-business-provisioning.ts` similarly defines the Business provisioning service contract, but a concrete production store and its authority context have not yet been identified.
- Persistence tests exercise `bootstrapExternalIdentity`, `linkExternalIdentity`, `linkBusinessExternalMapping`, `disableAccount`, and recovery/session primitives. Test coverage does not establish a production caller.
- No active public OAuth/external-provider HTTP route was found in the inspected auth router. Do not claim the external identity bootstrap function is safely provider-authenticated until its actual caller is identified.

### Updated security disposition

The auth RPC family must be split into:
1. Pre-authentication runtime authority for register/login/refresh/logout/recovery/reset, with database operations tied to verified password or one-time token proofs.
2. Migration-only authority for credentialless account provisioning and external person/business identity mapping, with a founder-approved migration manifest/resolution proof and no general runtime EXECUTE.
3. Unused/test-only legacy methods such as direct account disable, direct session-ID revoke, direct account-wide revoke and direct account/session password change; remove or narrow only after complete repository reference and compatibility checks.

Do not convert these migration-only or pre-JWT operations into ordinary user-JWT Actor Gateway routes. A separate internal-auth/migration authority design is required. No grants have been revoked and no production changes were made.


## Ordered migration-reference scan — authentication RPC follow-up (2026-11-11)

A branch-pinned scan fetched all 72 migration SQL files later than `20260921130000_create_auth_runtime_functions.sql` and searched for the exact auth lifecycle, external identity, migration provisioning, and QuoteFlow reset function names.

Results:
- The original auth runtime grant set is in `20260921130000_create_auth_runtime_functions.sql`.
- Refresh rotation is replaced/reaffirmed in `20260921130100_fix_auth_rotate_refresh_ambiguity.sql` and `20260921130200_auth_rotate_refresh_replay_outcome.sql`; both continue to revoke PUBLIC and grant runtime EXECUTE.
- `auth_link_external_identity` and `auth_link_business_external_mapping` are created/granted in their dedicated 20260921130400/130500 migrations.
- `auth_provision_migration_account` is created/replaced in 20261004030000 and 20261004040000; both versions revoke PUBLIC and grant runtime EXECUTE.
- QuoteFlow reset lookup and completion are created/granted in 20261004181000, 20261004190000 and lookup replacement 20261004191000.
- No later migration among the 72 scanned files contained a matching revoke/replacement for the listed auth lifecycle function signatures.

This materially increases confidence that those source-level runtime grants were not later explicitly revoked by a function-specific migration in the scanned chain. It is still **not** a final effective-ACL proof: PUBLIC/default privileges, role memberships, overloads, function owner, implicit privileges, actual database catalog state and any out-of-band SQL remain to be checked on disposable PostgreSQL and, separately, production after its release gates.

No auth grants were changed. No production database access or mutation occurred.


## Ordered migration-reference scan — storage lifecycle follow-up (2026-11-11)

A branch-pinned scan fetched the 57 migration SQL files from `20261004220000` onward and searched exact storage lifecycle and Business Logo binding function names.

Confirmed sequence:
- `20261004221000_establish_storage_persistence_boundary.sql` creates the lifecycle functions and grants runtime EXECUTE.
- `20261004222000_harden_storage_persistence_function_authority.sql` converts lifecycle functions to SECURITY DEFINER with fixed search paths, revokes PUBLIC, and reaffirms runtime EXECUTE.
- `20261026120000_scope_storage_metadata_lookup.sql` replaces the ID-only getter with `storage_get_object(bigint,bigint)`, revokes/drops the old one-argument function, and grants runtime EXECUTE on the account-aware signature.
- `20261106090000_business_logo_storage_binding.sql` creates the logo-binding function, revokes PUBLIC/migrator, and grants runtime EXECUTE; the public logo projection is separately granted to runtime.
- `20261110140000_allow_pending_storage_object_cleanup.sql` replaces `storage_mark_deletion_pending(bigint)` to support pending and available cleanup, revokes PUBLIC/migrator and re-grants runtime EXECUTE.
- `20261111160000_add_signed_business_logo_gateway.sql` adds the signed gateway wrapper for logo binding and restricts that wrapper to `ghm_actor_gateway`; it does not revoke runtime EXECUTE on the storage metadata lifecycle functions.

No later migration in the 57-file scan revoked/replaced the runtime grants for `storage_create_pending`, `storage_mark_available`, `storage_mark_deletion_pending`, `storage_mark_deleted`, or `storage_get_object(bigint,bigint)`. The only manual cutover found for this related slice is `20261111160000_revoke_legacy_business_logo_runtime.sql`, which revokes only `set_business_logo_object`.

This is an ordered migration-source result, not a live effective-ACL proof. PUBLIC/default privileges, role membership, actual function owners and production catalog state remain separate checks. The five metadata functions remain OPEN under the shared runtime credential. No storage grant was changed and no production state was touched.


## Existing storage qualification coverage review — exact gap recorded (2026-11-11)

Inspected:
- `scripts/qualify-storage-persistence.mjs`
- `src/storage/repository.test.ts`
- `src/storage/service.test.ts`
- `src/db/storage-pending-cleanup-migration-contract.test.ts`
- `package.json` test/qualification scripts.

The existing storage qualification is a persistence/application-boundary qualification, not a signed actor-provenance cutover qualification:

- It explicitly checks that the runtime role has EXECUTE on all five canonical storage metadata functions. It fails if those EXECUTE privileges are absent.
- It checks runtime direct INSERT/UPDATE/DELETE on `ghm.storage_object` are denied.
- It directly calls `storage_create_pending`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted` as runtime to exercise the lifecycle.
- It tests the account-aware getter for a known active member and a synthetic non-member account ID, and checks public logo visibility.
- It proves pending -> available -> deletion_pending -> deleted transitions and the pending-object cleanup path.
- It does not prove that the runtime caller cannot forge another active member's account ID, create metadata for an unauthorized tenant, mark an arbitrary pending object available, or transition another tenant's object to deletion_pending/deleted.
- It does not apply a storage metadata manual cutover, because no such cutover exists.

Unit tests in `src/storage/service.test.ts` correctly prove that the normal service calls application authorization before metadata state transitions and provider operations, and that deletion retries preserve `deletion_pending`. These application-path tests must be retained and extended, not replaced.

**Revised disposition:** existing storage lifecycle functional behavior remains covered; database actor provenance is OPEN / NOT QUALIFIED. The current qualification's expected runtime EXECUTE is an intentional legacy persistence contract, not evidence that direct runtime function invocation is safe against a compromised/misused shared credential. A future signed/internal gateway qualification must supersede this assumption and explicitly prove runtime EXECUTE denial only after every normal upload/read/delete/cleanup flow has been routed through its replacement.


## Connect Business external-mapping ACL/call-path reconciliation (2026-11-11)

A deeper review of the external Business mapping family found an application/ACL mismatch that was not visible from the migration marker scan alone.

### Ordered ACL history

- `20260921120300_create_business_external_mapping.sql` initially grants runtime SELECT and sequence USAGE on `ghm.business_external_mapping`, while denying runtime DML.
- `20260921130500_auth_link_business_external_mapping.sql` creates SECURITY DEFINER `auth_link_business_external_mapping(provider,external_business_id,business_id)`, revokes PUBLIC, grants runtime EXECUTE, and reiterates that runtime cannot INSERT/UPDATE/DELETE the table.
- `20261012000000_auth_lookup_business_external_mapping.sql` creates SECURITY DEFINER `auth_lookup_business_external_mapping(provider,external_business_id)`, returns the canonical Business ID, revokes PUBLIC and grants runtime/migrator EXECUTE.
- `20261012120000_revoke_runtime_business_mapping_table_access.sql` explicitly revokes SELECT and all DML/other table privileges from `ghm_runtime`. The intended model is function-only lookup, not direct table access.
- A source scan of later migrations found no later re-grant of direct table SELECT.

### Application mismatch

`src/integrations/connect/business-adapter.ts` still implements `findMapping` using direct SQL SELECT from `ghm.business_external_mapping`. It runs inside `withAuthorizedTransaction`, which uses the normal transaction pool and does not SET ROLE to schema owner. The adapter therefore cannot execute this lookup under the intended `ghm_runtime` ACL after migration 20261012120000.

The same adapter's `linkMappingInTransaction` calls `auth_link_business_external_mapping` directly. That function accepts caller-supplied provider/external Business ID/target Business ID and checks only that the target Business exists and that the mapping is not conflicting; it does not independently verify that the authenticated actor owns/manages the target Business or that the integration request is approved. The ordinary adapter path calls `requireAuthenticatedContext`, `assertRole(context,'admin','business')`, and creates the canonical Business plus owner membership before linking, but the database function trusts that application sequence.

### Qualification coverage

- `src/integrations/connect/business-adapter.persistence.test.ts` is a live PostgreSQL test using distinct runtime/migrator URLs. It invokes the adapter using the runtime pool and directly inspects mapping rows through schema-owner setup/verification. Its adapter's initial direct SELECT conflicts with the later runtime SELECT revocation.
- `package.json` exposes `qualify:connect-business-provisioning-live`, but the main `npm test` script does not include `business-adapter.persistence.test.js`; the CI workflow does not invoke that live qualification command.
- The ordinary unit test `business-adapter.test.ts` uses a fake database client that accepts the direct SELECT and therefore cannot detect the real ACL mismatch.
- `auth_lookup_business_external_mapping` is not called by the inspected Connect adapter, Connect HTTP router, or commercial repository. Its migration comment says payment preparation uses it, but that caller was not found in those inspected files; perform a repository-wide source caller check before deciding whether this function is dead code or used through another path.

### Disposition

**Confirmed source/ACL incompatibility in the Connect Business adapter's direct mapping lookup; live production impact is not yet established because the adapter is not wired by the inspected `src/http/app.ts` Connect router and no deployment call path has been demonstrated.** Do not restore table SELECT. The repair should make the adapter use a narrowly scoped SECURITY DEFINER mapping projection returning the complete fields required by `BusinessExternalMapping`, or a separately designed approved integration read boundary. Add exact live PostgreSQL qualification under the actual runtime role after the fix.

The mapping mutation function is a separate actor/integration provenance boundary. Decide whether it should be a signed Actor Gateway operation bound to the authenticated GHM actor, provider, external Business ID and canonical Business ID, or a distinct integration authority that verifies the trusted Connect request. Do not assume `assertRole` in TypeScript makes the database function independently safe.

No code, grants, Connect routing, production data or production permissions were changed during this investigation.


## Connect integration lifecycle and service-assertion RPC review (2026-11-11)

Inspected:
- `database/migrations/20261002101500_create_connect_integration_lifecycle.sql`
- `database/migrations/20261002130000_create_connect_service_assertion_replay.sql`
- `src/integrations/connect/integration-lifecycle.ts`
- `src/integrations/connect/service-assertion.ts`
- `src/integrations/connect/service-assertion-replay.ts`
- `src/integrations/connect/trusted-request-context.ts`
- `src/http/connect-service-router.ts`

### Integration lifecycle

- `ghm.connect_integration` has runtime SELECT only; PUBLIC table access is revoked.
- `connect_integration_get(text)` is SECURITY INVOKER and runtime-executable; the application repository uses it to resolve integration lifecycle state.
- `connect_integration_create`, `connect_integration_disable`, `connect_integration_enable`, and `connect_integration_revoke` are SECURITY DEFINER and PUBLIC-revoked, but no runtime EXECUTE grant is issued in the inspected migration. Their mutation surface is therefore not exposed to the shared runtime by this migration.
- No caller-supplied end-user account ID is involved in this lifecycle getter. The integration identity is a separate service principal, not an end-user identity.

### Service assertion replay protection

- `ghm.connect_service_assertion_replay` has PUBLIC table privileges revoked; runtime direct table DML is not granted.
- `connect_service_assertion_consume(jti,integration_id,expires_at)` is SECURITY DEFINER, PUBLIC-revoked and runtime-executable. It validates identifier shapes and future expiry, removes expired rows, then inserts the JTI idempotently.
- `src/http/connect-service-router.ts` verifies the ES256 service assertion before calling `requireFreshConnectServiceAssertion`; only after replay consumption does it establish the trusted context and require the integration to be active. The verified assertion's subject/JTI are carried into the trusted request.
- The database replay function does not independently verify the ES256 signature. Its trust model is that only the application calls it after successful cryptographic verification. A direct runtime SQL caller could insert chosen replay JTIs and cause denial of service for matching requests, but cannot use this function to create an authenticated integration context or read tenant data.
- The runtime cannot directly insert/update/delete the replay table under the inspected table ACL; the function-only path is intentional for atomic replay consumption.

### Disposition

The Connect lifecycle mutation RPCs are not runtime-granted in the inspected migration and are not a current shared-runtime mutation exposure. The active Connect replay function is a narrow service-internal operation whose security depends on signature verification before invocation; record its residual database trust assumption, but do not convert it into a user-JWT Actor Gateway operation. Any future hardening should bind replay consumption to a separate service authority or a signed assertion proof, while preserving one-use JTI semantics.

No Connect integration lifecycle or replay grants were changed. No production changes were made.


## Session checkpoint — latest verified repository state (2026-11-11 21:15 UTC)

- GHM PR #272 remains OPEN and UNMERGED.
- Current branch: `integration/capability-gateway-qualification-20261110`.
- Current PR head: `3d2c5796e19a06a6eea6bf40adb109f7e8db869f`.
- The latest commits made during this recovery session are documentation-only handover additions. No runtime code, SQL migration, cutover, role, grant, secret, production service or production data was changed.
- GitHub Actions run #3298 / run ID `43097925792` remains QUEUED with event `pull_request` and run head SHA `1ee5e91d247bb315df43f532a3beea7d10c1a344`. Its PR metadata now points at the newer current PR head, but the run's own `head_sha` is still the older commit. Do not treat it as exact-current-head qualification. No jobs/results were returned when checked.
- The current PR head `3d2c5796e19a06a6eea6bf40adb109f7e8db869f` has no workflow run/status returned by the GitHub connector at this checkpoint. Do not claim CI passed for the current head.
- Latest handover update includes internal-auth RPC caller review, ordered auth migration grant scan, storage metadata call graph and qualification coverage gap, ordered storage grant scan, Connect Business mapping ACL mismatch, and Connect integration lifecycle/replay review.

### Immediate continuation point

Continue with a bounded repository-wide search for remaining SECURITY DEFINER functions with runtime EXECUTE that accept account/session/business/resource identifiers, using this handover to skip the already reviewed families. Prioritize exact caller reachability and later ACL/cutover reconciliation. For the Connect Business mapping mismatch, do not restore table SELECT: the next implementation should use a full-field SECURITY DEFINER projection or a governed integration boundary and add live runtime-role PostgreSQL qualification. Keep the migration/production role boundaries unchanged until their dedicated qualification and release gates are satisfied.


## Founder directory-review RPC and route reconciliation (2026-11-11)

This family was traced because the founder review authority had previously been marked as disabled.

### Migration history / final source disposition

- `20261005210000_create_founder_system_admin_bootstrap.sql` created a one-time founder bootstrap function that was explicitly revoked from PUBLIC and `ghm_runtime`.
- `20261005211000_correct_founder_system_admin_bootstrap_existing_account.sql` replaced it with a promotion-only function for the already-existing canonical founder account and again revoked PUBLIC/runtime. It does not create the founder account or expose a runtime bootstrap route.
- `20261105230000_create_founder_directory_review.sql` initially created SECURITY DEFINER review RPCs accepting `p_account_id`, and granted runtime EXECUTE on submit/list/review/presentation functions.
- `20261109130000_harden_evidence_and_founder_review_authority.sql` temporarily tied reviewer resolution to the one-time founder system-admin state.
- `20261109140000_close_evidence_and_founder_review_authority.sql` deliberately disabled founder review: `is_directory_listing_founder_reviewer(bigint)` now returns false and is revoked from PUBLIC/runtime; submit/list/review functions are revoked from PUBLIC/runtime.
- That final close migration does **not** revoke `get_business_directory_review_presentation(bigint,bigint)`. It remains SECURITY DEFINER and runtime-executable from the earlier migration.

### Application caller and route mismatch

- `src/resources/directory-review/repository.ts` still calls all four functions: submit, list, review and presentation.
- `src/http/directory-review-router.ts` still registers POST business submission, GET admin review list, PATCH admin decision and GET business review presentation routes.
- `src/resources/registry.ts` still registers `directory_review` read/create/transition, and `src/auth/authorization.ts` includes `directory_review` in admin, customer and business role resources.
- The authority probe route explicitly returns `{ isFounderReviewer: false }`, but the POST/list/PATCH routes remain wired to functions whose runtime EXECUTE was revoked. The submission function would also reject because the reviewer allowlist is intentionally unconfigured/disabled.
- The GET business presentation route remains meaningful: `get_business_directory_review_presentation` verifies active owner/administrator membership for the supplied account ID and Business ID, and the repository invokes it after `withTenantTransaction` using `context.userId`. This is application-path guarded but still trusts the supplied account ID at the database function boundary.

**Disposition:** founder bootstrap is correctly non-runtime/deployment-only. Founder review submit/list/decision database functions are intentionally disabled at the SQL layer, but their HTTP routes and resource registration were not reconciled in the inspected code. These routes are therefore dead/mismatched and may surface permission errors rather than a deliberate 403/410. The presentation getter remains active and is a separate caller-supplied account-ID database trust gap.

### Trigger helper privilege note

`prevent_directory_review_event_mutation()` and `reject_expired_capability_evidence_verification()` are trigger-only functions. Their creation migrations do not explicitly revoke PUBLIC EXECUTE. PostgreSQL's default function EXECUTE grant therefore needs to be checked against schema usage and effective role privileges. Trigger functions cannot be called as ordinary SQL functions, and runtime has no trigger-creation/table DML authority on the protected tables in the inspected migrations; this is a least-privilege cleanup candidate, not a demonstrated bypass. Future migrations should explicitly revoke PUBLIC EXECUTE from trigger-only helpers.

### Next work

1. Decide whether to remove/disable the dead directory-review submit/list/decision HTTP routes and their registry operations, while retaining the owner-facing presentation read if still needed.
2. If presentation remains, replace the raw account-ID SQL trust with a signed actor-bound read operation or another database-verifiable context mechanism; preserve owner/administrator-only visibility.
3. Add migration-contract and HTTP tests that prove disabled founder review endpoints return the deliberate denial response and cannot reach revoked RPCs.
4. Verify trigger-helper effective EXECUTE ACLs and revoke PUBLIC explicitly in a cleanup migration if no required trigger invocation depends on PUBLIC.

No directory-review function grants or routes were changed in this audit. No production changes.


## Founder directory-review route reconciliation — implementation checkpoint (2026-11-11)

Following the source audit above, the explicitly disabled founder-review write paths were reconciled in application code:

- `src/http/directory-review-router.ts`: the legacy submit, admin queue and admin decision routes now return deterministic 403 responses after authentication and never call the revoked database functions. The authority endpoint continues to report `isFounderReviewer:false`. The owner-facing presentation read remains.
- `src/resources/registry.ts`: `directory_review` now registers only `read`; disabled create/transition operations are no longer advertised as governed operations.
- `src/resources/directory-review/contracts.ts`, `service.ts`, and `repository.ts`: removed the disabled submit/list/review service and repository methods and retained only the owner presentation read. This removes stale application callers for the revoked write RPCs.
- `src/http/directory-review-router.test.ts`: replaced tests that expected the disabled endpoints to execute with tests proving submit/list/decision return 403 and the owner presentation read remains available.
- `src/resources/directory-review/service.test.ts` and `src/resources/registry.test.ts`: now qualify only the active read operation and reject create/transition.
- `src/db/directory-review-migration-contract.test.ts`: now checks that the final founder-review close migration revokes the write RPCs while preserving the separate presentation getter.

The presentation getter remains OPEN for database actor provenance: `get_business_directory_review_presentation(p_account_id,p_business_id)` is still SECURITY DEFINER/runtime-executable and trusts the supplied account ID. The normal application path uses `withTenantTransaction` and AuthContext, but a direct runtime SQL caller can substitute another active owner/administrator account. Do not mark the entire directory-review boundary closed.

### Validation / unrelated CI blocker

The first CI runs on the implementation commits failed before the test suite at the pre-existing Trust Score qualification syntax check. Inspection found two literal escaped quote sequences in `scripts/qualify-trust-score-gateway-cutover-postgres.mjs` lines 72 and 100, which caused `node --check` to fail. Corrected those two quotes in commit `fb1e08146fff34f448630bb7b1a53fdf4430e639`. This was not caused by the directory-review changes.

Current PR head at this checkpoint: `b60a2e937005cc92c258d185ef4fc47c6eb8a061`. GitHub Actions PR run ID `43102773940` is IN PROGRESS; do not claim the updated suite passed until its exact-head result is complete. Earlier failed runs at heads `0e1684f`, `377fa60`, `cced0bf`, and `d4e1dbd` all stopped at the same Trust Score script syntax check; the web-quality job succeeded. The corrected latest run must still prove build, full tests, disposable migrations and all qualification steps.

No database migration, SQL grant, production role, deployment or production data was changed. PR #272 remains open and unmerged.


## External person identity mapping table boundary — remediation implementation checkpoint (2026-11-11)

The source audit confirmed that `20260921120200_create_account_external_identity.sql` granted `ghm_runtime` direct SELECT and sequence USAGE on `ghm.account_external_identity`, while later application code already used the SECURITY DEFINER `auth_lookup_external_identity(text,text)` function. No current application code requires direct runtime table reads. The QuoteFlow DB qualification script was the only identified runtime direct reader; it has been changed to use the governed lookup function. The persistence test's direct mapping inspection is performed under `ghm_migrator` after `SET ROLE ghm_schema_owner`.

### Changes made

- Added `database/migrations/20261111210000_revoke_runtime_account_external_identity_table_access.sql`.
  - Revokes all PUBLIC and `ghm_runtime` privileges on `ghm.account_external_identity`.
  - Revokes all PUBLIC and `ghm_runtime` privileges on `ghm.account_external_identity_id_seq`.
  - Explicitly preserves runtime EXECUTE on the existing SECURITY DEFINER lookup, link, bootstrap and QuoteFlow migration-provisioning functions. Their owners retain the table/sequence access required internally.
- Updated `scripts/qualify-quoteflow-migration-account-provisioning-db.mjs` so runtime preflight and diagnostic lookup use `auth_lookup_external_identity`; migrator verification remains direct under the owner role.
- Updated `src/auth/foundation/persistence.test.ts` to assert runtime has no SELECT/INSERT/UPDATE/DELETE on the mapping table and no sequence USAGE, that direct SELECT/INSERT/nextval are denied, and that governed link + lookup functions still work.

### Scope and remaining risks

This change closes direct enumeration of the external identity mapping table by the shared runtime while preserving the existing identity lookup and provisioning contracts. It does **not** yet close the separate broad function-authority risks:
- `auth_bootstrap_external_identity`, `auth_provision_migration_account`, and `auth_link_external_identity` remain runtime-executable and need their caller/migration authority reconciled.
- `auth_link_business_external_mapping` remains runtime-executable and lacks database actor/integration provenance; see the Connect Business mapping audit above.
- The other pre-authentication auth functions still require a dedicated internal-auth authority design.

No production ACL was changed. The new migration is only in the open PR branch and must be qualified on disposable PostgreSQL. Current code head at this checkpoint: `cf06ba02652189f9b418c39caa0437b7a80cf54f`. GitHub Actions run `43103300049` is IN PROGRESS on this exact head; no pass is claimed.


## External identity adapter call-path clarification and CI progress (2026-11-11)

Further inspection of `src/integrations/connect/identity-adapter.ts` and `src/integrations/connect/authorization-binding.ts` established:

- `ConnectIdentityAdapter` is explicitly a domain/integration seam, not an HTTP endpoint; it accepts a validated external UUID subject, not a Supabase JWT.
- The active governed authorization binding calls `identity.resolve(subject, { allowBootstrap: false })`. It requires an existing `supabase` mapping and then checks the canonical GHM account is active before deriving AuthContext.
- The adapter supports optional bootstrap for a trusted caller, and tests cover that optional path, but the inspected production authorization-binding path explicitly disables it. No public HTTP route was found that allows an external caller to request bootstrap.
- Therefore the direct table SELECT/sequence revocation preserves the active Connect identity lookup path. The optional bootstrap function remains a separate internal-authority question; do not remove it solely because the current authorization-binding path does not use it.

### Disposable CI progress for external identity ACL migration and directory-review route fix

On exact PR head `1ce967db5a161e82b41ef40ec4315a4ca7572a22`, GitHub Actions run `43103370681`:
- `web-quality`: completed successfully.
- `quality`: build succeeded; all migrations applied to disposable PostgreSQL successfully; isolated Actor Gateway principal qualification succeeded; storage/Opportunity SQL qualification steps reached; full `Test suite` step completed successfully, including the new external identity table ACL assertions and directory-review route/service/registry tests.
- At the last check, the quality job was still running the Business Hours signed gateway disposable PostgreSQL qualification. Remaining qualification steps had not yet completed. Do not mark the whole workflow PASS until both jobs finish successfully.

No production database, Render role, deployment or user data was touched. Current PR #272 remains open and unmerged.


## Unused authentication administration RPCs — least-privilege remediation checkpoint (2026-11-11)

A targeted source reference check covered the auth service, recovery/reset services, bearer/auth middleware, all auth foundation files, Connect identity adapter and the inspected migration service paths. No active HTTP or application-service callers were found for:
- `auth_revoke_session(bigint,text)`
- `auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)`
- `auth_disable_account(bigint)`

Their only application callers were dead convenience methods on `AuthPersistence`; the only direct test caller was the old `disableAccount` test. The normal logout route uses `auth_revoke_by_refresh_hash`, password recovery uses the one-time recovery transaction, and there is no password-change or account-disable HTTP route.

### Changes made

- Added `database/migrations/20261111220000_revoke_unused_auth_runtime_entry_points.sql`, revoking PUBLIC and `ghm_runtime` EXECUTE on those three functions. The functions remain owned by `ghm_schema_owner`; this does not drop them or alter their definitions.
- Removed the unused `revokeSession`, `revokeAllSessionsForAccount`, `changePassword`, and `disableAccount` convenience methods from `AuthPersistence` / `PostgresAuthPersistence`. The account-wide revoke SQL function remains runtime-executable because the active password-recovery reset transaction still calls it after one-time token redemption.
- Updated the Connect identity adapter test mock to match the narrowed persistence interface.
- Replaced the old account-disable behavior test with a database-backed ACL qualification proving runtime cannot execute the three removed administration RPCs.

### Deliberately not changed

- `auth_validate_session(bigint)` remains runtime-executable and is covered by auth persistence tests; it is read-only and may be used by future internal session validation. No route was added.
- `auth_revoke_all_sessions_for_account(bigint,text)` remains runtime-executable because the current recovery reset transaction calls it after `auth_redeem_recovery` derives the account from a valid one-time token. This is still an open internal-auth boundary requiring an atomic/token-bound authority design.
- `auth_set_password` and `auth_create_session_with_refresh` remain required by verified login/registration/recovery flows and are not revoked by this batch.
- `auth_bootstrap_external_identity`, `auth_provision_migration_account`, and external identity linking remain separately scoped internal/migration authority questions.

### Validation status

Current PR head at this checkpoint: `5fec70399ae220c5f1390dcd74c9dd5087248c16`. GitHub Actions PR run `43104203851` is IN PROGRESS on this exact head. The earlier intermediate build failure at head `a955787` occurred before the persistence test was updated to remove the deleted method; the current head contains the replacement ACL test. Do not claim the new auth ACL migration or full workflow passed until the current-head disposable migration and database-backed auth test complete.

No production database, role, grant, deployment or user data was changed.
