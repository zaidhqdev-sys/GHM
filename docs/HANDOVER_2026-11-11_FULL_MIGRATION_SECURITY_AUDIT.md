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


## Unused auth administration RPC batch — latest validation checkpoint (2026-11-11)

The first build after removing the unused persistence methods exposed one additional mock in `src/http/auth-router.test.ts` that still implemented `revokeSession`, `revokeAllSessionsForAccount`, `changePassword`, and `disableAccount`. Those four stale mock properties have now been removed in commit `d9e4ec68f05ca71d57d04a9858a1a12686e70371`. A follow-up source check confirms no remaining application/persistence references to the removed methods; the remaining `auth_revoke_session`, `auth_change_password`, and `auth_disable_account` references are only the new database ACL assertions.

On PR head `d9e4ec68f05ca71d57d04a9858a1a12686e70371`, GitHub Actions run `43104412505`:
- Build: PASS.
- All migrations, including `20261111210000` and `20261111220000`: applied successfully to disposable PostgreSQL.
- Storage getter and lifecycle qualification: PASS.
- Full test suite: PASS, including the new auth function ACL assertions, external identity table ACL tests, and directory-review route tests.
- At the last check, the workflow was still running Trust Score signed gateway disposable PostgreSQL qualification and had not completed all remaining qualification jobs. Overall workflow is still IN PROGRESS; do not claim full CI PASS yet.

### Newly identified next auth boundary item — account-wide session revocation

The original `auth_redeem_recovery(bytea)` already consumes the one-time recovery token and calls `auth_internal_revoke_all_sessions_for_account`. However, `PostgresAuthPersistence.resetPasswordWithRecovery` then redundantly calls `auth_revoke_all_sessions_for_account(account_id,...)` again after setting the password. This second call is normally a no-op because the sessions were already revoked by `auth_redeem_recovery`; it also keeps a broad caller-supplied account-ID revocation RPC runtime-executable.

The QuoteFlow migration reset completion function also calls `auth_revoke_all_sessions_for_account` internally from a SECURITY DEFINER function; nested owner execution does not require a runtime grant. Next batch should introduce a token-bound recovery redemption result that returns both account ID and revoked-session count, update the normal reset path to use it, then revoke runtime EXECUTE on the direct account-ID revoke wrapper. Preserve the token single-use, atomic reset, and QuoteFlow migration-reset behavior. Do not revoke `auth_set_password` yet; login rehash still uses it after successful password verification.


## Trust Score qualification fixture reconciliation (2026-11-11)

The completed run `43104412505` on code head `d9e4ec68f05ca71d57d04a9858a1a12686e70371` passed build, all migrations, storage qualification and the full test suite, but failed at the Trust Score signed gateway disposable PostgreSQL step.

The failure was not in the Trust Score gateway: `scripts/qualify-trust-score-gateway-cutover-postgres.mjs:40` seeded a private Business with `verification_status='pending'`, which is no longer allowed by the Business directory review status constraint. The private fixture needs to be `unverified` (still non-public and `is_verified=false`). Corrected in commit `1aa9477ae95666ae5d12596cb3b1ca858fbde86f`.

New exact-head GitHub Actions PR run `43104846183` is IN PROGRESS on `1aa9477ae95666ae5d12596cb3b1ca858fbde86f`; no pass is claimed until all qualification steps complete.

The next auth batch remains the token-bound recovery redemption result described above. Preserve the QuoteFlow reset completion function's nested owner call to `auth_revoke_all_sessions_for_account`; runtime EXECUTE can be revoked only after the ordinary recovery reset path no longer invokes that wrapper directly.


## Token-bound recovery revocation result — implementation checkpoint (2026-11-11)

Source review confirmed that the existing `auth_redeem_recovery(bytea)` already consumes the one-time recovery token and revokes every active session through `auth_internal_revoke_all_sessions_for_account`. The old Resource API then redundantly called `auth_revoke_all_sessions_for_account(account_id,...)` a second time after setting the password. That second call normally returned zero because the sessions had already been revoked, and it preserved an unnecessary runtime RPC accepting arbitrary account ID.

### Changes made

- Added `database/migrations/20261111230000_add_token_bound_recovery_revocation_result.sql`.
  - Adds owner-only `auth_internal_redeem_recovery_with_count(bytea)`, which consumes a valid one-time recovery token and returns both the derived account ID and exact session revocation count.
  - Replaces `auth_redeem_recovery(bytea)` with a compatibility wrapper over the internal function; its original bigint return contract is preserved.
  - Adds runtime-executable `auth_redeem_recovery_with_count(bytea)`, which accepts only the protected one-time token hash and returns the account ID/count.
  - Revokes runtime/PUBLIC EXECUTE on `auth_revoke_all_sessions_for_account(bigint,text)`. The QuoteFlow migration-reset SECURITY DEFINER function may still call it as `ghm_schema_owner`.
- Updated `PostgresAuthPersistence.resetPasswordWithRecovery` to use the token-bound count result, set the password in the same transaction, and no longer call the raw account-ID revocation wrapper.
- Extended the database persistence test to verify the returned count covers active sessions, all sessions are revoked, the token is single-use, and runtime cannot execute the direct account-ID revocation wrapper.
- Extended the auth schema readiness probe to require the new token-bound function.

### CI failure and correction

The first run on the new recovery function failed the existing recovery single-use test because the new helper raised lowercase `invalid recovery token`, while `raiseFromPg` maps the established `RECOVERY_CREDENTIAL_INVALID` error marker. Corrected both helper error paths to preserve the existing error contract in commit `1ebe0c5dfab55968fe4cbf6ffe0aa79a46230fbf`. No database migration has been applied to production; the migration is still open-PR-only.

Current PR head: `1ebe0c5dfab55968fe4cbf6ffe0aa79a46230fbf`. Push run `43105500794` is IN PROGRESS and PR run `43105509324` is QUEUED. The preceding failure at `13f9e741` was the error-marker mismatch above; do not claim the new recovery path qualified until the latest exact-head run passes all tests and QuoteFlow reset qualification.


## Recovery error-contract follow-up — exact-head checkpoint (2026-11-11)

A subsequent exact-head workflow run 43105297445 on code head 13f9e741c323ceaf9c847e0683911b6800c23d8d completed with:
- Build: PASS.
- All migrations: PASS on disposable PostgreSQL, including the token-bound recovery migration.
- Existing full test suite: 881 passed, 3 failed (the two recovery persistence subtests caused one parent-suite failure).
- web-quality: PASS.
- Failure cause: the recovery redemption path returned PostgreSQL text 'invalid recovery token' on second-use rejection, while raiseFromPg only recognized RECOVERY_CREDENTIAL_INVALID. The token was still rejected; this was an error-contract translation mismatch, not token replay acceptance or a session-revocation failure.

A narrow follow-up change was committed to src/auth/foundation/persistence.ts at commit ae7b2272ce5c1aea801dd19ad0e5781307394fe7: map both the canonical marker and legacy lowercase PostgreSQL message to RECOVERY_CREDENTIAL_INVALID. No SQL, authorization, transaction, or production behavior was changed by this follow-up.

At the time of this note, PR #272 was verified OPEN and unmerged at ae7b2272ce5c1aea801dd19ad0e5781307394fe7. No workflow run was returned for this commit by the PR-triggered commit-run lookup; do not claim exact-head CI validation. Recheck Actions for this exact head before continuing or marking the recovery batch qualified.

Next: verify whether the branch's canonical recovery SQL has been updated to raise RECOVERY_CREDENTIAL_INVALID consistently in both invalid-token paths (prefer correcting the SQL error contract if it has not already been corrected), then rerun exact-head build, full tests, disposable migration chain, and QuoteFlow migration-reset qualification. Preserve the token-bound session revocation and compatibility wrapper. No production migration/ACL change.


## Token-bound recovery qualification — validation supersedes queued checkpoint (2026-11-11)

The queued PR validation subsequently completed successfully. GitHub Actions PR run 43105509324:
- quality: PASS; build and complete disposable PostgreSQL migration chain passed.
- Full test suite: 884/884 passed, 0 failed.
- All Actor Gateway, storage, capability, Saved Business, Business Hours, Trust Score, Business Logo, supplier classification, Business profile, commercial settlement, migration audit policy and runtime-boundary qualification steps passed.
- QuoteFlow migration-reset HTTP tests passed (request remains anti-enumerating; completion issues a GHM session only after successful completion). The QuoteFlow retained-history qualification also passed 15/15.
- web-quality: PASS.

The push workflow run 43105500794 also completed with both quality and web-quality PASS. This supersedes the earlier note that these runs were in progress/queued. The earlier run 43105297445 remains a genuine failed run (881 passed, 3 failed) and is retained as history, not the current validation result.

The follow-up error normalization in src/auth/foundation/persistence.ts is present in the branch (blob 1627447c0d9e05858e38944c28ff657264c83382); the token-bound SQL migration currently raises RECOVERY_CREDENTIAL_INVALID in both invalid-token paths (blob c007ff90a91ee266beecd29863c635bf8045a579). The passing PR run completed while the recovery implementation was present. PR #272 remains OPEN and UNMERGED; latest verified PR head after the handover-only update is 203c532f488a7a90e456a9d4eafb2bd3c96eb28c. The CI run began before that final handover-only commit; no source code changed in that documentation commit. No production migration, grant, role, deployment or data mutation occurred.

Recovery token-bound revocation batch: DISPOSABLE QUALIFICATION PASS; PRODUCTION CUTOVER NOT PERFORMED. Continue the broader internal-auth caller/authority audit; do not treat all auth functions as closed based on this batch.


## Internal authentication authority audit — QuoteFlow migration provisioning boundary (2026-11-11 22:55 UTC)

### Exact repository state and validation discipline

- PR #272 remains OPEN and UNMERGED.
- Current branch: `integration/capability-gateway-qualification-20261110`.
- Current head after this checkpoint's code/test commits: `1478452aad96dc42bce3fc8d95c4fe832b51e19e`.
- The immediately preceding exact-head workflow lookup returned no run for this new head. The earlier success run #43105997182 belongs to the prior head `356de9d8ec6ce871bcc875a1b8b1e4de14f08b00`; it does NOT qualify these two new commits.
- Current branch inventory after adding this migration: 125 SQL migration files and 7 manual cutover SQL files.
- No production database, role, grant, secret, service, deployment, or data was changed. No PR was merged or closed.

### Findings established from SQL definitions and all discovered source paths

1. `ghm.auth_provision_migration_account(text,text,text,text)` is documented by its creation migrations as **migration-only credentialless QuoteFlow account provisioning**. It creates an active, non-admin GHM account and exact `(provider='supabase', subject)` mapping; it does not create credentials, sessions, Business records, or memberships.
2. Both creation/reconciliation migrations granted EXECUTE to `ghm_runtime`. The later mapping-table ACL migration `20261111210000_revoke_runtime_account_external_identity_table_access.sql` explicitly re-granted this provisioning function to runtime.
3. The concrete DB qualification script was the only discovered direct caller of this function. It used the runtime database connection to create accounts, test idempotency/concurrency/rollback, and asserted runtime EXECUTE=true. The TypeScript migration provisioning service is an abstraction over a store; the inspected source tree contains no concrete production store wiring to this SQL function, and no HTTP route invokes it.
4. The dedicated migrator path is already configured to use `SET ROLE ghm_schema_owner` for owner-controlled operations. The function owner is `ghm_schema_owner`; the intended migration operation can therefore be retained through the migrator/owner path without exposing it to the shared runtime.
5. `ghm.auth_bootstrap_external_identity` remains a separate Connect identity adapter method. The active `bindConnectAuthorization` caller explicitly passes `allowBootstrap:false`; tests assert that setting. The adapter's opt-in bootstrap behavior is still present as a domain seam and must not be conflated with the separate QuoteFlow migration-provisioning function.
6. `ghm.auth_link_external_identity(text,text,bigint)` is a general explicit mapping function that trusts caller-supplied account ID. The migration reconciliation executor is an abstraction and no concrete production store wiring was found in the inspected source tree. The database persistence tests call it through runtime and test linking, conflict, disabled-account and cross-product semantics. Do not revoke it until the migration reconciliation contract and test/runtime use are deliberately separated and the required migrator operation is qualified.
7. The current QuoteFlow migration reset completion SECURITY DEFINER function calls password-setting and account-wide session-revocation helpers internally. Its nested owner execution is distinct from direct runtime access and must be preserved when reviewing final ACLs.

### Bounded implementation performed — runtime restriction for migration provisioning only

- Added `database/migrations/20261111240000_revoke_runtime_quoteflow_migration_provisioning.sql`.
- It revokes PUBLIC and `ghm_runtime` EXECUTE on `ghm.auth_provision_migration_account(text,text,text,text)`; it does not drop or rewrite the function and does not alter the owner.
- Updated `scripts/qualify-quoteflow-migration-account-provisioning-db.mjs`:
  - runtime now must fail to execute the migration-only function;
  - runtime direct INSERT remains denied;
  - controlled provisioning, idempotent retry, provider validation, concurrency and rollback now execute through a dedicated migrator-pool connection after `SET LOCAL ROLE ghm_schema_owner`;
  - catalog assertions now require runtime EXECUTE=false.
- The qualification command is already registered in `package.json` as `qualify:quoteflow-migration-account-provisioning-db`; CI's existing qualification invocation remains the validation path.
- Commits: migration `6311c12c9dad3a902fbb29941b02665429545b15`; qualification runner `1478452aad96dc42bce3fc8d95c4fe832b51e19e`.

### Qualification status and next exact actions

- **Implementation committed to the open PR branch; qualification NOT YET PASSED.** The current head has no workflow run returned by the commit-run lookup at this checkpoint.
- Do not report this migration as qualified until a workflow on the exact current head completes successfully, including the full suite and the QuoteFlow migration-account provisioning disposable PostgreSQL qualification.
- Next, inspect the exact current-head CI job logs. If the runner fails, fix only evidence-backed harness or implementation defects, then re-run exact-head CI.
- Continue the caller/authority audit for `auth_bootstrap_external_identity` and `auth_link_external_identity` separately. The first has an explicit opt-in adapter seam but no active authorization-binding use; the second has migration reconciliation abstractions and runtime persistence tests but no concrete production migration-store wiring found. Establish intended production migration invocation and exact effective grants before changing either.
- Separately inspect final effective ACLs for all auth routines, including PUBLIC, role membership, owner, default privileges and the real login/refresh/recovery paths. Preserve public registration, login, refresh, logout, password recovery and QuoteFlow reset behavior.
- Do not apply this migration to production. Existing production gates remain unchanged: Render role-model/support resolution, fresh independently verified backup, approved role/network plan, and explicit cutover approval.



## CI qualification wiring correction — migration provisioning batch (2026-11-11 22:57 UTC)

The previous checkpoint's statement that CI already invoked `qualify:quoteflow-migration-account-provisioning-db` was premature. Inspection of the actual `.github/workflows/ci.yml` and `package.json` showed the command existed in package scripts but was NOT invoked by the workflow. The workflow's disposable runtime URL is `GHM_QUALIFICATION_DATABASE_URL`, not `GHM_RUNTIME_DATABASE_URL`.

Corrections committed:
- The qualification script now accepts `GHM_QUALIFICATION_DATABASE_URL` as the CI runtime URL fallback. It skips cleanly only when both runtime and migrator database URLs are absent; a partially configured environment still fails.
- The qualification script cleanup now uses separate parameterized DELETE statements, rather than a multi-statement parameterized query.
- The existing `npm test` script now syntax-checks and runs this DB qualification after the test suite. CI already invokes `npm test` after applying the complete migration chain; this integrates the new check without changing the workflow file.
- The CI workflow itself was inspected and left unchanged.

Commits after the earlier code head: runtime URL/skip handling `0628804b9c1196d4c10f57dfbc753fca7248b443`, no-DB local skip `1816bec852cb5ab1488bdc50ffa232e615cd2212`, cleanup fix `b1c653f3cc814f8d0fcccdfa3a004498ee24a5f3`, and `npm test` qualification wiring/syntax check `942203c53c94e81dabdef76895ac2220d48dbb25`.

At this checkpoint the latest code/test head `942203c53c94e81dabdef76895ac2220d48dbb25` has workflow run #43115856824 queued; the immediately preceding run #43115850276 is in progress on its parent commit. Earlier successful runs on the branch do not qualify this latest head. No qualification pass is claimed until the exact latest head's full workflow succeeds and the new DB qualification step is visible as PASS.



## Internal auth call-path map and first integrated qualification failure (2026-11-11 22:58 UTC)

### Verified application call paths — do not blanket-revoke these RPCs

The following SQL functions remain part of pre-JWT authentication flows. Their account/session IDs are derived by application control flow, not by a verified access-token actor, so they need a dedicated internal-auth authority boundary. They are not safe candidates for indiscriminate Actor Gateway conversion or blanket revocation:

- `auth_create_account(...)`: called by public registration after request validation and password hashing; returns the newly created account ID. The auth service then creates the first session.
- `auth_lookup_password_by_normalized_email(text)`: called by login and password-recovery request. It returns the credential/account state required for password verification or recovery delivery.
- `auth_set_password(bigint,...)`: called by login only after successful password verification when the hash needs rehashing; also used by the recovery-reset transaction after token redemption. It accepts account ID and credential fields, so direct runtime execution is broader than the application caller's proof.
- `auth_create_session_with_refresh(bigint,bytea)`: called after public registration or successful password verification. It accepts account ID and a caller-supplied protected refresh hash; direct runtime execution could create a session for an arbitrary account.
- `auth_validate_session(bigint)`: read-only session-state lookup. Keep separate from mutation operations; its direct exposure still needs review against actual bearer/JWT validation architecture.
- `auth_rotate_refresh(bytea,bytea)`: refresh route passes the opaque presented token; persistence hashes it and generates the successor hash. This is a token-possession flow, not a caller-supplied account-ID flow.
- `auth_issue_recovery(bigint,bytea,timestamptz)`: password-recovery route derives account ID from normalized-email credential lookup, generates a random opaque token and HMAC hash, then sends the wire token only through the delivery port. QuoteFlow migration-reset request derives account ID from the migration enrollment lookup. Direct runtime invocation still accepts arbitrary account ID and a caller-chosen token hash; preserve the flow while designing internal authority.
- `auth_redeem_recovery(bytea)` and `auth_redeem_recovery_with_count(bytea)`: token-bound; the latter atomically returns account ID and revoked-session count and is used by normal recovery reset. The QuoteFlow migration reset has a separate atomic SECURITY DEFINER completion function and must retain its nested owner calls.
- Logout now uses refresh-token possession through `auth_revoke_by_refresh_hash`; the unused account/session administration functions revoked by migration `20261111220000` are no longer part of an active HTTP/service path.
- External identity bootstrap and explicit linking remain separate concerns, not part of the password/session flow above.

This source map confirms the key design requirement: separate public/pre-authentication operations from generic internal mutation authority, and bind sensitive mutations to a verified credential/token proof inside the database boundary. The current runtime role still has EXECUTE on some broad pre-authentication functions; no safe replacement design is yet qualified. Do not revoke `auth_set_password`, `auth_create_session_with_refresh`, or `auth_issue_recovery` until an atomic internal-auth authority design preserves all existing flows.

### First CI result after wiring the new provisioning qualification

On exact code/test head `585aa150d7723ca0c530e23c4139f6fbc4751577`, run #43115920841 failed at the newly appended qualification script after the normal test suite had passed 884/884 (0 failed). The new script incorrectly hard-coded expected database name `ghm_db`; CI correctly runs against `ghm_disposable_test`. This was a qualification harness expectation mismatch, not a migration or privilege failure. Corrected by reading `GHM_QUALIFICATION_DATABASE_NAME` / `GHM_MIGRATION_DATABASE_NAME` with `ghm_db` only as the local default, commit `c71f795d92a5a500fd544420dad1845553d9a5f9`.

Exact-head workflow runs #43116108337 and #43116117596 are IN PROGRESS on `c71f795d92a5a500fd544420dad1845553d9a5f9` at this checkpoint; both have web-quality completed successfully, while quality has not yet completed. No pass is claimed for the migration provisioning DB qualification. Continue from those exact runs and inspect the actual npm test log for the new qualifier result.



## QuoteFlow migration provisioning DB qualifier — integrated test-step PASS (2026-11-11 23:00 UTC)

On code/test head `c71f795d92a5a500fd544420dad1845553d9a5f9`, GitHub Actions run #43116117596 has completed the full `Test suite` step successfully. The step runs `npm test`; the updated package test command performs the 884-test suite, syntax-checks `scripts/qualify-quoteflow-migration-account-provisioning-db.mjs`, and then runs the DB qualifier. The workflow environment provides both `GHM_QUALIFICATION_DATABASE_URL` and `GHM_MIGRATOR_DATABASE_URL`, so the qualifier does not take its no-database local skip path in CI. Therefore the new disposable PostgreSQL provisioning qualification command completed successfully within the passing test step.

The earlier #43115920841 failure was the hard-coded database-name mismatch and is superseded by the fix in `c71f795d`. At this checkpoint run #43116117596 is still IN PROGRESS in later qualification steps (Capability catalogue governance was active when checked); the overall `quality` job and full workflow are NOT yet marked PASS. The duplicate push/PR run #43116108337 is also still in progress on the same code/test head. No production ACL or database changes.

The subsequent documentation-only commits advance PR head to `cd7eff3a907e5b68621c46f85aea7c89873328a5`; they do not change the validated code/test head. Recheck exact-head workflow after the docs commits and await the complete workflow result before calling the entire PR qualified.



## QuoteFlow migration provisioning boundary — exact-head full qualification PASS (2026-11-11 23:01 UTC)

The corrected code/test head `c71f795d92a5a500fd544420dad1845553d9a5f9` passed exact-head GitHub Actions PR run #43116117596: both `quality` and `web-quality` completed SUCCESS. The quality job completed the full build, all ordered migrations on disposable PostgreSQL, the 884-test suite, and every existing disposable qualification step. The `npm test` command includes the new provisioning qualifier after the normal suite; the CI environment supplied the disposable runtime and migrator URLs. The earlier hard-coded database-name failure is superseded by this passing exact-head run.

For this bounded change, the evidence now supports:
- `auth_provision_migration_account` migration applied successfully on disposable PostgreSQL;
- runtime EXECUTE=false and direct invocation denied;
- migrator/owner path successfully creates the account+mapping;
- idempotent retry, fixed-provider validation, concurrent same-subject provisioning and rollback qualification all pass;
- runtime direct table INSERT remains denied.

**Disposition: QuoteFlow migration-only provisioning runtime ACL remediation IMPLEMENTED / DISPOSABLE QUALIFICATION PASS.** Production cutover NOT performed. PR #272 remains open and unmerged. No production roles, grants, database, secrets, deployments or data were changed.

The subsequent documentation-only commits advance the PR head beyond this code/test head. The current docs-only head must still have its own workflow checked; the code/test qualification result above remains tied specifically to `c71f795d`.



## External identity linking authority — runtime removal and migrator-only qualification in progress (2026-11-11 23:05 UTC)

### Evidence and scope

- `ghm.auth_link_external_identity(text,text,bigint)` accepts provider, external subject and caller-supplied GHM account ID. It can attach a new external identity to an existing account; the function itself does not establish that the caller is authorized to link that identity to that account.
- The active Connect authorization binding uses external identity lookup and explicitly passes `allowBootstrap:false`; it does not call the link operation.
- The QuoteFlow migration reconciliation module defines a store abstraction that calls a link operation, but the inspected tree contains no concrete production store implementation/wiring. The database-backed auth persistence tests were the concrete runtime callers.
- The general `AuthPersistence` interface and `PostgresAuthPersistence` implementation previously exposed this migration-oriented operation through the runtime connection. That was broader than the demonstrated active application need.

### Changes committed

1. Added `database/migrations/20261111250000_revoke_runtime_external_identity_link.sql`, revoking PUBLIC and `ghm_runtime` EXECUTE while preserving the schema-owner function and migrator `SET ROLE ghm_schema_owner` path.
2. Removed `linkExternalIdentity` from the general runtime `AuthPersistence` interface and `PostgresAuthPersistence` implementation. The independent QuoteFlow migration reconciliation store abstraction remains; any future concrete implementation must use the dedicated migrator/owner path.
3. Changed database-backed persistence tests to call the function through a migrator connection after `SET LOCAL ROLE ghm_schema_owner`, preserving create, idempotent retry, conflict, missing account, cross-product and disabled-account behavior.
4. Added explicit runtime privilege assertion and direct-call denial for `auth_link_external_identity`; the owner path remains positively qualified.
5. Removed obsolete mock properties from `src/integrations/connect/identity-adapter.test.ts` and `src/http/auth-router.test.ts`. The first build attempts exposed the stale auth-router mock; the mock was removed rather than reintroducing the unsafe runtime interface.

Commits: migration `2152ed41970322f50556dabfe4e7fa7f8b65862e`; persistence interface removal `c27dca4da672ee7ce456815ed3dd35e3b10b4e0b`; migrator-owner DB tests `0482878647dc3013685a288c09ee8213d2e59337`; Connect mock cleanup `9d6de26b4713d0929aaca1075a821aa32bb2bf46`; auth-router mock cleanup `6c6e20ca7d276c1153e2775968472d13a3d0ea08`.

### Validation status

On current code/test head `6c6e20ca7d276c1153e2775968472d13a3d0ea08`, run #43116910520:
- Build: PASS.
- All 126 SQL migrations applied to disposable PostgreSQL: PASS.
- Full test suite (including the updated auth persistence runtime-denial / migrator-owner tests and the QuoteFlow migration provisioning qualifier): PASS.
- Web-quality: PASS.
- Later existing disposable qualification steps were still in progress; overall workflow is NOT yet marked complete at this checkpoint.
- Branch inventory: 126 SQL migration files + 7 manual cutover SQL files.
- PR #272 remains OPEN / UNMERGED. No production grant, role, database, secret, deployment, or data change.

### Remaining boundaries

- `auth_bootstrap_external_identity` remains distinct: it creates a new credentialless external-identity account and is still exposed by the optional Connect adapter bootstrap seam. The active authorization-binding path passes `allowBootstrap:false`. Do not conflate bootstrap with linking or remove the optional behavior without a separate caller/authority decision.
- The QuoteFlow migration reconciliation store is still an abstraction, not a demonstrated live production implementation. If it is implemented, its SQL linking operation must use the migrator/owner connection and not reintroduce a runtime AuthPersistence method.
- Continue the internal-auth authority review for `auth_set_password`, `auth_create_session_with_refresh`, and `auth_issue_recovery`; preserve the real login, registration, refresh, recovery and QuoteFlow reset flows. These are not closed by the migration-only linking changes.

Next exact action: await run #43116910520 and inspect all later disposable qualification results. If it completes successfully, update this handover with the final result and then continue the separate bootstrap/pre-auth RPC authority trace. Do not merge PR #272 or apply production cutovers.



## External identity linking runtime ACL remediation — exact-head full qualification PASS (2026-11-11 23:06 UTC)

Code/test head `6c6e20ca7d276c1153e2775968472d13a3d0ea08` passed GitHub Actions run #43116918303: both `quality` and `web-quality` completed SUCCESS. The quality job confirms the complete 126-migration disposable PostgreSQL chain, full test suite and every existing disposable gateway qualification step passed. The auth persistence DB test within the suite proves:
- runtime cannot SELECT/INSERT/UPDATE/DELETE `ghm.account_external_identity` or use its sequence;
- runtime has no EXECUTE on `auth_link_external_identity` and direct invocation is denied;
- the migrator connection can SET ROLE to `ghm_schema_owner` and execute linking;
- create, idempotent retry, conflict, missing-account, cross-product and disabled-account semantics remain intact;
- the general runtime AuthPersistence interface no longer exposes the account-ID linking operation.

**Disposition: External identity linking runtime ACL remediation IMPLEMENTED / DISPOSABLE QUALIFICATION PASS.** Production cutover NOT performed. No production database, grants, roles, secrets, deployments or application data were changed.

The latest documentation-only PR head after the qualification record is `aff86bd0e05b41cfbb4a8496c4ff1b69bd29cd77`; its exact-head CI runs #43117233949 and #43117240318 were IN PROGRESS when checked. The code/test qualification result remains tied specifically to `6c6e20ca`. PR #272 remains OPEN / UNMERGED.



## 2026-11-12 — External identity bootstrap runtime authority removed

A source-traced review found that `ghm.auth_bootstrap_external_identity(text,text,text,text)` remained SECURITY DEFINER and executable by `ghm_runtime`. The function creates a new active GHM account plus an external identity mapping. The ordinary Connect authorization route does not use it: `src/http/connect-service-router.ts` resolves the signed integration request through `bindConnectAuthorization`, and `src/integrations/connect/authorization-binding.ts` requires an existing mapping. Before this batch it passed `allowBootstrap: false`; no active HTTP caller was found that authorized bootstrap. The adapter/persistence bootstrap methods and tests were therefore an unused authority seam, not an established live product flow.

Bounded changes committed to this open PR branch:
- `database/migrations/20261111260000_revoke_runtime_external_identity_bootstrap.sql` revokes PUBLIC and `ghm_runtime` EXECUTE on the bootstrap function. The schema-owner/migrator governance path remains available for controlled provisioning.
- Removed `bootstrapExternalIdentity` from `AuthPersistence` and `PostgresAuthPersistence`.
- Simplified `ConnectIdentityAdapter` to lookup-only resolution; unmapped identities fail closed and cannot create accounts through this adapter.
- Updated Connect authorization binding and adapter/persistence tests. The database-backed runtime ACL test now asserts bootstrap EXECUTE is false and direct runtime invocation is denied.
- No existing identity mappings or accounts were changed; no production database or ACL was touched.

Current PR head after this batch: `be08e9db8ac7fcf8602f2d6988518ae021597bfb`. GitHub Actions had not yet returned a workflow run for this exact head at the time of this checkpoint. The preceding exact-head run #3441 passed on `47f5a7e45c4b8abdb46c529b385ec7e8607d550f`; that run does NOT qualify this new batch. Wait for exact-head CI, including full build/test and the disposable PostgreSQL migration chain, before marking this change qualified.

Recursive tree at the new head contains 127 SQL migrations and 7 manual cutover files. This is a source-tree count only, not proof of effective production ACLs. PR #272 remains open and unmerged. Continue the internal-auth audit without blanket revocation: password set during login rehash/recovery, recovery issuance/redemption, session creation, refresh rotation and refresh-token logout are active service paths and must remain functional. The next bounded review should reconcile the remaining runtime-executable authentication functions against exact call sites, especially bootstrap-related grants now addressed, account/session administration functions already revoked by migration `20261111220000`, and any remaining runtime-executable RPCs that accept caller-supplied account/session IDs.


## Follow-up — internal-auth issuer boundary trace (2026-11-12)

### Exact source reviewed

- PR #272 branch: `integration/capability-gateway-qualification-20261110`
- Reviewed branch head at start of this follow-up: `6c25c96fd477f36ddb3b3b03827cf6114f4a1c1a`
- Authentication architecture: `docs/architecture/ADR-001-isolated-auth-issuer-and-db-actor-gateway.md` (approved for isolated design and qualification only; implementation not yet deployed/provisioned).
- Persistence: `src/auth/foundation/persistence.ts`
- Application service: `src/auth/ghm-auth-service.ts`
- HTTP routes: `src/http/auth-router.ts`
- Recovery service: `src/auth/password-recovery.ts`; reset service: `src/auth/password-reset.ts`
- Original function definitions/grants: `database/migrations/20260921130000_create_auth_runtime_functions.sql`

### Caller and trust-boundary findings

1. `POST /api/v1/auth/register` and `/api/v1/auth/web/register` call `GhmAuthService.register`. It validates registration input/password policy, calls `createAccount`, then calls `createSessionWithRefresh(created.accountId)` and signs an access token for that account.
2. `POST /api/v1/auth/login` and `/api/v1/auth/web/login` call `GhmAuthService.login`. It normalizes email, obtains the credential record by normalized email, verifies the supplied password with the Argon2id hasher, checks account and credential status, optionally rehashes, then creates a session for the account returned by the credential lookup and signs the pair.
3. The password recovery request route calls `PasswordRecoveryService.request`. It looks up the normalized email, checks active account and credential status, then calls `issueRecovery(credential.accountId, 30)` and delivers the opaque recovery token.
4. Password reset calls `PasswordResetService.reset`, which passes the recovery token, email and new password into `resetPasswordWithRecovery`. That transaction redeems the token and obtains its account ID from the database token row before setting the password; this is materially safer than a caller-supplied account ID.
5. QuoteFlow migration reset has separate request/completion services. Completion redeems a migration recovery token in its database function, atomically changes password and revokes sessions; the HTTP route then calls the normal login flow to issue a session. Keep this path in the caller inventory; do not collapse it into ordinary password-recovery semantics.
6. The ordinary Resource API currently constructs the auth service in-process and uses the same configured runtime database pool. The approved ADR explicitly says the isolated issuer is not yet implemented and that issuer credentials, refresh pepper and signing key must not remain in the ordinary Resource API.

### Effective authority gap

The original migration grants `ghm_runtime` EXECUTE on:

- `ghm.auth_set_password(bigint,text,text,text,integer,integer,integer)`
- `ghm.auth_create_session_with_refresh(bigint,bytea)`
- `ghm.auth_issue_recovery(bigint,bytea,timestamptz)`

The function bodies validate basic argument shape/account existence (and session creation checks account state), but do not independently prove the upstream password verification, successful recovery lookup, or registration provenance. Their legitimate TypeScript callers currently establish that provenance before passing the account ID. Because the shared runtime principal can call the SECURITY DEFINER functions directly, PostgreSQL cannot distinguish those trusted call paths from arbitrary SQL invoked with the same runtime credential.

This is a confirmed database-principal authority gap, not evidence of a public HTTP exploit or observed account compromise.

### Design constraint / decision

Do not add caller-writable GUCs, temporary tables, plain account-ID assertions, or a generic SQL/RPC proxy. Do not simply add a second connection string to the same ordinary API process and call that an isolated issuer. ADR-001 requires a separately isolated issuer boundary, issuer-only DB credentials and signing-key custody, and typed interfaces; the ordinary Resource API must not receive those credentials.

The next implementation design must explicitly cover:
- issuer-only database principal and the minimum function/table privileges it needs;
- registration, password verification, rehash, session creation, refresh rotation, logout, password-recovery issuance, token-bound reset and QuoteFlow migration reset;
- database-side checks for active account/credential state and token/session validity;
- proof/provenance for account selection, with no account ID chosen by the HTTP caller;
- safe delivery of recovery tokens and preservation of anti-enumeration/rate-limiting behavior;
- key/pepper custody and migration of existing valid ES256/refresh behavior;
- disposable PostgreSQL tests using real runtime and issuer logins, including direct runtime denial for all three functions and positive issuer flows.

No code, grants, production credentials, deployments, data or production services were changed during this follow-up. No privilege revocation is authorized until the replacement issuer path and all positive/negative qualifications are implemented.

### CI / documentation state

At the beginning of this follow-up, PR #272 was open and unmerged at `6c25c96fd477f36ddb3b3b03827cf6114f4a1c1a`; exact-head runs #3464 and #3465 both completed successfully (`quality` and `web-quality`). The branch is reported by GitHub as 648 commits ahead and 2 behind `main`; reconcile the two newer main commits and inspect the merge base before any merge decision. This follow-up documentation commit will advance the branch, so recheck the exact head and CI after the commit.


## Follow-up — broadened auth lifecycle EXECUTE inventory (2026-11-12)

A second pass against the ordered auth migrations shows the three account-ID functions above are not the whole issuer boundary. The original runtime grants also include the following auth lifecycle/credential operations. This is a grant-history inventory; effective final privileges still require ordered migration and live catalog reconciliation.

### Auth functions originally granted to `ghm_runtime`

- Account/credential creation and lookup: `auth_create_account`, `auth_lookup_password_by_normalized_email`.
- Credential mutation: `auth_set_password`.
- Session creation and validation: `auth_create_session_with_refresh`, `auth_validate_session`.
- Refresh/session lifecycle: `auth_rotate_refresh`, `auth_revoke_by_refresh_hash`.
- Recovery: `auth_issue_recovery`, `auth_redeem_recovery`, `auth_redeem_recovery_with_count` (later token-bound wrapper).
- QuoteFlow migration reset: `auth_lookup_quoteflow_migration_reset_enrollment`, `auth_complete_quoteflow_migration_reset`.
- External identity: `auth_lookup_external_identity`, `auth_link_external_identity`, `auth_link_business_external_mapping`, `auth_lookup_business_external_mapping`.
- Historical account/session administration: `auth_revoke_session`, `auth_revoke_all_sessions_for_account`, `auth_change_password`, `auth_disable_account`; later migration `20261111220000_revoke_unused_auth_runtime_entry_points.sql` revokes the first, third and fourth, while the token-bound recovery follow-up revokes runtime access to the account-wide revoke wrapper. Verify the final catalog for every overload.

Later migrations already narrow some of this surface: `20261111240000` revokes runtime QuoteFlow migration provisioning, `20261111250000` revokes external identity linking, and `20261111260000` revokes external identity bootstrap. Preserve these completed cuts; do not re-open them.

### Required issuer-only scope is broader than three writes

The issuer boundary must cover the password-hash lookup itself (ordinary runtime must not retrieve password hashes), registration/account creation, password rehash/change, session creation, refresh rotation, logout/revocation, recovery issuance/redemption/reset, and QuoteFlow migration reset. The exact minimal allow-list must be established from all production application call sites and current product contracts. `auth_validate_session` appears in the persistence/test surface; confirm whether it has any active non-test caller before deciding whether it belongs in the issuer allow-list or should be removed from runtime.

External identity mapping and business mapping need separate call-path decisions: lookup may be needed by Connect identity resolution, while link/bootstrap are privileged lifecycle operations and later revocations already exist. Do not sweep them into an auth migration without tracing their current consumers.

### Additional reset-flow review item

The HTTP password-reset contract currently accepts both a recovery token and an email value. The persistence path redeems the token to obtain the account ID, then calls the general password setter with the submitted email fields. Since that setter updates the stored login email, qualify whether reset is intentionally allowed to change the login email or whether the reset must retain the account's existing email / bind the submitted email to the redeemed credential. Add a negative test for token/account/email mismatch before changing behavior. This is an unresolved contract question, not yet classified as an exploit.

### Corrected next implementation order

1. Complete the exhaustive function/caller/effective-ACL matrix, including every overload, PUBLIC/default grants, and all later migration/cutover revokes.
2. Define the isolated issuer's minimal DB principal and typed operation surface. No ordinary Resource API process may receive issuer DB credentials, refresh pepper, or ES256 private key.
3. Move password-hash lookup, account registration and auth lifecycle calls behind the issuer boundary; ensure public requests never choose account IDs for session/recovery operations.
4. Prefer token/credential-bound database entry points over new arbitrary account-ID RPCs (e.g. recovery token-bound reset; refresh-token-bound logout; one-time credential-derived login/session operation). Any challenge/proof mechanism must be threat-modelled for replay, race, transaction binding and ordinary-runtime forgery; do not implement caller-writable GUCs or a generic SQL proxy.
5. Preserve QuoteFlow migration reset as a distinct, token-bound flow and preserve Connect external identity lookup/linking semantics.
6. Add real-login disposable-PostgreSQL tests proving `ghm_runtime` cannot read password hashes or execute issuer-only operations, while the issuer can complete registration/login/rehash/refresh/logout/recovery/QuoteFlow reset and disabled-account denial.

### Updated CI status after documentation commits

- Security handover update committed: `2cd3f791ec850d60031047fd40d62d9ddbdfd3ec`.
- Current-state update committed: `a7dbf3cebf7b7cbd65f60615c11864c03638cdd1`.
- Exact-head runs #3468 and #3469 were triggered for `a7dbf3c`; both were still in progress at the time of this note. Do not describe the documentation head as CI-passed until both finish successfully.
- No production migration, role/grant change, secret provisioning, deployment or data mutation was performed.


### Documentation-head correction

The broadened inventory above was committed as `87cfe564c427ce51ad1f5b93f3c718af52f70189`, after the two current-state/handover commits noted immediately above. Therefore runs #3468/#3469 validate the preceding documentation head `a7dbf3c`, not this latest commit. Recheck CI against the final documentation head before treating it as qualified.


## Follow-up — issuer boundary implementation shape (proposed, not yet implemented)

The source trace confirms the current HTTP auth routes are registered inside the ordinary Resource API process (`src/http/app.ts` constructs `PostgresAuthPersistence` and calls `registerAuthRoutes`). That process currently shares the normal runtime pool/configuration. This is not the isolated issuer required by ADR-001.

### Proposed isolation boundary

- Move the authentication HTTP surface and its persistence/crypto dependencies into a separately deployed or demonstrably isolated GHM issuer process.
- Give that process a dedicated `ghm_auth_issuer` LOGIN / NOINHERIT database principal. It must have no role memberships, no SET ROLE path, no DDL/table ownership, no broad table DML and only a reviewed exact EXECUTE allow-list.
- Keep the issuer DB credential, refresh-token pepper and ES256 private signing key out of the ordinary Resource API environment. The ordinary API must not call a generic issuer SQL endpoint or supply account IDs to a privileged internal endpoint.
- Keep the Actor Gateway DB principal distinct from the issuer DB principal. The gateway verifies access JWTs and handles typed actor operations; it is not the credential verifier or token signer.
- Ordinary Resource API retains only public-key JWT verification and ordinary resource DB access.

### Preferred database interface direction

These are design candidates to qualify, not approved function signatures:

| Flow | Safer DB input / binding | Required DB behavior |
|---|---|---|
| Registration | registration fields + Argon2 hash + refresh hash; no account ID | Create identity/credential and initial session atomically or preserve a clearly recoverable two-step transaction |
| Login | normalized login key / opaque lookup handle + expected credential version/hash + refresh hash | Issuer-only credential lookup; create session only if the credential/account is still active and unchanged; derive account ID in SQL |
| Rehash | credential identity + expected old hash/version + new hash | Conditional update; must not change email or credential identity as a side effect |
| Refresh | presented refresh hash + successor hash | Existing token-bound rotation; issuer-only EXECUTE; derive account/session from stored token |
| Logout | presented refresh hash + reason | Existing token-bound revocation; issuer-only EXECUTE |
| Recovery request | normalized login key + recovery hash + bounded TTL | Resolve eligible active account in SQL; create token bound to that account without caller-supplied account ID; preserve HTTP anti-enumeration |
| Password reset | recovery token hash + new password hash | One atomic token-bound operation: validate/consume token, update the same account credential, revoke all sessions; no caller-supplied account ID or email replacement |
| QuoteFlow migration reset | migration recovery token hash + new password hash | Preserve the existing enrollment-bound, one-time atomic reset; issuer-only EXECUTE |
| External identity lookup | provider + external subject | Keep separate from credential issuance; preserve the current Connect mapping lookup contract |

The issuer must still verify Argon2id passwords in the issuer process; PostgreSQL should not be given plaintext passwords. The database must derive account/session targets from stored credential/token rows where possible and reject stale credential versions. A one-time challenge/handle is a possible login bridge, but only after its lifecycle, entropy, expiry, replay, concurrency, and transaction semantics are qualified.

### Important compatibility notes

- The current registration path creates the account then creates its session in a second persistence transaction. The new issuer must preserve duplicate-email behavior and avoid leaving confusing partial registration state if session creation fails.
- Login performs a dummy Argon2 verification for unknown emails; preserve timing/anti-enumeration behavior.
- Password rehash happens only after successful password verification; a conditional expected-hash update is needed to avoid overwriting a concurrent password change.
- Refresh rotation and replay currently have qualified single-use/session-family semantics; do not replace them with a weaker flow.
- Recovery request currently returns a generic 202 for ineligible/unknown accounts; preserve that behavior.
- QuoteFlow migration reset is not ordinary password recovery. It checks enrollment, external identity binding, active account, consumes the recovery credential, changes password, revokes sessions and completes enrollment atomically.
- Password reset currently accepts an email alongside the token and passes it to the general setter, which updates the stored login email. Resolve this contract before implementing the new token-bound reset; default security posture should be to preserve the account's existing login email unless a separately verified email-change flow is intended.

### Implementation gate

Before any grant change:
1. Finish the effective-ACL matrix from the complete migration history and inspect disposable PostgreSQL catalogs as both `ghm_runtime` and the proposed issuer login.
2. Implement the isolated issuer and typed operations in a dedicated construction branch; no production service, secrets or grants.
3. Prove direct runtime denial for password-hash lookup, registration, password mutation, session creation, refresh, logout and recovery/migration-reset functions.
4. Prove positive issuer registration/login/rehash/refresh/logout/recovery/QuoteFlow reset and disabled-account denial.
5. Prove token replay, stale-hash race, wrong-account/email mismatch, duplicate registration, transaction rollback, concurrent refresh and no secret leakage.
6. Update the API/crypto/session contracts and this handover with exact source/CI evidence before any review or merge request.

This section is a technical proposal derived from the source trace; it does not silently approve a new DB role, service topology, function signature, migration or production operation.


## Follow-up — direct issuer secret-custody and runtime grant audit (2026-11-12)

### Confirmed isolation defect in current composition

The earlier note identified that auth routes are registered in the ordinary Resource API. This pass confirms the secret-custody consequence in code, not just topology:

- `src/http/app.ts` constructs `new PostgresAuthPersistence()` for the default auth persistence and registers the auth routes in the same application.
- `PostgresAuthPersistence` defaults to `loadTokenPepper()`, which loads `GHM_AUTH_TOKEN_PEPPER`.
- `src/http/auth-router.ts` lazily constructs `createGhmAuthService(dependencies.authPersistence)` when the auth service is not injected.
- `createGhmAuthService` defaults to `createAccessJwtService(loadEs256Keys())`.
- `loadEs256Keys()` loads `GHM_JWT_ES256_PRIVATE_KEY_PEM` and the public key. The service signs access tokens in-process.
- The same ordinary HTTP auth composition therefore has code paths that load the refresh/recovery pepper and ES256 private signing key, as well as the runtime database pool.

This is a confirmed implementation mismatch with ADR-001's isolated issuer / public-key-only Resource API design. It is not proof that a secret has leaked or that a production deployment currently has those variables configured. Do not infer deployment environment state from source code.

### Revised minimum isolation boundary

The issuer separation must move all of the following into the isolated auth issuer, not merely move three SQL calls:

1. Password credential lookup and Argon2id verification (including dummy-hash timing behavior).
2. Registration and Argon2id credential hashing.
3. Password rehash after verified login.
4. Session creation, refresh-token generation/HMAC, refresh rotation and logout.
5. Recovery token generation/HMAC, issuance, delivery handoff, redemption/reset.
6. QuoteFlow migration-reset lookup/issuance/completion and token delivery.
7. ES256 access-token signing and private-key custody.

The ordinary Resource API and Actor Gateway must use the public-key-only `createAccessJwtVerifier` / `loadEs256VerificationKeys` path. They must not instantiate `createAccessJwtService`, `loadEs256Keys`, or `PostgresAuthPersistence` with the default token pepper. The gateway may validate sessions only if a separately reviewed contract requires it; it must not receive refresh/recovery pepper or private signing authority.

### Full original runtime EXECUTE grant inventory — clarified

The original auth migration grants `ghm_runtime` EXECUTE on these function signatures:

- `auth_set_password(bigint,text,text,text,integer,integer,integer)`
- `auth_lookup_password_by_normalized_email(text)`
- `auth_create_session_with_refresh(bigint,bytea)`
- `auth_validate_session(bigint)`
- `auth_rotate_refresh(bytea,bytea)`
- `auth_revoke_session(bigint,text)`
- `auth_revoke_all_sessions_for_account(bigint,text)`
- `auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)`
- `auth_disable_account(bigint)`
- `auth_issue_recovery(bigint,bytea,timestamptz)`
- `auth_redeem_recovery(bytea)`
- `auth_lookup_external_identity(text,text)`
- `auth_bootstrap_external_identity(text,text,text,text)`

The original migration also grants runtime access to account creation and token-bound recovery wrappers in subsequent migrations. The account creation function signature is `auth_create_account(text,text,text,text,text,integer,integer,integer)`; token-bound recovery functions include `auth_redeem_recovery_with_count(bytea)`. Do not treat the original list as the final ACL: later migrations revoke unused account/session admin RPCs, account-wide revocation, QuoteFlow migration provisioning, external identity linking and bootstrap. The final authority matrix must query the actual PostgreSQL catalogs after all migrations, including PUBLIC and inherited role privileges and overloads.

### Positive test coverage currently present

`src/auth/foundation/persistence.test.ts` uses a real `ghm_runtime` pool for account creation, credential lookup, session creation/validation, refresh rotation/replay, recovery issuance/redemption/reset, and external identity mapping. It uses the migrator/owner path for fixture setup/cleanup and currently verifies runtime denial for the four already-revoked admin operations (`auth_revoke_session`, `auth_change_password`, `auth_disable_account`, `auth_revoke_all_sessions_for_account`).

It does not yet prove that runtime is denied the remaining issuer-only operations, nor prove a distinct issuer login can perform them. The present test is a baseline for preserving positive flows; extend it rather than replacing it with only denial assertions.

### Current exact-head CI

- Latest documentation head before this note: `6a959665a0d9dccec11665c4a238d1aded7b03fa`.
- Runs #3478 and #3479 both completed successfully; each reports `quality` and `web-quality` passed.
- This note will advance the branch again; CI must be rechecked against the resulting exact commit.
- PR #272 remains open/unmerged. The source-level issuer isolation gap is not fixed by the documentation commits.

### Next construction work — no privilege cut yet

Build the isolated issuer as a distinct process entrypoint and dependency graph, with separate runtime/issuer DB connection configuration, private key + pepper only in issuer config, and explicit public-key-only Resource API verification. Then define issuer-specific DB role and function grants from the final ACL matrix. Do not simply split routes into a different file while retaining one process/environment. Do not make production role/secret/deployment changes during construction qualification.


## Follow-up — entrypoint and dependency-graph audit (2026-11-12)

### Confirmed process entrypoints

- Ordinary Resource API: `src/server.ts` imports `config`, `createApp` and the ordinary DB pool; calls `createApp()`; verifies `ghm_runtime` at startup; then listens on the configured port.
- Actor Gateway: `src/actor-gateway/server.ts` has a separate entrypoint, separate `GHM_ACTOR_GATEWAY_DATABASE_URL`, startup role assertion for `ghm_actor_gateway`, and public-key-only JWT verification using `loadEs256VerificationKeys()` + `createAccessJwtVerifier()`. This is a sound existing separation pattern to follow.
- Resource API `src/http/app.ts` still registers `registerAuthRoutes` and constructs `new PostgresAuthPersistence()` using its default pepper loader.
- `src/http/auth-router.ts` lazily calls `createGhmAuthService()`; that factory defaults to `createAccessJwtService(loadEs256Keys())` and `createPostgresAuthPersistence()` defaults to the token pepper. Thus auth issuance is currently coupled to the ordinary Resource API process and ordinary runtime database principal.
- `src/auth/foundation/access-jwt-verifier.ts`, `loadEs256VerificationKeys()`, and Actor Gateway provide the already-existing public-key-only verification components. Reuse these; do not introduce a second JWT format or key model.

### Deployment/configuration gap

The ordinary server's `config` currently exposes one `GHM_RUNTIME_DATABASE_URL` (production) / development DB URL. Actor Gateway has its own explicit DB URL. There is no auth issuer entrypoint, issuer-specific DB URL, issuer principal assertion, or issuer-specific secret loader in the current source tree.

The package scripts expose `start`, `start:actor-gateway`, and no auth issuer start command. Therefore creating an issuer class or moving a route file alone would not create an isolation boundary. A separately launched process, separate service environment and independent DB connection are mandatory.

### Important unresolved dependency question

`src/http/app.ts` defaults to creating the auth persistence and password-reset service, but the production `src/server.ts` calls `createApp()` without injecting an auth service, recovery delivery service or QuoteFlow migration-reset services. The auth router's default auth-service factory exists, but the recovery/QuoteFlow services are optional dependencies and are not instantiated in this default composition. Before moving routes, trace how these services are intended to be supplied in deployment and whether current recovery routes are operationally enabled. Do not silently create a new email delivery integration or alter response behavior.

### Existing code-level isolation pattern to reuse

Actor Gateway startup already demonstrates:
- dedicated entrypoint and process;
- dedicated DB URL and connection pool;
- explicit principal startup verification;
- public-key-only JWT verification;
- bounded HTTP server timeouts and controlled shutdown.

The auth issuer should follow that pattern with its own `ghm_auth_issuer` principal and issuer-only secret loader. It must not import the general Resource API `config` module (which requires resource-specific environment settings), and the Resource API must not import issuer configuration or signing/pepper modules.

### Construction gate

Do not split auth routes yet until route ownership and recovery delivery configuration are resolved. First add an executable deployment contract test that fails if:
- Resource API imports or constructs `PostgresAuthPersistence`;
- Resource API imports `createAccessJwtService` / `loadEs256Keys`;
- Resource API auth routes remain registered;
- the issuer lacks its own database URL/principal assertion;
- Resource API or Actor Gateway loads issuer-only token pepper/private signing key.

Then build the isolated issuer entrypoint and route registration as one atomic construction change, update package scripts and service Blueprint/docs (not production), and run all auth HTTP + disposable PostgreSQL positive/negative tests.


## Follow-up — corrected auth EXECUTE grant history and final-cutover targets (2026-11-12)

The migration-by-migration pass found that the prior summary conflated original runtime grants with later grants. This section is the corrected history for the security-relevant functions reviewed. It is still not a substitute for querying the final live PostgreSQL ACL catalog.

### Additional grant sources and later cuts

- `20261004020000_create_auth_account_registration.sql` separately grants `ghm_runtime` EXECUTE on `auth_create_account(text,text,text,text,text,integer,integer,integer)`. This grant was not in the original `20260921130000` function list.
- `20261004181000_add_quoteflow_migration_reset_enrollment_lookup.sql` grants runtime EXECUTE on `auth_lookup_quoteflow_migration_reset_enrollment(text)`.
- `20261004190000_add_quoteflow_migration_reset_completion.sql` grants runtime EXECUTE on `auth_complete_quoteflow_migration_reset(bytea,text,integer,integer,integer)`. The function consumes a token and derives the account from the enrollment/recovery row, but it also performs password mutation and session revocation. It is still a privileged issuer lifecycle operation and should move behind the issuer boundary.
- `20261111210000_revoke_runtime_account_external_identity_table_access.sql` re-grants runtime EXECUTE on external identity lookup, external identity link, external identity bootstrap and QuoteFlow migration account provisioning after revoking direct mapping-table/sequence access. Later migrations cut the privileged link/bootstrap/provision functions:
  - `20261111240000` revokes `auth_provision_migration_account(text,text,text,text)` from PUBLIC and runtime.
  - `20261111250000` revokes `auth_link_external_identity(text,text,bigint)` from PUBLIC and runtime.
  - `20261111260000` revokes `auth_bootstrap_external_identity(text,text,text,text)` from PUBLIC and runtime.
- `20261111230000` removes runtime access to the internal recovery redemption/revocation helper and broad account-ID session revocation, but deliberately retains public-to-runtime EXECUTE on the token-bound wrappers `auth_redeem_recovery(bytea)` and `auth_redeem_recovery_with_count(bytea)`. Both are issuer lifecycle operations; runtime EXECUTE should be cut only when the replacement issuer path is ready.
- `auth_lookup_external_identity(text,text)` remains intentionally runtime-accessible for Connect's lookup-only identity adapter. Do not revoke it as part of the password issuer cutover without replacing Connect's consumer.
- `auth_lookup_quoteflow_migration_reset_enrollment(text)` is currently runtime-accessible and returns the internal enrollment/account identifier to its service. Move it into the issuer; it is not a resource API read.
- The current QuoteFlow reset completion function is token-bound and atomic, but still runs through the ordinary Resource API persistence pool and has runtime EXECUTE. Preserve its existing one-time token/enrollment/approved-email binding and transaction semantics while moving the caller.

### Corrected target matrix

| Function / capability | Current source evidence | Target after issuer cutover |
|---|---|---|
| `auth_create_account` | Separate registration migration grants runtime | issuer only |
| `auth_lookup_password_by_normalized_email` | Original auth migration grants runtime; returns password hash | issuer only |
| `auth_set_password` | Original auth migration grants runtime | issuer only; split into conditional rehash and token-bound reset/change operations if contract supports |
| `auth_create_session_with_refresh` | Original auth migration grants runtime; accepts account ID | issuer only; remove arbitrary caller account-ID authority |
| `auth_rotate_refresh` | Original auth migration grants runtime; token-bound | issuer only |
| `auth_revoke_by_refresh_hash` | Original auth migration grants runtime; token-bound | issuer only |
| `auth_issue_recovery` | Original auth migration grants runtime; accepts account ID | issuer only; derive account from eligible credential lookup |
| `auth_redeem_recovery`, `auth_redeem_recovery_with_count` | Token-bound wrappers remain runtime-accessible | issuer only |
| `auth_complete_quoteflow_migration_reset` | Token/enrollment-bound atomic function, runtime grant remains | issuer only |
| `auth_lookup_quoteflow_migration_reset_enrollment` | Runtime grant remains | issuer only |
| `auth_validate_session` | Runtime grant exists; persistence interface exposes it | remove from Resource API if unused; otherwise explicit separate read-only contract after caller trace |
| `auth_lookup_external_identity` | Runtime grant remains; Connect adapter calls it | retain for lookup-only Connect integration unless replacement contract is qualified |
| `auth_link_external_identity`, `auth_bootstrap_external_identity`, `auth_provision_migration_account` | Later migrations revoke runtime/PUBLIC | keep revoked; operator/migrator governance only |
| `auth_revoke_session`, `auth_change_password`, `auth_disable_account`, `auth_revoke_all_sessions_for_account` | Later migrations revoke runtime/PUBLIC | keep revoked; no broad account-ID operation in ordinary runtime |
| `auth_lookup_business_external_mapping`, `auth_link_business_external_mapping` | Separate business mapping integration | separate service/actor contract; not auth issuer by assumption |

### Immediate implementation consequence

Do not start by changing only `auth_set_password` grants. At minimum, the issuer cutover must include account creation, password hash lookup, session create, refresh rotation, refresh-token logout, recovery issuance/redemption/reset, QuoteFlow reset lookup/completion, password hash/pepper operations and ES256 signing. Connect external identity lookup is the deliberate exception. Existing migration/operator revocations must remain in force.

### Effective ACL qualification required

The repository CI's disposable PostgreSQL migration job currently applies all migrations and existing auth persistence tests exercise the shared runtime. Add a dedicated auth issuer ACL qualification after the new principal exists. It must query `has_function_privilege` for PUBLIC, `ghm_runtime`, `ghm_actor_gateway`, `ghm_auth_issuer`, and owner/migrator as appropriate; include every exact overload and confirm no inherited role membership/default PUBLIC EXECUTE bypass. Positive issuer calls and negative runtime direct calls must be run with separate real database logins, not `SET ROLE` impersonation from one login.

No grants have been changed in this follow-up.


## Follow-up — correct service-topology authority and auth route availability (2026-11-12)

### ADR-001 topology correction

A re-read of the approved ADR resolves an ambiguity in earlier handover wording. ADR-001's **default is two distinct internal services**: an authentication issuer and a typed database actor gateway. Separate processes inside one deployment are an exception only if process, credential, network and deployment isolation are demonstrably equivalent. The earlier handover phrasing that treated a separate process as the default was too permissive; it is corrected here. No service is to be provisioned until a separate operational plan is reviewed and authorized.

The existing Actor Gateway is the reference for a separately launched service and dedicated database URL/principal. The issuer should follow the distinct-service default and use its own database URL, role assertion, issuer-only secret configuration, signing key and refresh/recovery pepper. A same-deployment process split is not accepted merely because it has a separate entrypoint.

### Exact current HTTP route behavior from source

The previous note described missing recovery/QuoteFlow dependency injection as an unresolved deployment wiring question. The route-level behavior is now verified:

- `src/http/app.ts` always constructs `new PostgresAuthPersistence()` by default and always registers `registerAuthRoutes`.
- `PostgresAuthPersistence` evaluates its default `loadTokenPepper()` constructor argument immediately. Consequently the ordinary Resource API process requires and loads `GHM_AUTH_TOKEN_PEPPER` at app construction, not only when a login route is first called.
- `src/http/auth-router.ts` lazily creates the default `GhmAuthService` for register/login/refresh/logout. That factory loads `GHM_JWT_ES256_PRIVATE_KEY_PEM` via `loadEs256Keys()` when first invoked.
- Password reset is enabled by default: `app.ts` creates `createPasswordResetService(authPersistence)` when no dependency is injected, and the HTTP route calls it.
- Password recovery request is deliberately unavailable unless a `PasswordRecoveryService` is injected; without it the route returns HTTP 503 `service_unavailable`. The app's default server does not inject one.
- Both QuoteFlow migration-reset routes return HTTP 503 unless their respective recovery/completion services are injected. The default server does not inject them.
- No password-recovery delivery adapter is instantiated by the default Resource API composition. The `PasswordRecoveryDelivery` interface is a port only; source does not establish a configured provider. Do not assume email delivery works or add a provider without a separate approved integration decision.
- QuoteFlow migration reset completion currently commits the token-bound reset, then calls ordinary login with the returned email and submitted password to issue a session. The issuer move must preserve this contract or deliberately replace it with an atomic reset-and-session design that is proven compatible; do not accidentally introduce a failure window.

### Practical consequence

The issuer construction must not silently enable currently disabled recovery/QuoteFlow routes. Route availability and delivery remain explicit configuration dependencies. First preserve the current externally observable statuses and payloads; separately qualify a delivery adapter and service configuration if/when approved. Password reset's currently enabled route must remain supported and must be corrected to a token-bound credential update that does not implicitly change login email unless an explicit verified email-change contract is approved.

### Corrected implementation gate

1. Honor ADR-001's distinct-service default; if a process-only alternative is ever proposed, supply evidence for equivalent deployment/network/credential isolation and obtain architecture approval first.
2. Keep ordinary Resource API startup independent of `GHM_AUTH_TOKEN_PEPPER`; it must not construct auth persistence or load issuer secrets.
3. Move the complete authentication HTTP surface (native and browser-cookie variants) to the issuer, including rate limits, cookie origin/path/security policy, anti-enumeration and response compatibility.
4. Keep recovery/QuoteFlow routes unavailable until their explicit service and delivery dependencies are configured; preserve current 503 behavior during initial extraction.
5. Prove the issuer owns all credential, refresh/recovery and signing operations; Resource API and Actor Gateway retain only public-key verification.
6. Do not change production service topology, environment variables, secrets, grants, routes or payment settings during this isolated construction work.

No code or production configuration was changed in this follow-up.


## Follow-up — external auth routing and deployment contract (2026-11-12)

### Browser client contract

The GHM web app currently has one API origin:
- `web/src/api/config.ts` uses `VITE_GHM_API_BASE_URL`, defaulting to the current GHM Internal Runtime origin.
- `web/src/auth/ghm-auth-client.ts` sends login, refresh and logout directly to `/api/v1/auth/login`, `/api/v1/auth/refresh`, and `/api/v1/auth/logout` on that same origin.
- The web client also sends all ordinary resource API calls to the same origin.
- The server auth router includes both native JSON refresh-token routes and browser cookie routes. Browser cookies are scoped to `/api/ghm`, with configured allowed origins, HttpOnly, SameSite=Lax and Secure in production.

Therefore, a separate issuer service cannot simply be given a new browser-visible base URL without designing cross-origin/CORS/cookie and frontend/native-client compatibility. The preferred public contract is to preserve the existing auth paths and route them to the isolated issuer through an explicitly designed edge/reverse-proxy or same-origin routing layer. The proxy must not become an issuer-signing oracle or expose issuer DB/pepper/private-key credentials. Its authentication, network policy, request limits, origin validation and failure behavior must be threat-modelled.

### Deployment evidence gap

The repository tree contains no Render Blueprint, Dockerfile, deployment manifest, or service topology definition for the current Resource API / Actor Gateway. The Actor Gateway has a package start script and source entrypoint, but the deployment arrangement is not source-controlled here. No issuer deployment can be safely specified from the repository alone.

Do not guess the current Render service's start command, build command, environment variables, network exposure, proxy capabilities, or custom-domain routing. A deployment manifest and operational service inventory must be obtained before proposing the final public routing arrangement. No Render service is to be created or changed.

### Route compatibility and extraction

The issuer must own all auth routes, including:
- Native JSON register/login/refresh/logout.
- Browser register/login/refresh/logout and cookie issuance/clearing.
- Password recovery request/reset.
- QuoteFlow migration reset request/completion.

Current default service availability must be preserved: password reset exists; password recovery and QuoteFlow reset routes return 503 without injected dependencies. Rate limits, status codes, payloads, anti-enumeration, token bundle shape, cookie name/path/flags, and existing ES256 claims/TTL must be contract-tested across the extraction.

### Latest CI

The documentation/current-state head `0f9349a14b7b5e3e4e2d1d3c05c83470330beb0b` triggered CI run #3493. `web-quality` passed. `quality` completed build and all migrations, and was still running the test suite and subsequent disposable PostgreSQL qualification steps at the time of this note. Exact-head CI remains pending until the job concludes.


### CI follow-up after routing documentation

CI run #3493 is for predecessor commit `0f9349a14b7b5e3e4e2d1d3c05c83470330beb0b`: `web-quality` passed; `quality` has not yet reported a final conclusion. The subsequent routing handover/current-state commits are later than that run and require exact-head CI confirmation. No code changes were made in this audit batch.


## Follow-up — complete product-consumer auth endpoint inventory (2026-11-12)

The issuer route cutover has external product consumers, so it cannot be implemented only inside GHM. The following current-main source contracts were inspected.

### GHM web

- `web/src/api/config.ts` exposes one `VITE_GHM_API_BASE_URL` for both resource and auth traffic.
- `web/src/auth/ghm-auth-client.ts` calls native `/api/v1/auth/login`, `refresh`, and `logout` on that same base URL.
- Split auth and resource origins only after adding explicit configuration and tests; do not silently repoint ordinary resource requests to the issuer.

### ZAID Connect

- Main `src/lib/ghmAuth.js` currently uses `VITE_GHM_API_BASE_URL` for native `/api/v1/auth/register|login|refresh|logout` and all GHM resource requests.
- Optional browser auth is gated by `VITE_GHM_WEB_AUTH_ENABLED === "true"`; it defaults off. When enabled, `src/features/authentication/ghmWebAuthClient.js` calls the same-origin Vercel BFF at `/api/ghm/auth/web/{register,login,refresh,logout}`.
- `api/ghm/[...path].js` currently has one server-only upstream `GHM_INTERNAL_RUNTIME_URL`. Its browser-auth allow-list is exactly four POST routes; it maps them to `/api/v1/auth/web/*`, forwards the cookie and the canonical Origin, and blocks native auth routes from the general resource proxy.
- Native bearer mode remains the default and uses direct runtime auth endpoints; browser-cookie mode is optional and not enabled by default. Do not treat the optional BFF as proof that native auth has moved to a separate issuer.

### QuoteFlow

- Current main has a Gate A GHM auth adapter, but it is explicitly disabled unless `EXPO_PUBLIC_GHM_AUTH_ENABLED=true` and `EXPO_PUBLIC_GHM_AUTH_BASE_URL` is set.
- When enabled, `src/lib/ghmAuthClient.ts` uses one `baseUrl` for both native `/api/v1/auth/login|refresh|logout` and `/api/v1/identity`. Therefore the issuer extraction must split the auth issuer origin from the GHM resource/identity API origin before Gate A can be enabled against the new topology.
- Current QuoteFlow main retains its existing Supabase Auth coexistence. However, open PR #25 replaces AuthContext with GHM-only auth and removes the Supabase client dependency; the dependent issuer-origin branch inherits that removal. With Gate A false on that PR stack, sign-in/sign-up are unavailable and there is no Supabase fallback. Do not merge PR #25 or its dependent branch until the issuer is live and Gate A is explicitly approved.

### Required consumer migration

Before removing auth routes from the Resource API:
1. Add a distinct auth issuer base URL to GHM web and Connect native auth clients; keep resource API base URLs unchanged.
2. Add a distinct server-only issuer upstream to the Connect Vercel BFF for the four optional browser-cookie endpoints. Keep its allow-list, origin validation, body limits, cookie forwarding and no-redirect behavior.
3. Add separate issuer/resource base URLs to QuoteFlow's GHM client; preserve its disabled-by-default Gate A flag. Keep current main's Supabase coexistence unchanged, but treat PR #25's GHM-only auth stack as non-deployable while Gate A is disabled because it has no Supabase fallback.
4. Keep public auth path contracts, token response shape, ES256 claims/TTL, refresh rotation, logout semantics, cookie attributes and error mapping unchanged.
5. Add cross-repository contract tests and a staged non-production end-to-end plan before any product environment variable or deployment changes.

This inventory is based on GHM integration branch source plus the current `main` branches of `zaid-connect` and `QuoteFlow` as of 2026-11-12. No product repositories were modified and no feature flags or deployments were changed.


### Updated CI result

Run #3493 on predecessor commit `0f9349a14b7b5e3e4e2d1d3c05c83470330beb0b` has now completed successfully: both `quality` and `web-quality` passed. This covers the full build, migration chain, complete test suite and all configured disposable PostgreSQL qualifications. It does not validate the later cross-product consumer-inventory commits. The current branch head is newer and still requires exact-head CI confirmation.


## Construction checkpoint — isolated issuer foundation (2026-11-12)

A dedicated construction branch has been created from the reconciled integration documentation head:
`construction/auth-issuer-isolation-20261112`.

### Implemented in this construction batch

- `src/auth-issuer/server.ts`: separate issuer process entrypoint, dedicated `GHM_AUTH_ISSUER_DATABASE_URL`, explicit production SSL mode, independent PostgreSQL pool, startup database-principal assertion, and issuer-only construction of `PostgresAuthPersistence`, ES256 signing service and password-reset service.
- `src/auth-issuer/app.ts`: independent Express app that owns the existing auth router contract, with bounded JSON parsing, optional explicit CORS allow-list and process health endpoint.
- `src/auth-issuer/database-principal.ts` + tests: require session/effective user `ghm_auth_issuer`, LOGIN/NOINHERIT, no elevated role flags and no role memberships in either direction.
- `src/auth-issuer/database-ssl.ts` + tests: production must explicitly select internal or external DB transport; no implicit production mode.
- `src/auth-issuer/app.test.ts`: tests existing native login response contract and preserves the default 503 behavior for unconfigured password-recovery delivery.
- `package.json`: adds `start:auth-issuer` and includes the issuer tests in the Node test suite.
- `.env.example`: documents issuer-only environment variables; no values/secrets added.
- `.github/workflows/ci.yml`: creates a disposable `ghm_auth_issuer` login for future qualification and runs CI on this construction branch. This is CI-only role setup, not a database migration or production role change.

### Deliberately not done yet

- The Resource API still registers its existing auth routes and still loads the current token pepper/private signing path. This construction batch does not claim that production or the current runtime has been isolated.
- The issuer role has not been granted auth function/table privileges. There is no issuer privilege migration or manual cutover yet.
- The issuer process has not been deployed or connected to a live database.
- No GHM web, Connect or QuoteFlow clients have been modified. The cross-product base-URL split and Connect BFF upstream split remain required before route cutover.
- Password-recovery delivery and QuoteFlow migration-reset dependencies remain unconfigured, preserving current default 503 behavior.
- No production services, database roles, grants, secrets, environment variables, routes or deployments were changed.

### Qualification status

CI is running on the construction branch. Earlier queued runs predate the corrected package test-list placement; use the latest run against the exact current head as authoritative. Do not treat any earlier construction run as final qualification. The app test is a route-contract unit test only; issuer DB privilege tests, end-to-end issuer flow tests, cross-product tests and actual disposable issuer login qualification remain outstanding.

### Next construction tasks

1. Resolve any build/test issues from exact-head CI.
2. Add a dedicated issuer disposable-PostgreSQL qualification with a real `ghm_auth_issuer` login, exact function allow-list and negative `ghm_runtime` assertions.
3. Add issuer-specific database grant plan only after final effective ACL inventory; keep all grant changes in isolated qualification first.
4. Add cross-product auth-origin configuration and tests without changing product flags or production environment.
5. Remove auth routes/private key/pepper from Resource API only after issuer path and same-origin routing compatibility are qualified.


## Disposable issuer cutover qualification — passed (2026-11-12)

CI run #3521 passed both `quality` and `web-quality` on commit `76adba8bff042b40bd864c419c27259db40e63da`. The quality job ran the new issuer baseline and disposable cutover sequence after the existing runtime-based suite and all prior runtime qualifications.

### What passed

1. **Pre-grant baseline:** a real `ghm_auth_issuer` PostgreSQL login has no role memberships/elevated role flags, no callable `ghm.auth_*` functions, and no direct credential/session table privileges.
2. **Disposable-only cutover fixture:** `scripts/fixtures/auth-issuer-disposable-qualification-grants.sql` grants schema USAGE and an exact 12-function allow-list to `ghm_auth_issuer`, while revoking those functions from PUBLIC and `ghm_runtime`. This fixture is applied only to the CI disposable PostgreSQL database, after the normal runtime tests.
3. **Issuer privilege shape:** the issuer can execute exactly the 12 reviewed function names and has no direct privileges on the protected credential/session/identity mapping tables.
4. **Runtime negative tests:** real `ghm_runtime` login receives PostgreSQL permission-denied (SQLSTATE 42501) on all 12 issuer-only operations.
5. **Connect compatibility:** `ghm_runtime` can still execute `auth_lookup_external_identity`; the lookup-only Connect identity path remains available.
6. **Positive issuer lifecycle:** a separate real issuer DB login successfully registers an account, logs in, rotates refresh, logs out, issues recovery, redeems a one-time recovery token, changes the password, verifies replay rejection, confirms the old password no longer works, logs in with the new password and logs out.

### Exact issuer function allow-list qualified in disposable PostgreSQL

- `auth_create_account`
- `auth_lookup_password_by_normalized_email`
- `auth_set_password`
- `auth_create_session_with_refresh`
- `auth_validate_session`
- `auth_rotate_refresh`
- `auth_revoke_by_refresh_hash`
- `auth_issue_recovery`
- `auth_redeem_recovery`
- `auth_redeem_recovery_with_count`
- `auth_lookup_quoteflow_migration_reset_enrollment`
- `auth_complete_quoteflow_migration_reset`

### Remaining qualification gaps

- The positive QuoteFlow migration-reset enrollment/completion ceremony has not yet been run through the new issuer login. The two functions are in the allow-list, but require a dedicated enrollment fixture and end-to-end assertion.
- The password rehash-on-login branch has not yet been forced in the new issuer integration test.
- Password reset still accepts an email alongside the recovery token and calls the general setter; same-account email binding/mismatch behavior remains an open contract issue. This qualification used the account's existing email only.
- The issuer HTTP server itself is not deployed or started by CI; the database lifecycle test constructs the same persistence/service with a real issuer DB pool and ephemeral ES256 key. HTTP app route tests and compile pass separately.
- Resource API auth routes, private key and token pepper are still present. No live cutover occurred.
- Product clients and Connect BFF are unchanged. No service deployment, secret, production database role or grant was changed.

### Important sequencing proof

The disposable grant/revoke fixture is intentionally applied only after the existing auth persistence suite, runtime qualifications and `verify:runtime` have completed. This avoids changing the assumptions of the pre-existing runtime qualification suite and then misreading its failures. The resulting issuer test proves the post-cutover database boundary separately.

Latest CORS validation and environment documentation commits were added after #3521; use the newest exact-head CI run before treating the current construction branch as fully green.


### Extended issuer qualification — QuoteFlow reset and password rehash passed

CI run #3528 passed both quality and web-quality on commit `7f3c848c51ed09beedc6967640694b325f02ba57`. Its final qualification output was:

```json
{
  "issuerAllowList": 12,
  "issuerDirectSecretTablePrivileges": 0,
  "runtimeIssuerFunctionDenials": 12,
  "connectLookup": "preserved",
  "registrationLoginPasswordRehashRefreshLogout": "passed",
  "recoveryResetReplayAndSessionRevocation": "passed",
  "quoteFlowMigrationReset": "passed"
}
```

This closes two gaps from the previous checkpoint:
- Password rehash-on-login was forced with a wrapper hasher, then the new stored hash was independently verified by a subsequent normal login.
- QuoteFlow reset was exercised end-to-end using a credentialless active account, a matching Supabase external-identity mapping, a real migration enrollment, a token-bound recovery credential, the issuer-only enrollment lookup and completion functions, one-time completion/replay rejection, enrollment transition out of `reset_required`, and a successful login with the established password.

The enrollment/account/mapping fixture was created through the dedicated migrator login with `SET ROLE ghm_schema_owner`; all auth lifecycle operations ran through the separate `ghm_auth_issuer` login. No issuer direct table grants were introduced.

### Additional issuer ingress hardening in progress

After #3528, the construction app was hardened to:
- reject wildcard, opaque, malformed, non-HTTPS (except localhost) CORS origins;
- deduplicate exact configured origins;
- require explicit `GHM_AUTH_ISSUER_TRUST_PROXY_HOPS` in production (including explicit `0` for direct/no-proxy deployment), with a bounded integer range 0–10;
- avoid guessing Render/proxy topology; the value must be set only after the actual trusted hop chain is verified.

The latest exact-head CI run for these CORS/proxy changes is still in progress. Do not treat those later changes as qualified until the run completes.


## Cross-repository issuer URL extraction — construction completed and CI passed (2026-11-12)

The GHM issuer-origin client split has now been implemented on isolated construction branches in both consuming product repositories. No default origins or feature flags were changed; absent issuer URL configuration falls back to the existing GHM resource/API origin.

### GHM web client

- `web/src/api/config.ts` now has `getAuthIssuerBaseUrl()`, using optional `VITE_GHM_AUTH_ISSUER_BASE_URL` and falling back to `getApiBaseUrl()`.
- `web/src/auth/ghm-auth-client.ts` sends register/login/refresh/logout to the issuer origin, while `apiFetch` continues using the resource API origin.
- Added tests for fallback/configured origin selection and split auth/resource requests.
- This branch's changes are in the GHM construction branch; the exact CI run for the full branch still needs final-head confirmation after subsequent commits.

### ZAID Connect

- Construction branch: `construction/ghm-auth-issuer-origin-20261112`.
- Added `VITE_GHM_AUTH_ISSUER_BASE_URL` resolver; native bearer auth calls use it, while resource `apiFetch` remains on `VITE_GHM_API_BASE_URL`. Empty/unset issuer setting falls back to the resource URL.
- Added `GHM_AUTH_ISSUER_URL` as an optional server-only upstream for the four browser-cookie auth endpoints in the Vercel BFF. The resource proxy continues to use `GHM_INTERNAL_RUNTIME_URL`. Existing browser-auth feature flag remains disabled by default; fixed allow-list, Origin checks, cookie forwarding and native-route blocking remain.
- Added URL resolver and BFF upstream split tests; wired the contract test into the existing auth contract command.
- CI run #292 passed the full Connect quality job on commit `8c77213f089b335cdcfa44d26303319d4ebe7555`. This run includes the issuer URL contract and proxy upstream test commits present before the workflow-triggering commit. Exact final branch head `5fedd4d` has not itself triggered a new CI run yet; recheck after the next branch push.

### QuoteFlow

- Construction branch: `construction/ghm-auth-issuer-origin-20261112`.
- Added optional `EXPO_PUBLIC_GHM_AUTH_ISSUER_URL`; its resolver falls back to existing `EXPO_PUBLIC_GHM_AUTH_BASE_URL`.
- `ghmAuthClient` sends login/refresh/logout to the issuer URL, while `getIdentity` stays on the resource API URL. The adapter passes both origins explicitly.
- Gate A remains disabled by default. This statement applied to the then-current main-based construction branch only; it did not describe PR #25's GHM-only stack. PR #25 removes Supabase Auth and has no fallback when Gate A is disabled. No environment flag was enabled.
- Added a split-origin integration test and documented the optional env value.
- CI run #220 passed typecheck and tests on commit `76c8e29dd5609af5026299aee4359bfc90caa74a`. The subsequent test commit `8f58bfb` has not yet triggered an exact-head CI run; recheck after the next branch push.

### Cutover remains blocked intentionally

These are client-side construction changes only. No product deployment/environment variables, Vercel BFF secrets, issuer service, proxy routes, or DNS/custom domains were changed. All default behavior still uses the current GHM Internal Runtime origin. Before enabling a separate issuer URL, we still need:
- Actual Render service configuration and network/private routing plan confirmed from the owner.
- A same-origin ingress/proxy design for the GHM web client and Connect BFF that does not expose issuer credentials.
- A QuoteFlow build-time env plan; its flag remains off.
- Issuer DB principal allow-list and issuer service start-up qualification (disposable CI passes, production service not deployed).
- End-to-end non-production tests across GHM web, Connect native and browser modes, and QuoteFlow Gate A before any production routing changes.

No live service, database, secret, product environment, or feature flag has been changed.


### Final cross-product construction CI trigger

The product handover commits now trigger CI against the latest product branch heads, including the final test changes:
- Connect final construction handover commit: `5b564c09148948b7a854bc73dbe920844b4b16ce`.
- QuoteFlow final construction handover commit: `321eb8d8322fcc1d07ce576d382bb4b34af1573f`.

Wait for the new exact-head Connect and QuoteFlow workflows to finish before marking their branch heads qualified. Earlier #292/#220 results covered their workflow-triggering commits, not the later final test/handover commits.


## Render service inventory — deployment topology verified (2026-11-12)

The connected Render workspace inventory was inspected read-only. This resolves part of the earlier deployment evidence gap.

### Current GHM Internal Runtime service

- Service: `GHM-Internal-Runtime`
- Service ID: `srv-damupsek1f9s73eq8kkg`
- URL: `https://ghm-internal-runtime.onrender.com`
- Repository: `zaidhqdev-sys/GHM`
- Branch: `main`
- Build: `npm ci && npm run build`
- Start: `npm start`
- Health check: `/healthz`
- Plan: `free`
- Region: Frankfurt
- Auto deploy: disabled
- Render IP allow-list: `0.0.0.0/0` (publicly reachable at Render edge)

### Actor Gateway deployment status correction

The Render workspace currently lists five services. None is named or configured as a dedicated GHM Actor Gateway service. Source has a separate Actor Gateway entrypoint and start script, but that does **not** prove the gateway has a separately deployed service. Earlier handover language referring to an existing separate Actor Gateway service was too strong; the verified fact is only a separate source entrypoint/process contract. Its actual deployment is not present in the current Render service inventory.

### Network/topology implications

- Current Resource API service is public at the Render edge. The inventory does not establish private service-to-service routing, internal DNS, trusted proxy hop count, or whether a new issuer can be reached privately.
- Do not configure `GHM_AUTH_ISSUER_TRUST_PROXY_HOPS` based on assumption. Current Resource API and issuer need an explicit proxy/topology decision.
- A separate issuer would be an additional Render service. The current Resource API is on the free plan, but actual availability/limits for an additional free service must be confirmed in Render before creating anything. No service was created.
- Do not place issuer private key, token pepper or issuer DB URL in the current Resource API service environment. Its existing environment was not read or changed.
- Because the current service auto-deploy is off, merging code alone would not deploy it; however, this is not a reason to merge before docs and qualification gates are satisfied.

### Next deployment planning gate

Before service creation, obtain/confirm:
1. Whether Render offers a suitable free service allocation without paid spend.
2. Private networking availability for this workspace/service type and region, or a separately reviewed authenticated public upstream design.
3. Exact public routing arrangement for GHM web and Connect BFF.
4. Health/readiness behavior and startup DB-role assertion.
5. Required issuer database credential and exact grants after the migration has been reviewed; no current secret values were accessed.

This is a read-only inventory correction. No Render service, database, environment variable, secret, routing rule, or deployment was modified.


## Latest construction corrections — readiness and full-relation ACL check (2026-11-12)

- Added issuer `/readyz`, backed by `SELECT 1` against the dedicated issuer pool. `/healthz` remains liveness-only. Readiness fails closed with 503 if no database check is wired or the check fails. Tests cover both states.
- Strengthened both pre-grant and post-cutover ACL qualification to inspect all GHM tables, partitioned tables, views, materialized views and foreign tables, not only the named credential/session tables. The issuer must have no direct relation privileges; all access is through the reviewed SECURITY DEFINER function allow-list.
- CI runs #3544/#3545 exposed a simple variable-name regression during this test expansion (`secretTablePrivileges` remained in one assertion after the query variable was renamed). The failure was in the qualification script, not a PostgreSQL permission finding. It was corrected in commit `f254435fa813bf4960e4cb10e6974413699cd5e4`.
- Run #3549 on `f254435` has passed build, full migrations and the strengthened pre-grant all-relation baseline; the full existing suite and post-cutover lifecycle checks are still running.
- The latest readiness changes and the follow-up handover commits are newer than #3549 and will need exact-head CI confirmation.

No production changes.


## Manual cutover SQL now exercised in disposable PostgreSQL; least-privilege correction (2026-11-12)

### Guarded manual cutover artifact

The disposable qualification now applies the same durable manual cutover SQL intended for a future, explicitly approved cutover:
`database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql`.

This is deliberately under `database/cutovers/`, not the automatic migration chain. It:
- fails unless `ghm_auth_issuer` exists as LOGIN/NOINHERIT, has no elevated role flags and has no role memberships;
- grants only `USAGE` on schema `ghm`;
- removes all direct table, sequence and function privileges from the issuer before the allow-list;
- revokes the reviewed auth lifecycle functions from PUBLIC and `ghm_runtime`;
- grants the reviewed function allow-list to the issuer;
- deliberately retains `auth_lookup_external_identity` for Connect's lookup-only resource path.

CI runs #3553 and #3554 passed the full disposable sequence using this manual cutover file, including the positive lifecycle and runtime denial checks. This confirms the SQL artifact works in disposable PostgreSQL. It is not an authorization to apply it to a live database.

### Removed an unnecessary issuer permission: `auth_validate_session`

A source-level caller audit confirmed `auth_validate_session` / `PostgresAuthPersistence.validateSession` had no active production caller; all references were in the persistence test suite. It was therefore unnecessarily included in the first 12-function issuer allow-list.

Correction:
- removed `validateSession` from the production `AuthPersistence` interface and `PostgresAuthPersistence` implementation;
- retained the underlying SQL function for tests, but changed test-only calls to use the migrator login with `SET LOCAL ROLE ghm_schema_owner`;
- retained explicit denial of `auth_validate_session` to `ghm_runtime` in the post-cutover negative test;
- removed its issuer GRANT from the manual cutover and its name from the issuer allow-list.

The reviewed issuer allow-list is now **11 functions**, not 12. The latest CI runs #3557/#3558 test this reduced allow-list and owner-only test access. Do not claim the 11-function version is qualified until the exact-head run completes successfully.


## Password-reset email binding corrected; issuer allow-list reduced again (2026-11-12)

The unresolved reset contract has now been addressed in construction.

### New database operation

Migration `20261112020000_add_token_bound_password_recovery_reset.sql` adds `ghm.auth_reset_password_with_recovery`. It:
- accepts the recovery-token hash, normalized login email and new Argon2 hash/parameters;
- locks and validates the one-time recovery token;
- requires that token's account be active and the supplied normalized email match that account's existing active credential;
- rejects generic password reset for accounts still enrolled in the separate QuoteFlow migration-reset ceremony;
- consumes the token, updates only the password hash/Argon2 metadata (never login email), and revokes all sessions atomically;
- returns the account ID and revoked-session count without allowing the caller to choose an account ID.

The function is initially granted to `ghm_runtime` by the automatic migration to preserve compatibility until the manual service cutover. The guarded manual issuer cutover revokes it from PUBLIC/runtime and grants it to `ghm_auth_issuer`.

### Persistence and API changes

- `PostgresAuthPersistence.resetPasswordWithRecovery` now calls the single token-bound reset function instead of separately redeeming the token and calling the general password setter.
- The existing HTTP body still accepts the email field for compatibility, but it is now a binding check, not an instruction to change the account's login email.
- The database integration test and issuer qualification test attempt a mismatched email first, require `RECOVERY_CREDENTIAL_INVALID`, then successfully reset with the original email using the same still-unconsumed token. The subsequent login uses the unchanged original email.
- The standalone `redeemRecovery` persistence method was also found to have no active production caller. It has been removed from the production persistence interface/implementation; its underlying DB function is now used only by database tests through the schema-owner fixture path.

### Minimal issuer allow-list

The old `auth_redeem_recovery` and `auth_redeem_recovery_with_count` wrappers are no longer issuer operations. The issuer allow-list now consists of ten function names:
1. `auth_create_account`
2. `auth_lookup_password_by_normalized_email`
3. `auth_set_password`
4. `auth_create_session_with_refresh`
5. `auth_rotate_refresh`
6. `auth_revoke_by_refresh_hash`
7. `auth_issue_recovery`
8. `auth_reset_password_with_recovery`
9. `auth_lookup_quoteflow_migration_reset_enrollment`
10. `auth_complete_quoteflow_migration_reset`

The manual cutover revokes both old redemption wrappers from PUBLIC/runtime and grants the new token-bound reset function to the issuer. QuoteFlow migration reset remains a separate token-bound operation that sets the approved enrollment email; generic password reset cannot consume an enrolled migration token.

### Qualification state

Runs #3563 and #3553/#3554 validated earlier manual cutover versions, but not this new migration and 10-function allow-list. Runs #3571–#3573 are validating the new persistence API, tests, migration and cutover. Earlier failures in #3564–#3570 exposed stale test mocks and a token-pepper Buffer conversion in the owner-only fixture; these have been corrected. Do not claim the current reset change or 10-function allow-list qualified until exact-head CI passes.


## Conditional password rehash — stale-login race closed in construction (2026-11-12)

A further review of the login rehash path found a race not solved by issuer isolation alone: login verifies a password hash, then the old general `auth_set_password(account_id, email, new_hash...)` could overwrite a concurrent password reset that completed between verification and rehash.

### New compare-and-swap operation

Migration `20261112030000_add_conditional_password_rehash.sql` adds `auth_rehash_password_if_unchanged`. It updates only the password hash/Argon2 metadata and only where the active credential still contains the exact hash the login just verified. It does not accept an email or modify the login email.

### Application behavior

- `AuthPersistence.setPassword` was removed from the production persistence interface/implementation.
- Added `rehashPasswordIfUnchanged(accountId, expectedPasswordHash, password)`.
- Login calls the conditional operation after successful verification.
- If the conditional update loses a race, login re-reads the current credential and verifies the supplied password again. It rejects stale credentials and does not issue a session if a password reset/change has won.
- General `auth_set_password` remains available only to its SECURITY DEFINER owner path for the distinct QuoteFlow migration-reset operation; it is not an issuer grant and is revoked from runtime by the manual cutover.
- The manual issuer allow-list now includes `auth_rehash_password_if_unchanged` and no longer includes `auth_set_password`.

### New adversarial qualification

The disposable issuer test now interleaves a password reset after the login has verified the old hash but before the rehash operation. It requires the stale login to fail, then proves the replacement password succeeds. This checks the actual lost-update race, not merely that a normal rehash works.

### Current CI status

The first run with the new reset and rehash migrations found an ambiguous `account_id` reference in the new token-bound reset function (the name also exists as a PL/pgSQL output variable). The credential update was qualified with an explicit table alias in `68b5713`. CI #3588 is validating the corrected migration, full persistence suite, manual cutover and issuer race test. Do not claim this batch qualified until the exact-head run passes.


## Full issuer cutover qualification — 10-function boundary passed (2026-11-12)

CI run **#3588** completed successfully on code commit `68b57139994fc57120720d238047bc780cf0b972`: both `quality` and `web-quality` passed. The quality workflow completed all 894 tests (894 passed, 0 failed), all migrations, runtime boundary verification, the manual issuer cutover against disposable PostgreSQL, and the issuer lifecycle qualification.

### Exact post-cutover qualification output

```json
{
  "issuerAllowList": 10,
  "issuerDirectRelationPrivileges": 0,
  "runtimeIssuerFunctionDenials": 14,
  "connectLookup": "preserved",
  "registrationLoginPasswordRehashConcurrentResetRefreshLogout": "passed",
  "recoveryResetReplayAndSessionRevocation": "passed",
  "quoteFlowMigrationReset": "passed"
}
```

### Final 10-function issuer allow-list at this checkpoint

1. `auth_create_account`
2. `auth_lookup_password_by_normalized_email`
3. `auth_rehash_password_if_unchanged`
4. `auth_create_session_with_refresh`
5. `auth_rotate_refresh`
6. `auth_revoke_by_refresh_hash`
7. `auth_issue_recovery`
8. `auth_reset_password_with_recovery`
9. `auth_lookup_quoteflow_migration_reset_enrollment`
10. `auth_complete_quoteflow_migration_reset`

The general `auth_set_password` operation is no longer an issuer permission. It remains an owner-internal dependency of the QuoteFlow migration-reset SECURITY DEFINER operation and is revoked from PUBLIC/runtime by the manual cutover. `auth_validate_session`, `auth_redeem_recovery`, and `auth_redeem_recovery_with_count` are also excluded from issuer permissions; test-only uses run under schema-owner credentials.

### Adversarial guarantees demonstrated

- A normal login rehash succeeds and a later login verifies the new hash.
- A password reset interleaved after verification but before rehash wins; the stale login is rejected and cannot restore the old password.
- Recovery reset rejects a mismatched email without consuming the token, then succeeds with the matching existing email and leaves that login email unchanged.
- Recovery replay is rejected and all existing sessions are revoked.
- QuoteFlow migration reset remains one-time and bound to its enrolled external identity and approved email.
- The issuer has no direct privileges on any GHM table/partition/view/materialized view/foreign table.
- The shared runtime is denied 14 tested issuer/legacy auth operations; Connect's lookup-only external identity operation remains callable.

### Qualification boundary

The manual cutover was applied only to the disposable CI PostgreSQL database after the normal runtime test suite and all existing runtime qualifications. This proves the manual SQL and application boundary work together in isolation. It does **not** authorize applying the cutover to any live database.

The current construction branch contains later handover/current-state documentation commits than code commit `68b571`; exact-current-head CI is still required before branch review. Actual issuer service deployment, Render networking/routing, client production configuration and end-to-end non-production routing remain outstanding. No production role/grant/secret/service/deployment was changed.


## 2026-11-12 — Resource API issuer authority removed; cross-product routing contract verified

### Resource API process boundary

The latest construction batch removes the remaining authentication-issuer responsibilities from the ordinary Resource API process:

- src/auth/ghm-bearer.ts now builds the default resource-token verifier from loadEs256VerificationKeys() and createAccessJwtVerifier(). Resource authentication requires public ES256 verification material only; it does not load the signing private key.
- src/server.ts now creates the production Resource API with createApp({ authRoutesEnabled: false }).
- src/http/app.ts registers issuer lifecycle routes only when explicitly enabled. With them disabled, it does not instantiate PostgresAuthPersistence, so the Resource API does not load GHM_AUTH_TOKEN_PEPPER.
- The regression test requests all eight native, browser-independent auth lifecycle/recovery/QuoteFlow reset routes from a Resource API instance with issuer routes disabled and requires 404 for each.
- The isolated Authentication Issuer remains the only process that loads the ES256 private signing key, token pepper and dedicated GHM_AUTH_ISSUER_DATABASE_URL.

Exact current construction head 1cc09f83c236f9061e89dcf332c048845fd83185 passed GitHub Actions run #3597 (43134203950): quality and web-quality succeeded. The quality job passed 896 tests, 0 failures, the full migration chain, all existing disposable PostgreSQL qualifications, runtime boundary verification, the guarded issuer manual cutover against disposable PostgreSQL, and the issuer lifecycle/runtime-denial qualification. The new Resource API issuer-route isolation regression passed as test 247. This qualification is not a production cutover authorization.

### Cross-product client routing — source and exact-head CI verified

- GHM web: web/src/auth/ghm-auth-client.ts accepts separate baseUrl and authBaseUrl. VITE_GHM_AUTH_ISSUER_BASE_URL optionally selects the issuer for login/refresh/logout; VITE_GHM_API_BASE_URL remains the resource API origin for authenticated resource requests. Unset issuer URL falls back to the resource API origin.
- ZAID Connect: construction branch construction/ghm-auth-issuer-origin-20261112, exact handover/test head 5b564c09148948b7a854bc73dbe920844b4b16ce, passed CI #293 (43129562750). Native bearer login/refresh/logout can use optional VITE_GHM_AUTH_ISSUER_BASE_URL; resource requests retain VITE_GHM_API_BASE_URL. The same-origin Vercel BFF uses server-only GHM_AUTH_ISSUER_URL for exactly four existing browser-cookie operations (register/login/refresh/logout); resource requests remain on GHM_INTERNAL_RUNTIME_URL. Browser-cookie mode remains disabled by default.
- QuoteFlow: construction branch construction/ghm-auth-issuer-origin-20261112, exact handover/test head 321eb8d8322fcc1d07ce576d382bb4b34af1573f, passed CI #221 (43129565632). Optional EXPO_PUBLIC_GHM_AUTH_ISSUER_URL is used only for login/refresh/logout; identity/resource requests remain on the GHM resource API origin. This standalone main-based branch was superseded. Its Supabase coexistence note applied only to then-current main; the newer PR #25-based branch has no Supabase fallback when Gate A is disabled.

These are source-level split-origin implementations and CI contract tests, not deployed end-to-end routing. No issuer URL, feature flag or product environment value was enabled.

### Remaining non-production routing and deployment gates

1. Confirm a no-cost, suitable Render service allocation and whether private networking is actually available for the intended issuer service. The read-only Render inventory still does not establish a dedicated issuer service or verified private route. Do not assume Free service networking or create a paid service.
2. If private networking is unavailable, separately review a public HTTPS issuer ingress design, its CORS allow-lists, trusted proxy hop count, rate limiting, availability and origin restrictions. Do not place issuer private key, token pepper or issuer database URL in the Resource API environment.
3. Provision only non-production issuer secrets and the isolated database principal after the service topology is confirmed; run issuer /readyz and startup role assertions.
4. Exercise non-production registration/login/refresh/logout and resource authorization through all three clients, including Connect's native path and its separately disabled browser-cookie BFF path. Verify failure behavior and ensure identity/resource requests never route to the issuer.
5. Password recovery delivery and QuoteFlow migration-reset recovery delivery remain unconfigured in the issuer entrypoint; those routes remain unavailable (503) until an existing approved delivery adapter is wired and qualified. Do not invent a mail provider or claim recovery delivery is live.
6. Only after successful non-production end-to-end tests, a fresh independently verified production backup, Render role-model resolution, and explicit approval may the guarded manual issuer cutover be considered. The cutover file remains unapplied to every live database.

No production database grants/roles, secrets, Render services/environment, routing, deployments, product flags, application data or payment settings were changed. PayFast remains paused pending sandbox access; approved legal-document work remains parked. No merge was performed.


## 2026-11-12 — Render free-tier ingress and non-production topology decision

A fresh read-only inventory of the connected Render workspace and the current official Render networking/free-instance documentation resolves the earlier private-networking uncertainty.

### Verified workspace inventory

The workspace currently exposes five web services. Relevant GHM services:

- GHM-Internal-Runtime: Free web service, Frankfurt, branch main, auto-deploy disabled, public URL https://ghm-internal-runtime.onrender.com.
- ghm-identity-qualification: Free web service, Frankfurt, branch integration/ghm-identity-merge-candidate-20261018, auto-deploy enabled, last live deployment from 2026-11-04 commit ee91f42503e064571d57e87ed0d5cd1e9d5badd5. It has no configured Render health-check path in the service metadata.
- ghm-payfast-sandbox-runtime and ghm-payfast-callback-sandbox are separate Free services and remain outside this issuer work.

No dedicated Authentication Issuer service exists. The identity qualification service is an existing active deployment, not an unused allocation. Its database/environment contract has not been independently verified for issuer use. Do not repoint its branch, overwrite its environment, or redeploy it as an issuer until its current purpose, credentials and data boundary are reviewed. Do not treat the existence of this service as a free spare slot.

### Render networking facts

Official Render documentation confirms:

- Services in the same workspace and region share a private network.
- Free web services can initiate private-network requests but cannot receive private-network traffic.
- The current Resource API is a Free web service, so it cannot receive private-network requests either.
- A Free web service can receive public HTTPS traffic, but Render explicitly says Free instances are not intended for production applications.
- Free web services spin down after 15 minutes without inbound traffic and take about one minute to spin back up; they have one instance and no scaling.

References:
- https://render.com/docs/private-network
- https://render.com/docs/free

Therefore, a Free Render issuer cannot be privately reached by the Resource API or other services. A public-HTTPS issuer is technically possible for non-production routing, but it is not a private-network deployment and must be treated as public ingress. The current client architecture does not require issuer-to-Resource-API private calls: GHM web, Connect native, QuoteFlow native and Connect's server-side BFF call the issuer only for authentication operations; their resource/identity calls remain directed to the Resource API.

### Safe public-ingress contract for non-production only

If a verified non-production issuer endpoint is made available:

1. Use HTTPS only and a dedicated issuer origin. Keep issuer private signing key, token pepper and issuer DB URL exclusively in the issuer service.
2. Set GHM_AUTH_ISSUER_CORS_ORIGINS to exact browser origins that actually call the issuer. At present, GHM web is the browser client with direct split-origin auth. Connect browser-cookie auth remains disabled and, if separately approved later, its BFF calls the issuer server-to-server. Native Connect and QuoteFlow clients do not use browser CORS.
3. Treat CORS strictly as browser policy, never as authentication or authorization. Native clients and server-to-server requests can omit or forge Origin.
4. Determine GHM_AUTH_ISSUER_TRUST_PROXY_HOPS from observed request headers and a controlled deployed test. Do not guess a hop count or use X-Forwarded-For as a trusted identity signal.
5. Existing express-rate-limit limits are process-local. They provide a useful per-instance guard but do not survive process restarts and are not a distributed abuse-control system. Verify actual proxy IP handling and limiter behavior before public testing; do not claim global rate limiting.
6. Test health/readiness, cold starts, TLS, login/refresh/logout, invalid credentials, rate limits, CORS allow/deny behavior, and resource-origin separation. No production clients may be pointed at a qualification endpoint.

### Decision / blocker

No Render service or environment was changed. No deployment, secret write, database grant, or branch repointing occurred.

A Free public issuer could be used only as a temporary non-production qualification target after confirming a truly isolated non-production issuer database principal and credentials. The existing ghm-identity-qualification service must not be commandeered without confirming its purpose and database boundary. Free Render hosting is not an acceptable production availability plan for authentication because of spin-down/cold-start and the explicit non-production positioning in Render's own documentation.

Do not create a paid Render service, paid database, or other paid infrastructure. Do not use the live GHM database for a non-production issuer test. If no independently isolated non-production database and safe existing service allocation can be verified, keep end-to-end deployment blocked and continue with source-level and disposable-CI qualification.

Production cutover remains blocked on a fresh independently verified backup, approved production role provisioning/cutover, successful non-production end-to-end routing, and explicit approval. No production state changed.


### Database inventory — non-production issuer DB blocker confirmed (read-only)

A new read-only Render Postgres inventory found exactly three databases:

- ghm-db / database ghm_db: available, production primary, paid plan 0.1c-256mb. This is not a non-production issuer target.
- ghm-payfast-sandbox-db / database ghm_payfast_sandbox_db: Free plan but suspended by billing, expiry 2026-11-08. It remains unavailable and is reserved for PayFast sandbox work; do not repurpose it.
- ghm-identity-qualification-20261018 / database ghm_identity_qualification_20261018: available, paid basic_256mb, 15 GB disk. This is a dedicated qualification database, but its current consumers, role grants, data and service contract have not been audited for issuer use. Do not assume it is disposable or repurpose it.

There is no available Free Postgres database in the current Render workspace inventory. Therefore the hosted non-production Authentication Issuer cannot currently be deployed with a verified isolated database without either using a paid existing resource or creating another database. Neither is authorized under the no-new-spend constraint. Do not connect the issuer to ghm_db, and do not repurpose the identity qualification DB without a separate read-only ownership/data/role audit and explicit founder approval.

Continue using CI disposable PostgreSQL for issuer schema/grant/lifecycle qualification. Keep hosted end-to-end routing blocked. No database query, database mutation, role/grant change, service update, or environment write was performed during this inventory.


### Branch / PR relationship — checked 2026-11-12

PR #272 remains open and unmerged: "chore(security): qualify unified Actor Gateway integration stack", head `0eda4ea8e232c98264fe83c7aecc3c85f71a5596`, base `main`. Its current GitHub checks (quality, web-quality and Cloudflare Pages) are green. This does not authorize merging: production role-model/backup/deployment gates remain, and the founder's docs-first/no-stale-contradictions merge rule remains in force.

The Authentication Issuer construction branch is not an unrelated parallel fork. GitHub's commit comparison confirms `construction/auth-issuer-isolation-20261112` is **105 commits ahead and 0 commits behind** PR #272's current head at the time of this audit. It therefore carries the Actor Gateway integration stack as its base plus the subsequent issuer-isolation work. Keep the issuer work isolated on its construction branch; do not merge PR #272 underneath it or open a conflicting duplicate integration before the issuer branch is ready. Recheck ancestry and exact-head CI before preparing any eventual PR.


The paid identity-qualification database was not queried: Render's read-only Postgres connector reported that its IP allow-list is empty and blocks external connections. We did not widen that allow-list to enable the connector. Its schema, roles, migration state, consumers and data boundary therefore remain unverified. This is an explicit blocker, not evidence that the database is empty or suitable. Do not alter its network allow-list merely to make this audit possible.


## 2026-11-12 — Issuer CORS and abuse-control regression qualification

The next issuer hardening batch added real HTTP-level tests, beyond validating environment parsing:

- Exact allow-listed browser origin receives the matching `Access-Control-Allow-Origin` on preflight.
- An unlisted origin receives no CORS allow-origin header.
- Login rate limiting is exercised over HTTP: ten requests pass and the eleventh from the same client IP returns 429 with `rate_limited`.
- Existing auth-router regression also verifies the login limiter uses the rightmost trusted forwarded client IP under the configured proxy trust model.

Exact code/test head `51e1faa9836d09c8cf8f6eae4b97a06e82467115` passed GitHub Actions **#3606**: `quality` and `web-quality` succeeded; main test suite **898 passed / 0 failed** and the additional qualification suite **15 passed / 0 failed**. The issuer CORS and login limiter tests passed (test cases 42 and 43); issuer lifecycle/runtime-denial disposable PostgreSQL qualification also passed.

Existing auth-router limits are per registered app process and per client-IP key:
- Native/browser registration and login: 10 per 15 minutes.
- Password recovery and QuoteFlow migration-reset request/completion: 5 per 15 minutes.
- Refresh: 60 per 15 minutes.
- Browser-cookie logout: 60 per 15 minutes.

These are in-process limits, not a distributed quota, account-level global limit, edge WAF, or DDoS defense. Proxy trust must be set from measured deployed request topology. CORS only controls compliant browsers; it is not an authorization boundary and does not constrain native clients or server-to-server calls.

The latest test head is not the latest documentation head. Subsequent handover/state edits are being qualified separately; do not report them green until their exact-head CI completes.


### Additional deployment constraints confirmed

- Render Free Postgres is only 1 GB and expires 30 days after creation; only one Free Postgres instance may be active per workspace. It is suitable only as a temporary disposable qualification target, not a durable issuer database or backup strategy. There was no available Free Postgres instance in the workspace inventory. Creating one is a separate resource mutation and has not been authorized or attempted. Reference: https://render.com/docs/free.
- Issuer database TLS configuration is explicit in production. The current `external` mode uses TLS with `rejectUnauthorized: false`, which encrypts the connection but does **not** authenticate the database server certificate. The `internal` mode disables TLS and is intended only for a verified same-region Render private-network path. No production mode has been selected; the actual issuer/database topology and acceptable transport protection must be reviewed before deployment. Do not describe external mode as certificate-verified TLS.


### Production deployment status — do not confuse branch qualification with live cutover

The Render `GHM-Internal-Runtime` service is still configured to deploy from `main`, with auto-deploy disabled. Its latest live deployment inventory entry is commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf` from 2026-11-10. The Authentication Issuer construction branch has not been deployed to Render. Therefore the issuer-route removal, public-key-only Resource API verifier, separate issuer process and client split-origin routing are **construction-branch code only**, not live production behavior.

The current production Resource API remains on its existing deployed authentication arrangement until a coordinated, approved deployment and routing cutover. Do not remove its current signing/token secrets, alter its database grants, or point any production client at a new issuer based on CI success. No issuer service, production issuer principal, issuer environment values, or production routing was created or enabled.


## 2026-11-12 — Authentication issuer database authority closure and rollback qualification

A further ACL audit found that QuoteFlow migration reset enrollment registration, `ghm.auth_register_quoteflow_migration_reset_enrollment(bigint, text, text, text, text, text)`, was still granted to `ghm_runtime` by its original migration. This operation creates approved migration provenance and is not a Resource API or issuer operation.

Corrected on the issuer construction branch:
- Added automatic migration `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql`, revoking PUBLIC and `ghm_runtime`.
- Added the same explicit revocation for `ghm_auth_issuer` to the manual issuer cutover.
- Extended disposable cutover qualification to assert runtime denial and to create the approved enrollment only through the migrator's controlled `SET ROLE ghm_schema_owner` path.
- Added a migration contract test protecting the boundary.

Issuer cutover hardening also explicitly revokes `CREATE` on schema `ghm`. Disposable qualification now checks issuer table/view privileges, sequence privileges, schema CREATE, exact function allow-list and runtime denials.

Added manual rollback file `database/cutovers/20261112020000_authentication_issuer_privilege_rollback.sql`. It revokes issuer auth function and schema usage, then restores the documented pre-issuer-cutover `ghm_runtime` authentication function allow-list. It deliberately does not restore earlier-removed migration/operator privileges or direct relation/sequence access. This is DB ACL rollback only; it does not restore binaries, signing keys, pepper, secrets, client routing or a deployment. The qualification script applies cutover and rollback only to disposable PostgreSQL, then asserts issuer auth execution is zero and the documented runtime allow-list is restored. Earlier intermediate CI runs exposed a SQL ESCAPE bug in the rollback assertion; the query was corrected to use an explicit `left(proname, 5) = 'auth_'` predicate and metadata checks through the migrator connection. Do not treat those failed intermediate runs as green.

The issuer server now wires QuoteFlow migration-reset completion through `createQuoteFlowMigrationResetCompletionService`, and an HTTP regression verifies that completion precedes login/session issuance using the enrollment's approved email. QuoteFlow reset *request* and generic password-recovery *request* remain unavailable (503) because no recovery delivery adapter is wired. This is an explicit go-live blocker; do not claim recovery delivery works or introduce a paid provider without approval.

A complete operational sequence and limitations are documented in `docs/architecture/AUTH_ISSUER_CUTOVER_AND_ROLLBACK_RUNBOOK.md`. The runbook is design-only and authorizes no production changes.

The issuer branch remains directly based on `integration/capability-gateway-qualification-20261110`; latest comparison showed 140 commits ahead and 0 behind. PR #272 remains upstream and must not be merged independently underneath this dependent branch. Production remains unchanged. The exact latest branch head must pass CI before this batch is considered qualified.


### PostgreSQL future-function default ACL closure

The original schema-establishment migration configured default sequence usage for `ghm_runtime` but did not explicitly remove PostgreSQL's default `PUBLIC EXECUTE` privilege for future functions created by `ghm_schema_owner`. Current functions had individual grants/revocations, but that alone did not protect future functions from inheriting PUBLIC execution.

Added migration `20261112050000_revoke_public_default_function_execution.sql`:
`ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.

Added a source contract test and disposable PostgreSQL qualification that creates a probe function as `ghm_schema_owner`, verifies PUBLIC, `ghm_runtime` and `ghm_auth_issuer` have no implicit EXECUTE, then drops the probe in the same disposable transaction. Intended functions must receive explicit per-role grants. This is not a retroactive revoke; existing function ACLs remain controlled by their migrations and the manual issuer cutover.

The issuer branch's latest code now also wires QuoteFlow migration-reset completion. Recovery-token *delivery* remains absent: generic password-recovery request and QuoteFlow migration-reset request return 503 until a delivery adapter is explicitly configured. The runbook records this as a go-live blocker.

### Exact-head qualification — issuer ACL/default ACL/rollback batch

Exact construction head f678ea8d3a6f36556bd768318919134fa3241634 passed GitHub Actions #3648: both quality and web-quality succeeded. The main suite passed 900/900 and the additional disposable PostgreSQL qualification suite passed 15/15.

The exact-head run covered the default-function-ACL probe, issuer exact allow-list and zero direct relation privileges, issuer schema CREATE denial, guarded manual cutover, runtime denials, QuoteFlow migration-reset completion route, fail-closed QuoteFlow reset request, and disposable database rollback. The default ACL probe created a temporary function as ghm_schema_owner and verified PUBLIC, ghm_runtime and ghm_auth_issuer all lacked implicit EXECUTE. It then dropped the probe in the disposable database.

An intermediate run #3647 failed because the diagnostic query returned owner/ACL metadata in addition to the three boolean fields being compared. The underlying ACL values were already false for PUBLIC/runtime/issuer; the assertion was narrowed to compare only the intended booleans. #3648 is the successful exact-head rerun.

This CI result qualifies construction code and disposable PostgreSQL only. It does not authorize production migration, grants, service creation, secret changes, routing, or deployment. The runbook remains design-only. Recovery email delivery is still unavailable and both recovery request routes remain 503 until an approved adapter exists.


## 2026-11-12 — Cross-product issuer branches and open GHM PR stack audit

The earlier standalone client-origin branches were not based on the open product migration PRs. They have been superseded by dependent construction branches based on the exact open PR heads:

- Connect: `construction/ghm-auth-issuer-origin-connect-20261112`, based on PR #68 head `2eadf761400bb5a644b5907e670aacb68526c81f`; 9 commits ahead, 0 behind. Exact code head passed Connect CI #296; documentation head `0e1b93a08f449c727686dffa9d21c663a2c8edf3` passed #298. The BFF now blocks encoded, double-encoded, separator-encoded and case-variant native auth paths before upstream fetch.
- QuoteFlow: `construction/ghm-auth-issuer-origin-quoteflow-20261112`, based on PR #25 head `065225304f3a19c97050aa237ebbfe578f649a43`; 10 commits ahead, 0 behind. Exact head `fbdee2e0ccd536a8641abe0f1a7de328a266dc42` passed CI #224 (8 suites / 55 tests). Auth and resource origins are separate; Gate A now requires explicit `EXPO_PUBLIC_GHM_AUTH_ENABLED=true` and defaults false. The parent PR #25 had `ghmAuthEnabled: true` hard-coded and must not be merged/released as-is.
- Neither product branch is deployed or merged. Connect browser-cookie auth remains disabled by default. QuoteFlow Gate A remains disabled by default.

Open GHM PR stack snapshot:
- PR #272 is the current unified Actor Gateway integration branch, base `main`, open/non-draft, mergeable, exact head `0eda4ea8e232c98264fe83c7aecc3c85f71a5596`; all check-runs on that head passed (quality, web-quality and Cloudflare Pages). Do not merge until the complete GHM documentation reconciliation gate is satisfied.
- PRs #250, #268 and #269 are direct ancestors of the PR #272 integration branch (compare shows 0 commits behind); their capability-governance/invariant work is already in that integration stack. Do not merge them independently.
- PRs #271 and #270 are divergent older drafts whose Business-profile and supplier-classification work overlaps the revised integration in #272. Do not merge independently; reconcile their unique diffs before closing or superseding.
- PRs #243 and #244 are a separate supplier-classification/Business analytics stack; #244 depends on #243. Their branches diverge from #272 and contain additional onboarding, relationships/outcomes, storage and analytics work not all present in #272. Keep them stacked and do not merge until that separate diff is audited.
- PR #237 is the older Business-profile compatibility stack and diverges from #272; the newer integration includes a separate reconciliation migration. Compare exact SQL behavior before treating #237 as redundant.
- PR #264 is a documentation-only registration-identity checkpoint with mergeability conflict; reconcile its docs against the newer #272 handovers rather than merging blindly.
- PR #233 PayFast remains parked until PayFast sandbox access is restored.
- PR #201 QuoteFlow legal acceptance remains parked under the founder's instruction to defer legal work.

The branch list still includes the earlier standalone Connect/QuoteFlow construction branches created from `main`; the stacked branches above are the valid integration targets. The GitHub connector available in this session exposes no branch-delete operation, so those superseded branches have not been deleted. Do not continue work on them.


### External client ingress constraint

QuoteFlow's native mobile client calls the configured issuer URL directly from outside Render. A private-only issuer cannot serve it; a future deployment requires reviewed public HTTPS ingress or a separately approved public gateway. Connect's native bearer browser flow also calls the issuer origin directly and needs exact CORS allow-listing. Its optional browser-cookie flow uses the same-origin Vercel BFF and a server-side issuer upstream. Public issuer ingress must not imply a public database; the database path and TLS verification remain separate deployment blockers.


### Issuer startup now enforces the database ACL cutover

A source audit found that the issuer startup previously verified only the database login role flags and memberships. CI qualified the manual cutover, but a production service could still have started if an operator accidentally left extra function/table grants or had not applied the cutover.

Added `src/auth-issuer/database-privileges.ts` and startup checks in `src/auth-issuer/server.ts`. Before opening the HTTP listener, the issuer now verifies:
- GHM schema USAGE exists and schema CREATE does not.
- No direct table/view/foreign-table or sequence privileges exist.
- The executable function set equals the exact reviewed ten-function allow-list.
- The schema owner's global future-function default ACL does not grant EXECUTE to PUBLIC, `ghm_runtime`, or `ghm_auth_issuer`.
- `ghm_runtime` has no execution rights on the issuer lifecycle function set revoked by the cutover.

A mismatch aborts startup; it does not merely log a warning. Added unit tests for the pure privilege verifier and a source contract test that the check runs before `server.listen`. The next exact-head CI must qualify this change. This is fail-closed deployment defense in depth, not permission to deploy.


Historical checkpoint: the three-function Resource API allow-list remains current. The 2026-11-12 follow-up below confirms the mapping-link function is still required by Connect Business provisioning and records it as an open security gate.


## 2026-11-12 — Startup ACL verifier false-positive correction (in progress)

### Exact failed head and evidence

- Construction branch: `construction/auth-issuer-isolation-20261112`.
- Failed head: `8c6502a9faf8e31e66ca3afd07eb262c97f74d5c`.
- GitHub Actions run #3685 / run ID `43143027343`: `web-quality` passed; `quality` failed only at the final `Qualify isolated auth issuer lifecycle and runtime denials on disposable PostgreSQL` step. The full build, migration chain, test suite, Actor Gateway principal qualification and all preceding database cutover qualifications passed.
- The actual diagnostic showed the issuer's ten expected auth functions plus fourteen trigger-returning functions in `executable_functions`. All other reported issuer boundaries were correct: schema USAGE true, schema CREATE false, no direct relation privileges, safe future-function defaults, and the Resource API runtime's exact three-function auth allow-list.
- Root cause: PostgreSQL `has_function_privilege(..., 'EXECUTE')` also reports trigger functions, which are not directly invocable as ordinary SQL functions. The startup query compared every `pg_proc` row and therefore produced a false-positive allow-list mismatch. This was a query-classification defect, not evidence of excess issuer authority.

### Correction committed

- Updated `src/auth-issuer/database-privileges.ts` to exclude trigger-returning functions from the callable-function set using `p.prorettype <> 'trigger'::regtype`. Other function privilege checks and the exact ten-function allow-list remain unchanged.
- Added a source-contract regression in `src/auth-issuer/database-startup-acl-contract.test.ts` requiring the trigger-return exclusion, so the false-positive cannot silently return.
- Fix commit: `c2ddd18d793b61fe20a017f26bfade8cdb0394a1`.
- Regression-test commit: `fe3b765e2e265817655359c9fd96977a3dca9179`.
- Current branch head at this checkpoint: `fe3b765e2e265817655359c9fd96977a3dca9179`.
- Exact-head CI for this corrected head was queued when this handover was updated; do not claim it passed until all required checks finish successfully. The prior failed run remains historical evidence and must not be rewritten as green.

### Next actions

1. Inspect exact-head CI for `fe3b765e`, including the full disposable PostgreSQL issuer cutover/lifecycle/rollback qualification.
2. If it fails, inspect the actual failing assertion/log and make the smallest correction; do not weaken the privilege boundary or replace exact allow-list checks with a weaker subset check.
3. After CI passes, continue the issuer/Resource API/Actor Gateway/migrator privilege matrix and rollback review, then reconcile this handover and `docs/GHM_CURRENT_STATE.md` with the resulting evidence.
4. Keep the issuer branch stacked on PR #272; do not merge PR #272 underneath it independently. No production cutover, service creation, secrets, grants, deployment, or paid infrastructure is authorized by this work.


### Documentation reconciliation follow-up — current branch head

After recording the ACL correction, the handover and `docs/GHM_CURRENT_STATE.md` were reconciled on the dependent issuer branch. The handover records the failed run, actual PostgreSQL diagnostic, correction, and exact-head qualification gate. The current-state index now distinguishes mainline/PR #272 from the unmerged issuer construction branch and records the outstanding production blockers and recovery-delivery limitation.

- Current branch head after these documentation commits: `e4b48f6d7f5f092baccf5dc882ca77e3afa62ce3`.
- The corrected implementation/test commits remain `c2ddd18d793b61fe20a017f26bfade8cdb0394a1` and `fe3b765e2e265817655359c9fd96977a3dca9179`.
- A new exact-head CI run was queued for `e4b48f6d7f5f092baccf5dc882ca77e3afa62ce3` after the documentation updates. This run, not the earlier `fe3b765` push run, is the current full-branch evidence gate.
- No merge, production mutation, deployment, secret change, service creation, or paid spend occurred.


## 2026-11-12 — Startup identity enforcement and Connect mapping dependency review

### Exact database identity must be enforced, not merely queried

A source review found that `src/auth-issuer/server.ts` queried `session_user`, `current_user`, role flags and membership state, but did not pass the result to `assertAuthIssuerDatabaseIdentity`. The pure verifier and unit tests existed, but the live startup path was not enforcing the principal contract.

Correction:
- Startup now calls `assertAuthIssuerDatabaseIdentity(databaseIdentity)` immediately after resolving the identity and before ACL verification and `server.listen`.
- The startup source-contract test requires this assertion to be present before the listener.
- The assertion checks both login/effective role are exactly `ghm_auth_issuer`, LOGIN / NOINHERIT, no elevated attributes, and no role memberships.
- Fix commit: `0b7761eaf5cfeaabd16490474d483163fb488492`.
- Source-contract regression commit: `607d0260b244adc21bd0b934b83699479865165c`.

### Provider-business mapping mutation moved behind signed Actor Gateway

The current branch now replaces the runtime mapping mutation with one signed, atomic Actor Gateway operation.

Implementation:
- Added migration `20261112080000_signed_connect_business_provisioning_gateway.sql`.
- Added `ghm.gateway_provision_connect_business`, operation `business.connect.provision`, to the Actor Gateway. It validates the signed request assertion, active actor and business/admin role; serializes by provider/external ID; creates the canonical Business, active owner membership and provider mapping in one transaction; and resolves an existing mapping only for an active member or system admin.
- The function locks the actor row and existing membership row to prevent deactivation/revocation races. It rejects a mapping race unless the helper created the exact mapping for the new Business, preventing orphan Business rows.
- The old `ghm.auth_link_business_external_mapping(text,text,bigint)` function is now an internal schema-owner helper. The migration revokes PUBLIC, runtime, migrator, Actor Gateway, issuer and payment-provider execution; the signed wrapper calls it as `ghm_schema_owner`.
- Actor Gateway exact allow-list is now 25 signed/typed functions. Runtime's exact `ghm.auth_*` allow-list is now two lookup functions: `auth_lookup_external_identity` and `auth_lookup_business_external_mapping`.
- Removed the obsolete `AuthPersistence.linkBusinessExternalMapping` method and its runtime persistence test.
- Refactored `ConnectBusinessAdapter` to use `HttpConnectBusinessProvisioningGatewayClient`; it no longer connects to the runtime database or calls the helper directly.
- Added the Actor Gateway HTTP route `POST /v1/connect/businesses/provision-or-resolve`, HTTP client tests, route tests, migration contract tests, and a disposable PostgreSQL qualification for concurrency, membership isolation, runtime denial and atomic rollback.
- Added `npm run qualify:connect-business-provisioning-live` to CI.

Important integration status:
- The Actor Gateway route and adapter client are implemented and independently testable.
- The inspected main Connect service router does not yet mount `ConnectBusinessAdapter`; do not claim the Connect product API is fully wired until its authenticated route is mounted and end-to-end tested. No new public Connect endpoint was exposed by this work.
- The existing adapter's previous behavior allowed a second unrelated business account to resolve the same mapped Business without membership. The new gateway operation denies that case with SQLSTATE 42501; an active member or system admin can resolve it.

### Current qualification state

- Issuer database identity enforcement commits: `0b7761eaf5cfeaabd16490474d483163fb488492`, `607d0260b244adc21bd0b934b83699479865165c`.
- The attempted mapping-link revocation was removed before merge; no production or mainline change occurred.
- The exact runtime auth allow-list is three functions until the Connect provisioning flow is migrated.
- The latest exact-head CI must pass the complete migration chain, full tests, disposable Actor Gateway qualification, issuer cutover/lifecycle/rollback and web checks before this dependent branch is considered qualified.
- No production database, grants, service, secrets, deployment, routing, paid resource, or client environment was changed.

## 2026-11-12 — Actor Gateway exact database ACL enforcement (in progress)

A cross-role review found that Actor Gateway startup enforced its database login identity, but did not verify the complete effective database function and relation privilege set. Its disposable qualification previously spot-checked selected functions and four authentication tables; it did not prove that the gateway had exactly its reviewed callable-function set or zero direct relation privileges across the whole GHM schema.

The migration history contains 31 distinct gateway function signatures across successive migration generations. Nine pre-signed overloads were explicitly dropped by migrations `20261111020000`, `20261111030000`, `20261111040000` and `20261111050000`. At the current pre-cleanup state, 25 functions were executable by `ghm_actor_gateway`: 24 signed/typed operations plus one surviving unsigned helper, `assert_actor_gateway(bigint)`. The three later signed read projections are `gateway_get_business_hours`, `gateway_get_trust_score` and `gateway_list_trust_scores`.

The surviving helper accepts an account ID and returns it if the account is active. Its original migration comment says it was not wired to feature RPCs. The current Actor Gateway uses `assert_actor_gateway_capability` with signed request context; no current application code calls the unsigned helper. The helper was still granted to `ghm_actor_gateway` and therefore remains an unnecessary entry point.

Correction:
- Added migration `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql` to revoke PUBLIC, `ghm_runtime`, `ghm_migrator` and `ghm_actor_gateway` from the one surviving `assert_actor_gateway(bigint)` helper, preserving `ghm_schema_owner` ownership for controlled maintenance.
- Reduced the exact gateway allow-list from 25 to 24 signed/typed operations by revoking the unused unsigned helper. The three business-hours/trust-score read projections are included because their SQL validates signed request context and re-checks membership/public visibility.
- Changed disposable qualification to require SQLSTATE `42501` when the gateway attempts to call the unsigned helper.
- Added a migration contract test for the surviving helper revocation.

The nine previously obsolete overloads are already dropped and are not included in the new migration or denial probes. The latest exact-head CI must prove the migration applies cleanly and the 24-function startup verifier passes. Do not claim this closure before that run passes.




### Superseding follow-up: signed Connect Business provisioning closes the mapping-link runtime gap (2026-11-12)

The prior section below this handover's earlier issuer checkpoints is superseded by the later Connect gateway work. Do not use its three-function runtime allow-list or its recommendation to preserve direct runtime mapping-link execution as current guidance.

The dependent branch subsequently added:
- Migration `20261112080000_signed_connect_business_provisioning_gateway.sql`, which adds the signed `business.connect.provision` Actor Gateway operation.
- A single SECURITY DEFINER transaction that validates the signed actor assertion, binds the exact operation/context, requires an active business/admin actor, serializes concurrent provisioning by external Business ID, resolves existing mappings with membership checks, or atomically creates the canonical Business, owner membership and external mapping.
- `gateway_provision_connect_business` is owned by `ghm_schema_owner` and executable only by `ghm_actor_gateway`.
- The internal `auth_link_business_external_mapping` helper is revoked from PUBLIC, `ghm_runtime`, `ghm_migrator`, `ghm_actor_gateway`, `ghm_auth_issuer` and `ghm_payment_provider`. The signed SECURITY DEFINER gateway wrapper invokes it internally.
- The manual Authentication Issuer cutover now also revokes direct runtime/application access to that helper. Its stale trailing SQL comment has been corrected to describe the signed gateway boundary.
- The Resource API runtime's exact post-cutover auth-function allow-list is now **two** functions: `auth_lookup_external_identity` and `auth_lookup_business_external_mapping`. The Actor Gateway has the separate signed provisioning operation.
- `scripts/qualify-auth-issuer-cutover.mjs` now expects exactly those two runtime auth functions after cutover and after database-only rollback, and retains an explicit runtime denial probe for `auth_link_business_external_mapping`.
- The signed provisioning migration contract test asserts the signed operation, schema-owner ownership, Actor Gateway-only grant, atomic membership/mapping flow, and helper revocation.

Relevant implementation commits include `12f7b09f72` (issuer cutover helper revocation), `68136846d5` (Connect adapter routes provisioning through the signed gateway identity), `a650c699ba` (the initial qualification follow-up, subsequently corrected after discovering the signed gateway migration), and `4ef26bafdc` / `6fb40c1ff3` (corrected two-function qualification and SQL comment). Do not treat the initial three-function follow-up as current.

The issuer cutover's database-only rollback still restores the documented pre-issuer Resource API auth-function set, not the obsolete business-mapping mutation path. The mapping-link helper remains unavailable to runtime after rollback because the signed gateway migration independently revoked it. The gateway remains a separate principal and its exact 25-function allow-list (including signed Connect Business provisioning) must continue to be checked independently.

The latest corrected exact-head CI is pending. Do not claim the current dependent branch fully qualified until both required checks pass. No production grant, database, secret, service, deployment, routing or paid infrastructure was changed.

### Latest dependent-branch CI corrections — 2026-11-12

The signed Connect Business gateway and its disposable PostgreSQL qualification were reviewed on the exact dependent branch.

- The gateway principal diagnostic reported the expected **25 signed/typed functions**, zero direct relation privileges, schema USAGE without CREATE, no PUBLIC executable gateway functions, no runtime gateway-function execution, and safe future-function defaults. The `ghm_actor_gateway` principal qualification passed in run `43158393919`.
- The separate live PostgreSQL Connect provisioning qualification exercised runtime denial of the mapping helper and direct mapping-table reads, concurrent provisioning/membership isolation, existing-mapping membership checks, and atomic rollback. It initially failed during the idempotent retry path with `Invalid Connect Business slug`. The retry fixture has been simplified to use a short known-valid alternate name, so this test focuses on existing-mapping resolution rather than an unrelated long-name/truncation edge. This correction is pending a fresh exact-head run.
- The same CI run exposed stale TypeScript references to the removed runtime mapping-link persistence method. Removed the obsolete `PostgresAuthPersistence.linkBusinessExternalMapping` method and the two stale test-mock properties. The subsequent CI run's TypeScript build passed.
- Updated issuer privilege unit tests to expect exactly the two remaining Resource API lookup functions, including rejection of a missing lookup grant. Updated Actor Gateway privilege unit fixture to use the signed assertion verifier rather than the revoked unsigned helper.

Current code/test commits include `a6a8749eef94a04af692c127292755869481cb6f`, `4edd60f1dfa6675626c9b043c533fc264e4566cf`, `242479d2d8dd74b4c53e9cbf2f1a46ebb4dc9f28`, `b6855d5c3eccbadbf106d2b62e25f384a3b2353e`, `eff5d3bcf3bc5612e9911424728855cafcc389e6`, and `608c767397b37a06579c3bd4efeaad64583d9e05`. The latest exact-head run must complete the Connect provisioning qualification, full suite, manual issuer cutover/lifecycle/rollback, and both required CI checks before any green qualification claim.
### Exact-head issuer and Actor Gateway qualification — 2026-11-12

Corrected exact candidate `0f12703108b1b42f6efcd8fe49970f5c28dd052f` passed GitHub Actions run `43159174319`: `quality` and `web-quality` succeeded, and the Cloudflare Pages check completed successfully.

Qualification evidence on that exact source head:
- TypeScript build, complete test suite and ordered PostgreSQL 18 migration chain passed.
- Isolated `ghm_auth_issuer` principal baseline passed.
- Actor Gateway principal and exact 25-function signed/typed ACL passed; no direct table/view/sequence privileges, no schema CREATE, no PUBLIC executable gateway functions, no runtime gateway-function execution, and safe future-function defaults.
- Signed Connect Business provisioning live PostgreSQL qualification passed: runtime mapping-helper/table denials, concurrent membership isolation, existing mapping membership checks, idempotent resolution, and atomic rollback.
- The full Actor Gateway signed-operation/cutover qualification sequence passed, including capability, Saved Business, Business Hours, Trust Score, Business Logo, supplier classification and Business profile.
- Runtime boundary and migration audit policy checks passed.
- Manual Authentication Issuer cutover applied only to disposable PostgreSQL; issuer lifecycle, runtime denials, ten-function issuer allow-list, two-function Resource API auth allow-list, startup ACL verification, and database-only rollback all passed. Qualification output: `issuerAllowList: 10`, `issuerDirectRelationPrivileges: 0`, `runtimeIssuerFunctionDenials: 16`, `disposableDatabasePrivilegeRollback: passed`, `issuerStartupAclVerification: passed`.

During this final qualification pass, the updated two-function SQL allow-list exposed trailing commas in PostgreSQL array literals in both the production startup verifier and disposable qualification runner. These were removed in commits `a30fa4ada464733a1bb64c23301a5775314eed90` and `0f12703108b1b42f6efcd8fe49970f5c28dd052f`; the exact-head run above proves both corrected queries execute and verify successfully.

The current two-function Resource API auth allow-list is `auth_lookup_external_identity` and `auth_lookup_business_external_mapping`. Direct `auth_link_business_external_mapping` remains revoked from all application roles and is invoked only inside the signed `gateway_provision_connect_business` SECURITY DEFINER operation. Actor Gateway has 25 signed/typed operations, including `business.connect.provision`.

**Important:** this is disposable qualification only. No production database, role, grant, secret, service, deployment, routing, backup, or paid resource was changed. PR #272 remains open/unmerged, and the issuer construction branch remains dependent on it. Production remains blocked on a fresh independently verified backup, Render database role/ownership resolution, reviewed network/TLS topology, recovery delivery, client/service readiness, and separate founder approvals. Do not merge or apply production cutovers on the strength of this CI run alone.
### Migrator role-membership hardening — 2026-11-12

The migration runner previously checked `current_user = ghm_schema_owner` and `session_user = ghm_migrator` only after `SET ROLE`. That proved the effective execution identity but did not independently reject an over-privileged migrator login, extra role memberships, an inheritable/admin membership, or a login-capable/elevated schema-owner role before activating owner authority.

Added `src/db/migrator-principal.ts` and its unit tests. Before `SET ROLE`, `src/db/migrate.ts` now requires:
- `ghm_migrator` is LOGIN, NOINHERIT, and has no SUPERUSER, CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS attributes.
- Exactly one direct membership exists for `ghm_migrator`, to `ghm_schema_owner`, with `ADMIN FALSE`, `INHERIT FALSE`, `SET TRUE`.
- `ghm_schema_owner` is NOLOGIN, has no elevated role attributes, and has no direct role memberships (therefore no transitive authority path through another role).
- Both `current_user` and `session_user` are `ghm_migrator` before activation; after `SET ROLE`, the runner still verifies `session_user = ghm_migrator` and `current_user = ghm_schema_owner`.

The CI role fixture now explicitly creates the membership with `WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`. A source-contract test protects the ordering and catalog checks. The migration chain executes this gate on every CI run; unit tests exercise rejection of extra/missing membership, incorrect membership options, elevated flags, and owner transitive membership.

Exact-head CI passed on `465b8e034243c80bf7efe6cc6ea8b27705176760` in run `43160050121`: `quality`, `web-quality`, and Cloudflare Pages all passed. The build, complete migrations, full suite, Connect Business gateway qualification, Actor Gateway cutover qualifications, manual issuer cutover, issuer lifecycle/runtime denials, and disposable database-only rollback also passed.

**Production qualification remains outstanding:** inspect the actual Render `ghm_migrator` and `ghm_schema_owner` role flags and `pg_auth_members` options against this exact contract before any production migration run. Do not assume the disposable CI role state proves the live Render roles conform. No production role, grant, database, secret, service, deployment, routing or paid resource was changed.
### Migrator direct privilege boundary — exact-head qualification (2026-11-12)

The migrator contract was tightened one further step after the role-membership check. Before `SET ROLE`, the runner now also requires that `ghm_migrator` has database CONNECT only: no database CREATE, no `ghm` schema USAGE or CREATE, and no direct SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on GHM relations or USAGE/SELECT/UPDATE on GHM sequences. The membership remains exactly one direct, non-inheritable, SET-only path to `ghm_schema_owner`; the owner remains NOLOGIN, non-elevated and without role memberships.

Unit tests and a source-contract test cover the new direct privilege boundary. The migration runner's real preflight is exercised by CI's full migration chain.

Exact candidate `5a1b26ab65c69bab654ba3b1c4fc8610123481cd` passed run `43160516327`: `quality`, `web-quality`, Cloudflare Pages, build, migrations, full suite, Connect Business gateway qualification, Actor Gateway qualifications, manual issuer cutover, issuer lifecycle/runtime denials and disposable rollback all passed. This is disposable evidence only.

Before production migration, inspect the live Render role flags, exact `pg_auth_members` options, database/schema/object privileges and schema-owner memberships against the same contract. No production mutation was made.

## 2026-11-12 — manual issuer cutover operator-boundary correction

A source/qualification review found that the two manual issuer SQL artifacts relied on the operator convention and CI caller to establish the intended migrator/schema-owner identity. The SQL itself did not reject direct execution under another privileged login. This was a real fail-closed gap in the manual change artifacts even though the disposable qualification invoked them through a controlled path.

Corrected both:
- `database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql`
- `database/cutovers/20261112020000_authentication_issuer_privilege_rollback.sql`

Each now begins its transaction with a SQL identity guard requiring exactly `session_user=ghm_migrator` and `current_user=ghm_schema_owner`. Any other login/effective role raises an exception before privilege changes. The scripts remain manual-only; no production script was run.

The migration-contract test now loads both artifacts and asserts both identity checks and the fail-closed diagnostic. CI was changed to invoke the cutover through a single `ghm_migrator` psql session, execute `SET ROLE ghm_schema_owner`, include the SQL file in that same session, then reset role. The CI include is a single psql meta-command backslash; do not change it to a shell-level invocation that loses the session identity.

**Exact-head qualification pending:** the previous green run `43161326835` at `2b2014afff8dc605ab427a15256a41f89c70adab` predates these changes and is historical evidence only. The latest known branch commit after the code, CI and runbook updates is `7569ea12d8261eff341fe06feae95e3aa7e11dba`; verify the live branch head and obtain a complete exact-head run before claiming this correction qualified.

The issuer runbook's old 130-commit branch-distance statement was also corrected: the GitHub comparison at this audit reported 381 commits ahead and zero behind the integration base. This is a dated comparison, not a live guarantee.

Production remains untouched. The production role/ownership issue, fresh independently verified backup, transport/network topology, recovery-delivery readiness, cross-product compatibility, and separate founder approvals remain blockers. No paid infrastructure, production grants, roles, secrets, services, deployments, data or routing were changed.


## 2026-11-12 — startup default-ACL verifier gap and correction

A further source audit found that both the Authentication Issuer and Actor Gateway startup verifiers inspected only global function default ACL rows (`pg_default_acl.defaclnamespace = 0`). They did not inspect GHM-schema-specific function defaults. A schema-specific default EXECUTE grant could therefore have escaped the startup default-privilege check.

The verifier was also limited to PUBLIC and a fixed list of known application-role grantees. That was not a complete non-owner audit: an unexpected role grant could be missed. Both verifiers now inspect global and `ghm`-schema function default ACLs and treat any EXECUTE grant to any grantee other than `ghm_schema_owner` as unsafe. This covers PUBLIC, known application principals, and unexpected/non-catalogued roles without relying on a hard-coded role list.

Regression source-contract assertions were added to both startup ACL contract tests. The PostgreSQL 18 exact-head run must still prove the catalog query compiles and behaves correctly against actual global and schema-specific default ACL fixtures; source assertions alone are not database evidence.

Other current audit corrections:
- Manual issuer cutover and rollback SQL each enforce `session_user=ghm_migrator` and `current_user=ghm_schema_owner`.
- CI runs the manual cutover in one psql connection using the dedicated migrator login, `SET ROLE`, the SQL file, and `RESET ROLE`.
- Issuer cutover allow-list is ten functions; rollback restores fourteen Resource API authentication functions. The rollback deliberately does not restore the separate QuoteFlow migration-reset enrollment registration operation.
- The issuer branch remains separate from upstream PR #272; PR #272 itself is still open and unmerged. Current branch comparison during this audit was 411 commits ahead / 0 behind the integration base. This is a dated diagnostic only, not merge readiness.
- The available GitHub workflow-run view did not expose push-triggered run records for the issuer branch. Exact-head CI status is therefore **unverified**, not passed. Do not use the earlier run `43161326835` as evidence for these later changes.

Latest source/test correction before this handover update: `419dd4470268b5811dd9197ba36c9e40b87f4b1b`. Re-fetch the branch head after the documentation commits and require full exact-head CI.

No production ACL, role, secret, service, deployment, data or routing change was made. No paid resource was created.


## 2026-11-12 — disposable schema-specific default-ACL adversarial fixture

The default-ACL verifier correction is now covered by an actual PostgreSQL qualification fixture, not only source-text assertions.

`scripts/qualify-auth-issuer-cutover.mjs` now:
1. Confirms both issuer and Actor Gateway default-function ACL verifiers begin in a safe state.
2. Uses the restricted migrator session and `SET LOCAL ROLE ghm_schema_owner` to grant function EXECUTE by schema-specific default privilege (`IN SCHEMA ghm`) to the unexpected non-owner role `postgres`.
3. Confirms both verifiers report `unsafe_function_defaults=true`.
4. Revokes the probe grant through the same controlled role path.
5. Confirms both verifiers return to the safe baseline.

The qualification uses the existing Actor Gateway database URL from the disposable CI environment and closes its pool with the other qualification pools. The probe runs only after the existing strict local `ghm_disposable_test` URL/database guard. It does not touch production.

Static contract tests now ensure this adversarial fixture remains part of the issuer and Actor Gateway qualification. This test is committed but still requires a full exact-head PostgreSQL 18 CI run. The available GitHub workflow-run connector does not expose push-triggered run records for this branch, so do not claim it passed until a run is independently retrieved.

Latest qualification-source/test commit before this handover update: `c2e345440978716bc221cbf8aa486dd9d8d173a6`. The issuer branch remains separate from open/unmerged upstream PR #272; no integration or merge is authorized.


## 2026-11-12 — SECURITY DEFINER owner and temporary-schema search_path hardening

A further review of the issuer and Actor Gateway allow-lists found that startup verified effective EXECUTE sets but did not verify the metadata of every privileged GHM function. A function can be correctly granted yet still be unsafe if its SECURITY DEFINER owner is not the schema owner or its search_path permits temporary-object shadowing.

Added migration `20261112090000_pin_security_definer_search_path.sql`:
- Preflights that every SECURITY DEFINER function in schema `ghm` is owned by `ghm_schema_owner`; it aborts before changing any function if ownership is unexpected.
- Pins every such function to `search_path = pg_catalog, ghm, pg_temp`. Explicitly placing `pg_temp` last prevents PostgreSQL's implicit temporary-schema-first behavior from allowing caller-created temporary objects to shadow trusted objects.
- Uses `ALTER FUNCTION ... SET` and changes no function body, grants, ownership, data or service configuration.

Both issuer and Actor Gateway startup ACL queries now return every GHM SECURITY DEFINER function whose owner is not `ghm_schema_owner` or whose function-local search_path is not exactly `pg_catalog, ghm, pg_temp`. Both startup assertions fail closed unless that result is empty. Unit tests reject a non-empty result; source-contract tests cover the catalog predicates; disposable issuer qualification asserts both verifiers return an empty result before and after the default-ACL adversarial probe.

The earlier registration migration had a function-local path `ghm, pg_temp`; the new migration normalizes that and every other SECURITY DEFINER function, not just the current issuer/gateway allow-lists. Existing function bodies and application behavior are not rewritten.

**Qualification status:** the migration, startup verifier, and regression tests are committed but no exact-head PostgreSQL 18 CI evidence is available yet. The connector's combined-status endpoint returned no status checks for the inspected commit; that is not a pass. The disposable full migration chain must prove the owner preflight, ALTER FUNCTION loop, exact catalog string representation, all existing SECURITY DEFINER functions, and startup checks. If any owner preflight fails, stop and audit that owner rather than weakening the preflight.

Latest source/test commit before this handover entry: `228cf68a0fda4c507a50af75d9e24ab2a946df07`. Issuer branch remains separate from open/unmerged PR #272. No production database, grants, roles, secrets, services, deployments, data, routing or paid resources were changed.


## 2026-11-12 — exact-head issuer/Actor Gateway metadata qualification passed

Exact branch HEAD `b0711ccebc4adb82fc24256a40a812d0335f8702` passed GitHub Actions run `43178029417`:
- `quality`: success
- `web-quality`: success
- PostgreSQL 18.6 full migration chain: success, including migration `20261112090000_pin_security_definer_search_path.sql`
- Isolated Authentication Issuer principal qualification: success
- Isolated Actor Gateway principal qualification: success
- Full test suite: success
- Migration audit policy tests and runtime boundary verification: success
- Guarded manual issuer cutover on disposable PostgreSQL: success
- Issuer lifecycle, runtime-denial and database rollback qualification: success

The run also proves the revised CI setup seeds the GHM schema under `ghm_schema_owner`, the migrator startup query reads both schema-owner authority fields, and the issuer manual cutover's role guard parses and executes with the corrected named dollar-quote delimiter.

**Important qualification boundary:** this is disposable PostgreSQL evidence only. No production grant/cutover, role change, deployment, service configuration, secret, data, routing, or paid resource was changed. The issuer construction branch is still separate from upstream PR #272 and is not approved to merge independently. Production role/ownership inspection, fresh independently verified backup, transport/network topology, recovery-delivery readiness, cross-product client/service compatibility and separate founder approvals remain blockers.

Previous failed exact-head attempts were not hidden or counted as passes:
- The migration-principal query omitted the two schema-owner authority fields required by its assertion; the query and contract test were corrected.
- The fresh CI database had no pre-existing `ghm` schema for the migrator preflight; CI now seeds it as owned by `ghm_schema_owner`.
- Existing gateway and storage qualification scripts expected the old search_path; their expectations now require `pg_temp` last.
- The manual issuer cutover had an unbalanced dollar-quote delimiter in the role preflight; it was corrected and a contract regression added.
- Source-contract tests still expected a hard-coded role list after the verifier moved to an any-non-owner-grantee predicate; obsolete assertions were removed.

Do not use any earlier intermediate run as exact-head evidence. The successful run SHA above is the current qualified source checkpoint.


## 2026-11-12 — complete direct function-grantee boundary added and qualified

The issuer and Actor Gateway startup verifiers previously checked their own effective EXECUTE allow-lists, PUBLIC access, and selected Resource API runtime access, but did not independently reject every direct EXECUTE grant to other principals. A function could therefore be callable by the intended principal and still be directly executable by an unexpected application login.

Both verifiers now enumerate function ACLs with `aclexplode`:
- Authentication Issuer's ten-function allow-list permits EXECUTE only to `ghm_auth_issuer` and the function owner.
- Actor Gateway's 25-function allow-list permits EXECUTE only to `ghm_actor_gateway` and the function owner.
- Any other grantee is reported, including PUBLIC, `ghm_runtime`, `ghm_migrator`, `ghm_payment_provider`, other known roles, and arbitrary/unexpected roles.
- Both startup assertions fail closed on any such grant.

The disposable issuer qualification now proves this behavior by temporarily granting EXECUTE on `auth_create_account` and `gateway_provision_connect_business` to `ghm_payment_provider`, confirming each verifier reports the unexpected grantee, revoking both grants through the migrator/schema-owner path, and confirming both verifiers return to an empty unsafe-grantee result. Static contract tests lock the adversarial fixture and cleanup into the qualification.

**Exact-head qualification passed:** source HEAD `1db5f78b8a0f0405586fc9ae2675f16732e9374e`, CI run `43179755317`, both `quality` and `web-quality` success. PostgreSQL 18.6 full migrations, issuer and Actor Gateway principal checks, full test suite, runtime boundary, guarded disposable cutover, and issuer lifecycle/runtime-denial/database rollback all passed. The run includes both the unexpected direct-grant fixture and the schema-scoped default-ACL fixture.

This remains disposable-only evidence. Production grants/cutover, roles, deployments, secrets, data, routing and paid services remain untouched. PR #272 and the issuer dependent branch remain unmerged. Production role/ownership resolution, fresh independently verified backup, transport/network topology, recovery delivery, cross-product compatibility and separate founder approvals remain blockers.


## 2026-11-12 — PUBLIC execution audit for all SECURITY DEFINER functions

The next database-boundary pass found that the existing privilege verifier checked PUBLIC execution for the service's callable function set, but the separate SECURITY DEFINER ownership/search-path audit did not independently report PUBLIC EXECUTE across every SECURITY DEFINER function in the GHM schema. A privileged function outside the current service allow-list could therefore have been omitted from that specific PUBLIC-execution finding.

Both Authentication Issuer and Actor Gateway privilege verifiers now expose `public_executable_security_definer_functions`. The query expands each GHM function ACL and selects every SECURITY DEFINER function with EXECUTE granted to grantee OID 0 (PUBLIC). The least-privilege assertion rejects any non-empty result. This is separate from the existing owner and pinned-search-path check, and separate from each service's callable allow-list.

Regression tests now reject a synthetic non-empty PUBLIC-definer result for each service. The disposable PostgreSQL qualification now:
1. Starts by asserting the baseline has no PUBLIC-executable SECURITY DEFINER functions.
2. Grants PUBLIC EXECUTE on one issuer and one Actor Gateway SECURITY DEFINER operation through the restricted migrator/schema-owner path.
3. Confirms each verifier reports its respective function.
4. Revokes both temporary PUBLIC grants.
5. Confirms both verifiers return to an empty result.

The probe is confined to the existing guarded disposable database. It is not production evidence until a complete exact-head PostgreSQL 18 CI run passes.

This audit is limited to GHM-schema SECURITY DEFINER functions. It does not yet prove that extension-owned or other-schema SECURITY DEFINER functions are harmless, nor does it replace a full role-membership/ownership audit. Function bodies and dynamic SQL still require separate review for unsafe object resolution, dynamic execution and assumptions about caller-controlled values.

Latest code/test commit before this handover update: `e4a644825824b61db0692c479a71edbdc23b2ebf`. Exact-head CI remains unverified; do not reuse earlier green workflow runs as qualification for these changes. No production change, merge, paid resource or external provider operation was made.


## 2026-11-12 — global default-ACL row and pre-cutover rollback baseline qualified

A further default-ACL review found that the verifier's "global or schema-specific row exists" condition could treat a schema-specific row as sufficient even if the global function default ACL row was absent. PostgreSQL schema-specific defaults are additive; they do not replace the global defaults. Both issuer and Actor Gateway verifiers now require the global `ghm_schema_owner` function-default ACL row to exist, then inspect both global and GHM-schema-specific rows for any non-owner EXECUTE grant. Source-contract tests cover this distinction.

The manual rollback's claimed "pre-issuer" Resource API grant state is now independently verified **before** cutover. Added `scripts/qualify-auth-issuer-precutover.mjs` and a CI step that runs it before the manual SQL:
- Requires exactly the documented 16 Resource API runtime auth functions.
- Rejects unexpected direct auth-function grants, including PUBLIC and arbitrary roles.
- Preserves the one explicit migration/operator exception: `ghm_migrator` may execute `auth_lookup_business_external_mapping(text,text)`, as granted by migration `20261012000000_auth_lookup_business_external_mapping.sql`.
- Only after this snapshot passes does CI apply the guarded issuer cutover; the existing rollback test then verifies that the exact 16-function Resource API grant set is restored and issuer grants are removed.

**Exact-head qualification passed:** HEAD `405a220d408cb3c2f176131173fedb9200f62635`, CI run `43181545588`, both `quality` and `web-quality` success. The run includes PostgreSQL 18.6 full migrations, issuer and Actor Gateway principal qualification, full test suite, pre-cutover Resource API grant snapshot, manual issuer cutover, issuer lifecycle/runtime denials, adversarial function/default ACL probes, and database-only rollback.

This remains disposable-only evidence. No production ACL, role, service, secret, deployment, data, routing or paid resource was changed. Upstream PR #272 and the issuer dependent branch remain unmerged. Production ownership/grantor authority, fresh independently verified backup, TLS/network topology, recovery delivery, cross-product compatibility and separate founder approvals remain blockers.


## 2026-11-12 — SECURITY DEFINER body review and qualification reconciliation

This entry supersedes any implication that CI run `43181545588` at `405a220d408cb3c2f176131173fedb9200f62635` qualifies the later PUBLIC-definer audit changes. That run passed on its exact recorded SHA, but twelve commits followed it, including the new PUBLIC-execution verifier/query and adversarial tests. The latest code/test commit is `e4a644825824b61db0692c479a71edbdc23b2ebf`; current issuer branch HEAD is `1095dc5619c013d8efe53fb416e846bad842a3e4` after documentation updates. The latest code/test SHA has no reported combined status and no associated workflow run in the available GitHub Actions view. Exact-head qualification is therefore **not verified**. Do not reuse run #43181545588 or PR #272's run #3507 as evidence for this code head. PR #272 remains open/unmerged on a separate branch.

### Function-body review findings

- Reviewed the source-controlled GHM SECURITY DEFINER definitions and the latest profile, auth, Actor Gateway, storage, trust-score, business-hours, capability, directory-review and commercial function migrations.
- The application function body containing dynamic SQL is `ghm.update_business_profile`, introduced/reconciled in `20261110265000_reconcile_business_profile_legacy_contract.sql`. Its `v_set_extra` fragments are fixed SQL literals selected by validated patch keys; values are passed using PL/pgSQL `USING` parameters. No caller-controlled identifier or value is interpolated into the dynamic statement. The supplier-classification field is independently rejected by the signed gateway wrapper in `20261111060000_bind_gateway_assertions_to_request_context.sql`; the disposable qualification script contains direct database assertions for both `isSupplier` and `is_supplier` rejection.
- The dynamic DDL in `20261112090000_pin_security_definer_search_path.sql` uses a catalog-derived `regprocedure` signature in `format` to construct `ALTER FUNCTION`; it does not accept a caller-provided identifier.
- Founder directory review functions are disabled by `20261109140000_close_evidence_and_founder_review_authority.sql`: reviewer lookup returns false and runtime execution is revoked from the review/list/submit functions.
- Issuer functions with account-ID parameters rely on the isolated issuer process and its dedicated database principal; token-bound recovery reset derives the account from the recovery credential and preserves the existing login email. Actor Gateway operations bind actor, operation, nonce, request context and business/target arguments to the v2 HMAC assertion; wrappers derive actor authority from the verified token subject and enforce operation-specific membership/admin checks.
- Issuer and Actor Gateway login-role membership checks reject any direct membership edge involving the login role, preventing a transitive membership path; both also require NOINHERIT and reject elevated role attributes.

### Remaining audit gaps — do not mark complete

1. **All non-owner grantees, not just PUBLIC:** the new `public_executable_security_definer_functions` query enumerates every GHM SECURITY DEFINER function for PUBLIC EXECUTE. However, `unsafe_function_grantees` is still scoped to the issuer's ten expected signatures or the Actor Gateway functions executable by that login. It is not yet a whole-GHM inventory of every direct non-owner EXECUTE grant. A GHM SECURITY DEFINER function outside those sets could have a grant to another non-PUBLIC role without appearing in that particular check. This is an audit-coverage gap, not yet evidence of an unauthorized live grant. Build a whole-schema function/ACL/grantee inventory and an explicit role-function exception matrix before declaring every privileged execution boundary justified.
2. **Other schemas and extensions:** the owner, search_path and PUBLIC-definer startup queries filter to schema `ghm`. Source-controlled migrations reviewed here define application functions in `ghm`, but this does not establish that the live database has no SECURITY DEFINER functions in `public`, extension schemas or legacy schemas. Enumerate all non-system SECURITY DEFINER functions in disposable PostgreSQL, identify extension ownership/membership and review every remaining schema against the live catalog before production approval.
3. **Live catalog remains unverified:** disposable migrations cannot prove production role membership, function ownership, ACL/grantor state, public-schema CREATE privileges, extension inventory or legacy objects. Production catalog inspection remains a separate release gate.

### Next investigation

- Add a disposable PostgreSQL catalog qualification that inventories every SECURITY DEFINER function across all non-system schemas, including schema, owner, identity arguments, pinned search_path, extension membership, ACL grantee, grant option and effective role membership.
- Reconcile every direct non-owner EXECUTE grant against a documented function/role exception matrix; include runtime, migrator, issuer, Actor Gateway, payment-provider and any unexpected role.
- Adversarially test caller-controlled search_path and temporary-object shadowing against the complete function inventory, and inspect any extension/legacy SECURITY DEFINER definitions outside `ghm`.
- Re-run exact-head PostgreSQL 18 CI on the latest code/test head after the coverage work. Production remains untouched; no cutover, merge, secret, role, grant, service, deployment, data or paid-resource change is authorized.


## 2026-11-12 — Whole-database SECURITY DEFINER inventory tooling added

Added a read-only catalog inventory to close the previous schema/allow-list coverage gap:

- `scripts/audit-security-definer-authority.mjs`
- `scripts/audit-security-definer-authority.test.mjs`
- `npm run audit:security-definer-authority`

The inventory is deliberately restricted to a local `ghm_disposable_test` database via `GHM_SECURITY_DEFINER_AUDIT_DATABASE_URL`; it rejects non-local hosts and any other database name. It does not issue DDL, GRANT/REVOKE, role changes, or data writes. It inventories SECURITY DEFINER functions/procedures in every non-system schema and records full signatures, definitions, owner, per-function settings/search_path, extension membership, direct ACL entries (grantee, grantor, EXECUTE, grant option), effective EXECUTE roles, all role membership edges, and global/schema function default ACLs. Output is explicitly marked `REVIEW_REQUIRED_NO_AUTOMATIC_APPROVAL`.

The contract test is appended to the repository `npm test` command. This is tooling added to source control, **not a completed database inventory**: it has not yet been run against disposable PostgreSQL in this session, so no actual grant matrix or cross-schema findings are claimed. Do not convert the preliminary report into automatic allow/deny decisions until the output has been reviewed and every legitimate function-role grant is documented. Startup verifiers remain unchanged and production remains untouched.

### Next required evidence

Run `npm test` on this exact branch head, then run `npm run audit:security-definer-authority` with `GHM_SECURITY_DEFINER_AUDIT_DATABASE_URL` pointing only to local `ghm_disposable_test`. Preserve the JSON output as qualification evidence, inspect all SECURITY DEFINER bodies outside `ghm`, and construct the exact function-signature-to-role EXECUTE exception matrix from observed disposable catalog state plus migration intent. Only after that review should we decide whether to strengthen startup verifiers or add adversarial grants for every uncovered function/role combination. Exact-head CI is still required; no production cutover, merge or live catalog mutation is authorized.


### Inventory runner output handling

The runner now accepts `GHM_SECURITY_DEFINER_AUDIT_DATABASE_URL`, falling back to `GHM_MIGRATOR_DATABASE_URL` loaded from the local dotenv file. The host/database guard still requires localhost and `/ghm_disposable_test`; a production or remote URL is rejected. Full JSON is written by default to `tmp/security-definer-authority-audit.json` (override with `GHM_SECURITY_DEFINER_AUDIT_OUTPUT`), while the terminal receives only counts, decision and report path. The database inventory is read-only; local report-file creation is expected. This runner has still not been executed here and its output must not be treated as evidence until the user runs it against the disposable PostgreSQL 18 qualification database.


## 2026-11-12 — Expanded whole-database authority inventory and CI integration

Expanded `scripts/audit-security-definer-authority.mjs` beyond SECURITY DEFINER routine ACLs. The read-only report now also captures role attributes (including superuser, CREATEROLE, CREATEDB, BYPASSRLS, LOGIN and replication), schema ownership and direct/effective USAGE/CREATE privileges, current-database ownership and direct/effective CONNECT/CREATE/TEMPORARY privileges, language trust status, extension membership, all role-membership options, and global/schema function default ACLs. Non-trusted languages are flagged for manual review. The test contract now asserts the additional catalog coverage.

CI workflow `.github/workflows/ci.yml` now syntax-checks the runner, executes it after all migrations have been applied to the PostgreSQL 18 disposable database, and preserves the JSON report as the `security-definer-authority-inventory` Actions artifact (14-day retention). It uses the existing CI `GHM_MIGRATOR_DATABASE_URL`, and the script's localhost + exact disposable-database guard remains active. This makes inventory evidence reproducible on each push to the issuer construction branch. The report is deliberately non-gating on preliminary findings: it records all exceptions for human review and does not pretend every grant is unsafe or automatically approved.

### CI checkpoint

The first workflow runs triggered by the successive audit commits were observed in GitHub Actions. Run `43220323598` was queued at exact HEAD `c9a599a19e3590de4f29ef243e7138b85e0da881`; earlier runs for intermediate commits were in progress. These are not yet passing results. Wait for the latest-head run and inspect the inventory artifact, test results and full job logs before claiming qualification. Each commit has its own run; results from intermediate SHAs do not qualify the eventual documentation-updated HEAD.

### Next decision gate

Review the full report for every non-owner EXECUTE grant, PUBLIC execution, unsafe/unpinned search path, non-trusted language, unexpected schema/database CREATE or USAGE privilege, powerful role attributes, role membership path, extension-owned function, and function default ACL. Build a documented exact-signature × role permission matrix from that evidence and migration intent. Add adversarial grant/search-path/temporary-shadowing tests for any identified gaps. No production catalog access, privilege changes, merge or issuer cutover is authorized by this work.


## 2026-11-12 — PUBLIC SECURITY DEFINER qualification assertion corrected

The first Actions runs after the global PUBLIC-definer scan change failed at `scripts/qualify-auth-issuer-cutover.mjs:186`, with the assertion message `issuer verifier must report PUBLIC execution on any SECURITY DEFINER function`. The observed array contained both intentionally injected PUBLIC grants: `ghm.auth_create_account(...)` and `ghm.gateway_provision_connect_business(...)`. This was an outdated qualification expectation, not evidence that the baseline database had an unexpected PUBLIC grant: the probe explicitly GRANTed PUBLIC EXECUTE to both functions, and the issuer verifier correctly returned both because its new query intentionally enumerates every GHM SECURITY DEFINER function. The Actor Gateway verifier uses the same global scan and must return the same two injected signatures.

Corrected the adversarial qualification to require both verifiers to report the complete two-function set (sorted), then require both arrays to be empty after the probe revokes both grants. Do not narrow the verifier back to service-local allow-lists. This preserves the intended cross-service protection and makes the test prove it. The earlier failed runs checked the previous assertion and do not qualify the corrected commit. Await the next exact-head PostgreSQL 18 CI run.

The run failed at the final issuer cutover qualification before the new inventory CI step had been added; it therefore provides no evidence about the inventory runner. The new workflow now executes the inventory immediately after migrations and stores the report artifact. Inspect the new exact-head run's inventory step and artifact independently of the later issuer cutover step.


### Effective inherited function execution explicitly flagged

The inventory now separately derives `effective_non_owner_execute_roles` for each SECURITY DEFINER routine from `has_function_privilege(role_oid, function_oid, 'EXECUTE')`, excluding only the function owner. This is distinct from direct ACL grantees and makes inherited membership paths visible as review findings alongside the membership graph. Contract coverage asserts that this effective-role finding is emitted. It still does not auto-approve any service exception.


## 2026-11-12 — First complete inventory reviewed; superuser classification corrected

The exact-head workflow run `43220670560` passed both `quality` and `web-quality` on `d0bf47c13114dcfe477ed45dd28173e6d4a552bd`. Its `security-definer-authority-inventory` artifact (SHA-256 `d005bcab9aec26a3ed50ca135493fba87618464dd55fd50b3e735960dc5eb582`) was retrieved and reviewed. It represents the post-migration, **pre-manual-auth-issuer-cutover** disposable PostgreSQL 18.6 state, using `ghm_migrator` to inspect `ghm_disposable_test`; no database mutation was performed by the inventory.

Observed baseline: 97 SECURITY DEFINER routines, all in schema `ghm`, all owned by `ghm_schema_owner`, all with `search_path=pg_catalog, ghm, pg_temp`, and all written in trusted `plpgsql` or `sql` languages. No non-system schema outside `ghm` contained SECURITY DEFINER routines. No PUBLIC EXECUTE grant appeared in the direct ACLs. The only role-membership edge among application roles was `ghm_migrator -> ghm_schema_owner` with `INHERIT FALSE`, `SET TRUE`, and `ADMIN FALSE`. Application login roles had no SUPERUSER, CREATEROLE, CREATEDB, REPLICATION or BYPASSRLS attributes. Schema/database ACLs and default function ACLs are included in the artifact for review.

The original report flagged all 97 functions because `has_function_privilege` reports superuser `postgres` as effectively able to execute every function. This is PostgreSQL superuser bypass, not an ordinary application-role grant. Corrected the inventory to return role metadata with effective EXECUTE, report superuser roles separately, and exclude superusers from `effective_non_owner_execute_roles`. They remain visible under `effective_superuser_roles_excluded_from_acl_findings`. The revised classification must be re-run in CI; do not reuse the old 97-finding count as the corrected result.

The original direct ACL evidence identified four application principals with grants: `ghm_actor_gateway` (25 functions), `ghm_runtime` (43), `ghm_payment_provider` (2), and `ghm_migrator` (1). These are **pre-cutover observations, not automatic approvals**. Gateway functions must match the Actor Gateway allow-list; payment-provider functions must match settlement responsibilities; runtime functions must be traced to active Resource API callers and separately approved manual cutovers; the migrator's single grant is the narrow read-only `ghm.auth_lookup_business_external_mapping(text,text)`, explicitly granted by migration `20261012000000_auth_lookup_business_external_mapping.sql`. Build and record the exact signature × role matrix before changing grants. The issuer principal's absence of `ghm` schema USAGE in this pre-cutover snapshot is expected to be resolved only by the separately qualified manual issuer cutover.

Function-body review found one SECURITY DEFINER routine containing dynamic SQL: `ghm.update_business_profile(bigint,bigint,jsonb)`. Its dynamic statement uses a fixed SQL template, fixed code-authored optional fragments, and parameterized values via `USING`; no caller-supplied identifier or SQL fragment is interpolated. The caller-controlled JSON keys are checked against a fixed allow-list before the statement is built. The gateway wrapper separately rejects `isSupplier` and `is_supplier` so supplier classification remains on its dedicated operation. This must remain covered by the database qualification and migration contract tests.

### Remaining review, not yet closed

- Finish signature-by-signature justification of all 71 direct application-role grants (70 unique routines across the four principals).
- Trace every `ghm_runtime` grant to an active caller, distinguishing pre-issuer baseline functions that the manual cutover revokes.
- Confirm the 25 Actor Gateway grants exactly equal the service's allow-list and two payment-provider grants equal its narrow settlement allow-list.
- Review SECURITY DEFINER bodies for account/business ID trust, actor authorization and cross-operation boundaries; dynamic SQL review is not a substitute for this.
- Review schema/database ACLs, default ACLs and role membership against the intended Render PostgreSQL production role model. Disposable CI evidence does not establish production state.
- Run the corrected superuser-aware inventory on the new exact HEAD, inspect its artifact, and repeat the full CI qualification.

No production database, secrets, deployments, services, migrations or live grants were changed. No merge or cutover is authorized.


## 2026-11-12 — Caller-supplied identity review: saved favourites and storage metadata

The first SECURITY DEFINER body pass now distinguishes database-enforced identity from application-layer checks.

### Saved Business (user favourites/bookmarks)

The legacy `ghm.create_saved_business(p_account_id,p_business_id)` inserts the caller-supplied account ID without independently authenticating it; `ghm.delete_saved_business(p_account_id,p_saved_business_id)` deletes by the supplied account ID. The current signed Actor Gateway wrappers are the intended path, and the manual cutover `database/cutovers/20261111110000_revoke_legacy_saved_business_runtime.sql` revokes direct table/sequence access plus both legacy function grants from application principals. The disposable PostgreSQL cutover qualification exists. This feature remains users saving Businesses as favourites/bookmarks; this security work must preserve that behavior. Production cutover remains pending the documented deployment, role-model and fresh-backup gates. Until that cutover is applied, the legacy runtime SQL grant remains a residual identity-spoof surface even if the current application routes no longer call it.

### Storage metadata — unresolved database-boundary gap

The `ghm_runtime` role has direct EXECUTE on the following SECURITY DEFINER storage routines:

- `ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text)`
- `ghm.storage_get_object(bigint,bigint)`
- `ghm.storage_mark_available(bigint,text)`
- `ghm.storage_mark_deletion_pending(bigint)`
- `ghm.storage_mark_deleted(bigint)`
- `ghm.storage_get_public_business_logo(bigint)`

The public-logo lookup is constrained to active, verified, approved public Business logos. The other five functions require further scrutiny: `storage_get_object` checks membership against a supplied `p_account_id`, but does not derive that identity from the database session; `storage_create_pending` accepts a supplied tenant Business ID and inserts metadata without a database-side membership check; and the three lifecycle functions mutate object status using only the supplied object ID/state, with no database-side actor, tenant, or provider assertion. Current application service code performs authorization before these calls, but that is not an independent database authorization boundary. A caller holding the shared `ghm_runtime` credential can invoke the SECURITY DEFINER functions directly and supply another account/business/object ID.

This is an **open security finding**, not an approved exception. Do not revoke these grants blindly: the current storage service still uses them for upload completion/deletion flows, and no replacement storage principal or signed storage-operation gateway has yet been qualified. Trace all callers and provider-side verification first, then design a database-verifiable actor/operation/context assertion or a dedicated least-privilege storage principal/gateway. Qualification must prove cross-tenant read denial, cross-tenant pending-object creation denial, unauthorized state-transition denial, provider-object verification, and preservation of the current authorized storage workflow. The Actor Gateway's logo-binding operation does not by itself secure storage object creation or lifecycle transitions.

### Dynamic SQL finding

The only SECURITY DEFINER definition containing dynamic SQL is `ghm.update_business_profile`. The SQL statement is a fixed template; optional fragments are selected from fixed code-authored strings; user values are bound through `USING`; caller-controlled JSON keys are checked against a fixed allow-list. The current signed gateway wrapper additionally checks exact request context and rejects both `isSupplier` and `is_supplier`, preserving the separate supplier-classification operation. The profile qualification script contains database-level regression assertions for these denials.

### Inventory superuser correction CI

The first superuser-aware contract test run failed because its source-text regular expression was over-escaped; the implementation itself passed syntax and the inventory step. Corrected the test to match the emitted `'superuser', r.rolsuper` metadata and `entry.superuser !== true` filter. Exact-head run for the corrected test is pending; the earlier failure must not be described as an implementation/database qualification failure.


### Corrected superuser-aware inventory result — CI passed

The corrected superuser-aware inventory completed successfully on code/test HEAD `df7aba60df7eaf1a01a5b7b6811f5d4a5d9afe6e`, Actions run `43221800807`: both `quality` and `web-quality` passed, with 55/55 quality steps successful. The new artifact `security-definer-authority-inventory` (SHA-256 `ac619dc8b558ad7b828aaf50770c73f34b2d9973f2d51f8cb580af75557e47a1`) was retrieved and independently parsed. It reports 97 SECURITY DEFINER routines and 70 preliminary findings after excluding PostgreSQL superuser bypass from ordinary role findings. All 70 findings are attributable to direct non-owner application-role EXECUTE grants; no PUBLIC EXECUTE grants were found. Each of the 97 functions reports owner `ghm_schema_owner`, pinned search path, trusted language; all routines are in `ghm`. The superuser `postgres` remains explicitly listed separately for every routine. The 70 findings are not automatically safe or unsafe: they are the complete signature-level application grant set that still requires role-purpose justification. Counts by grantee remain Actor Gateway 25, Resource API runtime 43, payment provider 2, migrator 1.

This corrected result supersedes the first artifact's misleading 97 preliminary findings. The earlier failure on the superuser metadata contract test was a test regex escaping error; the corrected test and full exact-code-head CI now pass. Subsequent handover documentation commits are being validated separately at the current branch HEAD.


### Pre-cutover application grant matrix — reconciled by role purpose

The 71 direct non-owner application-role EXECUTE grants in the retrieved pre-manual-cutover artifact reconcile as follows:

| Principal | Direct routine grants | Purpose / disposition |
|---|---:|---|
| `ghm_actor_gateway` | 25 | 24 signed `gateway_*` operations plus the signed assertion verifier; matches the Actor Gateway database privilege allow-list. |
| `ghm_runtime` | 43 | Mixed active Resource API functions and legacy operations whose manual gateway/issuer cutovers are still pending. See exact residual allow-list below. |
| `ghm_payment_provider` | 2 | PayFast-specific attempt lookup and settlement-result wrapper. |
| `ghm_migrator` | 1 | Read-only `ghm.auth_lookup_business_external_mapping(text,text)`, explicitly granted by its migration. |

The planned manual issuer/gateway cutovers account for 27 of the 43 pre-cutover runtime grants: 14 auth lifecycle/enrollment functions (issuer cutover), 3 capability catalogue governance functions, 2 registration identity functions, 3 legacy Business Capability mutation functions, 2 Saved Business favourite functions, 1 Business Hours function, 1 Trust Score function, and 1 Business Logo binding function. These are manual-only files and must be applied only after the relevant service/client deployment, end-to-end qualification, production role-model resolution and fresh verified backup. Their disposable qualification does not mean they have been applied to production.

After those 27 planned revocations, the 16-function runtime residual in this pre-cutover matrix is:

- Auth mapping/read: `auth_lookup_external_identity`, `auth_lookup_business_external_mapping`.
- Connect service assertion replay: `connect_service_assertion_consume`.
- Campaign: `create_campaign`, `update_campaign` (both enforce active owner/administrator membership in the function body).
- Directory/public reads: `get_business_directory_review_presentation`, `get_public_business_hours`, `get_public_trust_score`, `list_public_trust_scores`, `is_business_capability_publicly_evidence_eligible`.
- Storage: `storage_create_pending`, `storage_get_object`, `storage_get_public_business_logo`, `storage_mark_available`, `storage_mark_deletion_pending`, `storage_mark_deleted`.

The public lookup functions enforce approved/active/verified publication predicates; the directory review presentation checks active owner/administrator membership. The five non-public storage functions remain the open database-boundary finding above. The exact signatures and ACL grantors/grantees are preserved in the retrieved inventory artifact; no role is auto-approved solely by this purpose-level grouping.


### Branch and PR relationship verified

The active security-inventory work is on `construction/auth-issuer-isolation-20261112`; this branch currently has no associated open pull request. PR #272 is a separate integration branch, `integration/capability-gateway-qualification-20261110`, targeting `main`; its observed head is `0eda4ea8e232c98264fe83c7aecc3c85f71a5596`, it remains open/unmerged, and GitHub reports it not mergeable. Do not attribute this construction branch's inventory commits or CI results to PR #272, and do not merge either branch as part of this audit. The current construction branch remains the working evidence branch until the complete audit and documentation reconciliation are finished.


### Privileged function body review — actor and tenant identity

A source-level pass over the 97 catalog definitions found 24 application gateway wrappers plus the shared signed assertion verifier. All 24 wrappers invoke `ghm.assert_actor_gateway_capability` and independently compare the signed JSON context with the actual function arguments (including business/object IDs and mutation payloads). The verifier requires `session_user = ghm_actor_gateway`, an active account, a short timestamp window, one-use nonce and full 32-byte HMAC comparison. The wrappers therefore bind the authenticated actor, operation and exact target/payload; this includes Saved Business create/list/read/delete. Saved Business remains a user favourite/bookmark feature: create is allowed for an eligible public Business without membership, while read/list/delete are scoped to `p_actor` and the signed wrapper.

Legacy runtime-executable management functions were reviewed for body checks. Campaign create/update, Business profile, Business Hours, Trust Score calculation, Business registration identity, Business Capability assertion replacement, and directory review presentation check active owner/administrator membership or explicit admin authority in their function bodies. Capability governance functions check active admin/system-admin authority. Legacy evidence verification functions check admin role but do not independently check active account status; their signed gateway wrappers call the active-account assertion verifier, and their old runtime EXECUTE grants are covered by the manual capability-mutation cutover. These manual revocations remain production release gates, not completed production changes.

Two categories remain different: legacy Saved Business RPCs accept caller-supplied account IDs without actor authentication (covered by its manual cutover and signed wrappers), and the five non-public storage metadata RPCs do not bind supplied account/business/object IDs to a database-verifiable actor/provider assertion (open finding). Do not conflate the storage issue with the Saved Business favourite contract or remove the feature.


### Latest exact-head inventory artifact — 2026-11-12 13:00 UTC

The current construction branch HEAD at that validation point, `36fd0f63ec094a0603c3d3c272e04a456b2078a5`, passed both Actions jobs in run `43222978930` (55/55 quality steps). Its own inventory artifact was retrieved and parsed, not inferred from an earlier run: artifact `security-definer-authority-inventory`, SHA-256 `504617d724670704e673ed22f4841069d02a19aceeca2674e9b6de9cdb73e64d`, captured `2026-11-12T13:00:08.081Z`. It independently confirms 97 routines, 70 preliminary findings, zero PUBLIC EXECUTE grants, and the same direct grant counts (runtime 43, Actor Gateway 25, payment provider 2, migrator 1). All 97 are in `ghm`, owned by `ghm_schema_owner`, use exactly `search_path=pg_catalog, ghm, pg_temp`, and use trusted languages. This supersedes the previous note that the docs-updated exact HEAD was pending CI.


## Superseding storage metadata security status — 2026-11-12

The historical checkpoints above that describe storage metadata gateway work as proposed, open, or awaiting implementation/qualification are superseded by the November 12 implementation and qualification record in `docs/HANDOVER_2026-11-12_STORAGE_METADATA_GATEWAY.md`. The five storage metadata operations now use the signed Actor Gateway from the Resource API. Provider-confirmed transitions require both the JWT-derived actor assertion and a separate Resource API HMAC attestation verified in PostgreSQL. Disposable PostgreSQL 18 qualification covers the legitimate metadata lifecycle and adversarial actor/provider boundaries. The legacy direct runtime grant cutover has been rehearsed and rolled back on disposable PostgreSQL; no production grants were changed. The latest exact-head CI after the expanded disabled-account fixture and documentation reconciliation must be checked before claiming final whole-repository qualification. Production cutover remains blocked by fresh independently verified backup, Render role-administration access, and approved deployment/network/rollback planning. No merge or production mutation is authorized.
