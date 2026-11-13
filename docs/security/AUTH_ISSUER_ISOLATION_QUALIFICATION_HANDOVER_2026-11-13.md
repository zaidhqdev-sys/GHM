# GHM Authentication Issuer Isolation Qualification Handover — 2026-11-13

## Purpose

Continue ADR-001 Authentication Issuer isolation qualification on the existing construction branch. This handover records the actual result of workflow run 43330297297 and the follow-up source correction. It does not authorize merge, production deployment, production SQL, credential rotation, Render changes, or service creation.

## Repository and branch

- Repository: `zaidhqdev-sys/GHM`
- Construction branch: `construction/auth-issuer-isolation-20261112`
- Workflow: [43330297297](https://github.com/zaidhqdev-sys/GHM/actions/runs/43330297297)
- Branch work is intentionally separate from `main`.
- Unified Actor Gateway integration PR #272 remains draft/open/unmerged on `integration/capability-gateway-qualification-20261110`; do not confuse that PR branch with this issuer-isolation construction branch.
- PR #275 (Resource API runtime login isolation) and PR #274 (Render role-separation support handover) are merged.

## Run 43330297297 — actual outcome

The previous chat checkpoint said 45 steps passed and the issuer checks were pending. The completed run advanced through step 57, then failed at step 58.

Passed before the failure:
- PostgreSQL 18 role setup and delegated CREATEROLE reproduction.
- Issuer and Actor Gateway principal qualification.
- Application build, full migrations on disposable PostgreSQL, whole-database SECURITY DEFINER inventory and full test suite.
- Actor Gateway signed assertion, lifecycle and gateway-only cutover qualifications, including Business Capability, Saved Business, Business Hours, Trust Score, Business Logo, supplier classification and Business profile.
- Exact pre-issuer Resource API grant inspection: `preIssuerRuntimeAuthFunctions=16`, `unexpectedAuthFunctionGrantees=0`, `preCutoverRuntimeGrantContract=passed`.
- Guarded issuer manual cutover against disposable PostgreSQL (step 57).
- Web quality passed.

Failed:
- Step 58: `Qualify isolated auth issuer lifecycle and runtime denials on disposable PostgreSQL`.
- Step 59 post-cutover SECURITY DEFINER inventory was skipped because step 58 failed.
- Step 60 preserved the pre/post inventory artifact step, but this is not proof that the post-cutover inventory ran.
- Overall quality job failed; web-quality passed.

The failed SQL was PostgreSQL SQLSTATE 22025:
`invalid escape string`, hint `Escape string must be empty or one character`.
The PostgreSQL log showed a prefix filter expressed as:
`p.proname LIKE 'auth\\_%' ESCAPE '\\\\'`.
This is an invalid multi-character escape under the server's string-literal settings.

## Follow-up source correction

A source correction was committed to this construction branch:

- Commit: `ecbcc3f73561b18191e779d14e0c15b9a75b1db2`
- File: `scripts/qualify-auth-issuer-principal.mjs`
- Change: replace the fragile LIKE/ESCAPE prefix filter with the equivalent
  `left(p.proname, 5) = 'auth_'`.

This removes the invalid escape pattern from the issuer-principal qualification script. Important: the workflow failure was in the later cutover qualification. The failing PostgreSQL log statement must be reconciled against the exact checked-out source/build output before declaring the root cause fully fixed. Do not assume this one correction proves step 58 passes. Search all issuer qualification SQL for remaining LIKE/ESCAPE variants and inspect the exact query at the failing call site.

## Required next actions

1. Inspect the current branch HEAD and exact diff after commit `ecbcc3f`.
2. Search the issuer qualification scripts and issuer database privilege SQL for all `LIKE ... ESCAPE` patterns. Prefer a simple prefix expression such as `left(proname, 5) = 'auth_'` where equivalent.
3. Reconcile the logged statement with the exact source line / compiled TypeScript helper used by step 58. Add a focused regression assertion/test for the SQL predicate so the invalid escape cannot recur.
4. Run exact-head CI on the construction branch. Do not report qualification success until the entire quality job passes.
5. Confirm the manual cutover step runs only against `ghm_disposable_test`, then confirm the isolated issuer lifecycle/runtime-denial step passes.
6. Confirm the post-cutover SECURITY DEFINER inventory executes (not skipped), and compare it with the preserved pre-cutover inventory. Record both artifacts and their hashes/locations in the handover.
7. Preserve rollback evidence: issuer privileges removed on rollback, exact documented Resource API auth function allow-list restored, and guarded cutover reapplied only to the disposable DB for post-cutover inventory.
8. Reconcile the resulting exact-head CI, branch, commit and remaining gates in this handover before any PR or merge decision.

## Security and operating boundaries

- Production target remains Render `ghm-db` / `ghm_db` / GHM Internal Runtime.
- Production currently has no `ghm_auth_issuer` role or separate production issuer service; do not imply otherwise.
- The issuer cutover is manual-only and must not be added to normal migrations or applied to production by CI.
- No production database changes, role/grant changes, credential rotation, environment-variable changes, deployments, service creation, DNS/routing changes or traffic cutover are authorized by this qualification.
- Keep the Render Dashboard-managed administrator for controlled administration. Normal Resource API execution uses the existing SQL-created `ghm_runtime` login as specified in the merged role-separation handover.
- No additional paid Render service, database, pgAdmin service, or sandbox revival. The suspended sandbox remains out of scope.
- PayFast remains paused; do not activate or modify payment paths.
- Keep Connect/QuoteFlow cutover and legal publication out of this task.
- Update this handover at each meaningful checkpoint.

## Related PR and handover context

- PR #272 remains draft and unmerged; it explicitly records that issuer separation is the hard ADR-001 blocker.
- PR #275 merged the Resource API runtime principal isolation.
- PR #274 merged the Render support role-separation resolution.
- The merged handover `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md` records the production read-only role graph and the Render support recommendation.
- The branch's Actor Gateway vertical cutovers are qualification evidence only; they do not authorize production deployment or gateway hosting.

## Current status

| Gate | Status |
|---|---|
| Issuer principal syntax / baseline | Passed in run 43330297297 |
| Pre-issuer Resource API grant inventory | Passed: 16 expected, 0 unexpected |
| Disposable manual issuer cutover | Step passed |
| Issuer lifecycle/runtime denials | Failed: SQLSTATE 22025 |
| Post-cutover SECURITY DEFINER inventory | Skipped |
| Pre/post inventory comparison | Not qualified |
| Follow-up LIKE/ESCAPE source correction | Committed as `ecbcc3f`; exact failing call-site reconciliation pending |
| Exact-head retry | Pending |
| Production cutover | Not authorized |

**Next checkpoint:** resolve the SQL escape mismatch at the actual failing call site, rerun exact-head CI, and obtain a completed post-cutover authority inventory before considering any further integration.


## Retry progress checkpoint — 2026-11-13

The failed quality job from run `43330297297` was successfully re-requested using GitHub's job rerun action. The latest observed retry job is quality job `131582323714`; web-quality job `131582327237` completed successfully.

At the latest status check:
- Quality: `in_progress`.
- 44 quality steps completed successfully.
- No failed quality steps.
- Current active step: 45, capability legacy RPC cutover and gateway-only access.
- Issuer gates 56–60 (pre-issuer grant inspection, disposable manual cutover, issuer lifecycle/runtime denials, post-cutover SECURITY DEFINER inventory, inventory preservation) had not yet started.
- This is not a final pass. Continue checking this same run until it completes; then inspect exact job logs and artifacts.

Do not infer issuer qualification success from the green web-quality job or the successful earlier gateway steps. Confirm whether the rerun's checkout contains the post-failure branch corrections by inspecting its logs/commit identity once logs are available. If it does not, run a fresh workflow against the current construction branch HEAD rather than treating a rerun of the earlier commit as validation.


### Live retry update

A subsequent poll of the same retry shows 48 successful quality steps, zero failed steps, and step 49 (Trust Score signed gateway cutover) active. The issuer-specific steps 56–60 remain pending. Web quality remains passed. The workflow has not completed; do not interpret these intermediate results as issuer qualification success.

Two existing workflow artifacts named `security-definer-authority-inventory` were listed by GitHub, created at 23:39:13Z and 23:49:14Z. Their timestamps precede completion of the retry's issuer-specific steps, so they are not accepted as evidence of the retry's post-cutover inventory. Confirm provenance and exact contents after the run completes; require a newly produced post-cutover artifact from step 59/60.


## 2026-11-13 retry failure — root cause confirmed

The retried quality job `131582323714` has completed and failed at step 58, `Qualify isolated auth issuer lifecycle and runtime denials on disposable PostgreSQL`.

### Critical provenance correction

The retry did **not** test the latest construction branch. Its checkout log records:
- Branch: `construction/auth-issuer-isolation-20261112`
- Checked-out commit: `2fe38cb56ca560cb57d145d8bcc37a574ac15a7a`

This is the original failing commit, before the subsequent branch corrections and handover commits. Therefore rerunning that old job cannot validate the fixes.

### Exact failure source now identified

The PostgreSQL log pinpoints the SQL statement:
`p.proname LIKE 'auth\\_%' ESCAPE '\\\\'`.

Comparing the exact checked-out commit `2fe38cb` against the current construction branch source identifies the stale expressions in `scripts/qualify-auth-issuer-cutover.mjs`:
- Original line 389: issuer startup ACL check.
- Original line 771: final runtime auth-function allow-list check.

The current construction branch version of that script (blob SHA `3f94dca1a958e970ca1aca67e39a4e8cc7fd99a9`) replaces **both** with the equivalent safe predicate `left(p.proname, 5) = 'auth_'`. It contains no remaining `LIKE` or `ESCAPE` expressions; the same six auth-prefix checks use `left(...)`.

The current helper `src/auth-issuer/database-privileges.ts` also uses `left(p.proname, 5) = 'auth_'`. The earlier source fix in commit `ecbcc3f` to the principal qualification script was not the actual fix for this step-58 SQL failure.

### Step results for old-SHA retry

- Step 56 exact pre-issuer Resource API grants: passed.
- Step 57 guarded manual cutover on disposable PostgreSQL: passed.
- Step 58 issuer lifecycle/runtime denials: failed with PostgreSQL SQLSTATE 22025 (invalid escape string).
- Step 59 post-cutover SECURITY DEFINER inventory: skipped.
- Step 60 artifact-preservation step: success, but does not prove a post-cutover inventory was produced.
- Web quality: passed.
- Overall quality: failed.

The three same-named inventory artifacts in this run are not accepted as post-cutover evidence. In particular, step 59 was skipped.

### Required next action

Trigger a **new workflow run against the current construction branch HEAD**, not a rerun of the old job. Confirm the new run's checkout SHA is the current branch HEAD and that it includes the two safe predicates in the cutover script. Then require steps 56–60 to complete, including an executed step 59 and a newly produced post-cutover inventory artifact. Compare that artifact with the preserved pre-cutover inventory before considering the issuer qualification complete.

No production changes are implicated: the failing run used `ghm_disposable_test` only. Production remains untouched and the integration PR remains draft/unmerged.


## Fresh exact-head CI trigger — 2026-11-13

The CI workflow definition on this construction branch explicitly includes a `push` trigger for `construction/auth-issuer-isolation-20261112` (as well as workflow_dispatch and PR triggers). The earlier rerun action reused the old run's original SHA `2fe38cb56ca560cb57d145d8bcc37a574ac15a7a`, so it could not validate the later fix.

A new documentation commit is being pushed to this same construction branch to invoke its configured push workflow against the branch's current source. The expected source includes the safe auth-function prefix predicates in the cutover script at current lines 350, 389, 650, 686, 771 and 782. The new workflow's checkout SHA must be inspected before accepting its result.

The branch is deliberately not being opened as a PR to `main`: a comparison against `main` reports a divergent history (1,599 commits ahead and 6 behind), so using a PR merely as a CI trigger would create an unsafe and misleading integration surface. No merge, production deployment, or production database operation is authorized.

After the push, retrieve the newly created workflow run and verify:
1. checkout SHA equals the pushed construction branch HEAD;
2. all qualification steps pass, particularly issuer lifecycle/runtime denials;
3. post-cutover SECURITY DEFINER inventory step executes rather than skips;
4. a fresh post-cutover artifact is produced and its contents/hash are retained;
5. pre/post inventories are compared and unexplained authority changes are zero.


### Push-trigger attempt result

The handover-only push commit was created successfully:
- Commit: `cd8b147e42f1edefe2f86bda5fd5ba727e259673`
- Message: `docs(security): trigger exact-head issuer qualification`
- Branch: `construction/auth-issuer-isolation-20261112`

The branch workflow configuration includes a push trigger for this branch. However, immediately after the push, the connected GitHub interface returned no commit statuses and no associated workflow runs for this SHA. Its workflow-run lookup is limited to pull-request-triggered runs, so this interface cannot confirm whether the push-triggered workflow was queued. Do not state that a fresh run has started until a run ID is visible in GitHub Actions.

Next: inspect the repository Actions page for a new run on SHA `cd8b147e42f1edefe2f86bda5fd5ba727e259673`. If no run exists, trigger the existing CI workflow manually using GitHub Actions `workflow_dispatch` for this branch. Do not create a PR to main as a workaround; the branch/main histories are divergent and the security stack must remain isolated.


## Regression guard added — 2026-11-13

Added a regression test to `scripts/audit-security-definer-authority.test.mjs` in commit `1125a293e89edd4f09f9568b85e4b829ac1b99c5`.

The new test reads the issuer cutover script, issuer database privilege helper and issuer principal qualification script. It rejects `LIKE ... ESCAPE` SQL prefix filters in those sources and asserts that the reviewed auth-function prefix checks use `left(p.proname, 5) = 'auth_'` (including at least six cutover call sites).

This test is included in the existing `npm test` command via `node --test scripts/audit-security-definer-authority.test.mjs`; no separate workflow or additional infrastructure was introduced.

The push is configured to trigger the existing CI workflow on this construction branch. A fresh workflow run and exact checkout SHA still need to be confirmed in Actions. The prior retry is not valid evidence because it checked out the old SHA `2fe38cb`. No PR, merge, production database operation, Render change or deployment was made.


## Regression-test review correction — 2026-11-13

A source review of the newly added test caught an issue in the test's own regular-expression escaping: the first committed version over-escaped the regex literals and would not match the intended SQL expressions. Corrected in commit `4751727863158d775d8fffdddd653d48dae0d57e`.

The corrected test now contains actual JavaScript regex literals for:
- rejecting a `LIKE ... ESCAPE` pattern;
- counting the six safe auth-prefix predicates in the cutover script;
- asserting the safe predicate in both the privilege helper and principal qualification script.

The current source has been re-read from the branch and confirms six safe cutover predicates and no `LIKE`/`ESCAPE` tokens. The package `test` script explicitly invokes `node --test scripts/audit-security-definer-authority.test.mjs` after the build and existing qualification tests, so the guard is in the existing CI test path.

### CI trigger status

The branch's `.github/workflows/ci.yml` has a push trigger for this exact construction branch and a `workflow_dispatch` trigger. However, the GitHub connection currently exposes read-only workflow-run discovery and job retries, not workflow dispatch. For commits `1125a293...` and `47517278...`, the commit status API returned `pending` with zero statuses and the available PR-filtered workflow-run lookup returned no runs. Therefore no fresh CI run is confirmed.

Do not call this regression test passed until a fresh run executes on the corrected HEAD. Do not retry the stale run from `2fe38cb`. The corrected branch remains isolated; do not open a PR to main as a CI workaround because the histories are divergent.

## Current verified state after test correction

- Cutover SQL: six reviewed `left(p.proname, 5) = 'auth_'` filters; no `LIKE` or `ESCAPE` in current cutover script.
- Regression test: corrected and committed; not yet executed in CI.
- Current construction branch HEAD at time of this note: `4751727863158d775d8fffdddd653d48dae0d57e`.
- PR #272: open, draft, unmerged.
- Issuer lifecycle/runtime-denial qualification: still pending fresh exact-head CI.
- Post-cutover SECURITY DEFINER inventory: not yet proven to have executed on a fresh run.
- Production: untouched.


## 2026-11-13 exact-head issuer qualification passed; inventory comparison added

### Fresh run evidence

GitHub Actions run `43334838854` completed successfully on:
- Branch: `construction/auth-issuer-isolation-20261112`
- Exact checkout SHA: `835324eacce464aa09c08b2f445e1df7438bee2e`
- Event: `push`
- Quality: 64/64 steps passed.
- Web quality: 11/11 steps passed.
- No failed or skipped steps in either job.

Critical issuer steps:
- 56 exact pre-issuer Resource API authentication grants: passed.
- 57 guarded manual issuer cutover on disposable PostgreSQL: passed.
- 58 isolated issuer lifecycle and runtime denials: passed.
- 59 post-cutover whole-database SECURITY DEFINER inventory: executed and passed.
- 60 inventory artifact preservation: passed.

The issuer qualification emitted:
`issuerAllowList=10`, `issuerDirectRelationPrivileges=0`, `runtimeIssuerFunctionDenials=19`, `finalRuntimeAuthFunctionAllowList=2`, and passed registration/login/password rehash/concurrent reset/refresh/logout, recovery replay/session revocation, QuoteFlow migration reset, disposable rollback, startup ACL, default ACL, unexpected direct grants, SECURITY DEFINER ownership/search_path and PUBLIC execution checks.

The post-cutover audit was read-only against `ghm_disposable_test`, reported 106 SECURITY DEFINER routines and 58 preliminary findings, and retained decision `REVIEW_REQUIRED_NO_AUTOMATIC_APPROVAL`. This is intentionally an inventory requiring review, not an automated approval. Artifact:
- ID `13995824180`
- URL: `https://github.com/zaidhqdev-sys/GHM/actions/runs/43334838854/artifacts/13995824180`
- ZIP SHA-256: `fa474b49f29b541c26fc0894d37e881f0faa1b0b023e7985b85c3c9e1af4d5b9`

### Evidence limitation discovered and addressed

Although workflow step 60 uploaded both the pre- and post-cutover JSON files, source inspection showed that no machine comparison was performed. Step 60 was upload-only. Do not claim that the inventories had been compared or that unexplained authority differences were zero based on run 43334838854.

Added:
- `scripts/compare-security-definer-authority-inventories.mjs`
- `scripts/compare-security-definer-authority-inventories.test.mjs`
- CI step after the post-cutover inventory to run the comparison tests and compare the two generated JSON inventories.
- Artifact glob expanded to preserve pre-cutover, post-cutover and comparison JSON together.

The comparator enforces same disposable DB/server version, same SECURITY DEFINER routine identities/count, unchanged non-issuer function definitions/owners/ACLs, unchanged role memberships/attributes, schema/database/column/default ACLs, and unchanged non-issuer findings. It records the Authentication Issuer function ACL changes separately. Exact issuer allow-list and runtime-denial assertions remain enforced by the dedicated issuer cutover qualification.

The comparator's output newline handling was corrected in commit `77ca5158f2b8bf68d732eca23e90a10981f3cf13`. The comparator, tests and CI integration are committed on this construction branch, but their execution is still pending a new exact-head Actions run.

### Current boundaries and remaining gates

- This run only mutated disposable PostgreSQL `ghm_disposable_test`; no production database, Render service, credentials, secrets, environment variables or application traffic were changed.
- The manual SQL cutover is deliberately excluded from automatic migrations and its own comments state it must not be applied before the isolated issuer service, private routing/public ingress, client URLs, credentials and verified backup are ready.
- Passing disposable qualification does not mean the Authentication Issuer is deployed or the production cutover is authorized.
- PR #272 remains draft/unmerged and on its separate Actor Gateway integration branch. It explicitly retains issuer separation and hosting/network isolation as hard blockers.
- Fresh exact-head CI for the new inventory comparator is required. The resulting comparison JSON must be inspected and its output must show zero unexplained non-issuer changes.
- The whole-database inventory's 58 preliminary findings remain a review queue; no automatic approval is inferred.


## Inventory comparator CI failure and correction — 2026-11-13

Fresh exact-head run `43335733351` checked out `a02aceb1eb00801aa8b6e2436879e01330101b28`.
- Web quality: 11/11 passed.
- Issuer pre-grant, guarded disposable cutover, lifecycle/runtime-denial, and post-cutover inventory steps: all passed.
- Inventory artifact upload: passed; artifact ID `13997057246`, SHA-256 `0a84587bdaac9a9c6e006dfcf488c8c06c9af69b7e3714f338730f98e802647e`.
- The new comparator's test suite: 4/5 passed, 1 test failed due solely to an incorrect expected assertion message. The comparator correctly rejected the changed routine count; test expected `routine_count`, but actual assertion message is `issuer cutover must not add or remove SECURITY DEFINER routines`.
- No evidence yet that the real pre/post inventories compare successfully. The comparator process did not run because the preceding test command exited nonzero.

Corrected the test expectation in commit `4bb587e5068ce9d974d4b5eab889de7ae32891cc`. No production change. Next run must execute the corrected test and real inventory comparison. Inspect its report: require zero unexplained non-issuer changes, expected issuer ACL changes, and no unrelated differences. Do not mark the inventory comparison passed before exact-head CI evidence.


## Inventory baseline placement correction — 2026-11-13

Exact-head workflow run 43336223388 checked out `4a9fce1f0bf2f38d94815d370d3c58e15157ec65`.

- All five comparator unit tests passed.
- Issuer pre-grant, guarded disposable cutover, lifecycle/runtime-denial qualification and post-cutover inventory generation passed.
- The real inventory comparison correctly failed: pre-cutover had 103 SECURITY DEFINER routines and post-cutover had 106.
- Artifact ID `13997481654` (run URL: https://github.com/zaidhqdev-sys/GHM/actions/runs/43336223388/artifacts/13997481654; ZIP SHA-256 `2480760e9e22ddb27d817c4baddd51136f2f2d93f3b3da68eddc06e193537a52`).
- Direct artifact inspection identified exactly three additions between snapshots: `ghm.gateway_create_campaign(...)`, `ghm.gateway_get_business_directory_review_presentation(...)`, and `ghm.gateway_update_campaign(...)`. No routine identities were removed. These were created by qualification work that ran after the initial baseline inventory and before issuer cutover; they are not issuer routines.
- The comparator is behaving correctly and remains strict. Do not relax routine-count or identity-set assertions.

Correction committed in `7259de499cee34ccff476886f385020befe31146` (`fix(security): capture issuer baseline after all qualifications`): moved the baseline inventory from immediately after migrations to immediately before the exact pre-issuer grants/cutover sequence, after all other qualification work. This ensures the before/after comparison isolates only the issuer cutover.

Next gate: wait for and inspect exact-head CI on the corrected commit. Require all comparator tests and the real comparison to pass; inspect the generated comparison JSON and artifact. Expected structural result is 106 routines on both sides, identical identity set, issuer ACL changes observed, and zero unexplained non-issuer changes. No production database, Render service, credentials, deployment or merge was touched.


## 2026-11-13 authority comparison diagnosis and correction

### Exact evidence from failed run 43337128977

The failed run checked out construction commit `7259de499cee34ccff476886f385020befe31146`. Its quality job reached the real inventory comparison after the dedicated issuer cutover qualification and post-cutover inventory both passed. The comparator's five tests passed; the real comparison then failed because it treated every schema privilege as immutable.

Downloaded and inspected artifact `13997189067` (`security-definer-authority-inventory`), which contains both pre- and post-cutover JSON reports. Both reports identify:
- Database: `ghm_disposable_test`
- PostgreSQL: `18.7`
- Audit connection: `session_user=ghm_migrator`, `current_user=ghm_migrator`

The inventory proves the exact expected change:
- Pre-cutover `ghm` schema direct ACL had no `ghm_auth_issuer` entry; effective issuer privilege was `USAGE=false, CREATE=false`.
- Post-cutover `ghm` schema direct ACL has exactly `ghm_auth_issuer / USAGE / grantable=false`, granted by `ghm_schema_owner`; effective issuer privilege is `USAGE=true, CREATE=false`.
- Every other direct and effective `ghm` schema privilege is identical.
- The `public` schema ACL and effective privileges are identical in the two actual JSON reports.
- Role memberships, role attributes, database privileges, column privileges and function default ACLs are identical.
- The issuer startup/lifecycle verifier passed in this run, consistent with the post-cutover grant.

This corrects the earlier interpretation of the truncated CI diff: the cutover did not remove issuer USAGE, and there is no unexplained `public` schema change. The real comparator rejected the intended, explicitly reviewed `ghm_auth_issuer` schema USAGE grant because it compared the whole `schema_privileges` section as if the issuer grant were forbidden.

### Comparator correction committed

Changed:
- `scripts/compare-security-definer-authority-inventories.mjs`
- `scripts/compare-security-definer-authority-inventories.test.mjs`

Commits:
- Comparator: `96bfd6c11a2c75614a1e29696119cbb5e98a2a47`
- Regression tests: `486c8a9349191b29f1456f2ab16d6418ad124d0e`

The comparator now:
1. Continues to require role memberships, role attributes, database privileges, column privileges and default function ACLs to remain byte-for-byte equivalent after canonicalization.
2. Normalizes only the `ghm_auth_issuer` entry in the `ghm` schema privilege section, and requires every other schema ACL/effective privilege to remain unchanged.
3. Requires the pre-cutover inventory to have no direct issuer `ghm` USAGE grant and effective issuer `USAGE=false, CREATE=false`.
4. Requires the post-cutover inventory to have exactly one non-grantable direct issuer `USAGE` grant from `ghm_schema_owner`, with effective `USAGE=true, CREATE=false`.
5. Rejects issuer schema CREATE and all unrelated schema privilege changes.

Two focused regression tests were added: one accepts only the exact reviewed issuer schema USAGE delta; the other rejects issuer CREATE or any unrelated schema privilege change. Existing strict comparisons and non-issuer routine checks remain intact.

### Current state and next validation

- Current construction branch HEAD: `486c8a9349191b29f1456f2ab16d6418ad124d0e`.
- Fresh exact-head CI has not yet been observed for these comparator changes. Do not claim the comparator correction or full qualification has passed until a new run checks out this exact HEAD and completes both quality and web-quality.
- Require the real comparison report to confirm the single expected issuer schema USAGE delta and zero unexplained non-issuer changes.
- PR #272 remains open, draft and unmerged.
- Production remains untouched; all database qualification evidence is from disposable local PostgreSQL only.


## 2026-11-13 comparator syntax correction

Exact-head run `43338682362` checked out `1ac512bfabad6f54b41b4a74b4a0c1a9c2de025d`. It completed the issuer database principal qualification, pre-cutover authority inventory, exact pre-issuer runtime grant contract, guarded disposable cutover, and issuer lifecycle/runtime-denial qualification successfully. The lifecycle report confirmed issuer allow-list 10, issuer direct relation privileges 0, runtime issuer function denials 19, final runtime auth-function allow-list 2, issuer startup ACL verification, default ACL denials, unexpected direct function grant denials, SECURITY DEFINER owner/search_path and PUBLIC execution checks, and disposable privilege rollback all passed.

The comparator stage failed before executing the inventory comparison because the report-label object contained a literal escaped newline token, producing a JavaScript `SyntaxError: Invalid or unexpected token`. This is a comparator source syntax defect, not a PostgreSQL authority mismatch. No comparison report was produced; inventory comparison remains unqualified.

Corrected the source to use a real line break and added a regression assertion checking the comparator report labels and malformed escaped-newline pattern. New commits:
- comparator syntax fix: `4802bffd0544bf021ba1819c5351e1d58144efc7`
- syntax regression test: `40da8b61e91d32be3694deb50145585eff4efdd1`

A fresh exact-head workflow run is required. The next gate is that comparator tests pass, the real pre/post comparison executes, and the report confirms only the reviewed `ghm_auth_issuer` schema USAGE delta with zero unexplained non-issuer changes. Do not weaken the comparator or infer a pass from successful issuer lifecycle tests.

All database changes in this run were confined to disposable PostgreSQL. Production, Render and application traffic remain untouched. PR #272 remains draft and unmerged.
