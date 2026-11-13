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


## 2026-11-13 comparator retry findings and correction

Inspected both fresh workflow runs named in the prior checkpoint:

- Run `43339183651`: `web-quality` passed; `quality` failed.
- Run `43339189049`: `web-quality` passed; `quality` failed.
- In both runs the issuer lifecycle/cutover and disposable rollback checks completed successfully, and the post-cutover whole-database inventory step executed successfully.
- Neither run produced a successful pre/post inventory comparison. The comparison stage was blocked by failures in the comparator unit-test file before the comparator's real CLI comparison step could run. No comparison report is accepted as evidence.

### Exact test defects found in run 43339189049

The comparator source syntax correction itself is present: the report-label object now has a normal line break between `schemaPrivileges` and `issuerSchemaGrant`.

The newly added regression test introduced two independent test-fixture defects:
1. It referenced `fs.readFileSync` without importing `node:fs` (`ReferenceError: fs is not defined`).
2. The first successful-comparison fixture omitted the required `ghm` schema privilege inventory, so the comparator correctly rejected it with `pre/post inventories must both contain the ghm schema`.

The other six comparator unit tests passed; these two failures are test defects, not evidence of a database authority mismatch. The real pre/post comparator has still not run.

### Corrections committed to the same construction branch

- `d309ca0bbfa7ae42107b151479d58aa67583cef4` — imports `node:fs` and supplies before/after `ghm` schema privilege fixtures to the successful issuer ACL comparison test.
- `443bfe127b78c022381cb52cda11fa20fbb92656` — corrects the escaped-newline regression assertion so it checks for the literal malformed backslash-n sequence rather than an over-escaped pattern.

The latest required action is a fresh exact-head CI run on the current branch HEAD `443bfe127b78c022381cb52cda11fa20fbb92656`. Confirm the run checks out that exact SHA. Require all comparator unit tests to pass, then require the actual CLI comparison step to execute against the pre/post inventory files and produce a report. The report must confirm:
- unchanged SECURITY DEFINER routine identity set;
- only the reviewed Authentication Issuer ACL changes;
- exactly the non-grantable `ghm` schema USAGE grant for `ghm_auth_issuer`, with CREATE denied;
- unchanged non-issuer function definitions/ACLs, role memberships/attributes, database/column/default ACLs and non-issuer findings;
- `unexplainedNonIssuerChanges: 0`.

Do not infer that the real comparison passed from passing unit tests or from successful inventory collection. Preserve the actual comparison artifact and hash in the next handover update.

Production remains untouched. All database changes in these runs were confined to disposable PostgreSQL. No deployment or merge has been made; PR #272 remains draft/open/unmerged.


## Follow-up inspection after comparator corrections

Reviewed the full comparator implementation and all eight unit tests at branch HEAD after commits `d309ca0` and `443bfe1`.

- The missing filesystem import is now present.
- The successful comparison fixture now contains explicit before/after `ghm` schema inventories and the exact expected issuer USAGE grant.
- The regression assertion now checks for the literal malformed escaped-newline source pattern.
- The comparator remains deliberately strict: routine identity/count equality, issuer function non-ACL metadata equality, unchanged non-issuer function definitions/ACLs, role membership/attributes, database/column/default ACLs, all unrelated schema privileges, and non-issuer preliminary findings.
- It requires the issuer's direct non-grantable `ghm` USAGE grant to be absent before and present after, and effective issuer schema privileges to change from USAGE=false/CREATE=false to USAGE=true/CREATE=false.

### CI dispatch observation

Checked workflow runs associated with the handover commit `889dd960bf4f19af0ed42723ef407d8fc00dd94e`; the commit-specific PR-run lookup returned no runs. Therefore no fresh exact-head result is currently available to claim. The prior failed runs remain failures on their earlier test source. The latest code and handover commits are on `construction/auth-issuer-isolation-20261112`; do not reuse older run results as validation of these corrections.

The next evidence requirement remains a new CI execution on the corrected branch head (or descendant), followed by inspection of the actual comparator CLI step and its generated JSON artifact. If a run is not automatically created by the branch push, trigger the configured CI workflow for this exact branch/commit through an authorized GitHub Actions dispatch mechanism; do not merge, deploy, or weaken the comparator to obtain a green result.

No production activity has occurred.


## Stacked integration branch created — 2026-11-13 13:34 UTC

### New branch and ancestry

Created `construction/auth-issuer-stacked-on-pr272-20261113` from the exact live PR #272 head:

- Parent/base commit: `c81e2bf2534febef9c5e49b39f60f85415f04ff1`
- New integration snapshot commit: `9d14a6a84e09f8f41d6acbd0231517f6fbd60b5e`
- The new commit has exactly one parent, PR #272 head `c81e2bf...`.
- GitHub compare confirms the new branch is exactly 1 commit ahead and 0 behind PR #272, with 137 changed files.
- PR #272 itself has not been modified.

### What was ported

The integration commit uses a Git tree built on the PR #272 tree and applies every file-level difference from the already-qualified construction snapshot `7199fe8315f98adc9549da6447751d50fc53cb42`. It applies 137 changed/added paths and preserves the one PR-head-only file `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md` rather than deleting it.

This is intentionally a complete validated construction-snapshot integration, not a narrowly issuer-only cherry-pick. The 137-file delta includes Authentication Issuer source, SQL cutover/rollback, auth lifecycle migrations, runtime/migrator principal work, security inventory/comparator scripts, CI qualification, and subsequent Actor Gateway/storage qualification and supporting changes already present in the validated snapshot. This avoids silently mixing an older PR Actor Gateway implementation with an issuer tested against a newer gateway contract. The trade-off is broader scope than an issuer-only PR; the resulting diff must be reviewed and kept as a separate draft integration PR until all tests pass.

The CI workflow was updated to include the new branch in its push triggers. The new branch was verified to contain that trigger.

### Fresh CI started

- Workflow run: [43434743430](https://github.com/zaidhqdev-sys/GHM/actions/runs/43434743430)
- Event: push
- Exact tested SHA at dispatch: `9d14a6a84e09f8f41d6acbd0231517f6fbd60b5e`
- Initial state at 13:34 UTC: queued.

This run validates the snapshot commit only. The present handover update will create a descendant commit and therefore requires its own exact-head CI run; do not treat run 43434743430 as validation of that later commit.

### Gates remain closed

- No production database operation or deployment.
- No merge.
- PR #272 remains open/draft and unchanged.
- No new issuer PR has been opened yet.
- Do not reuse construction-branch CI as proof for the stacked branch. Require fresh exact-head CI, including issuer pre/post inventory comparison and artifact retention.
- Because the integrated delta includes more than issuer-only changes, inspect the new branch's changed paths and test output before deciding whether to split it into narrower PRs.


## Stacked branch exact-head CI PASSED — 2026-11-13 13:38 UTC

### Exact handover-head workflow

- Branch: `construction/auth-issuer-stacked-on-pr272-20261113`
- Exact tested HEAD: `88fb9a153ed22ba0cd3eccd9c0058ffd3f975506`
- Workflow: [43434789412](https://github.com/zaidhqdev-sys/GHM/actions/runs/43434789412)
- Trigger: push
- Overall workflow: `success`
- `quality`: `success`, 65/65 steps
- `web-quality`: `success`, 11/11 steps
- Main test suite: 994 passed, 0 failed
- Comparator regression suite: 8 passed, 0 failed
- No failed workflow steps.

A preceding push run on parent snapshot commit `9d14a6a84e09f8f41d6acbd0231517f6fbd60b5e` also passed 65/65 quality steps and 11/11 web-quality steps. The latest run above validates the actual handover commit `88fb9a1`.

### Integrated issuer qualification

Disposable PostgreSQL 18.7 qualification passed:

- Issuer allow-list: 10 functions.
- Issuer direct relation privileges: 0.
- Runtime issuer-function denials: 19.
- Connect lookup compatibility: preserved.
- Registration/login/password rehash/concurrent reset/refresh/logout: passed.
- Recovery reset, replay protection and session revocation: passed.
- QuoteFlow migration reset: passed.
- Disposable privilege rollback: passed.
- Final disposable state: issuer cutover active for post-cutover inventory.
- Final Resource API runtime auth-function allow-list: 2.
- Issuer startup ACL verification, global/schema default ACL denials, unexpected direct function grant denials, SECURITY DEFINER owner/search_path checks, and no-PUBLIC-execution checks: passed.

### Exact-head pre/post inventory comparison

- Database: `ghm_disposable_test`, PostgreSQL 18.7.
- SECURITY DEFINER routines: 106 before and 106 after.
- Routine identity set: unchanged.
- Issuer ACL changes observed: 14.
- Non-issuer function definitions and ACLs: unchanged.
- Role memberships and role attributes: unchanged.
- Schema privileges: unchanged except reviewed issuer `ghm` USAGE grant.
- Issuer schema grant: USAGE only; CREATE denied.
- Database privileges, column privileges and function default ACLs: unchanged.
- Non-issuer preliminary findings: unchanged.
- `unexplainedNonIssuerChanges: 0`.
- Comparator decision: `STRUCTURAL_COMPARISON_PASSED; AUTH ISSUER ACLS REQUIRE DEDICATED CUTOVER QUALIFICATION`. The dedicated issuer cutover qualification immediately preceding this comparison passed, so the two scoped results together pass the issuer gate. The comparator does not independently grant global approval.

### Evidence artifact for exact handover commit

- Artifact ID: `14043681325`
- Name: `security-definer-authority-inventory`
- Run: `43434789412`
- [Download artifact from GitHub Actions](https://github.com/zaidhqdev-sys/GHM/actions/runs/43434789412/artifacts/14043681325)
- ZIP SHA-256: `b6a68ac5e8aef77ac517824c95135065793ea4e127919081c81c3d3b40a1938e`
- Contents: pre-cutover inventory, post-cutover inventory, comparison JSON.

### Remaining gates

This confirms the combined code snapshot on the stacked branch passes its exact-head disposable CI. It does not authorize production or merging.

- PR #272 remains unchanged, open and draft.
- The stacked integration branch includes 137 source-snapshot file changes plus the preserved PR-only Render handover and current branch/handover updates; it is broader than issuer-only.
- Next: inspect the complete 137-file PR diff and decide whether to keep as a coordinated integration PR or split independent storage/campaign work without changing tested behavior. Any resulting tree must receive fresh exact-head CI.
- Production-only inventory, the 58 preliminary whole-database findings, and Project↔Opportunity reconciliation remain outstanding before any production cutover.
- PayFast remains out of implementation scope; the workflow's commercial settlement check was confined to disposable PostgreSQL and did not contact PayFast.
- No production DB changes, Render deployments, merges, or PR #272 metadata changes were made.


## Draft stacked PR opened — 2026-11-13 13:41 UTC

Created draft PR [#276 — feat(security): stack isolated Authentication Issuer on Actor Gateway](https://github.com/zaidhqdev-sys/GHM/pull/276).

- Head branch: `construction/auth-issuer-stacked-on-pr272-20261113`
- Head at PR creation: `cc926fa5991ee393ab5222f0ca62cc2d621be183`
- Base: PR #272 head branch `integration/capability-gateway-qualification-20261110`
- Base SHA: `c81e2bf2534febef9c5e49b39f60f85415f04ff1`
- Draft/open/unmerged.
- PR #272 remains open/draft and unchanged.
- PR #276 is explicitly dependent on #272 and must not merge independently of it.
- PR creation response reported mergeable=false at creation time; no mergeability or merge approval is inferred from that field.

The exact PR-head-at-creation SHA `cc926fa...` passed [push CI run 43435341377](https://github.com/zaidhqdev-sys/GHM/actions/runs/43435341377): quality 65/65, web-quality 11/11, 994 main tests passed, 8 comparator tests passed, disposable issuer qualification passed, 106 pre/post SECURITY DEFINER routines unchanged, 14 reviewed issuer ACL changes, and zero unexplained non-issuer changes. Artifact `14044006709`, ZIP SHA-256 `d4ec21cdd4c276267893bc53e5e53c8659d8a199acd18d69cc69ac2bc7793d63`.

This handover update will advance the PR head and trigger another push/PR CI run. The PR-created SHA's successful push run remains valid for that exact SHA only; require the new head's own checks before treating PR #276 as fully green.

The PR deliberately exposes the full 137-file coordinated snapshot delta (14,370 additions / 1,114 deletions) for scope review. It is broader than an issuer-only PR because the isolated issuer depends on the later qualified Actor Gateway/storage snapshot. Do not hide or silently drop those supporting changes. If scope is split, rerun exact-head qualification on each resulting integration state.

Production inventory, the 58 preliminary whole-database findings, and Project↔Opportunity reconciliation remain outstanding release gates. No production DB changes, Render deployment, merge, or traffic switch occurred.


## PR #276 exact-head CI and mergeability confirmation — 2026-11-13 13:44 UTC

The handover update/PR-creation commit `79392fe7d75d59b5e053789cefa3f6b95f46f941` has now passed its own exact-head push workflow:

- [Run 43435858656](https://github.com/zaidhqdev-sys/GHM/actions/runs/43435858656)
- Workflow conclusion: success.
- Quality: 65/65 steps passed.
- Web quality: 11/11 steps passed.
- Main suite: 994 passed, 0 failed.
- Comparator suite: 8 passed, 0 failed.
- Disposable issuer lifecycle/cutover/rollback qualification: passed.
- Pre/post SECURITY DEFINER inventory: 106 routines before and after; 14 reviewed issuer ACL changes; zero unexplained non-issuer changes.
- Artifact ID: `14041949062`
- Artifact ZIP SHA-256: `76115fcbab0ebaa58522b72b18a9eda84a075fde60bbfd042c5863ad75a2363a`.

Live PR metadata rechecked:
- PR #276 is open and draft, head `79392fe...`, base `c81e2bf...`, 137 changed files, and GitHub now reports `mergeable: true`.
- PR #272 remains open and draft at unchanged head `c81e2bf...`, based on main `ad4fea43...`.
- Mergeability true is GitHub's conflict assessment only; it is not approval to merge.

This confirms the PR-created head and its first handover update. No merge or deployment was performed. Production gates remain unchanged.


## Exact-head qualification completed — 2026-11-13 13:56 UTC

PR #276 head `6942986319a5b62ae511b426ee43b3637a991a28` completed [push workflow 43436320011](https://github.com/zaidhqdev-sys/GHM/actions/runs/43436320011) successfully.

- Quality: 65/65 steps passed.
- Web quality: 11/11 steps passed.
- Main Node test suite: 994 passed, 0 failed, 0 skipped.
- Additional post-suite Node checks: 4 passed, 0 failed.
- Security-definer comparator tests: 8 passed, 0 failed.
- Provenance/target-isolation tests: 15 passed, 0 failed.
- Disposable PostgreSQL 18.7 issuer cutover/lifecycle checks completed, including issuer allow-list (10), zero direct relation privileges, 19 runtime issuer function denials, final runtime auth allow-list (2), startup ACL verification, global/schema default-ACL denials, unexpected direct-function grant denials, safe SECURITY DEFINER owner/search_path checks, no PUBLIC SECURITY DEFINER execution, and disposable rollback.
- Pre/post catalog inventory: 106 SECURITY DEFINER routines on both sides; same routine identity set; 14 reviewed issuer ACL changes; non-issuer function definitions/ACLs unchanged; role memberships/attributes, database privileges, column privileges and function default ACLs unchanged; only reviewed schema delta was `ghm_auth_issuer` USAGE (CREATE denied); zero unexplained non-issuer changes.
- Comparator decision: `STRUCTURAL_COMPARISON_PASSED; AUTH ISSUER ACLS REQUIRE DEDICATED CUTOVER QUALIFICATION`. The dedicated disposable issuer cutover qualification passed separately.
- Audit's broad preliminary-finding count changed from 62 pre-cutover to 58 post-cutover because issuer function grants move from `ghm_runtime` to `ghm_auth_issuer`; do not interpret the raw count delta as four unrelated findings fixed. Comparator explicitly isolates issuer changes and reports non-issuer preliminary findings unchanged.
- Artifact: [14043473438](https://github.com/zaidhqdev-sys/GHM/actions/runs/43436320011/artifacts/14043473438), `security-definer-authority-inventory.zip`, 80,050 bytes; ZIP SHA-256 `e1b3a5833bc4705db428c0af2ace3f60d5f90ab5466c2e13186440b0b3a9722a`. Retrieved and inspected its three JSON reports (pre-cutover inventory, post-cutover inventory, comparator).

All qualification above ran against `ghm_disposable_test` on disposable PostgreSQL 18.7. It does not establish production state or authorize production changes. The inventory report explicitly records `mutation: false` and `REVIEW_REQUIRED_NO_AUTOMATIC_APPROVAL`.

PR #276 remains open/draft and unmerged; base PR #272 remains open/draft at `c81e2bf2534febef9c5e49b39f60f85415f04ff1`. No Render deployment, production DB mutation, merge, or traffic switch occurred.

## Next gate: production-only read-only inventory

Proceed by identifying the existing Render `ghm-db` production Postgres instance and executing only the reviewed, read-only catalog inventory against that existing database. Do not create services/databases, deploy, alter roles/ACLs, run migrations, or execute cutover/rollback SQL. Capture server/database/session identity and compare production evidence to the disposable qualification without assuming they match. Production SECURITY DEFINER findings and Project↔Opportunity reconciliation remain separate release gates.


## Production ghm-db read-only catalog inventory — 2026-11-13 13:58 UTC

Executed a catalog-only SQL inventory through Render's read-only Postgres query operation against the existing production Render database. This did not use the local-only audit script (which deliberately refuses non-local targets); the catalog SELECTs were adapted into a single read-only query and returned production identity plus role, membership, SECURITY DEFINER, schema, database, column, and function-default-ACL inventories.

**Target identity verified from Render and from the SQL connection**
- Render service: `ghm-db`, resource `dpg-dag0sdtbedkc7389vi2g-a`
- Database: `ghm_db`
- PostgreSQL: 18.6
- Session identity: `session_user=ghm_app_user`, `current_user=ghm_db_user`
- Capture time: 2026-11-13 13:58 UTC
- Render status: available, Frankfurt, existing primary database.
- Query was read-only; no role, ACL, schema, data, migration or deployment changes were made.

**Important production findings — release gate remains closed**
1. `ghm_db_user` still has `CREATEROLE=true` and `CREATEDB=true`.
2. `ghm_db_user` has `ADMIN OPTION` memberships in `ghm_actor_gateway`, `ghm_migrator`, `ghm_payment_provider`, `ghm_runtime`, and `ghm_schema_owner`. Those memberships have `INHERIT OPTION=false` and `SET OPTION=false`, but ADMIN OPTION is still present and is the grant/revoke authority issue previously escalated to Render support. This is not fixed by lack of SET ROLE.
3. `ghm_app_user` is a member of `ghm_db_user` with `INHERIT OPTION=true` and `SET OPTION=true`; query connection resolves `current_user=ghm_db_user`. This effective connection identity must be accounted for in the authority model.
4. Production does not currently list a `ghm_auth_issuer` role. The `ghm` schema ACL grants USAGE to `ghm_runtime` and `ghm_payment_provider`, not `ghm_actor_gateway` or `ghm_auth_issuer`. Therefore the isolated issuer cutover is not present in production and must not be inferred from disposable qualification.
5. SECURITY DEFINER inventory: 63 routines (versus 106 in the disposable post-issuer qualification snapshot); 49 routines have non-owner EXECUTE grants/effective non-owner execution; 0 have PUBLIC EXECUTE; 58 do not have the exact pinned `search_path=pg_catalog, ghm, pg_temp` used by the qualification policy; all 63 use trusted languages.
6. Column ACL inventory: 188 columns with explicit ACLs.
7. Function default ACL rows include global defaults owned by `postgres`, including PUBLIC EXECUTE. These are distinct from the GHM schema-owner defaults and require provenance/owner review; do not automatically classify them as a GHM grant.
8. `public` schema has PUBLIC USAGE and `ghm_db_user` CREATE/USAGE. `ghm` schema owner is `ghm_schema_owner`; its direct ACL currently grants USAGE to `ghm_runtime` and `ghm_payment_provider`.

The production findings are a baseline, not a remediation instruction. Do not run the disposable cutover/rollback against production. First reconcile the production migration ledger and exact role provenance, then build a production-specific approved privilege plan that addresses the Render-managed role membership/ADMIN OPTION issue. Any production privilege mutation requires a separately reviewed, explicit cutover window and verified backup/rollback path. No production change is authorized by this inventory.

## Next read-only checks

- Identify the production migration ledger table and compare applied migration IDs/checksums to the repository without modifying the ledger.
- Reconcile production Project↔Opportunity links and orphans as a separate read-only report.
- Compare the complete production SECURITY DEFINER signatures and ACLs against the migration history and approved function allow-list; the 63-vs-106 count is a material divergence to explain, not a pass/fail conclusion by itself.


## Production migration-ledger access and Project↔Opportunity reconciliation — 2026-11-13 14:00 UTC

Additional read-only checks against the same verified production `ghm_db` target:

**Migration ledger**
- Catalog inspection confirms `ghm.ghm_schema_migrations` exists with columns `version`, `name`, `checksum`, and `applied_at`.
- The Render read-only query connection has `session_user=ghm_app_user`, `current_user=ghm_db_user`. A SELECT of the ledger rows was denied with PostgreSQL SQLSTATE `42501` (permission denied for table `ghm_schema_migrations`).
- No attempt was made to SET ROLE, bypass the ACL, or use another credential. Production migration IDs/checksums therefore remain unverified through this read-only connection. Next evidence path is a read-only session authenticated as the already-provisioned migration principal, using the existing credential workflow; do not change grants just to make the audit query work.

**Project↔Opportunity production-only reconciliation**
- Read-only counts succeeded against `ghm.project` and `ghm.opportunity`; both tables have SELECT available to the query's effective database role and neither has row-level security enabled.
- Production counts: 0 Projects, 0 Opportunities, 0 linked Projects, 0 Projects without an Opportunity, 0 dangling Project→Opportunity references, and 0 Opportunities without a Project.
- Cross-check: production currently contains 22 `account_identity` rows and 16 `business` rows; `customer` and `quote` each have 0 rows.
- This is a clean zero-row reconciliation for these two tables at capture time, not evidence that the application workflow is fully reconciled. It does not validate the Project creation API or explain why production currently has no Project/Opportunity rows.

**More precise SECURITY DEFINER path inventory**
- The 58 routines outside the exact qualified search path are mostly set to `search_path=pg_catalog, ghm`; two observed variants are `ghm, pg_temp` and `ghm, pg_catalog`. The exact required hardened value `pg_catalog, ghm, pg_temp` is absent on those 58 routines.
- 49 routines have non-owner EXECUTE access (principally `ghm_runtime`; selected payment functions to `ghm_payment_provider`; external mapping lookup also to `ghm_migrator`). No PUBLIC EXECUTE was observed among the 63 SECURITY DEFINER routines.
- Treat this as production remediation scope requiring signature-by-signature owner/consumer review. Do not bulk-revoke runtime access or bulk-rewrite function search paths without dependency analysis and a tested migration/rollback.

No production data, role, ACL, schema, migration, or service changes were made.


## Production gateway/issuer deployment gap confirmed — 2026-11-13 14:01 UTC

A focused production catalog query confirmed:
- `ghm.gateway_*` routines: 0.
- SECURITY DEFINER `ghm.gateway_*` routines: 0.
- `ghm.gateway_storage_*` routines: 0.
- `ghm.auth_*` routines: 29 (all 29 SECURITY DEFINER).
- `ghm.storage_*` routines: 6.

Together with the absence of the `ghm_auth_issuer` role and the absence of `ghm_actor_gateway` USAGE on schema `ghm`, production is still on the pre-gateway/pre-issuer database contract. The existence of the `ghm_actor_gateway` role alone is not evidence that the gateway SQL contract is deployed or usable. Do not point Connect or QuoteFlow at gateway/issuer endpoints until the dependent database cutovers have been separately qualified and deliberately deployed.

This is a production-vs-qualification divergence, not a CI failure. The disposable branch qualification must not be described as production-ready.


## Render role-authority design conflict — 2026-11-13 14:03 UTC

Cross-checked the live production membership graph against the actual source migration guards and the prior Render support handover.

- The production read-only connection authenticated as `ghm_app_user` but resolved `current_user=ghm_db_user`.
- `ghm_app_user` has `ghm_db_user` membership with `INHERIT OPTION=true` and `SET OPTION=true`.
- `ghm_db_user` is `CREATEROLE=true`, `CREATEDB=true`, and has `ADMIN OPTION=true` memberships over `ghm_actor_gateway`, `ghm_migrator`, `ghm_payment_provider`, `ghm_runtime`, and `ghm_schema_owner`.
- The Actor Gateway principal-guard migration (`20261110210000_add_actor_gateway_principal_guard.sql`) explicitly requires the bounded `ghm_db_user → ghm_actor_gateway` ADMIN OPTION membership.
- The Authentication Issuer manual cutover (`20261112010000_authentication_issuer_privilege_cutover.sql`) also explicitly requires `ghm_db_user → ghm_auth_issuer` ADMIN OPTION membership.

This means the currently authored database architecture continues to depend on the Render-managed `ghm_db_user` as administrator of application principals, and the legacy `ghm_app_user → ghm_db_user` SET-capable path remains. That conflicts with the Render support recommendation already recorded in the 2026-11-12 grant-authority handover: move normal application execution to SQL-created login(s) outside the Dashboard-managed credential list.

**Release blocker / design decision required:** before any production Actor Gateway or Authentication Issuer cutover, revise and requalify the role-administration model so the normal application credential cannot SET ROLE into a CREATEROLE/CREATEDB database administrator, and the runtime principal cannot re-grant or administer gateway/issuer/migrator/owner memberships. The deployment/migration authority must be separately provisioned and controlled, without relying on the ordinary app credential's role chain. Do not simply remove the membership in production: the current migrations explicitly guard for it, and the service/migration credential dependencies must first be reworked and qualified.

The existing Render support escalation and its recommendation remain part of the evidence. No attempt was made to SET ROLE, alter memberships, change credentials, or bypass the ledger ACL during this audit.


## Corrected production role-membership provenance — 2026-11-13 14:05 UTC

A second, more granular catalog query included membership grantors and PostgreSQL's effective `pg_has_role(..., 'SET')` results. This refines the earlier summary and must be used instead of a simplified one-row-per-role description.

**Exact production membership rows**
- `ghm_app_user → ghm_db_user`: granted by `postgres`, `INHERIT=true`, `SET=true`, `ADMIN=false`.
- `ghm_db_user → ghm_runtime`: there are TWO distinct membership rows:
  1. granted by `ghm_db_user`, `INHERIT=true`, `SET=true`, `ADMIN=false`;
  2. granted by `postgres`, `INHERIT=false`, `SET=false`, `ADMIN=true`.
- PostgreSQL's effective membership check confirms both `ghm_db_user` and `ghm_app_user` can SET ROLE to `ghm_runtime`. The first row is the direct SET-capable path; the second is the separately administered ADMIN OPTION path.
- `ghm_db_user → ghm_actor_gateway`, `ghm_migrator`, `ghm_payment_provider`, and `ghm_schema_owner`: each has a `postgres`-granted `ADMIN=true`, `INHERIT=false`, `SET=false` row.
- `ghm_migrator → ghm_schema_owner`: granted by `ghm_db_user`, `INHERIT=false`, `SET=true`, `ADMIN=false`. This is the intended migration DDL owner path and is separate from the normal application login.

**Implications**
1. The prior shorthand that `ghm_db_user` has only a non-SET membership into `ghm_runtime` was incomplete: the duplicate grantor-specific rows make its effective SET privilege true. The same applies to `ghm_app_user` through its SET-capable membership into `ghm_db_user`.
2. The ADMIN OPTION memberships granted by `postgres` do not themselves permit SET ROLE under their recorded `SET=false` options, but they confer grant/revoke authority over the target roles. This is a separate risk from SET ROLE.
3. The migration principal has a narrower intended path: it can SET ROLE to the non-login `ghm_schema_owner`, while its own table SELECT on `ghm_schema_migrations` is false. The schema owner itself has SELECT on that table, but the Render read-only query connector cannot choose an alternate session role or credentials.
4. The production ledger is therefore not accessible through the available Render query action without a separate authorized connection as `ghm_schema_owner` (or another explicitly provisioned read-only audit principal). No attempt was made to assume role or alter grants.

This correction is based on exact `pg_auth_members` grantor rows and PostgreSQL effective-role checks, not an inference from membership names.
