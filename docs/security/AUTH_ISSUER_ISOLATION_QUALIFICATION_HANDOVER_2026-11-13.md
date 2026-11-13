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


## Role-setting verification and application-login separation plan — 2026-11-13 14:06 UTC

### Role-level setting confirmed

A read-only query of `pg_db_role_setting` confirmed the exact Render-managed setting:

```
role_name     = ghm_app_user
database_name = ALL DATABASES
setting       = role=ghm_db_user
```

This explains why a connection authenticated as `ghm_app_user` resolves to `current_user=ghm_db_user`. It is not merely a transient SET ROLE in the connection pool; it is a role-level setting configured for all databases. Do not attempt to clear this setting using the application connection: the setting is part of the Dashboard-managed default-user arrangement and must be handled through the Render administrator/rotation workflow.

### Render support recommendation already confirmed

The 2026-11-12 Render support handover records explicit support confirmation that normal application execution should move to SQL-created login(s) outside the Dashboard-managed credential list. Render also explained that SQL-created roles will not appear in the Dashboard/API and their credentials must be supplied to services through their own environment variables. Dashboard-managed credentials remain for database administration.

### Intended target shape — design only, no production mutation

The target must preserve the existing service count and database. It does not require a new paid database or Render service.

- Retain a controlled Render-managed default administrator for Dashboard operations and recovery only.
- Use SQL-created, service-specific LOGIN roles for normal application connections, each with no SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, or ADMIN OPTION over protected roles.
- Where appropriate, grant a SQL-created application login membership in a NOLOGIN privilege role such as `ghm_runtime` using `INHERIT TRUE, SET FALSE`; that login inherits only the runtime's measured privileges and cannot SET ROLE into the privilege role. First qualify exact PostgreSQL 18 semantics and all direct grant paths.
- Keep Actor Gateway, Authentication Issuer and Payment Provider as separate principals with their own exact function allow-lists; PayFast remains paused.
- Keep `ghm_migrator` as the only application-adjacent migration login, with its explicit `SET ROLE ghm_schema_owner` path. Do not provide the migration credential to normal runtime services.
- Make `ghm_runtime` NOLOGIN only after every runtime consumer has moved to its own SQL-created login and the existing runtime direct grants have been reconciled. This is a later, separately qualified step, not an immediate change.
- Remove the `ghm_app_user` role setting/default-user relationship and legacy `ghm_app_user → ghm_db_user` path only through Render's supported administrator replacement/rotation sequence, after an independent Dashboard administrator and recovery path have been verified.
- Resolve bootstrap `postgres`-granted ADMIN OPTION memberships through the provider/bootstrap authority path. Do not infer that the ordinary application connection can revoke them or assume the target roles.

This plan is consistent with the existing role-separation runbook and Render support response. It is not executable SQL, has not been applied to production, and does not authorize changes to Render credentials or services.

### Current Render service inventory (metadata only)

The Render workspace service listing was inspected without reading environment-variable values:
- `GHM-Internal-Runtime` is the current production GHM Resource API service, Frankfurt, with auto-deploy off.
- `ghm-identity-qualification`, `ghm-payfast-sandbox-runtime`, and `ghm-payfast-callback-sandbox` are legacy qualification/sandbox services and are not the production migration target.
- No new Render service or database was created. No service environment variables, deploy settings, credentials, or deployments were changed.

### Exact-head CI at this handover update

- Run [43438702236](https://github.com/zaidhqdev-sys/GHM/actions/runs/43438702236), head `5d5dcf1`: quality 65/65 and web-quality 11/11 passed.
- Run [43438756496](https://github.com/zaidhqdev-sys/GHM/actions/runs/43438756496), head `b4dc44a`: quality 64/64 and web-quality 11/11 passed.
- Latest handover head `9eff7cee58ef8e82f185d6b63c3d8da46bf7c2a0`, run [43439277662](https://github.com/zaidhqdev-sys/GHM/actions/runs/43439277662): web-quality 11/11 passed; quality is in progress at the signed Connect Business provisioning qualification step (33/64 steps passed, no failures reported).
- Prior run [43438965542](https://github.com/zaidhqdev-sys/GHM/actions/runs/43438965542), head `7e3d895`: web-quality 11/11 passed; quality remains in progress (48/64 at the Business Logo gateway qualification step, no failures reported).

Do not claim the latest exact-head quality job has passed until run 43439277662 completes. Earlier successful exact-head runs do not supersede the current handover commit's run.


## Production ghm_runtime privilege baseline and code-path reconciliation — 2026-11-13 14:10 UTC

A further read-only catalog inventory measured the already-existing production `ghm_runtime` principal directly, rather than assuming its grants from the disposable database.

### Runtime principal attributes and effective authority

- `ghm_runtime` is LOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS.
- It has zero direct role memberships; two roles are direct members of it (the bootstrap `ghm_db_user` administration membership and the corresponding protected membership record).
- It has database CONNECT, no database CREATE, `ghm` schema USAGE, and no schema CREATE.
- It can execute 46 SECURITY DEFINER functions in `ghm`.
- It has privileges on 39 tables and 39 sequences in `ghm`.
- It has no direct path from `ghm_runtime` to `ghm_migrator` or `ghm_schema_owner` through membership (zero direct memberships).

The production runtime role itself is a plausible replacement connection identity for the application from a *role-attribute/connection* perspective, but its current object/function grants are not yet the post-cutover security boundary. Do not equate the safe role attributes with a completed application authority cutover.

### Critical production function inventory

The production runtime still has direct EXECUTE on legacy functions that the current repository source has moved behind signed Actor Gateway wrappers, including:

- 14 authentication lifecycle/enrollment operations (the manual issuer cutover remains unapplied).
- Campaign create/update and owner directory-review presentation legacy functions.
- Five private storage metadata lifecycle functions.
- Business registration identity, capability governance, Business Capability, Saved Business, Business Hours, Trust Score and Business Logo legacy functions.
- Other currently required runtime readers/operations.

The runtime also has direct table/sequence privileges across the existing production `ghm` schema; the exact ACL listing was captured by the production catalog query and must be reconciled signature-by-signature and relation-by-relation against the intended cutover stages before changing connection credentials or revoking grants.

### Source/runtime configuration cross-check

Current branch `src/config.ts` already requires `GHM_RUNTIME_DATABASE_URL` in production; `src/db/pool.ts` uses that configured URL. It does not require the Render-managed `DATABASE_URL` in production. The prior production connection identity `session_user=ghm_app_user/current_user=ghm_db_user` therefore means the configured `GHM_RUNTIME_DATABASE_URL` currently resolves to the managed credential/role path, or the inspected running deployment is not yet on this branch's runtime config. The actual Render environment-variable values were not retrieved or exposed during this audit.

Current `src/db/runtime-principal.ts` deliberately fails startup unless both `session_user` and `current_user` are exactly `ghm_runtime`, with no elevated role attributes, no schema/database CREATE, and no untrusted membership path. This confirms the intended runtime credential target is the existing SQL-created `ghm_runtime` login (or a separately qualified SQL-created login with an intentionally revised contract), not `ghm_app_user`/effective `ghm_db_user`.

### Migration principal dependency that must be corrected in design

Current `src/db/migrate.ts` and `src/db/migrator-principal.ts` explicitly expect `ghm_db_user` to retain ADMIN OPTION memberships over `ghm_migrator` and `ghm_schema_owner` (with INHERIT/SET false). They also expect the dedicated `ghm_migrator → ghm_schema_owner` SET path.

This is the remaining design coupling to the Render-managed administrator. It does not mean the migrator needs to SET ROLE into `ghm_db_user`; rather, the migration startup contract insists that the provider-managed admin membership rows exist. Before any bootstrap-membership cleanup, revise this guard to an authority model that no longer requires normal application identity or its default-role chain to administer the migration/owner roles. Preserve the migrator's own exact owner SET path and ensure only the provider/bootstrap authority can provision/rotate the migration credential.

### Safe sequencing conclusion

1. Keep the current production connection and all grants untouched while the exact runtime ACL allow-list is reconciled.
2. Complete the signed Actor Gateway / Authentication Issuer / storage / other manual cutover qualifications against the exact production catalog baseline. Production currently still exposes legacy direct runtime EXECUTE paths.
3. Revise and qualify the migrator guard and provider-admin bootstrap model so `ghm_db_user` ADMIN OPTION is no longer a permanent application architecture prerequisite.
4. Confirm the exact Render runtime credential key and deployment commit without exposing secret values; only then plan the service connection change to a SQL-created restricted login.
5. The runtime connection switch and legacy grant revocations must be coordinated as one versioned, rollback-tested cutover. A connection-only change before the production ACL cutovers would leave direct legacy functions callable by the runtime login; revoking them before the corresponding application/gateway deployment would break live operations.

No production credentials, role attributes, role memberships, ACLs, table/sequence grants, functions, data, migrations, environment variables or deployments were changed.


## Migration authority guard decoupling — 2026-11-13 14:16 UTC

The production role graph and Render support finding exposed a source-level coupling: `src/db/migrate.ts` and its identity verifier required `ghm_db_user` ADMIN OPTION membership over both `ghm_migrator` and `ghm_schema_owner`. This made the provider-managed Dashboard administrator a permanent migration-runner prerequisite, even though the intended authority path is the dedicated `ghm_migrator → ghm_schema_owner` SET membership.

### Source correction on the stacked construction branch

- The migration runner no longer references `ghm_db_user` or requires a Dashboard-admin membership over `ghm_migrator`.
- The migrator must have exactly one direct membership: the explicit `ghm_schema_owner` membership with `ADMIN=false`, `INHERIT=false`, `SET=true`.
- No other role may be a member of `ghm_migrator`.
- `ghm_schema_owner` must have exactly one member (the migrator) and no direct memberships of its own.
- The migrator retains no direct schema or relation privileges; after verification it explicitly SETs `ghm_schema_owner` and verifies the resulting effective identity.
- Disposable CI bootstrap was changed so `ghm_db_user` receives trusted ADMIN OPTION memberships only for runtime, Actor Gateway, Authentication Issuer and Payment Provider principals; it is no longer granted membership over the migrator or schema owner.
- Unit and source-contract tests now encode the isolated migrator/owner-only relationship.

### Validation state

The first CI attempts on intermediate sequential commits failed during TypeScript build because the unit-test fixture still described the removed admin membership fields. That fixture and the source-contract assertions were corrected. The current exact-head workflow is [43441019084](https://github.com/zaidhqdev-sys/GHM/actions/runs/43441019084) on `20a48eb0096c6897b06a20a1181dedfd50c12658`; at the time of this handover update it is still running, with no failures reported. Do not call this change qualified until the exact final head passes the complete PostgreSQL 18 migration and security qualification.

### Production boundary

This is source and disposable-CI work only. It does not remove the existing production postgres-granted memberships, change production roles or ACLs, provision/rotate migration credentials, change Render configuration, or run migrations against `ghm_db`. Production migration-ledger SELECT remains blocked through the currently available read-only Render connection. A separately authorized migration/audit credential path and provider/bootstrap authority plan are still required before production membership cleanup.

No production role, membership, ACL, data, migration ledger, credential, Render environment, deployment, or traffic was changed.


## Production SECURITY DEFINER and relation ACL snapshot refreshed — 2026-11-13 14:17 UTC

A new read-only query was run against the Render production database `ghm_db`. The connection reported `session_user=ghm_app_user` and `current_user=ghm_db_user`. The query did not change roles, grants, data or schema.

### Exact production SECURITY DEFINER counts

- 63 SECURITY DEFINER routines exist in schema `ghm`.
- `ghm_runtime` can EXECUTE 46.
- `ghm_actor_gateway` can EXECUTE 0.
- `ghm_auth_issuer` does not exist in the production role catalog; issuer EXECUTE is therefore 0.
- `ghm_migrator` can EXECUTE 2.
- PUBLIC EXECUTE is present on 0 routines.
- Only 5/63 have the exact hardened `search_path=pg_catalog, ghm, pg_temp`; 58/63 do not.

This confirms the production database is still on the pre-Actor-Gateway/pre-Authentication-Issuer contract. The 46 runtime function grants remain a live compatibility/security boundary; do not bulk-revoke them before the gateway/issuer services and application routing are actually deployed.

### Exact production relation ACL counts

- Runtime has privileges on 39 GHM tables/views and 39 sequences.
- The table ACLs are not blanket write access: the observed direct runtime writes are INSERT on `business`, `business_membership`, and `opportunity`; UPDATE on `opportunity`; and DELETE on `opportunity_capability_requirement`. The other listed relations are SELECT-only.
- All 39 sequences have USAGE; 10 also have SELECT; none have UPDATE.

The complete per-signature function list and per-relation ACL rows were returned by the read-only catalog queries during this session. These are current production observations, not a proposed grant plan. Each function and relation still needs an explicit source-consumer disposition before any cutover.

### Important sequencing consequence

The production database has no gateway EXECUTE grants and no issuer role, while the source candidate already expects gateway/issuer principals and has manual-only cutover SQL. A source/CI pass cannot be treated as a production deployment or migration. Keep the current Resource API production credential and grants unchanged until:
1. the exact production ACL inventory is mapped to current application call sites and the approved post-cutover allow-lists;
2. the issuer/gateway hosting and network boundary is feasible within the existing service/cost constraints;
3. a separately authorized migrator/audit credential can inspect the migration ledger and execute only the approved migration plan;
4. the provider/bootstrap role authority and verified backup/rollback path are settled.

No production roles, memberships, ACLs, function definitions, search paths, relation grants, migration ledger rows, credentials, Render settings, deployments, application data or traffic were changed.


## Migrator contract test correction — 2026-11-13 14:18 UTC

The exact-head CI run `43441019084` reached the full test suite and reported one failure in the migration source-contract test: two assertions still expected the removed Dashboard-admin membership predicates. The migrator implementation and TypeScript build had passed; 993/994 tests passed.

Those stale assertions were removed from `src/db/migrator-principal-contract.test.ts`. The independent fixture was also updated to the new exact contract (zero members of `ghm_migrator`, one member of `ghm_schema_owner`, and only the `ghm_migrator → ghm_schema_owner` SET path).

The correction is on the same stacked construction branch. The new exact-head workflow is pending; no qualification claim is made until its final quality and web-quality jobs pass.


## Production role graph and runtime function allow-list comparison — 2026-11-13 14:19 UTC

A follow-up read-only production catalog check confirmed the current role graph and compared the exact `ghm_runtime` SECURITY DEFINER EXECUTE set to the candidate source's `RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS`.

### Current production migrator/owner membership rows

- `ghm_db_user → ghm_migrator`: grantor `postgres`, ADMIN=true, INHERIT=false, SET=false.
- `ghm_db_user → ghm_schema_owner`: grantor `postgres`, ADMIN=true, INHERIT=false, SET=false.
- `ghm_migrator → ghm_schema_owner`: grantor `ghm_db_user`, ADMIN=false, INHERIT=false, SET=true.
- `ghm_app_user → ghm_db_user`: grantor `postgres`, ADMIN=false, INHERIT=true, SET=true.
- `ghm_migrator` has database CONNECT, no database CREATE, no `ghm` schema USAGE/CREATE, and no direct relation grants.
- `ghm_schema_owner` is NOLOGIN, has database CREATE, and owns schema `ghm`.

The new migrator guard intentionally rejects the current production graph because the two postgres-granted Dashboard-admin memberships remain. This is the expected fail-closed result until Render/provider bootstrap authority removes those memberships through its supported process. The direct migrator-to-owner SET path remains intact. No membership was changed.

### Runtime function allow-list discrepancy

The exact production runtime set contains 46 SECURITY DEFINER EXECUTE grants. The candidate source's reviewed pre-manual-cutover baseline contains 43 signatures.

Set comparison found:
- 12 production signatures absent from the source baseline:
  - `ghm.auth_bootstrap_external_identity(text,text,text,text)`
  - `ghm.auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)`
  - `ghm.auth_disable_account(bigint)`
  - `ghm.auth_link_business_external_mapping(text,text,bigint)`
  - `ghm.auth_link_external_identity(text,text,bigint)`
  - `ghm.auth_provision_migration_account(text,text,text,text)`
  - `ghm.auth_read_account_email(bigint)`
  - `ghm.auth_read_connect_identity_authority(bigint)`
  - `ghm.auth_register_quoteflow_migration_reset_enrollment(bigint,text,text,text,text,text)`
  - `ghm.auth_revoke_all_sessions_for_account(bigint,text)`
  - `ghm.auth_revoke_session(bigint,text)`
  - `ghm.update_business_profile(bigint,bigint,jsonb)`
- 9 signatures in the source baseline are absent from production:
  - `ghm.auth_redeem_recovery_with_count(bytea)`
  - `ghm.auth_rehash_password_if_unchanged(bigint,text,text,integer,integer,integer)`
  - `ghm.auth_reset_password_with_recovery(bytea,text,text,integer,integer,integer)`
  - `ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)`
  - `ghm.get_public_business_hours(bigint)`
  - `ghm.get_public_trust_score(bigint)`
  - `ghm.list_public_trust_scores(text)`
  - `ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer)`
  - `ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)`

This is not a simple count adjustment: the function sets differ materially in both directions. Do not enable `GHM_RUNTIME_FUNCTION_ALLOWLIST_ENFORCED`, deploy the candidate startup contract, or revoke functions until each difference is traced to its migration provenance, source consumer and intended gateway/issuer cutover stage. The production runtime remains on its old live deployment, and the allow-list enforcement must remain disabled until this reconciliation is complete.

No production function, grant, role, membership, search path, data, credential, service setting, deployment or traffic was changed.


## Source-to-production runtime function difference disposition — 2026-11-13 14:20 UTC

The 12 production-only runtime functions and 9 source-baseline-only functions have now been traced to the candidate migration/cutover tree. The function-set divergence is explained by the production catalog being on an earlier schema/ACL state than the construction branch; it is not yet proof of which migration versions are recorded in the production ledger.

### Production-only signatures — intended revocation path

| Production-only function(s) | Candidate disposition |
|---|---|
| `auth_bootstrap_external_identity` | Migration `20261111260000_revoke_runtime_external_identity_bootstrap.sql` |
| `auth_change_password`, `auth_disable_account`, `auth_revoke_session` | Migration `20261111220000_revoke_unused_auth_runtime_entry_points.sql` |
| `auth_link_external_identity` | Migration `20261111250000_revoke_runtime_external_identity_link.sql` |
| `auth_provision_migration_account` | Migration `20261111240000_revoke_runtime_quoteflow_migration_provisioning.sql` |
| `auth_register_quoteflow_migration_reset_enrollment` | Migration `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql` |
| `update_business_profile` | Migration `20261110270000_gateway_business_profile_update.sql` |
| `auth_link_business_external_mapping` | Manual Authentication Issuer cutover `20261112010000_authentication_issuer_privilege_cutover.sql` |
| `auth_read_account_email`, `auth_read_connect_identity_authority`, `auth_revoke_all_sessions_for_account` | Conditional legacy-authority revocations in the same manual Authentication Issuer cutover |

### Source-baseline-only signatures — candidate creation path

| Source-only function(s) | Candidate creation migration |
|---|---|
| `auth_redeem_recovery_with_count` | `20261111230000_add_token_bound_recovery_revocation_result.sql` |
| `auth_rehash_password_if_unchanged` | `20261112030000_add_conditional_password_rehash.sql` |
| `auth_reset_password_with_recovery` | `20261112020000_add_token_bound_password_recovery_reset.sql` |
| `create_capability_draft`, `update_capability_draft`, `transition_capability_lifecycle` | `20261110160000_add_admin_capability_catalogue_governance.sql` |
| `get_public_business_hours` | `20261111140000_add_business_hours_read_projections.sql` |
| `get_public_trust_score`, `list_public_trust_scores` | `20261111170000_add_trust_score_read_projections.sql` |

### Disposition

The source/migration paths account for every member of the 12/9 set difference. This narrows the issue from an unexplained ACL mismatch to a production migration/cutover reconciliation gate. It does **not** establish that all candidate migrations are applied or that the manual issuer cutover is safe to run. Production ledger rows/checksums remain unreadable via the available Render query identity, so exact applied-version provenance is still blocked.

Do not bulk-update the production allow-list, run the manual issuer cutover, or revoke any production function. The next evidence step is to obtain a separately authorized read-only migration-ledger session and reconcile exact production versions/checksums with this source disposition, then produce a signature-by-signature cutover plan and rollback.

### CI evidence for migrator redesign

Exact implementation head `faaeb1c4600be07a814dde1aa93993132a1a24d5` passed GitHub Actions run [43441364402](https://github.com/zaidhqdev-sys/GHM/actions/runs/43441364402):
- Quality: 65/65 steps passed.
- Web quality: 11/11 steps passed.
- The full disposable PostgreSQL 18 migration/security workflow completed successfully, including the isolated migrator contract without Dashboard-admin membership.

The subsequent handover/production-reconciliation head is `32d6b24c213fcc29517738f775125fcebcd7c608`; its exact-head CI run [43441631366](https://github.com/zaidhqdev-sys/GHM/actions/runs/43441631366) was still running at the time of this note. Do not call the latest documentation head green until that run completes.

No production mutation occurred.


## Latest exact-head qualification and Render deployment confirmation — 2026-11-13 14:24 UTC

The latest handover/source tree head `868c41a912751c7bbaca23be8a1a83d761c3cde3` passed exact-head GitHub Actions run [43441944994](https://github.com/zaidhqdev-sys/GHM/actions/runs/43441944994):
- `quality` — success, 65/65 steps.
- `web-quality` — success, 11/11 steps.

This includes the isolated migrator redesign, the corrected contract tests, production runtime ACL difference mapping and this handover update. Earlier intermediate commits failed on stale unit/source-contract assertions; those assertions were corrected, and the final exact head is green.

### Render production service independently confirmed

- Service: `GHM-Internal-Runtime` (`srv-damupsek1f9s73eq8kkg`)
- Branch: `main`
- Auto-deploy: OFF
- Latest live deploy: `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`
- No newer deployment was created during this session.

The production database is still `ghm_db`, PostgreSQL 18, Frankfurt. The available Render query connection resolves to `session_user=ghm_app_user`, `current_user=ghm_db_user`. It cannot SELECT `ghm.ghm_schema_migrations`; catalog ACL inspection confirms SELECT is granted only to `ghm_schema_owner` among the audited roles. The migrator can reach that privilege only by its exact SET ROLE path, which the Render query connector does not use. I did not attempt to bypass this boundary.

### Existing read-only ledger reconciliation path

The repository already contains `scripts/forensic-migration-reconciliation.mjs`. It:
- requires `GHM_MIGRATOR_DATABASE_URL`;
- begins a READ ONLY transaction;
- verifies `session_user=current_user=ghm_migrator` and the explicit `ghm_db` target;
- SET ROLEs to `ghm_schema_owner` and verifies the resulting identity;
- reads ledger rows and compares exact version/name/checksum provenance with repository migrations, production historical exceptions, retained history and pending-migration policy.

This is the correct existing script for the remaining production-ledger evidence. It does not need a new service or a production write. The remaining limitation is access: this session has no authorized `ghm_migrator` connection string or supported Render query identity capable of taking that path. Do not expose or rotate credentials to work around it.

### SECURITY DEFINER search-path source disposition

Candidate migration `20261112090000_pin_security_definer_search_path.sql` preflights that every GHM SECURITY DEFINER routine is owned by `ghm_schema_owner`, then pins every such routine to `search_path = pg_catalog, ghm, pg_temp`. Current production catalog counts are:
- `pg_catalog, ghm`: 54
- `pg_catalog, ghm, pg_temp`: 5
- `ghm, pg_temp`: 3
- `ghm, pg_catalog`: 1

Thus 58 of 63 production SECURITY DEFINER routines still need the candidate hardening migration. This is another migration-ledger-dependent production cutover gate; no search path was changed.

No production SQL mutation, role/grant/membership change, migration, environment change, deploy, application data change or traffic change occurred.


## Authentication Issuer deployment/provisioning gap confirmed — 2026-11-13 14:25 UTC

A read-only Render service inventory was checked against the candidate source.

### Candidate code exists

- `src/auth-issuer/server.ts` is a separate HTTP process entry point.
- `package.json` defines `start:auth-issuer = node dist/auth-issuer/server.js`.
- The issuer has its own database identity/privilege verifier and separate `GHM_AUTH_ISSUER_DATABASE_URL` / SSL configuration.
- The manual issuer cutover assumes `ghm_auth_issuer` already exists and has its bounded Render administrator membership.

### Production infrastructure does not yet exist

- Production `ghm_db` currently has no `ghm_auth_issuer` PostgreSQL role.
- The candidate tree has no production issuer-role provisioning migration or dedicated provisioning script; CI creates the role directly in its disposable PostgreSQL fixture.
- Render currently has `GHM-Internal-Runtime` on `main`, auto-deploy OFF, plus older qualification/PayFast services. There is no deployed Actor Gateway service or Authentication Issuer service.
- The older qualification and PayFast sandbox services remain outside this target workstream and were not changed.

### Release consequence

The issuer implementation is source-qualified, but it is not deployable as an isolated production service yet. Before the manual issuer privilege cutover, the team still needs a hosting decision that respects the existing no-extra-paid-service constraint, an approved role/password provisioning path, the issuer service's private signing-key custody, network restrictions, and verified client routing. Do not put the issuer process inside the existing Resource API process and call that isolation; the private key must not be accessible to the Resource API process.

No Render service was created or updated, no role was provisioned, and no credential or secret was generated or changed.


## Legacy application login role-escalation path confirmed — 2026-11-13 14:30 UTC

A read-only PostgreSQL 18 membership/effective-privilege query confirmed an additional production boundary that must be treated as a release blocker.

### Current legacy login graph

- `ghm_app_user` is LOGIN INHERIT and has direct memberships:
  - `ghm_app_user → ghm_db_user`: grantor `postgres`, ADMIN=false, INHERIT=true, SET=true.
  - `ghm_app_user → pg_read_all_stats`: INHERIT=true, SET=true.
  - `ghm_app_user → pg_signal_backend`: INHERIT=true, SET=true.
- PostgreSQL confirms `pg_has_role('ghm_app_user','ghm_db_user','SET') = true`.
- PostgreSQL confirms `pg_has_role('ghm_app_user','ghm_db_user','MEMBER') = true`.
- The canonical `ghm_runtime` login is not a member of `ghm_db_user` and cannot SET ROLE to it.
- The legacy `ghm_app_user`, `ghm_db_user` and canonical `ghm_runtime` identities currently report the same effective GHM object privilege counts (46 SECURITY DEFINER functions and 39 tables/views), but the legacy app login additionally has the ability to assume the provider-managed Dashboard-admin role.

### Disposition

Do not use `ghm_app_user` as the replacement Resource API credential. The intended runtime connection is a direct login as `ghm_runtime`, whose own role has no outbound membership path to `ghm_db_user`. The current Render service is still on old commit `c7cf1eb`, and its environment values are not exposed by the read-only service metadata; do not assume it is already using `GHM_RUNTIME_DATABASE_URL`. Verify the actual configured credential key and effective identity before any deployment.

The `ghm_app_user → ghm_db_user` membership is provider-granted by `postgres`; an ordinary REVOKE from the Dashboard login has previously failed to remove provider-granted membership. This needs the existing Render support/provider authority path, not an application-side workaround. No role membership or credential was changed during this audit.

This finding is separate from the `ghm_db_user → ghm_migrator/ghm_schema_owner` admin memberships addressed by the migrator redesign. Both provider-granted membership families must be explicitly dispositioned before production identity cutover.


## Production SECURITY DEFINER ownership and explicit-grant reconciliation — 2026-11-13 18:18 UTC

A new read-only catalog inventory was taken against production `ghm_db` (PostgreSQL 18). This records the full direct function ACL distribution, not just the effective runtime count.

### Ownership and routine configuration

- 63/63 GHM SECURITY DEFINER routines are owned by `ghm_schema_owner`.
- Direct function ACL contains no PUBLIC EXECUTE entries.
- No direct EXECUTE grant is grantable (zero `WITH GRANT OPTION` entries).
- All 63 routines have explicit function-level `search_path` settings, but only 5/63 include `pg_temp` last. The other 58 remain candidates for the reviewed hardening migration.
- Function ACL grantors for the non-owner grants are consistently `ghm_schema_owner`.

### Exact non-owner function grants

| Grantee | Explicit SECURITY DEFINER EXECUTE |
|---|---:|
| `ghm_runtime` | 46 |
| `ghm_migrator` | 2 |
| `ghm_payment_provider` | 2 |
| `ghm_actor_gateway` | 0 |
| `ghm_auth_issuer` | Role does not yet exist |

The two migrator functions are the external identity and business external-mapping lookup helpers. The two payment-provider functions are the PayFast payment-result and attempt readers. PayFast remains out of scope and frozen; no payment grants were changed.

The runtime's exact 46 signatures were enumerated and preserved in the query result for comparison with the source stage inventory. The 12/9 signature difference documented above remains; the source migrations explain intended changes, but production migration-ledger evidence is still required before a cutover stage can be asserted.

### Important role-graph clarification

The latest direct membership inventory confirms:
- `ghm_runtime` is **not** a member of `ghm_db_user` and cannot SET ROLE to it.
- `ghm_db_user` is a member of `ghm_runtime` with provider-granted ADMIN OPTION, but SET=false and INHERIT=false on that edge.
- `ghm_app_user` remains a member of `ghm_db_user` with INHERIT=true and SET=true, so the legacy login can still assume the Dashboard-admin role.
- `ghm_db_user` retains provider-granted ADMIN OPTION memberships over `ghm_actor_gateway`, `ghm_migrator`, `ghm_payment_provider`, `ghm_runtime` and `ghm_schema_owner`.
- `ghm_migrator → ghm_schema_owner` remains the single direct migrator membership with SET=true, INHERIT=false, ADMIN=false.

This clarifies the direction of the `ghm_runtime` / `ghm_db_user` edge: it does not give the runtime login the ability to assume `ghm_db_user`. It does give the Dashboard role provider-granted authority to administer the runtime role membership. The earlier finding about legacy `ghm_app_user` role escalation remains unchanged.

### Current production gate

The runtime's 46 grants are still the old production state. The Actor Gateway and Authentication Issuer are not yet deployed and do not have their production database identities. The candidate manual issuer cutover must not be applied until service/client routing, production role provisioning, exact migration ledger provenance, backup/rollback and live function-stage reconciliation are all verified.

No production role, membership, grant, function, relation, sequence, search path, migration, data, credential, Render setting, deployment or traffic was changed.


## Production direct relation and sequence authority inventory — 2026-11-13 18:22 UTC

A read-only effective-privilege inventory was collected for `ghm_runtime` across all production `ghm` relations and sequences. This is separate from the SECURITY DEFINER function ACL inventory.

### Direct relation access

The runtime has SELECT on 39 relations, with additional direct DML on four relations:

| Relation | Additional direct privilege |
|---|---|
| `ghm.business` | INSERT |
| `ghm.business_membership` | INSERT |
| `ghm.opportunity` | INSERT and UPDATE |
| `ghm.opportunity_capability_requirement` | DELETE |

There is no direct runtime DELETE on other relations, no TRUNCATE, no REFERENCES and no TRIGGER privilege. Every listed relation is owned by `ghm_schema_owner`.

These four DML exceptions are high-priority authority review items. Their direct DML grants bypass SECURITY DEFINER function boundaries and must be traced to the exact production application operations and actor/tenant checks before they can be removed. In particular, the INSERT grants on Business and Business Membership must be reconciled against the signed Connect Business provisioning gateway, and Opportunity INSERT/UPDATE plus requirement DELETE must be reconciled against the Project/Opportunity and capability-requirement APIs. Do not revoke them until those paths have a verified replacement and regression coverage.

### Direct sequence access

- Runtime has USAGE on 39/39 GHM sequences.
- Runtime has SELECT on 10 sequences.
- Runtime has UPDATE on zero sequences.

Sequence SELECT exceptions include identity/business/membership, engagement, enquiry, opportunity, opportunity type, project and review identifiers. These privileges should be reviewed alongside direct table DML; do not infer that all 39 USAGE grants are required merely because the runtime can currently use them.

### Function default ACL

The production global default ACL inventory includes PostgreSQL-owned defaults granting EXECUTE to PUBLIC and `ghm_db_user`. The candidate migration `20261112050000_revoke_public_default_function_execution.sql` changes the defaults specifically for `ghm_schema_owner`, which is the owner of all 63 current GHM SECURITY DEFINER functions. Current direct function ACL has zero PUBLIC entries. Confirm the production default ACL owner/scope and exact migration-ledger state before claiming future function creation is protected; do not modify PostgreSQL provider defaults from this application cutover.

### Required next implementation/reconciliation work

1. Enumerate source call sites and tenant/actor authorization for the four direct DML exceptions.
2. Compare their production grants with candidate gateway wrappers and exact migration/cutover files.
3. Build a relation/sequence privilege stage contract analogous to the function allow-list; include exact allowed relation+privilege tuples, not only aggregate counts.
4. Add disposable PostgreSQL tests proving forbidden direct DML fails while approved API/gateway operations continue.
5. Preserve a rollback plan and do not revoke production privileges until client routes and gateway service deployment are qualified.

No production privilege, ACL, sequence, relation, function, role, membership, migration, data, credential, Render setting, deployment or traffic was changed.


### Direct DML ACL grantor confirmation

The five effective DML privileges listed above are explicit direct ACL entries granted by `ghm_schema_owner` to `ghm_runtime`, with no grant option. They are not inherited through `ghm_db_user` or another role. Exact tuples:
- `ghm.business`: INSERT
- `ghm.business_membership`: INSERT
- `ghm.opportunity`: INSERT, UPDATE
- `ghm.opportunity_capability_requirement`: DELETE

This confirms the privilege cleanup must be an intentional owner-controlled migration/cutover after the associated direct SQL consumers are replaced, not merely a role-membership adjustment.


## Render database network exposure inventory — 2026-11-13 18:25 UTC

The Render Postgres inventory was checked directly.

### Production database

- Service: `ghm-db`
- Database: `ghm_db`
- PostgreSQL 18, Frankfurt
- Status: available
- Render database service ID: `dpg-dag0sdtbedkc7389vi2g-a`
- Current provider IP allow-list: `0.0.0.0/0` (everywhere)
- Connection pool: none

This means the database network endpoint is not IP-restricted at the Render allow-list layer. This is not evidence of unauthenticated database access, but it broadens the network attack surface and should be narrowed after a complete inventory of legitimate clients and their stable egress ranges. Do not blindly restrict it: GHM runtime, administrative access, approved migrations, and any external clients must be accounted for first. TLS, credentials and PostgreSQL role grants remain separate security controls.

### Other database resources

- `ghm-payfast-sandbox-db` remains suspended for billing and expired; it is not part of this target.
- `ghm-identity-qualification-20261018` is a separate available PostgreSQL 18 database with a 15 GB disk and its own allow-list. It was not used or modified for this production audit.

### Required follow-up

1. Enumerate every legitimate production client and stable egress address (Render service private networking where applicable, Vercel/Connect if direct DB access exists, owner/admin paths).
2. Confirm whether the runtime uses Render's private hostname and whether the DB allow-list can be narrowed to private service networking plus explicit admin/migration sources.
3. Plan and validate a lockout-safe allow-list change with a tested rollback path.
4. Keep the current network policy unchanged until the client inventory is complete.

No Render IP allow-list, database setting, service, credential, role, membership, grant, migration or traffic was changed.


## Correction: production column-level DML grants materially expand runtime authority — 2026-11-13 18:31 UTC

The earlier relation inventory used `has_table_privilege` and did not include PostgreSQL column-level ACL entries. That was incomplete. A second catalog query over every `pg_attribute.attacl` entry now establishes the full effective direct column DML footprint for `ghm_runtime`.

### Full column-level DML totals

- INSERT: 156 column grants across 21 tables.
- UPDATE: 60 column grants across 12 tables.
- Every inspected column grant is directly granted to `ghm_runtime` by `ghm_schema_owner`, with no grant option.
- This is in addition to relation-level INSERT/UPDATE/DELETE and does not include the runtime's SELECT grants or sequence grants.

INSERT-capable tables:
`business_capability`, `business_capability_evidence`, `business_category_assignment`, `business_engagement_event`, `business_offering`, `commercial_event`, `commercial_payment_attempt`, `commercial_subscription`, `commercial_trial`, `customer`, `enquiry`, `notification`, `opportunity_capability_requirement`, `opportunity_participant`, `project`, `project_quote`, `quote`, `quote_line_item`, `review`, `support_request`, `support_request_message`.

UPDATE-capable tables:
`account_identity`, `business`, `business_category_assignment`, `business_offering`, `customer`, `enquiry`, `notification`, `project`, `project_quote`, `quote`, `review`, `support_request`.

The relation-level DML exceptions previously recorded remain:
- `business`: INSERT
- `business_membership`: INSERT
- `opportunity`: INSERT and UPDATE
- `opportunity_capability_requirement`: DELETE

Column-level DML additionally includes INSERT on `opportunity_capability_requirement` and `project`, plus the UPDATE/INSERT tuples in the full table lists above. The table-level and column-level views must be treated as one ACL inventory; neither alone is complete.

### Source consumer trace — representative direct SQL paths confirmed

The construction branch still contains direct SQL writes in resource repositories, including:
- `src/resources/business-identity/repository.ts`: inserts `business` and `business_membership`; updates authenticated `account_identity` profile columns.
- `src/resources/opportunity/repository.ts`: inserts and updates `opportunity` after application-level membership/ownership checks.
- `src/resources/opportunity-requirements/repository.ts`: deletes and inserts `opportunity_capability_requirement` after an application-level manager check.
- `src/resources/project/repository.ts`: inserts `opportunity`, `opportunity_participant` and `project`; updates `project`.
- `src/resources/business-capability/repository.ts`, `business-capability-evidence/repository.ts`, `business-category/repository.ts`, `business-offering/repository.ts`: direct inserts into their respective resource tables.
- `src/resources/commercial/repository.ts`: direct inserts into commercial trial/subscription/event/payment-attempt records. PayFast activation remains frozen/out of scope; do not change these privileges until its separate business lifecycle and authority path is resolved.
- `src/resources/customer/repository.ts`, `enquiry/repository.ts`, `notification/repository.ts`, `opportunity-participant/repository.ts`, `project-quote/repository.ts`, `quote/repository.ts`, `review/repository.ts`, `support-request/repository.ts`: direct resource inserts.

`withAuthorizedTransaction` in `src/db/authorized-transaction.ts` validates an application `AuthContext` and opens a transaction; it does not establish a database-verifiable actor assertion or set an actor identity in PostgreSQL. Thus the current database grants rely on the Resource API's verified bearer-auth middleware and application checks. A holder of the runtime DB credential can issue direct SQL without those application checks. This is the central least-privilege/actor-binding gap to close in stages, not a finding that ordinary HTTP requests currently bypass their bearer authentication.

The signed Actor Gateway already provides a pattern for selected trusted operations (e.g. Connect Business provisioning and capability/business metadata domains), but it does not yet replace all direct resource repository writes above. Do not infer gateway coverage merely because a route has a gateway client for a related read or mutation.

### Startup enforcement gap

`src/db/runtime-database-privileges.ts` currently verifies only the SECURITY DEFINER EXECUTE signature set. It does not inventory or enforce:
- relation-level ACLs,
- column-level ACLs,
- sequence USAGE/SELECT/UPDATE,
- schema/database privileges,
- default ACLs.

The current production startup gate therefore cannot detect the 156 INSERT and 60 UPDATE column grants. Add a complete relation/column/sequence privilege-stage contract with exact allowed tuples, and qualify it on disposable PostgreSQL before enabling production enforcement.

### Next implementation sequence

1. Create a source-to-ACL matrix for all 21 INSERT and 12 UPDATE tables, including exact repository call sites, actor/tenant predicate, and current gateway/function replacement status.
2. Prioritize the high-risk Business/Business Membership, Opportunity/Project, review/moderation, and commercial lifecycle writes; keep PayFast frozen.
3. For each write family, move the authorization predicate into a bounded SECURITY DEFINER operation or signed Actor Gateway assertion as appropriate; do not simply wrap arbitrary SQL with a generic function.
4. Add tests proving forged account IDs, cross-tenant writes, inactive memberships, replayed assertions and unauthorized DML are denied by PostgreSQL itself.
5. Revoke only the exact relation/column privileges after the replacement route is deployed and observed; retain a reviewed rollback file.
6. Add exact ACL-stage startup checks for functions, relation privileges, column privileges, sequences and default ACLs.

This correction supersedes the earlier statement that the runtime's only direct DML exceptions were four relation-level grants. The actual direct DML surface is broader because of column-level privileges.

No production grant, ACL, relation, sequence, function, role, membership, migration, data, credential, Render setting, deployment or traffic was changed.


## Exact-head CI and source-to-ACL work queue — 2026-11-13 18:35 UTC

### Exact-head qualification result

The full workflow for ACL-inventory handover commit c670897cfd7cd6f1a236cb1e2b4a025744cd8219 completed successfully:

- quality: 65/65 steps passed.
- web-quality: 11/11 steps passed.
- Workflow: https://github.com/zaidhqdev-sys/GHM/actions/runs/43482171421

No production deployment was triggered by this documentation-only commit.

### Source-to-ACL matrix — first-pass ownership map

This is a routing map for the next exact SQL/call-site audit. It is deliberately not a declaration that each table is exclusively written by one repository; the repository may write multiple related tables and a route may compose multiple repositories.

| Production table with column DML | First source repository to inspect | Required authorization evidence before revocation |
|---|---|---|
| business_capability | src/resources/business-capability/repository.ts | Capability manager/owner scope; capability lifecycle; signed capability mutation gateway coverage |
| business_capability_evidence | src/resources/business-capability-evidence/repository.ts | Evidence submitter identity, business scope, verification transitions and evidence object binding |
| business_category_assignment | src/resources/business-category/repository.ts | Business membership/manager authority and allowed category lifecycle |
| business_engagement_event | src/resources/business-engagement/repository.ts (confirm path) | Authenticated actor and business-scoped event attribution |
| business_offering | src/resources/business-offering/repository.ts | Business membership, offering ownership and public/private visibility |
| commercial_event | src/resources/commercial/repository.ts | Provider-authenticated event provenance and idempotency; PayFast remains frozen |
| commercial_payment_attempt | src/resources/commercial/repository.ts | Payment-provider identity, attempt ownership and callback authenticity; PayFast remains frozen |
| commercial_subscription | src/resources/commercial/repository.ts | Subscription lifecycle authority and verified provider event; do not activate payment |
| commercial_trial | src/resources/commercial/repository.ts | Business owner/manager, trial eligibility and idempotent creation |
| customer | src/resources/customer/repository.ts | Business tenant context and customer ownership |
| enquiry | src/resources/enquiry/repository.ts | Public intake validation, target business scope and actor attribution |
| notification | src/resources/notification/repository.ts | Recipient identity, tenant isolation and trusted event source |
| opportunity_capability_requirement | src/resources/opportunity-requirements/repository.ts | Opportunity manager/owner check and requirement replacement atomicity |
| opportunity_participant | src/resources/opportunity-participant/repository.ts | Opportunity participant eligibility and owner/manager scope |
| project | src/resources/project/repository.ts | Project owner/business context; atomic Project↔Opportunity relation |
| project_quote | src/resources/project-quote/repository.ts | Project tenant scope, quote authority and immutable lifecycle constraints |
| quote | src/resources/quote/repository.ts | Customer/business scope, quote owner and status transition |
| quote_line_item | src/resources/quote/repository.ts | Parent quote ownership and same-tenant consistency |
| review | src/resources/review/repository.ts | Review author, target business, moderation authority and immutable review rules |
| support_request | src/resources/support-request/repository.ts | Requester identity, assigned operator authority and tenant scope |
| account_identity (UPDATE) | src/resources/business-identity/repository.ts / profile identity path (confirm) | Self-service account binding; only authenticated account's allowed profile fields |

The exact production ACL inventory remains authoritative for table/column counts. The source paths above are prioritized starting points and several are explicitly marked for confirmation where the first-pass naming is not guaranteed by the repository tree.

### Additional controls that the source matrix must capture

- The current application withAuthorizedTransaction checks a valid application AuthContext but does not set a PostgreSQL actor identity. This means runtime-credential possession is a stronger threat than an ordinary authenticated HTTP caller.
- Every write row must record: HTTP route, repository method, SQL columns, actor source, tenant predicate, lifecycle predicate, gateway/function replacement, and tests.
- A generic SECURITY DEFINER wrapper around arbitrary SQL is not acceptable. Each replacement must have fixed parameters, fixed operation semantics, bounded row scope, explicit actor assertion verification and transaction-level replay protection where relevant.
- The direct DML grant inventory must include relation-level ACL, column-level ACL and inherited privileges, not just has_table_privilege.
- Sequence access must be paired to each INSERT path and reviewed separately; sequence USAGE alone does not authorize inserting into a table.

### Next work order

1. Confirm all 21 source paths against actual SQL statements (including any path outside src/resources).
2. Extract exact columns and the complete actor/tenant predicate for every INSERT/UPDATE/DELETE.
3. Mark already migrated signed Actor Gateway operations and remaining direct-resource operations separately.
4. Build a staged relation/column/sequence allow-list only after the source mapping is complete.
5. Add disposable PostgreSQL tests for direct-DML denial and continued API/gateway operation before writing any production cutover.

Production remains read-only. No role, membership, relation/column/sequence ACL, function, migration, data, credential, Render setting, deployment or traffic was changed.


## Source-to-ACL matrix correction — verified repository SQL — 2026-11-13 18:40 UTC

The previous first-pass matrix was a navigation aid, not a verified SQL map. This follow-up inspected the actual repository files at PR #276 HEAD `61389e54384ce9433bb2651368f7ce81f998f6e2` and matched concrete INSERT/UPDATE/DELETE statements. The earlier mapping of `business_engagement_event` to a guessed repository path is not confirmed and must remain unresolved until its actual writer (or trigger) is identified.

### Concrete direct write paths now confirmed

| Table | Concrete source path and operation | Application-side authorization observed |
|---|---|---|
| `business` | `business-identity/repository.ts` — creates Business row | authenticated context; owner membership is created in same transaction; no DB actor assertion in this repository path |
| `business_membership` | `business-identity/repository.ts` — creates initial owner membership | authenticated context user ID is used for account and created_by |
| `account_identity` | `business-identity/repository.ts` — updates full_name, phone, avatar_ref | row predicate is `id = context.userId`; repository first requires the account |
| `business_capability` | `business-capability/repository.ts` — inserts capability assertion | tenant resolution and business-management checks are in the repository path; later assertion replacement uses a SECURITY DEFINER function |
| `business_capability_evidence` | `business-capability-evidence/repository.ts` — inserts evidence | loads parent capability and its business before insert; verification transition is delegated to `ghm.transition_business_capability_evidence` |
| `business_category_assignment` | `business-category/repository.ts` — inserts and updates primary assignment | tenant/business authorization in repository path; confirm each update's exact role predicate in the full method before privilege reduction |
| `business_offering` | `business-offering/repository.ts` — inserts and updates offering | tenant resolution; create requires owner/administrator; update locks target then checks tenant membership/role |
| `commercial_trial`, `commercial_subscription`, `commercial_event`, `commercial_payment_attempt` | `commercial/repository.ts` — commercial lifecycle and payment preparation writes | business-management checks exist for owner-initiated operations; provider event provenance is a separate boundary. PayFast remains frozen and these grants are not candidates for removal until provider/lifecycle authority is redesigned |
| `customer` | `customer/repository.ts` — inserts customer for `context.userId` | authenticated account ID is used as account_id |
| `opportunity` | `enquiry/repository.ts`, `project/repository.ts`, and `opportunity/repository.ts` — create paths; opportunity repository also has owned-update path | owner/membership predicates are application-side; Project and Opportunity creation is transactional; DB actor assertion is not established by generic authorized transaction |
| `opportunity_participant` | `enquiry/repository.ts`, `project/repository.ts`, `opportunity-participant/repository.ts` — creator/owner/recipient/participant inserts | composed with opportunity creation or explicit participant service checks; verify all account/business combinations before narrowing grants |
| `enquiry` | `enquiry/repository.ts` — inserts enquiry after opportunity and participant creation | request context plus target business; confirm target business eligibility and public intake abuse controls |
| `notification` | `notification/repository.ts` — inserts notification for supplied user_id | recipient identity is passed as input; verify every caller is trusted and cannot choose another account's recipient |
| `opportunity_capability_requirement` | `opportunity-requirements/repository.ts` — deletes then inserts requirement set | `assertOpportunityManager` executes before replacement; replacement is transactional |
| `project` | `project/repository.ts` — inserts Project with linked Opportunity and creator participant; updates Project | owner context and transaction; keep Project↔Opportunity atomicity intact |
| `project_quote` | `project-quote/repository.ts` — inserts and updates quotes/status | project/business and quote lifecycle checks occur in service/repository path; inspect each transition predicate before revocation |
| `quote`, `quote_line_item` | `quote/repository.ts` — inserts quote and line items | quote account_id uses context.userId; customer lookup and quote ownership must be preserved |
| `review` | `review/repository.ts` — inserts review and updates moderation state; also updates aggregate Business rating | reviewer identity from context; moderation uses separate admin path; aggregate rating update is coupled to review operations |
| `support_request` | `support-request/repository.ts` — inserts request; updates status and replies | create checks authenticated role/account and optional business membership; status/reply admin methods assert admin role |

### Important implications

1. The concrete source list proves that the ACL footprint is not merely an unused legacy grant set. Many grants currently back active repository writes.
2. The `business` and `business_membership` direct insert path is especially sensitive: initial Business creation and owner membership are coupled in one transaction. The existing signed Connect provisioning gateway should be the replacement boundary for Connect provisioning, but confirm all GHM first-party business creation callers before changing grants.
3. The `notification` insert accepts a recipient ID at repository boundary. Every caller must be traced to establish whether it is a trusted server-side event or a user-influenced request.
4. The `business_engagement_event` column INSERT grant has not yet been tied to a concrete source repository in this pass. It remains an explicit unresolved writer/trigger investigation; do not guess its owner.
5. `account_identity` is updated only with `id = context.userId` in the inspected repository method. It is a candidate for a narrow self-profile DB operation, not blanket UPDATE access.
6. Several ACL tables have writes that are already split between direct SQL and SECURITY DEFINER functions. The replacement plan must distinguish those paths; do not remove all DML from a table if a remaining approved repository path still depends on it.

### Immediate next technical step

Before writing any revocation migration, complete the writer inventory for every column ACL tuple (including the untraced engagement-event table), enumerate all callers of the concrete repository methods, and mark whether the operation is user-driven, trusted internal, provider-driven or admin-only. Then design fixed-purpose database operations for each actor-bound write family and qualify their grants on disposable PostgreSQL.

No production permissions, roles, memberships, tables, sequences, functions, data, credentials, Render settings, deployments or traffic were changed.


## Production investigation: business_engagement_event writer unresolved — 2026-11-13 18:45 UTC

The previously untraced `business_engagement_event` INSERT grant has now been checked directly against production catalog dependencies and data.

### Production facts confirmed (read-only)

- Relation: `ghm.business_engagement_event`, ordinary table, owner `ghm_schema_owner`.
- RLS and FORCE RLS are both disabled.
- No non-internal triggers exist on the table.
- No catalog-tracked dependent function or view was found.
- Table contains 0 rows.
- Runtime has no relation-level ACL on this table; its INSERT capability is column-level.
- Column INSERT is granted directly to `ghm_runtime` on exactly: `business_id`, `account_id`, `event_type`, `event_context`, and `source`.
- Runtime also has column SELECT on `id`, the five inserted columns, and `created_at`.
- Backing sequence: `ghm.business_engagement_event_id_seq`, owned by `ghm_schema_owner`; runtime has USAGE and SELECT on it.

### Interpretation and disposition

The table is empty and has no trigger/function writer path visible in PostgreSQL's dependency catalog. That does not prove the application never writes it; dynamic SQL, application SQL, and external clients are not represented as catalog dependencies. The INSERT ACL therefore remains an unresolved direct-runtime grant until a full repository/route caller trace finds the writer or establishes that the feature is dead.

Do not remove the INSERT/sequence grants solely because the table is empty. First establish whether any deployed application version or connected product still writes engagement events, and inspect the complete repository tree for the exact relation identifier (the available GitHub code-search index returned no matches, so absence from search results is not evidence of absence).

If no active writer exists after route, deployment and connected-product verification, prepare a separately qualified revocation candidate for the five INSERT column grants and sequence USAGE; retain SELECT only if a demonstrated read consumer requires it. No such revocation has been prepared or applied yet.

### Exact-head CI checkpoint

The documentation/source-audit commit `a1dc2ff645672b143048bb647265ff6749545a74` has:
- web-quality: 11/11 passed.
- quality: was still running at 42/64 steps, in the disposable PostgreSQL system-admin capability catalogue governance qualification, with no failures reported at that observation.

### Production safety

All production queries in this investigation were catalog or aggregate read-only SELECTs. No production grants, roles, memberships, tables, sequences, functions, data, credentials, Render settings, deployments or traffic were changed.


## Production role-membership reconciliation — read-only snapshot — 2026-11-13 18:50 UTC

A fresh read-only catalog snapshot was taken against Render production database `ghm_db`. This materially confirms why the migration-principal contract must be reconciled before any production migration attempt.

### Important interpretation correction

The Render query connection reported `session_user = ghm_app_user` and `current_user = ghm_db_user`. This is the identity of the administrative/query connection used for this catalog inspection. It is **not evidence that the deployed GHM application pool is connected as either role**. The application source explicitly uses `GHM_RUNTIME_DATABASE_URL` in production, and `src/db/runtime-principal.ts` requires both session_user and current_user to be `ghm_runtime`. The actual runtime connection identity must be verified separately through its own startup evidence or a safe application-origin identity probe.

### Production role attributes

| Role | LOGIN | INHERIT | CREATEDB | CREATEROLE | SUPERUSER | BYPASSRLS |
|---|---:|---:|---:|---:|---:|---:|
| ghm_db_user | yes | yes | yes | yes | no | no |
| ghm_app_user | yes | yes | no | no | no | no |
| ghm_migrator | yes | no | no | no | no | no |
| ghm_schema_owner | no | no | no | no | no | no |
| ghm_runtime | yes | no | no | no | no | no |
| ghm_actor_gateway | yes | no | no | no | no | no |

The `ghm_schema_owner` role owns schema `ghm` and has database CREATE. This is intentional for the controlled migration `SET ROLE` path; it is NOLOGIN and has no elevated role attributes.

### Membership edges and options observed

| Member | Granted role | ADMIN OPTION | INHERIT OPTION | SET OPTION |
|---|---|---:|---:|---:|
| ghm_app_user | ghm_db_user | no | yes | yes |
| ghm_db_user | ghm_migrator | yes | no | no |
| ghm_db_user | ghm_schema_owner | yes | no | no |
| ghm_db_user | ghm_actor_gateway | yes | no | no |
| ghm_db_user | ghm_runtime | yes | no | no |
| ghm_db_user | ghm_payment_provider | yes | no | no |
| ghm_migrator | ghm_schema_owner | no | no | yes |

Also present: membership of `ghm_app_user` and `ghm_db_user` in PostgreSQL's `pg_read_all_stats` and `pg_signal_backend` roles. The exact grantor for these edges should be captured in the next catalog pass.

### Consequences for the migration-principal assertion

The current `assertMigratorDatabaseIdentity` contract requires:
- exactly one direct membership for `ghm_migrator`;
- zero members of `ghm_migrator`;
- exactly one member of `ghm_schema_owner` (the migrator);
- zero direct memberships granted to `ghm_schema_owner`;
- exactly the non-inheritable, SET-only migrator → schema-owner membership.

The observed production membership graph violates at least two of those required invariants:
- `ghm_db_user` is an additional member of `ghm_migrator`;
- `ghm_db_user` is an additional member of `ghm_schema_owner`.

Both edges carry ADMIN OPTION, even though INHERIT and SET are false. Thus the production graph is inconsistent with the exact least-privilege migrator contract, and `ghm_db_user` can administer these memberships. Its CREATEROLE and CREATEDB attributes make it a high-authority bootstrap/admin identity. This is a role-graph issue, not evidence that the GHM runtime process is using this principal.

The `ghm_db_user → ghm_actor_gateway`, `ghm_runtime`, and `ghm_payment_provider` ADMIN OPTION edges are also unnecessary for ordinary application operation and must be included in the managed-role ownership/support remediation plan. Do not revoke them through the application connection: previous attempts showed that the managed/admin membership is not removable by the current app connection and Render support has already been engaged.

### Existing source contract is directionally correct

`src/db/migrate.ts` connects with the dedicated `GHM_MIGRATOR_DATABASE_URL`, checks the complete migrator/schema-owner membership contract, then performs `SET ROLE ghm_schema_owner` and verifies `current_user = ghm_schema_owner` and `session_user = ghm_migrator` before applying migrations.

`src/config.ts` requires `GHM_RUNTIME_DATABASE_URL` for production. `src/server.ts` calls `assertRuntimeDatabaseIdentity`, which requires the runtime login and effective user both to be `ghm_runtime`. Preserve this separation.

### Required remediation path

1. Confirm the deployed migration job's actual connection identity and whether the exact principal assertion currently blocks a production migration attempt; do not trigger a production migration merely to test it.
2. Capture membership grantors and provider-managed ownership metadata for all listed edges.
3. Obtain the managed database provider's supported procedure to remove the legacy `ghm_db_user` ADMIN OPTION edges without weakening Render's control plane or breaking the existing migration SET ROLE path.
4. Ensure the final graph contains only `ghm_migrator → ghm_schema_owner` (NOINHERIT, SET allowed, ADMIN disallowed) for migration authority. Remove legacy `ghm_db_user` membership edges only through a supported controlled operation.
5. Qualify this exact graph in disposable PostgreSQL 18, including negative tests for admin-option membership, unexpected members and unexpected role attributes.
6. Separately verify the deployed application's real `ghm_runtime` session identity; do not infer it from the administrative Render query session.

### Current CI status at checkpoint

For commit `c1485367fbb98af2a52e7e21936022febd92fb43`:
- web-quality: 11/11 passed.
- quality: 39/64 steps passed and the test suite was running; no failures were reported at this observation.
- Workflow: https://github.com/zaidhqdev-sys/GHM/actions/runs/43484112233

No production role, membership, grant, schema, relation, sequence, function, data, credential, Render setting, deployment or traffic was changed by this investigation. The catalog work consisted only of read-only SELECTs.


## Runtime identity verification and membership grantor follow-up — 2026-11-13 18:55 UTC

### Exact-head qualification

The latest handover commit `ebf6396bbb230dc9d980c9989cee6ee550e2af26` completed successfully:
- quality: passed (65/65 steps)
- web-quality: passed (11/11 steps)
- workflow: https://github.com/zaidhqdev-sys/GHM/actions/runs/43484488907

PR #276 remains open; no merge was performed.

### Render production service/deployment state

Read-only Render inspection confirms:
- service: `ghm-internal-runtime` (`srv-damupsek1f9s73eq8kkg`)
- deployed branch: `main`
- auto deploy: off
- current live deployment: `dep-dbpmv8jrjlhs73abkli0`
- deployed commit: `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`
- deployment completed 2026-11-10 19:26 UTC
- database: `ghm-db`, PostgreSQL 18, `ghm_db`

No production deploy was triggered. Render application logs contained no entries in the inspected 2026-11-13 17:00–18:45 UTC window.

### Actual runtime DB session status — important limitation

A read-only `pg_stat_activity` query at 2026-11-13 18:55 UTC returned:
- observer session: `ghm_app_user`
- active `ghm_runtime` sessions: 0
- active `ghm_migrator` sessions: 0

This is not proof that the deployed application uses the wrong identity. The database query tool opens a separate connection and closes it after each query; the application pool may be idle, or the service may not have generated a request during the snapshot. It also means the live `ghm_runtime` session identity is **not yet independently verified**. The source-level startup guard remains the current evidence: production config requires `GHM_RUNTIME_DATABASE_URL`, and `assertRuntimeDatabaseIdentity` requires both `session_user` and `current_user` to equal `ghm_runtime`.

Do not claim runtime identity verification complete until a safe, application-origin identity probe or contemporaneous database activity observation captures the actual application session. Do not expose connection strings or credentials to obtain this evidence.

### Membership grantor audit — correction and additional edge

A second read-only membership query captured grantors and exposed one additional membership edge omitted from the previous summary:

| Member | Granted role | Grantor | ADMIN | INHERIT | SET |
|---|---|---|---:|---:|---:|
| ghm_db_user | ghm_actor_gateway | postgres | yes | no | no |
| ghm_db_user | ghm_migrator | postgres | yes | no | no |
| ghm_db_user | ghm_payment_provider | postgres | yes | no | no |
| ghm_db_user | ghm_runtime | postgres | yes | no | no |
| ghm_db_user | ghm_schema_owner | postgres | yes | no | no |
| ghm_db_user | ghm_runtime | ghm_db_user | no | yes | yes |
| ghm_migrator | ghm_schema_owner | ghm_db_user | no | no | yes |
| ghm_app_user | ghm_db_user | postgres | no | yes | yes |
| ghm_app_user | pg_read_all_stats | postgres | no | yes | yes |
| ghm_app_user | pg_signal_backend | postgres | no | yes | yes |
| ghm_db_user | pg_read_all_stats | postgres | no | yes | yes |
| ghm_db_user | pg_signal_backend | postgres | no | yes | yes |

The legacy admin-option edges are granted by `postgres`, not `ghm_db_user`. The migration membership `ghm_migrator → ghm_schema_owner` was granted by `ghm_db_user` and has SET but not ADMIN or INHERIT. This is important provider/cluster bootstrap provenance: do not assume that application credentials can revoke the postgres-granted edges. The `ghm_db_user → ghm_runtime` membership is an additional inherited/SET-capable path; its necessity must be checked against the dedicated runtime URL and the migration bootstrap contract. It must not be conflated with the ADMIN OPTION edge on the same role.

### Updated next steps

1. Keep the Render-managed `postgres`-granted ADMIN OPTION edges as provider/bootstrap remediation, not an app-session REVOKE task.
2. Determine why `ghm_db_user` is a member of `ghm_runtime` and whether the migration/bootstrap contract depends on that edge.
3. Confirm whether `ghm_migrator → ghm_schema_owner` grantor `ghm_db_user` is a deliberate supported migration bootstrap path; preserve SET-only/no-admin semantics.
4. Obtain application-origin runtime identity evidence without exposing credentials or changing production.
5. Continue disposable PostgreSQL 18 tests for the exact grantor, membership options, migration identity and negative cases.

No production roles, memberships, grants, schema, relations, sequences, functions, data, credentials, environment variables, Render settings, deployments or traffic were changed. All database inspection was read-only.


## Migration-principal assertion hardening — 2026-11-13 18:58 UTC

A source review of the existing migration principal guard found that the SQL identity snapshot already collected `schema_owner_rolreplication` and `schema_owner_rolbypassrls`, but `assertMigratorDatabaseIdentity` did not include either field in its expected-false invariant map. This meant a future schema-owner role accidentally configured with REPLICATION or BYPASSRLS could pass the pure assertion despite the fields being queried.

### Correction committed

- Added explicit `schema_owner_rolreplication: false` and `schema_owner_rolbypassrls: false` checks to `assertMigratorDatabaseIdentity`.
- Added negative unit cases proving either elevated flag is rejected.
- Extended the migration-runner source contract test to require both role attributes to be selected from `pg_roles`.

The schema-owner role is NOLOGIN and should also be non-superuser, non-CREATEDB, non-CREATEROLE, non-REPLICATION and non-BYPASSRLS. The migration role remains NOINHERIT with only its SET-only schema-owner membership.

### Commits and qualification

- Assertion correction: `d61908b7efb103a975e02d2459dd979c3e124bbe`
- Duplicate cleanup: `a1d6656fc133c0e35e9a5b30bdc80b802ff67609`
- Negative tests: `47c08fcddb210d411f7a1945ff6e7946b399c974`
- Contract tests: `c081f05b66e6a805867a3487ef5072d74015ac65`

CI runs:
- Previous exact-head `00acfbe`: quality 64/64 and web-quality 11/11 passed — https://github.com/zaidhqdev-sys/GHM/actions/runs/43485512710
- Latest assertion/test commits have new workflows queued/in progress; do not treat them as passed until the final branch HEAD has completed both jobs.

### Scope and production safety

This is a code-level fail-closed guard correction and test expansion only. No production role, membership, grant, database object, data, credential, Render environment, deployment or traffic was changed. No production migration was attempted. PR #276 remains open and unmerged.


## Exact migration assertion compared against live production — 2026-11-13 18:50 UTC

A further read-only production query now evaluates the exact membership-count and role-attribute invariants enforced by the current `src/db/migrator-principal.ts` / `src/db/migrate.ts` contract. This confirms the remaining production mismatch precisely.

### Role attributes

Both roles have the intended attributes:
- `ghm_migrator`: LOGIN, NOINHERIT, not SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS.
- `ghm_schema_owner`: NOLOGIN, not SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS.

Database/schema authority is also aligned:
- `ghm_migrator`: CONNECT yes; database CREATE no; ghm schema USAGE no; ghm schema CREATE no.
- `ghm_schema_owner`: database CREATE yes; owns schema `ghm`.

### Exact membership counts

| Current source invariant | Production observation | Result |
|---|---:|---|
| migrator direct membership count = 1 | 1 | pass |
| migrator member count = 0 | 1 | **fail** |
| exact migrator → schema-owner edge (NO ADMIN, NO INHERIT, SET) | yes | pass |
| schema-owner direct membership count = 0 | 0 | pass |
| schema-owner membership count = 1 | 2 | **fail** |

The extra member of `ghm_migrator` and extra member of `ghm_schema_owner` are both `ghm_db_user`. The desired `ghm_migrator → ghm_schema_owner` edge itself remains correct: grantor `ghm_db_user`, ADMIN=false, INHERIT=false, SET=true.

### Meaning

The source assertion is now correctly fail-closed for the intended final topology, but it will reject the current production topology because `ghm_db_user` remains a member of both protected roles. The role attributes are not the remaining blocker; the extra membership edges are.

Do not relax `migrator_member_count` or `schema_owner_membership_count` to make the current production topology pass. That would bless the unwanted bootstrap membership rather than fix the role graph. The appropriate next step is a provider-supported, controlled membership cleanup that preserves the migrator-to-owner SET-only edge and then re-runs the exact preflight. No production migration was attempted.

### Exact-head CI status at this observation

Commit `4c96572c0c01208d67b8e44fc4fbc18eb62c3a8a`, workflow https://github.com/zaidhqdev-sys/GHM/actions/runs/43486051101:
- web-quality: passed, 11/11.
- quality: 46/64 steps passed, currently executing Business Hours signed gateway cutover qualification against disposable PostgreSQL 18; no failures reported at this observation.
- The prior intermediate duplicate-key failure was corrected; the latest exact-head quality job has progressed past TypeScript build and principal tests.

No production roles, memberships, grants, schema, relations, sequences, functions, data, credentials, Render settings, deployments or traffic were changed. The production query was read-only.


## Legacy-role dependency and runtime-membership exception reconciliation — 2026-11-13 18:53 UTC

Reviewed the legacy role qualification harness, remediation audit, role-separation runbook, runtime principal guard and unit tests against the latest production catalog snapshot.

### Canonical application and migration credential boundary — source verified

- Production `src/config.ts` requires `GHM_RUNTIME_DATABASE_URL`; only non-production may fall back to `DATABASE_URL`.
- `src/db/pool.ts` constructs the application pool from `config.databaseUrl`.
- `src/server.ts` performs the principal check before the server begins listening.
- The startup query requires both `session_user` and `current_user` to be `ghm_runtime`, verifies its role attributes and database/schema privileges, and checks role membership topology.
- The migration runner independently requires `GHM_MIGRATOR_DATABASE_URL`, connects as `ghm_migrator`, validates its exact role/membership contract, and enters `ghm_schema_owner` with explicit SET ROLE.
- The legacy dependency harness statically excludes executable/config references to `ghm_app_user` and `ghm_db_user`, and dynamically checks configured runtime/migrator credentials and role reachability. It is read-only and does not authorize role mutation.

This corrects the earlier documentation shorthand that described runtime as using `DATABASE_URL`: in production the required variable is `GHM_RUNTIME_DATABASE_URL`; `DATABASE_URL` is only a non-production fallback.

### Runtime's explicit legacy bootstrap-membership exception

The production runtime startup SQL deliberately permits the isolated `ghm_db_user → ghm_runtime` membership edge while rejecting other unexpected memberships. Its runtime-principal unit test explicitly describes this as the isolated Render administrator membership.

Production catalog evidence for that edge:
- grantor: `ghm_db_user`
- ADMIN OPTION: true
- INHERIT OPTION: false
- SET OPTION: false

This means the legacy administrator can administer the membership edge, but the edge does not currently provide inheritance or SET ROLE capability to `ghm_runtime` from `ghm_db_user`. Do not misstate it as a runtime inherited authority path. It remains an administrative membership dependency that must be resolved through the provider/bootstrap authority path.

The production runtime guard's special case is deliberate compatibility with the current Render-managed bootstrap topology. Do not remove that exception from source until provider-supported cleanup is ready and the exact production role graph has been reconciled; otherwise the next runtime startup would fail closed.

### Existing read-only qualification gates

The legacy dependency contract explicitly requires:
1. runtime URL resolves to `ghm_runtime`;
2. migrator URL resolves to `ghm_migrator`;
3. runtime has no transitive path to migrator or schema owner;
4. migrator retains its schema-owner SET path;
5. runtime and migrator are distinct identities;
6. no executable/config dependency on legacy role names;
7. auth, recovery and QuoteFlow migration reset use canonical GHM persistence;
8. no mutation.

The older legacy-role remediation audit also inventories ownership, schema/table/database privileges and transitive role paths, and explicitly says not to mutate until runtime/migration/recovery dependencies, two legacy `public.users` rows and object ownership are reconciled. This remains the correct order. The two legacy public user rows must not be deleted or inferred by email.

### Production versus source status

- The intended source contract for migration topology is stricter than the current production topology: production has the additional `ghm_db_user` membership in `ghm_migrator` and `ghm_schema_owner`, both with ADMIN OPTION.
- The runtime has its separately documented and source-tested Render bootstrap exception on `ghm_db_user → ghm_runtime`.
- Provider-granted ADMIN OPTION edges were granted by `postgres`; application credentials are not the correct remediation authority.
- No evidence in this pass establishes that the deployed process has opened a DB connection as `ghm_runtime`; source/startup guard and configured variable requirement are verified, live application-origin identity remains outstanding.

### Exact-head CI status

Latest documentation head `b456edc163007313e6b72ab1104c2af7b416cf51`, run https://github.com/zaidhqdev-sys/GHM/actions/runs/43486429850:
- web-quality: passed, 11/11.
- quality: 40/64 steps passed; currently running the Campaign and directory-review signed actor gateway qualification on disposable PostgreSQL 18. No failures reported at this observation.

No production roles, memberships, grants, schema, relations, sequences, functions, data, credentials, Render settings, deployments or traffic were changed. All production SQL was read-only.


## Production SECURITY DEFINER and Actor Gateway cutover baseline — 2026-11-13 18:56 UTC

A read-only production catalog inventory was executed against Render `ghm_db`. This is a live baseline, not an assertion that the current construction branch has already been deployed.

### Deployment boundary

The current Render service deployment remains commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf` from 2026-11-10. The current PR #276 construction branch is ahead of that deployment and automatic deploy remains OFF. Therefore differences between the new branch's intended migrations and live production must be tracked as a pending production cutover, not silently described as a failed migration on the deployed version.

### SECURITY DEFINER inventory

Live catalog:
- 63 SECURITY DEFINER functions in schema `ghm`.
- 50 direct non-owner EXECUTE ACL entries across the inventory.
- 0 PUBLIC EXECUTE grants on those SECURITY DEFINER functions.
- All 63 are owned by `ghm_schema_owner` (ownership guard query in the source migration requires this).
- 60 functions do not yet have the exact hardened `search_path = pg_catalog, ghm, pg_temp`; many currently have `pg_catalog, ghm`, and a small number have legacy `ghm, pg_temp` orderings. Migration `20261112090000_pin_security_definer_search_path.sql` normalizes every GHM SECURITY DEFINER function to the explicit temporary-schema-safe order `pg_catalog, ghm, pg_temp`.

The audit script's local-only restriction is deliberate: `scripts/audit-security-definer-acl.mjs` refuses any target other than localhost `ghm_disposable_test`. Do not weaken that restriction or repurpose it to connect directly to production. The live catalog comparison in this handover was performed through separate read-only provider query operations.

### Exact Connect business-mapping helper discrepancy

Production currently reports:
- `ghm.auth_link_business_external_mapping(text,text,bigint)` exists and is owned by `ghm_schema_owner`.
- `ghm_runtime` has effective EXECUTE on it.
- Direct ACL entries include `ghm_runtime` and `ghm_schema_owner`.

The construction migration `20261112080000_signed_connect_business_provisioning_gateway.sql` explicitly revokes EXECUTE from PUBLIC, `ghm_runtime`, `ghm_migrator`, `ghm_actor_gateway`, `ghm_auth_issuer` and `ghm_payment_provider`; the signed wrapper calls the helper as its SECURITY DEFINER owner. No later migration in the current source tree re-grants runtime access to this helper.

This is a genuine live-versus-target ACL delta. Because production is still running the 2026-11-10 deployment and the signed provisioning migration belongs to the newer construction work, the likely explanation is that the production cutover has not yet applied this migration. The migration ledger could not be read with the read-only query observer (SELECT denied), so do not claim the migration's ledger status has been verified. Before production rollout, compare the migration ledger through the authorized migration/audit identity and run the disposable signed-provisioning qualification.

### Actor Gateway live baseline — distinguish trigger functions

Production has zero routines named `gateway_%` and zero SECURITY DEFINER routines named `gateway_%`. It also has zero direct Actor Gateway EXECUTE ACL entries on SECURITY DEFINER functions in schema `ghm`.

A broad `has_function_privilege('ghm_actor_gateway', ...)` query initially counted 14 trigger functions executable via PostgreSQL's default PUBLIC trigger-function ACL. Those are trigger-returning routines, not callable Actor Gateway API operations, and are excluded from the Actor Gateway startup allow-list by design. Do not report those 14 as gateway operations.

This confirms that the production database has not yet reached the branch's signed Actor Gateway operation surface. The branch's 25-operation gateway allow-list and migrations are pending cutover. Keep PayFast frozen and do not deploy as part of this audit.

### Search-path interpretation

The earlier audit count of unsafe paths is specifically measured against the new exact target `pg_catalog, ghm, pg_temp`. `pg_catalog, ghm` is pinned but does not explicitly place `pg_temp` last; PostgreSQL may search the temporary schema ahead of ordinary schemas when it is omitted. The normalization migration exists to close that temporary-object shadowing exposure. Do not characterize every path as unpinned: many are pinned but not yet temporary-schema-safe under the target invariant.

### Next actions

1. Finish the current exact-head CI and disposable PostgreSQL 18 qualification.
2. Read the production migration ledger only through an authorized read-only migration identity; the current Render query observer is denied SELECT on `ghm.ghm_schema_migrations`.
3. Reconcile the full production-versus-target function signature/ACL/search_path matrix, with explicit separation of trigger functions from callable operations.
4. Qualify the signed Connect business provisioning wrapper and prove runtime denial of the helper before scheduling any production cutover.
5. Keep the production rollout separate from the security construction PR; no deployment or role mutation is authorized by this catalog snapshot.

No production roles, memberships, grants, function definitions, schema, relations, sequences, data, credentials, Render settings, deployments or traffic were changed. All production queries in this pass were read-only.


## Exact production SECURITY DEFINER ACL exception matrix — 2026-11-13 18:58 UTC

Expanded the production read-only inventory from aggregate counts to exact signatures, ACL grantees, grantors and role-effective EXECUTE checks.

### Function shape and ownership

- 63 SECURITY DEFINER routines in `ghm`.
- All 63 are ordinary functions (`prokind = 'f'`); no SECURITY DEFINER procedures.
- All 63 are owned by `ghm_schema_owner`.
- No extension-owned SECURITY DEFINER functions were found in `ghm`.
- No PUBLIC EXECUTE ACL entries were found.
- All 50 non-owner EXECUTE ACL entries are non-grantable and were granted by `ghm_schema_owner`.

This validates that the current search-path migration's `ALTER FUNCTION` loop matches the live routine kinds; no `ALTER PROCEDURE` branch is needed for this production set.

### Exact non-owner ACL distribution

| ACL grantee | Count | Current role |
|---|---:|---|
| `ghm_runtime` | 46 | Application runtime |
| `ghm_migrator` | 2 | Migration identity |
| `ghm_payment_provider` | 2 | Payment integration |
| PUBLIC | 0 | No public execution |
| **Total** | **50** | |

The two migration-only grants are:
- `ghm.auth_lookup_account_external_mapping(text,text)`
- `ghm.auth_lookup_business_external_mapping(text,text)`

The two payment-provider grants are:
- `ghm.commercial_apply_payfast_payment_result(bigint,text,text,text,text,text,text,timestamp with time zone,jsonb)`
- `ghm.commercial_get_payfast_attempt(bigint)`

The 46 runtime grants comprise the existing auth/session/recovery, identity mapping, Connect assertion, QuoteFlow migration reset, Business, directory review, campaign, trust-score and storage operations. The complete exact-signature query result is retained in the live audit record for this checkpoint; do not bulk-revoke this set. Each operation must be mapped to its replacement gateway/API path and tested before a future privilege change.

### Connect mapping helper confirmed

`ghm.auth_link_business_external_mapping(text,text,bigint)` has a direct EXECUTE ACL for `ghm_runtime` in production, granted by `ghm_schema_owner`, and `has_function_privilege('ghm_runtime', ...)` returns true. The new signed provisioning migration explicitly revokes this ACL. The signed wrapper is owned by `ghm_schema_owner`, so its internal helper invocation executes with owner authority; the caller remains `ghm_actor_gateway` and is authenticated by the signed assertion check.

### Search-path migration scope confirmed

All 63 SECURITY DEFINER routines in production are ordinary functions, so the migration's dynamic `ALTER FUNCTION <identity signature> SET search_path = pg_catalog, ghm, pg_temp` loop is compatible with the current catalog. No extension-owned function was detected. The 60 legacy search paths still require normalization; this pass did not alter them.

### Latest exact-head CI

Run https://github.com/zaidhqdev-sys/GHM/actions/runs/43487403745 on exact handover head `a153aca0f15a9a6c84a64826c6e28e0beaf6e068`:
- web-quality: passed, 11/11.
- quality: 39/64 steps passed and currently running the test suite; no failure reported at the observation.
- PR #276 remains open and unmerged.

### Outstanding

1. Let exact-head quality finish and inspect any failure before proceeding.
2. Complete per-signature source-to-production ACL disposition for the 46 runtime grants and the 2 migrator grants.
3. Obtain production migration ledger evidence using an authorized read-only migration identity; current observer remains denied SELECT.
4. Complete disposable PostgreSQL 18 tests for signed Connect provisioning, runtime denial of the helper, signature/replay failures and atomic rollback.
5. Do not deploy or revoke production ACLs as part of this audit.

No production ACLs, function definitions, roles, memberships, schema, data, credentials, Render settings, deployments or traffic were changed. All production queries were read-only.


## Runtime grant-to-cutover reconciliation — production snapshot 2026-11-13 19:01 UTC

Re-queried the live SECURITY DEFINER routines for effective `ghm_runtime` EXECUTE. This was read-only. It returns 46 effective runtime grants, matching the earlier aggregate, now grouped by exact routine identity.

### Important Authentication Issuer pre-cutover mismatch

The construction branch's `scripts/qualify-auth-issuer-precutover.mjs` requires an exact 16-function Resource API auth allow-list. The current production catalog instead has 24 auth-prefixed SECURITY DEFINER functions effectively executable by `ghm_runtime`.

The eight additional production functions not in the pre-cutover allow-list are:
- `ghm.auth_bootstrap_external_identity(text,text,text,text)`
- `ghm.auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)`
- `ghm.auth_disable_account(bigint)`
- `ghm.auth_link_business_external_mapping(text,text,bigint)`
- `ghm.auth_link_external_identity(text,text,bigint)`
- `ghm.auth_provision_migration_account(text,text,text,text)`
- `ghm.auth_read_account_email(bigint)`
- `ghm.auth_read_connect_identity_authority(bigint)`
- `ghm.auth_register_quoteflow_migration_reset_enrollment(bigint,text,text,text,text,text)`
- `ghm.auth_revoke_all_sessions_for_account(bigint,text)`
- `ghm.auth_revoke_session(bigint,text)`

Correction: the list above contains **11** functions, not eight; the live set is 24 while the pre-cutover allow-list is 16, but three of the eleven listed legacy functions are explicitly conditionally revoked by the issuer cutover and one is revoked by the dedicated QuoteFlow enrollment migration. Therefore the raw production-vs-precutover delta must be reconciled by migration sequence, not summarized as eight final retained extras. The following six functions are not explicitly revoked by the current issuer cutover or the QuoteFlow registration migration and need a caller/owner disposition before the pre-cutover exact allow-list can pass:
- `auth_bootstrap_external_identity`
- `auth_change_password`
- `auth_disable_account`
- `auth_link_external_identity`
- `auth_provision_migration_account`
- `auth_revoke_session`

Do not blindly add these to the issuer or revoke them. Trace their active route callers and determine whether they remain Resource API responsibilities, require issuer ownership, or are obsolete legacy capabilities. In particular, `auth_change_password` and `auth_revoke_session` may be user-session-bound operations and must not be removed until their current call sites are understood.

### Issuer role is not yet provisioned in production

A read-only role-aware ACL query referencing `ghm_auth_issuer` failed with PostgreSQL `42704`: role `ghm_auth_issuer` does not exist in current production. The existing manual issuer cutover correctly guards for this role and intentionally does not create credentials. This is a separate provider/bootstrap prerequisite: provision the isolated least-privilege login and credential through the approved Render/provider process, then verify its attributes and bounded administrator membership before any cutover. No role was created.

### Complete production runtime effective function groups

- Auth-prefixed: 24.
- Business profile/capability/saved-business/hours/logo/trust: 9 named by current grouping.
- Campaign/directory review: 3.
- Business registration identity: 2.
- Storage metadata/public logo: 6.
- Other capability helpers: 2.
Total SECURITY DEFINER functions effectively executable by runtime: 46.

The exact production runtime signature list was retrieved through read-only catalog SQL. Note that `auth_read_account_email`, `auth_read_connect_identity_authority` and `auth_revoke_all_sessions_for_account` are explicitly covered by conditional revocation in the manual issuer cutover; `auth_register_quoteflow_migration_reset_enrollment` is revoked by `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql`. The other six named above require explicit route disposition.

### Existing gateway/cutover coverage verified from source

- Connect Business provisioning migration revokes direct runtime execution on `auth_link_business_external_mapping` and routes provisioning through the signed gateway wrapper.
- Business profile qualification proves runtime direct RPC denial and tests forged, expired, replayed and context-mismatched assertions.
- Storage gateway migrations create signed wrappers for five metadata lifecycle operations; their dedicated qualification snapshots and restores exact legacy ACLs on disposable PostgreSQL.
- Campaign/directory-review manual cutover revokes the three legacy runtime functions and has direct runtime-denial tests.
- Actor identity/registration migration and qualification already test runtime denial of the old identity helpers and unsigned gateway calls.

### CI at this checkpoint

Run https://github.com/zaidhqdev-sys/GHM/actions/runs/43487713624, exact handover head `0f685eb4bddb897e8f1f0d3736e4c7bc28a0262f`:
- web-quality: passed 11/11.
- quality: 57/64, currently executing `Qualify isolated auth issuer lifecycle and runtime denials on disposable PostgreSQL`; no failure reported at this observation.

### Required next steps

1. Reconcile the six unhandled auth routine callers and update either route ownership, the exact pre-cutover allow-list, or the cutover only where justified by source behavior.
2. Provision `ghm_auth_issuer` through the approved provider/bootstrap path; never create it with application credentials or an untracked ad hoc SQL grant.
3. Re-run the complete pre-cutover 16-function contract against a disposable clone with the full production baseline and migration sequence.
4. Keep all cutovers manual and independently gated by route deployment, issuer service health, secret provisioning, client configuration and rollback readiness.
5. No production ACL or role changes until these mismatches are resolved and the disposable qualification passes.

No production roles, memberships, grants, function definitions, schema, data, credentials, Render settings, deployments or traffic were changed. The role lookup failure was read-only and did not mutate production.


## Correction — six apparent legacy auth exceptions are already covered by migrations (2026-11-13 19:04 UTC)

Re-opened the exact migration sources after the previous checkpoint's production-versus-branch comparison. The earlier statement that six functions remained unhandled was incorrect. All six have explicit, source-controlled runtime revocation migrations; they are not outstanding allow-list exceptions.

| Function | Correct disposition | Source migration |
|---|---|---|
| `ghm.auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)` | Unused account-ID operation; remove runtime EXECUTE | `20261111220000_revoke_unused_auth_runtime_entry_points.sql` |
| `ghm.auth_disable_account(bigint)` | Unused account-ID operation; remove runtime EXECUTE | `20261111220000_revoke_unused_auth_runtime_entry_points.sql` |
| `ghm.auth_revoke_session(bigint,text)` | Unused account/session-ID operation; remove runtime EXECUTE | `20261111220000_revoke_unused_auth_runtime_entry_points.sql` |
| `ghm.auth_link_external_identity(text,text,bigint)` | Operator/migration-controlled linking; remove runtime EXECUTE | `20261111250000_revoke_runtime_external_identity_link.sql` |
| `ghm.auth_bootstrap_external_identity(text,text,text,text)` | Operator/migration-controlled bootstrap; remove runtime EXECUTE | `20261111260000_revoke_runtime_external_identity_bootstrap.sql` |
| `ghm.auth_provision_migration_account(text,text,text,text)` | QuoteFlow migration-only account provisioning; remove runtime EXECUTE | `20261111240000_revoke_runtime_quoteflow_migration_provisioning.sql` |

Additional allow-list deltas are explicitly handled by:
- `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql` — removes the operator-only reset enrollment registration function from runtime.
- `20261112080000_signed_connect_business_provisioning_gateway.sql` — removes direct runtime access to `auth_link_business_external_mapping`, retaining it as an internal helper of signed Connect Business provisioning.
- The manual Authentication Issuer cutover conditionally removes three historical account-ID authority wrappers (`auth_read_account_email`, `auth_read_connect_identity_authority`, `auth_revoke_all_sessions_for_account`) where present.

The six listed functions are therefore **not** reasons to expand the 16-function pre-issuer Resource API allow-list or create more revocation migrations. Their route/application disposition is consistent with the existing comments: the first three have no active HTTP/application callers; the latter three are operator/migration-only paths. The migration account provisioning service itself remains a governed migration workflow, not an ordinary runtime route.

### Corrected outstanding verification

1. The production catalog is still at the older deployed migration level; the current observer cannot SELECT the migration ledger. Therefore we have not established which of these source migrations are present in production.
2. Run the complete migration sequence against the disposable PostgreSQL 18 database and require `qualify-auth-issuer-precutover.mjs` to prove exactly the documented 16 runtime auth functions.
3. Verify that the six legacy functions above are denied to `ghm_runtime` after the applicable migrations, and that the dedicated `ghm_migrator → ghm_schema_owner` migration path remains functional where needed.
4. Keep the manual issuer cutover separate; it must only be qualified after isolated issuer role provisioning and all client/resource route cutovers.

### CI observation

Run https://github.com/zaidhqdev-sys/GHM/actions/runs/43488222423 on preceding head `0bc51bef38c84e9364ebbdb49abfda75dcbfebb7`:
- web-quality: passed 11/11.
- quality: 45/64 at observation, currently qualifying the Saved Business signed gateway cutover; no failure reported.

No production roles, memberships, grants, function definitions, schema, data, credentials, Render settings, deployments or traffic were changed. This correction is source review and handover documentation only.

## 2026-11-13 19:07 UTC — complete exact-head Authentication Issuer qualification

Exact-head workflow **43488670407** completed successfully on commit `338f2b835e6626bee3473ab4840a45ad7040e74f` (PR #276):
- `quality`: passed.
- `web-quality`: passed.
- The issuer-specific sequence all passed: isolated principal qualification; pre-cutover whole-database SECURITY DEFINER inventory; exact pre-issuer Resource API authentication grant allow-list; guarded manual cutover against disposable PostgreSQL only; isolated issuer lifecycle/runtime denial qualification; post-cutover inventory; strict pre/post inventory comparison; evidence preservation.
- No failed workflow steps.

### Retrieved and inspected evidence artifact

Artifact: [security-definer-authority-inventory, ID 14068397949](https://github.com/zaidhqdev-sys/GHM/actions/runs/43488670407/artifacts/14068397949).

Both inventories identify the target as `ghm_disposable_test`, PostgreSQL 18.7, session/current user `ghm_migrator`, and `mutation: false`. Each contains 106 SECURITY DEFINER routines, all owned by `ghm_schema_owner`, with all 106 normalized to `search_path=pg_catalog, ghm, pg_temp`.

Pre/post result:
- Pre-cutover auth-prefixed function ACLs: exactly 16 EXECUTE grants to `ghm_runtime`.
- Post-cutover: exactly 10 EXECUTE grants to `ghm_auth_issuer` and exactly 2 retained runtime auth lookup grants (`auth_lookup_external_identity` and `auth_lookup_business_external_mapping`). The other legacy auth-prefixed routines have no direct runtime EXECUTE.
- 14 auth routine ACL identities changed as part of the issuer cutover.
- Routine identity set remained unchanged (106 before and after).
- Non-issuer function definitions and ACLs unchanged.
- Role memberships and role attributes unchanged.
- Database privileges, column privileges and function default ACLs unchanged.
- Only reviewed schema privilege delta: `ghm_auth_issuer` received schema USAGE; CREATE remained denied.
- Unexplained non-issuer changes: 0.
- Comparator decision: `STRUCTURAL_COMPARISON_PASSED; AUTH ISSUER ACLS REQUIRE DEDICATED CUTOVER QUALIFICATION`. The dedicated lifecycle/runtime-denial qualification also passed in the same workflow.

This is disposable PostgreSQL qualification evidence only. It does not establish that the production issuer role exists, that production migrations are applied, or that a production issuer service/secret/client route is provisioned.

### Current PR and production boundary

PR #276 remains open and unmerged. It is stacked on PR #272's integration branch and must not be merged independently. No production database mutation, production role/ACL change, Render environment change, service deployment, traffic switch or credential provisioning occurred. Render auto-deploy remains OFF. PayFast remains out of scope.

### Next release gates

1. Obtain authorized read-only production migration-ledger evidence; the current production observer cannot SELECT the ledger.
2. Reconcile the production migration state and production SECURITY DEFINER ACL inventory against this exact qualified migration sequence. Do not infer production state from the disposable artifact.
3. Complete production-only Project↔Opportunity reconciliation before any mainline merge.
4. Provision the isolated production Authentication Issuer role/service/secret through the controlled provider process, then independently verify its identity and health before any manual production cutover. No credentials or roles are to be improvised.
5. Reconcile PR #276/#272 as a mainline-based integration series; preserve the already-merged Resource API runtime principal changes and avoid merging the current stacked aggregate blindly.

No production roles, memberships, grants, function definitions, schema, data, credentials, Render settings, deployments or traffic were changed in this qualification.
