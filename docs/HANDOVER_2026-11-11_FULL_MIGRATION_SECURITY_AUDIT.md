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
