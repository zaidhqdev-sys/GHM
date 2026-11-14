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

## 2026-11-13 19:10 UTC — production Project↔Opportunity read-only reconciliation

Queried the live Render production database `ghm_db` through the existing observer connection (`session_user=ghm_app_user`, `current_user=ghm_db_user`). All queries ran through the read-only database query interface.

- Confirmed `ghm.project.opportunity_id` exists and references the canonical Opportunity model; the production schema exposes the expected Project, Opportunity and Opportunity Type columns.
- Aggregate reconciliation returned: Projects 0; linked Projects 0; unlinked Projects 0; orphaned Project links 0; links to non-`project` Opportunity types 0; linked title/description/creator-account mismatches 0.
- The separate project-type Opportunity count also returned no rows (zero project-type Opportunities).

This establishes that there are currently no production Project or project-type Opportunity records requiring repair. It does **not** prove the historical migration ledger is complete: an attempted read of `ghm.ghm_schema_migrations` was denied with PostgreSQL SQLSTATE 42501 (permission denied). The table exists, but the observer cannot read its contents. The earlier probe against the guessed `public` ledger relation was not applicable; the actual table is in schema `ghm`.

### Updated release gate

The data-level Project↔Opportunity reconciliation is complete with zero records and zero discrepancies. The production migration-ledger verification remains blocked on an authorized read-only identity. No privilege was granted to the observer and no production data or schema was changed.

## 2026-11-13 19:14 UTC — final exact-head CI and production ledger ACL diagnosis

The handover update at `fec8923302e629eb255f4cae2eaa1e96e39d9dc5` completed exact-head CI run **43489777884** successfully:
- `quality`: 65/65 steps passed.
- `web-quality`: 11/11 steps passed.
- No failed steps.
- Artifact `security-definer-authority-inventory` (ID `14068318776`) was retrieved and inspected. Its two whole-database snapshots and comparison agree with the previous exact-head run: 106 routines pre/post, 16 runtime auth grants pre-cutover, 10 issuer grants plus 2 runtime identity lookups post-cutover, 14 auth ACL identities changed, no routine identity changes, no unexplained non-issuer changes, and dedicated issuer lifecycle qualification passed. Both snapshots are explicitly from disposable database `ghm_disposable_test`, PostgreSQL 18.7, with `mutation=false`.

### Additional production ledger catalog evidence

Read-only inspection of `ghm.ghm_schema_migrations` established:
- Relation owner: `ghm_schema_owner`.
- Relation ACL is NULL (no explicit relation ACL entries; access is owner/default-derived).
- `information_schema.role_table_grants` returned no grant rows for this relation.
- Current observer is `session_user=ghm_app_user`, `current_user=ghm_db_user`; SELECT is denied.
- Catalog role attributes observed: `ghm_db_user` has LOGIN, CREATEDB and CREATEROLE (not SUPERUSER); `ghm_app_user` and `ghm_migrator` have LOGIN without CREATEDB/CREATEROLE; `ghm_schema_owner` is NOLOGIN without those attributes.

This confirms the ledger is owner-protected and the current observer is not an authorized ledger reader. It does not reveal applied migration versions/checksums. No grants, memberships, role attributes or table ACLs were changed. Do not elevate the application observer or use the powerful `ghm_db_user` identity for routine ledger access; obtain an approved read-only evidence path through the existing owner/provider process.

### PR topology and merge gate

At this checkpoint PR #276 is still a draft, based on `integration/capability-gateway-qualification-20261110` at `c81e2bf2534febef9c5e49b39f60f85415f04ff1`; PR #272 is still a draft against `main`. PR #276 must not be merged independently of its base integration series. Exact-head CI is green, but production ledger evidence and mainline integration/review remain outstanding. Production cutover, issuer role/service/secret provisioning, Render changes, deployments and traffic changes remain out of scope.

## 2026-11-13 19:16 UTC — production role-membership boundary confirmed

Additional read-only catalog inspection of production `pg_auth_members` confirms the production role topology is still a material cutover blocker:
- `ghm_app_user` is a member of `ghm_db_user` (non-admin, SET allowed, inherited).
- `ghm_db_user` has ADMIN OPTION (but no SET/INHERIT) over `ghm_actor_gateway`, `ghm_migrator`, `ghm_payment_provider`, `ghm_runtime`, and `ghm_schema_owner`; the grantor reported for these memberships is `postgres`.
- `ghm_db_user` also has a separate non-admin, SET+INHERIT membership in `ghm_runtime`.
- `ghm_migrator` is a member of `ghm_schema_owner` with SET allowed, no ADMIN OPTION, and no INHERIT.

This confirms the observed membership/admin-option topology, but does not establish the provenance or provider-level reason for the postgres-granted memberships. It is consistent with the previously escalated role-separation concern. The migration identity has no direct SELECT on the ledger as currently evaluated; the owner role does. No SET ROLE was attempted, no memberships/role attributes/ACLs were changed, and no production cutover was performed.

### Exact-head workflow after documentation-only update

The preceding handover commit `fec8923302e629eb255f4cae2eaa1e96e39d9dc5` passed run `43489777884` (quality 65/65; web-quality 11/11). This new role-membership evidence update is commit `ea3e457c96d2f2f6be2c075435d938bbd87560d3`; its exact-head workflow `43490550377` has started and must be checked to completion before the latest documentation head is described as green.

The production role membership issue remains a separate release blocker. Do not attempt to revoke the memberships from the app observer or change the provider-managed role graph in this workflow.


## 2026-11-13 19:19 UTC — exact-head stacked integration qualification completed

The latest handover/stacked integration commit `31c4181197770ae04cfdeabf21ca21d5f7c94795` on branch `construction/auth-issuer-stacked-on-pr272-20261113` completed GitHub Actions run [43490703193](https://github.com/zaidhqdev-sys/GHM/actions/runs/43490703193).

### Exact checkout and workflow result

The quality job log independently confirms that GitHub fetched and checked out the exact commit above on the expected construction branch.

- `quality`: 65/65 steps completed successfully; no failed or skipped steps.
- `web-quality`: 11/11 steps completed successfully; no failed or skipped steps.
- The quality job completed the full disposable PostgreSQL migration chain, build and test suite; issuer principal qualification; Actor Gateway and storage/business qualifications; exact pre-issuer Resource API grant check; guarded manual issuer cutover against disposable PostgreSQL; issuer lifecycle/runtime-denial qualification; post-cutover SECURITY DEFINER inventory; strict pre/post comparison; and evidence preservation.
- This is CI/disposable-database evidence only. It does not establish production role provisioning, production migration state, production ACL state after cutover, or a deployed issuer/gateway service.

### Latest authority-inventory artifact

GitHub artifact: [security-definer-authority-inventory, ID 14069067834](https://github.com/zaidhqdev-sys/GHM/actions/runs/43490703193/artifacts/14069067834).

Artifact ZIP SHA-256 reported by GitHub:
`2e5fffd3f0b05ee0619809ba98676a6487ddd81fc20db37506f4f34864dd67df`.

Retrieved ZIP contains:
- `security-definer-authority-audit.json` — pre-cutover snapshot; SHA-256 `d1f7a498e24405b248dda80c3502079e42224aac83d9a5d936a1d3ce9ef8c08b`.
- `security-definer-authority-audit-post-issuer-cutover.json` — post-cutover snapshot; SHA-256 `30c1eafa0724fd14cc161a109febb60eae8d60f66b5e7e22d7df4e6a876671ad`.
- `security-definer-authority-inventory-comparison.json` — comparison; SHA-256 `b3ea9cec33a9d711ea7e88ffb2033e053df02adbc43d6fd5e2eabafb526faf23`.

Both snapshots identify `ghm_disposable_test`, PostgreSQL 18.7, `session_user=current_user=ghm_migrator`, and `mutation=false`. Each contains 106 SECURITY DEFINER routines.

Comparison confirms:
- Routine identity set unchanged: 106 before and after.
- 14 issuer ACL identities changed.
- Pre-cutover: 16 auth-prefixed routines have direct EXECUTE for `ghm_runtime`.
- Post-cutover: 10 issuer functions have direct EXECUTE for `ghm_auth_issuer`; two identity lookup functions remain directly executable by `ghm_runtime`.
- Non-issuer function definitions and ACLs unchanged.
- Role memberships and role attributes unchanged.
- Database privileges, column privileges and function default ACLs unchanged.
- Reviewed schema delta is `ghm_auth_issuer` receiving schema USAGE only; CREATE remains denied.
- Unexplained non-issuer changes: 0.
- Comparator decision: `STRUCTURAL_COMPARISON_PASSED; AUTH ISSUER ACLS REQUIRE DEDICATED CUTOVER QUALIFICATION`; the dedicated issuer lifecycle/runtime-denial qualification also passed in this run.

### Production release gates remain unchanged

The successful disposable cutover does not authorize or prove a production cutover. The current production evidence still shows:
- `ghm_db_user` has provider-granted ADMIN OPTION over `ghm_actor_gateway`, `ghm_migrator`, `ghm_payment_provider`, `ghm_runtime` and `ghm_schema_owner`; current SET/INHERIT flags do not mean the administrator currently has SET/INHERIT through those edges.
- `ghm_app_user` is a member of `ghm_db_user`; the Render role-level setting makes the effective identity `ghm_db_user`.
- `ghm_migrator` has SET-only membership in `ghm_schema_owner`.
- The production migration ledger `ghm.ghm_schema_migrations` is owned by `ghm_schema_owner`; the current observer cannot SELECT it. Applied versions/checksums remain unverified.
- Production Project↔Opportunity data reconciliation is complete: zero Projects, zero project-type Opportunities and zero discrepancies. This does not resolve the migration-ledger gate.
- Production `ghm_auth_issuer` role and separate issuer service are not provisioned/verified. No issuer credentials, production service or secret are to be improvised.

### Next action

Continue with a read-only, source-backed reconciliation of the production role graph against the exact principal guards and manual cutover preconditions. Establish an authorized, non-mutating way to obtain the production migration-ledger versions/checksums through the existing provider/owner process. Do not grant the application observer ledger access, use it to assume roles, revoke provider-managed memberships, rotate credentials, execute production cutover SQL, change Render settings, deploy, or merge the stacked PRs as part of this checkpoint.

PR #276 remains draft/unmerged and dependent on PR #272. Render auto-deploy remains OFF. Production roles, memberships, grants, schema, data, credentials, environment variables, services, deployments and traffic were not changed. PayFast remains paused and excluded.


## 2026-11-13 21:25 SAST — live Resource API identity verification attempt

### Render control-plane state confirmed

Read-only Render inspection confirms the production service is:

- Service: `GHM-Internal-Runtime`
- Service ID: `srv-damupsek1f9s73eq8kkg`
- URL: `https://ghm-internal-runtime.onrender.com`
- Branch: `main`
- Auto-deploy: disabled (`autoDeploy=no`, trigger `off`)
- Latest live deployment: `dep-dbpmv8jrjlhs73abkli0`
- Deployed commit: `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`
- Deployment completed: 2026-11-10 19:26:11Z
- Health check path: `/healthz`

The latest deployment logs independently confirm checkout of commit `c7cf1eb...`, successful build, and process startup. They do not print the database principal or the configured environment-variable names.

### Important distinction: live identity is still NOT proven

The service metadata endpoint does not expose its environment-variable names or values. No Render environment-variable read/list operation is available through the connected interface; no secret values were accessed or changed.

A read-only `pg_stat_activity` sample taken through Render's database query connector showed only the connector's own active query session (`ghm_app_user`), with no distinct application connection at that instant. That observation is not evidence of the Resource API's database principal and must not be misattributed to the service.

A separate read-only query through the Render database connector again returned:
- database: `ghm_db`
- `session_user=ghm_app_user`
- `current_user=ghm_db_user`
- PostgreSQL 18.6

This is the connector's observer identity, not proof of the Resource API connection. The historical role-separation handover records the same managed connection identity and the required target `GHM_RUNTIME_DATABASE_URL` with `session_user=current_user=ghm_runtime`; the live service adoption remains unverified.

The attempt to retrieve app logs for 2026-11-13 18:00–19:24Z returned no entries. The deployment startup log from 2026-11-10 contains only the generic server-listening message and no DB identity assertion output.

### Current decision

**Gate 1 remains OPEN: deployed Resource API database identity is not yet independently observed.** Source requirements and the merged runtime-principal design are not substitutes for runtime evidence.

Next safe evidence path:
1. Use an approved, non-secret-exposing Render configuration inspection to confirm whether `GHM_RUNTIME_DATABASE_URL` is configured on this service (never reveal its value).
2. Obtain a service-originated, sanitized runtime identity assertion or startup diagnostic that reports only database name, `session_user`, `current_user`, and the expected role-membership/attribute checks.
3. Confirm the assertion is emitted by the actual deployed Resource API process, not by the Render query connector or an unrelated service.
4. Only then mark the runtime identity gate complete.

No Render service settings, environment variables, secrets, database roles, memberships, grants, schema, data, deployments or traffic were changed. Render auto-deploy remains OFF. The suspended sandbox and PayFast remain excluded. PR #272/#276 remain unmerged; no production cutover is authorized.


## 2026-11-13 21:30 SAST — merged Resource API principal code is ahead of production

### PR #275 merge state reconciled

GitHub PR metadata confirms:
- PR #274 (Render role-separation support handover): merged 2026-11-12; merge commit `744b91f030d5cfc9257685677aaff148cf1f9f43`.
- PR #275 (Resource API runtime database login isolation): merged 2026-11-12; merge commit `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b`.
- PR #272: open, draft, unmerged; base `main`; head `c81e2bf2534febef9c5e49b39f60f85415f04ff1`.
- PR #276: open, draft, unmerged; stacked on PR #272; current head `9d9c80060c4d8b2b3c859bfd7ea65499b21e083f`.

PR #275's merged contract is explicit: production configuration requires `GHM_RUNTIME_DATABASE_URL`; `DATABASE_URL` is only a non-production fallback; Resource API startup must verify `session_user=current_user=ghm_runtime` and least privilege. Its PR body explicitly prohibited deployment until the runtime credential is provisioned through the controlled secret path and end-to-end identity is verified.

### Critical deployment chronology

Render's live Resource API service is still deployed from `main` at commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`, deployed on 2026-11-10 19:26Z.

PR #275 was merged on 2026-11-12 at merge commit `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b`, after that live deployment.

Therefore the production service has **not deployed the merged PR #275 runtime-principal enforcement**. This is a stronger and more actionable conclusion than the earlier uncertainty about whether the live process adopted `GHM_RUNTIME_DATABASE_URL`: the currently deployed commit predates the code that makes that variable mandatory and verifies the runtime identity.

Do not infer the current process's DB role from the source contract of a later main commit. The deployed service's database identity is still unproven, and the live deployment is demonstrably behind the merged security code.

### Live role catalog rechecked (read-only)

A fresh Render query reconfirmed:
- `ghm_runtime`: LOGIN, NOINHERIT, no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS.
- `ghm_app_user`: LOGIN, INHERIT, member of `ghm_db_user` (SET+INHERIT).
- `ghm_db_user`: LOGIN, CREATEDB, CREATEROLE.
- `ghm_db_user` retains provider-granted ADMIN OPTION over `ghm_actor_gateway`, `ghm_migrator`, `ghm_payment_provider`, `ghm_runtime`, and `ghm_schema_owner`, with INHERIT=false and SET=false on those provider-granted edges.
- `ghm_db_user` also has a distinct non-admin SET+INHERIT membership in `ghm_runtime`.
- `ghm_migrator` has SET-only membership in `ghm_schema_owner`.
- The role graph is unchanged from the recorded provider-managed topology. No role or membership was modified.

### Correct next gate

The immediate blocker is now explicit: **controlled rollout of the already-merged PR #275 runtime identity enforcement**, not another source implementation.

Before any production deployment:
1. Verify that the existing `ghm_runtime` credential is available through the controlled secret-management path without exposing it.
2. Verify that Render service configuration can supply `GHM_RUNTIME_DATABASE_URL` to the existing Resource API service without displaying or copying the secret.
3. Confirm the exact deployment commit and fail-closed startup/rollback behavior.
4. Confirm the production database grants and runtime startup verifier are compatible; no production grant changes are authorized by this note.
5. Only after these checks, make a separately authorized deployment decision. Auto-deploy remains OFF.

No environment variables, secrets, roles, memberships, grants, database objects, service settings, deployments or traffic were changed. The live service remains on `c7cf1eb`. PR #272/#276 remain drafts and unmerged. PayFast remains excluded.


### Runtime-role database grants checked independently (read-only)

The production catalog was also queried for the *target role's* effective database/schema grants, without assuming the query connection was that role. Results for `ghm_runtime`:
- Database CONNECT: true.
- Database CREATE: false.
- Schema `ghm` USAGE: true.
- Schema `ghm` CREATE: false.
- Runtime membership contract: true (no outbound memberships from `ghm_runtime`; only the trusted `ghm_db_user` inbound membership is allowed).

This confirms the currently observed database grants and role graph satisfy these portions of PR #275's startup verifier. It does **not** prove the service has the correct password/connection string, that the process authenticates as `ghm_runtime`, or that the complete startup verifier passes.

The role-level grant preconditions are therefore read-only verified; the service configuration and runtime identity remain outstanding.


## 2026-11-13 21:35 SAST — reconcile historical Render environment inventory

The 2026-10-24 operator-provided inventory is recorded in `docs/operations/handover-production-db-and-render-2026-10-24.md`. It states that production `GHM-Internal-Runtime` had:
- `DATABASE_URL` targeting production database `ghm_db` with the `ghm_runtime` database user.
- `GHM_MIGRATOR_DATABASE_URL` as a separate connection for `ghm_migrator`, added later to the same service.
- The production migrator credential had already been validated and must not be substituted for the runtime URL.

This is relevant pre-existing operator evidence that the production `DATABASE_URL` was intended to authenticate directly as `ghm_runtime`. It corrects the previous checkpoint's overly broad implication that a new runtime credential necessarily needs to be generated or rotated.

### What this historical inventory does and does not establish

- It records the variable names and safe connection-target metadata supplied by the operator on 2026-10-24.
- It does **not** contain the password or complete connection URL, and it is not a live read-back of the current Render Environment page.
- The later 2026-11-12/13 deployment and PR #275 records establish that production code now expects the explicit name `GHM_RUNTIME_DATABASE_URL`, while the live deployment remains on older commit `c7cf1eb`.
- No evidence found in the handovers says the underlying production `DATABASE_URL` credential was rotated away from `ghm_runtime`; equally, the October inventory alone cannot prove that its current value has not changed since then.

### Corrected next step — reuse the existing credential, do not rotate by default

Do not create or rotate a `ghm_runtime` password merely to satisfy the new variable name.

The preferred operational path is to preserve the existing `DATABASE_URL` value and make the explicit `GHM_RUNTIME_DATABASE_URL` key resolve to that same existing credential through a controlled Render configuration action, without reading the value into chat, Git, logs or tool output. The generic `DATABASE_URL` key should remain unchanged until the new deployment is verified and any later cleanup is separately planned.

The available Render service-variable update operation can merge a supplied key/value without retrieving existing variables, but it cannot copy an unknown existing secret value by itself. The connected Render API surface currently exposes no safe read/list action for service variable values or a server-side same-service variable-copy operation. Do not guess interpolation syntax or submit a placeholder value. The remaining operational step is therefore to duplicate the existing `DATABASE_URL` value into `GHM_RUNTIME_DATABASE_URL` in the Render Dashboard's Environment page, keeping the value out of the conversation. Save without deploying first; verify both keys exist by name without revealing values; then separately authorize and execute the manual deployment decision.

The runtime startup verifier remains the authoritative final check: it must observe `session_user=current_user=ghm_runtime` and all least-privilege flags before the API listens. If the old `DATABASE_URL` no longer authenticates as `ghm_runtime`, startup must fail closed; do not weaken the verifier.

No Render variables, credentials, services, deployments, database roles, memberships, grants, data or traffic were changed by this reconciliation.


## 2026-11-14 01:37 SAST — operator supplied complete Render environment inventory; prior credential-reuse conclusion withdrawn

The operator supplied the complete visible environment-variable inventory for GHM-Internal-Runtime. This is direct current configuration evidence and supersedes the older 2026-10-24 handover assumption that the production `DATABASE_URL` targeted `ghm_db`.

### Confirmed environment facts

- `GHM_RUNTIME_DATABASE_URL` is **absent**.
- `DATABASE_URL` is configured with username `ghm_runtime`, but its host is Render resource `dpg-db4416vlk1mc73eocug0` and its database is `ghm_payfast_sandbox_db`.
- `GHM_MIGRATOR_DATABASE_URL` targets that same sandbox host/database.
- `GHM_MIGRATION_DATABASE_HOST`, `GHM_MIGRATION_DATABASE_NAME`, `GHM_NONPRODUCTION_DATABASE_NAME`, and `GHM_QUALIFICATION_DATABASE_NAME` also identify the sandbox resource/database.
- The environment includes `PAYFAST_ENVIRONMENT=sandbox` and a sandbox JWT key identifier. PayFast remains excluded from the current work; these values are recorded as configuration drift indicators only.
- The supplied list contains no credential values in clear text; secrets were redacted by the operator.

### Material correction to the previous checkpoint

The prior 2026-11-13 note proposed copying the existing `DATABASE_URL` value into `GHM_RUNTIME_DATABASE_URL`. That recommendation is **withdrawn and must not be followed**. Although the username is `ghm_runtime`, the actual target is `ghm_payfast_sandbox_db`, not production `ghm_db`. Duplicating it would preserve the wrong database target and could make the production Resource API connect to the retired/suspended sandbox database.

The historical 2026-10-24 operator inventory was stale or described a different configuration state. It is not authoritative for the current Render environment supplied on 2026-11-14.

### Correct production configuration target

The production Resource API must be configured to connect to the existing production PostgreSQL resource/database:
- Render production PostgreSQL resource ID previously inspected: `dpg-dag0sdtbedkc7389vi2g-a`.
- Production database: `ghm_db`.
- Intended login: `ghm_runtime`.
- Required explicit variable: `GHM_RUNTIME_DATABASE_URL`.
- Required startup identity: `session_user=current_user=ghm_runtime`.

The current `DATABASE_URL` must not be copied, repointed, or deleted until a separately controlled production configuration plan is established. The existing migrator URL is also pointed at sandbox and must not be reused as the runtime URL.

### Next safe actions

1. Treat this supplied inventory as the current baseline and correct the stale October handover assumption.
2. Establish the approved production `ghm_runtime` credential/connection string for `ghm_db` through Render's controlled secret path. Do not expose the password or full URI in chat, Git, logs, or command output.
3. Add `GHM_RUNTIME_DATABASE_URL` only with the production `ghm_db` target and existing approved `ghm_runtime` login. Do not change `DATABASE_URL` or migrator variables as part of this step.
4. Keep Render auto-deploy OFF. Save configuration without deploying; independently verify the variable name and target metadata without revealing its secret.
5. Review the complete PR #275 startup verifier and deployment/rollback plan against the production database. Only then make a separately authorized manual deployment decision.
6. After deployment, require service-originated startup evidence for database `ghm_db`, `session_user=current_user=ghm_runtime`, and all least-privilege checks before considering the runtime identity gate passed.

No Render environment variables, credentials, services, deployments, database roles, memberships, grants, schema, data or traffic were changed by this investigation. The production Resource API remains deployed at `c7cf1eb`; auto-deploy remains OFF. PR #272/#276 remain unmerged. The suspended sandbox and PayFast remain excluded.


### Production Render database resource metadata reconfirmed

Read-only Render Postgres resource lookup confirms:
- Resource: `ghm-db` (`dpg-dag0sdtbedkc7389vi2g-a`).
- Database: `ghm_db`.
- Region: Frankfurt.
- PostgreSQL major version: 18.
- Status: available; not suspended.
- Render resource metadata's default `databaseUser` is `ghm_app_user`.

That `databaseUser` field describes the Render-managed default database credential; it is not evidence that the application must use it, nor does it invalidate the separately cataloged `ghm_runtime` LOGIN role. The Resource API contract remains the explicit `ghm_runtime` login, and the service must authenticate with that role.

The operator-provided current service inventory points at a different resource/database (`dpg-db4416vlk1mc73eocug0` / `ghm_payfast_sandbox_db`). The two resource IDs and database names are distinct. Do not copy that URL into production configuration.

PR #275 merged contract was re-read: production requires `GHM_RUNTIME_DATABASE_URL`; `DATABASE_URL` is a non-production fallback only; startup fails closed unless `session_user=current_user=ghm_runtime` and the complete least-privilege verifier passes. No deployment is permitted until the production-target runtime URL is provisioned.



## 2026-11-14 01:45 SAST — full GHM-Internal-Runtime environment reconciliation

The operator correctly identified that this is a broader sandbox-to-production environment drift issue, not only a missing runtime URL. The complete variable inventory supplied on 2026-11-13 has been reconciled against current `main` source, `.env.example`, the production configuration contract, the isolated issuer ADR/runbook, and the PayFast isolation ADR.

No secret values are reproduced here.

### A. Database target drift — critical

| Current variable | Supplied target/value | Assessment / intended handling |
|---|---|---|
| `DATABASE_URL` | `ghm_runtime` on sandbox resource `dpg-db4416vlk1mc73eocug0-a`, DB `ghm_payfast_sandbox_db` | Wrong target for the production Resource API. Do not copy or deploy. Preserve temporarily until a controlled config change replaces its role in the new contract. |
| `GHM_RUNTIME_DATABASE_URL` | Absent | Mandatory in production per merged PR #275 and current `src/config.ts`. Must target production resource `dpg-dag0sdtbedkc7389vi2g-a`, DB `ghm_db`, login `ghm_runtime`. |
| `GHM_MIGRATOR_DATABASE_URL` | `ghm_migrator` on sandbox resource, DB `ghm_payfast_sandbox_db` | Wrong target for production migrations. Must not be used for Resource API. A production migrator connection is a separate credential and must be provisioned/verified through the controlled migration path; do not overwrite it blindly. |
| `GHM_MIGRATION_DATABASE_HOST` / `GHM_MIGRATION_DATABASE_NAME` | Sandbox host/name | Sandbox metadata, not present in current `.env.example` or the Resource API config contract. Determine whether any live process/script consumes them before removal. |
| `GHM_NONPRODUCTION_DATABASE_NAME` / `GHM_QUALIFICATION_DATABASE_NAME` | Sandbox DB name | Non-production/qualification metadata, not part of the current Resource API config contract. Do not point these at production. Determine whether consumed by a live process before removal. |

The current production database resource was independently reconfirmed as Render `ghm-db`, ID `dpg-dag0sdtbedkc7389vi2g-a`, database `ghm_db`, PostgreSQL 18. The service-supplied database host is a different Render resource and database. Do not revive or reuse the suspended sandbox.

### B. Authentication and signing material — cutover-dependent

| Current variable | Supplied state | Assessment / intended handling |
|---|---|---|
| `GHM_JWT_ES256_KID` | `ghm-sandbox-20261012-01` | Sandbox-labelled key ID remains in the current service. Do not rename or rotate in isolation: existing JWTs and client verifiers depend on the key ID/public key relationship. Plan key-ID transition with issuer cutover and overlap/previous-key support. |
| `GHM_JWT_ES256_PRIVATE_KEY_PEM` | Present (redacted) | Issuer-only secret under the approved isolated issuer ADR. It must ultimately exist only in the Authentication Issuer service, not ordinary Resource API or Actor Gateway. Do not remove from current live Resource API until issuer service, credentials, routing and client compatibility are deployed and verified. |
| `GHM_JWT_ES256_PUBLIC_KEY_PEM` | Present (redacted) | Public verification material is expected on Resource API and Actor Gateway; retain the verified public key and matching KID for verifier use. |
| `GHM_AUTH_TOKEN_PEPPER` | Present (redacted) | Refresh-token/issuer secret under the isolated issuer ADR; ultimately issuer-only. Do not remove before issuer cutover and confirmation that no Resource API path still needs it. |
| `GHM_WEB_AUTH_ALLOWED_ORIGINS` | One Connect preview deployment URL | Not part of current Resource API `src/config.ts` or `.env.example` configuration contract. It is preview-scoped rather than the canonical Connect production origin. Trace its actual consumer before changing/removing; do not assume it configures `CORS_ORIGINS`. |
| `INVITE_CODE` | Present (redacted) | Required by current Resource API config. Keep secret; rotate only through a deliberate invite-code lifecycle decision, not as part of database target correction. |

The current production Resource API has not deployed PR #275 or the isolated Authentication Issuer cutover. The issuer cutover runbook explicitly says not to remove issuer-only secrets or revoke old auth paths until issuer service readiness, routing and client compatibility are verified. The present private key/pepper placement is therefore a known transitional-state issue, not an instruction to delete them immediately.

### C. Origins and browser access — canonical-origin review required

| Variable | Supplied state | Assessment |
|---|---|---|
| `CORS_ORIGINS` | localhost:5173; `ghm-cu1.pages.dev`; one Cloudflare Pages deployment URL | Contains a local development origin and Cloudflare Pages origins. Validate which Pages origin is the canonical deployed GHM frontend and whether the deployment-specific URL is still required. Do not add wildcard origins. |
| `GHM_WEB_AUTH_ALLOWED_ORIGINS` | Connect Preview URL only | Preview-only value; does not include the canonical Connect production origin in the supplied list. Its consumer must be traced before deciding whether it belongs on this service or a different web-auth/BFF component. |

Current `src/config.ts` parses `CORS_ORIGINS` as an explicit comma-separated list of absolute HTTP(S) origins, rejects wildcard and path-bearing entries, and `src/http/app.ts` applies it to the Resource API CORS middleware. The Connect preview allow-list must not be confused with this Resource API CORS setting.

### D. PayFast — preserve the pause; isolate from core runtime

| Variable group | Supplied state | Assessment |
|---|---|---|
| `PAYFAST_ENVIRONMENT` | `sandbox` | Sandbox mode remains configured. Sandbox service/database is unavailable/retired for this work. Do not switch to `live`. |
| Merchant ID/key and passphrase | Sandbox merchant credentials present; passphrase blank | Keep out of source and handovers. Do not rotate, validate, or repurpose while PayFast is paused. |
| Return/cancel URLs | Connect production URL paths | URLs alone do not make the payment environment production-ready. |
| Notify URL | Old `ghm-payfast-sandbox-runtime` callback URL | Stale callback destination; points to the retired sandbox service. Do not redirect to production until PayFast sandbox access returns and the separate provider callback service is explicitly qualified and approved. |

Current Resource API source still reads `PAYFAST_*` configuration for checkout preparation. The separate callback process requires `PAYFAST_CALLBACK_DATABASE_URL` and `ghm_payment_provider`; its credential must never be put on the ordinary Resource API. The PayFast isolation ADR confirms this service boundary. Keep payment activation frozen and do not use the sandbox merchant settings for live processing.

### E. Storage and general runtime — mostly production-aligned

| Variable | Supplied state | Assessment |
|---|---|---|
| `STORAGE_PROVIDER` | `s3` | Matches current provider contract. |
| `STORAGE_ENDPOINT` | Cloudflare R2 HTTPS endpoint | Production-shaped configuration; retain pending normal storage verification. |
| `STORAGE_REGION` | `auto` | Correct for Cloudflare R2. |
| `STORAGE_BUCKET` | `zaid-ghm-production` | Explicitly production-named bucket; do not change as part of database reconciliation. |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | Present (redacted) | Keep secret; do not disclose or rotate without evidence. |
| `STORAGE_FORCE_PATH_STYLE` | `false` | Consistent with the supplied R2 configuration; current storage config accepts the boolean. |
| `STORAGE_UPLOAD_GRANT_TTL_SECONDS` | 900 | Matches current source variable name and default contract. |
| `STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS` | 3600 | Matches current source variable name and default contract. |
| `DATABASE_SSL` | `true` | Correct production requirement. |
| `NODE_ENV` | `production` | Correct for the production service. |

### F. Safe reconciliation order — no changes made

1. **Do not bulk-replace the environment.** Preserve the supplied inventory as the baseline.
2. First establish the production Resource API URL for `ghm_runtime` against `ghm_db`; verify its target metadata without exposing the password.
3. Establish the production migrator URL independently for `ghm_migrator`; keep it separate from the runtime URL and do not run migrations as part of this environment correction.
4. Add the required `GHM_RUNTIME_DATABASE_URL` and keep auto-deploy OFF. Do not delete or repoint old `DATABASE_URL` until the deployed code and rollback plan are settled.
5. Resolve canonical GHM frontend and Connect origins against their actual production deployments, then update `CORS_ORIGINS` and any separately consumed web-auth allow-list only with proven origins.
6. Keep PayFast variables frozen and explicitly non-live. Do not point callbacks at a production provider service or enable payment processing.
7. Plan Authentication Issuer provisioning/cutover separately. Only after it is live and client-compatible should issuer private key/pepper be removed from Resource API and the sandbox-labelled KID transition be performed.
8. Remove obsolete sandbox metadata variables only after a repository/runtime consumer audit proves they are unused. Do not point qualification variables at production.
9. After configuration changes, manually deploy an exact reviewed commit with auto-deploy still OFF, then verify database identity, health, CORS, storage and auth smoke tests. PayFast remains out of scope.

### Overall conclusion

The environment has mixed state: production application/storage settings coexist with sandbox database endpoints, sandbox-labelled signing identity, preview-only web-auth origin and a retired PayFast callback URL. It is not safe to treat the service as production-configured merely because `NODE_ENV=production`, `DATABASE_SSL=true`, or the bucket name contains `production`.

This handover is an evidence and sequencing update only. No Render environment variable, secret, credential, service, deployment, database role, membership, grant, schema, data, or traffic was changed. Render auto-deploy remains OFF. The suspended sandbox and PayFast remain excluded.


## 2026-11-14 01:55 SAST — source-level environment consumer audit (PR #276 candidate)

The complete operator-supplied GHM-Internal-Runtime environment inventory was traced against `main` and the current stacked PR #276 source, including Resource API configuration, migration runner, Actor Gateway, Authentication Issuer, storage and PayFast entry points. This section distinguishes the currently deployed `main` process from the future candidate topology; candidate-only requirements must not be treated as live service requirements until the candidate is deployed.

### 1. Existing Resource API process — variables actually consumed

| Supplied variable | Current source consumer | Classification |
|---|---|---|
| `NODE_ENV`, `PORT` | Resource API bootstrap/config | Keep. |
| `DATABASE_SSL` | Resource API PostgreSQL pool | Keep true for current production external Render PostgreSQL connection. |
| `DATABASE_URL` | Non-production fallback only in current PR #276 candidate; production config explicitly requires `GHM_RUNTIME_DATABASE_URL` | Current supplied value targets sandbox and is not an acceptable production connection. Do not copy it. |
| `GHM_RUNTIME_DATABASE_URL` | Required by production Resource API config and runtime identity guard | Missing; must be provisioned for production `ghm_db` / `ghm_runtime` before candidate rollout. |
| `INVITE_CODE` | Required Resource API config | Keep secret; no change in this DB/environment work. |
| `CORS_ORIGINS` | Required Resource API config; applied to Express CORS middleware | Keep only verified browser origins required to call Resource API. The supplied localhost origin is development-only; the Cloudflare Pages canonical origin needs confirmation; the per-deployment preview origin is temporary. Connect's canonical browser origin must be explicitly assessed because Connect's bearer-token client calls the Resource API cross-origin. Do not replace the list until exact production callers are confirmed. |
| `TRUST_PROXY` / `TRUST_PROXY_HOPS` | Resource API proxy/rate-limit configuration | Neither supplied. Confirm actual Render proxy hop topology and configure the explicit hop count rather than guessing. |
| `STORAGE_*` | Resource API S3/R2 storage config | The supplied R2 endpoint, `auto` region, production bucket, S3 provider, TTLs and non-path-style setting are consistent with the storage contract. Retain pending ordinary storage qualification; secrets remain redacted. |
| `GHM_ACTOR_GATEWAY_URL` | Optional gateway client URL; production storage startup in PR #276 requires it when storage is enabled | Missing. Candidate Resource API will fail startup with storage enabled until a real, secured Actor Gateway endpoint exists. |
| `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET` | Resource API storage metadata gateway workflow attestation | Missing. Candidate Resource API explicitly fails startup when production storage is enabled and this secret is absent. It must be a canonical base64 32-byte secret shared only with the authorized gateway workflow; do not invent or place it before the gateway is provisioned. |
| `GHM_JWT_ES256_PUBLIC_KEY_PEM`, `GHM_JWT_ES256_KID` | Public token verification material | Present. Retain matching public key/KID on Resource API and Actor Gateway. The supplied KID is sandbox-labelled; do not rename/rotate independently of issuer key overlap and client compatibility. |
| `GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM`, `GHM_JWT_ES256_PREVIOUS_KID` | Optional previous-key overlap | Absent. Only add during an explicitly planned key rotation; both must be paired. |
| `GHM_JWT_ES256_PRIVATE_KEY_PEM`, `GHM_AUTH_TOKEN_PEPPER` | Current deployed `main` still has legacy in-process issuer responsibilities; PR #276 target assigns these secrets to Authentication Issuer only | Transitional secrets. Do not delete from current live service before a separate issuer is deployed, provisioned, routed and end-to-end verified. Do not leave them on Resource API after successful isolated issuer cutover. |
| `PAYFAST_*` | Resource API config and PayFast checkout preparation | Still consumed by current Resource API source. Existing merchant credentials can enable checkout generation; `PAYFAST_ENVIRONMENT=sandbox` and notify URL points to the retired sandbox callback. Payment activation remains frozen. Do not switch to live or redirect callback. A separate PayFast disablement/removal decision is needed before production DB cutover if checkout must be technically impossible. |
| `GHM_WEB_AUTH_ALLOWED_ORIGINS`, `GHM_WEB_AUTH_COOKIE_PATH`, `GHM_WEB_AUTH_COOKIE_MAX_AGE_SECONDS` | Present in candidate `.env.example` as optional browser-cookie contract, but not read by current GHM Resource API or Auth Issuer server source inspected | No current GHM process consumer found. Likely belongs to the Connect same-origin BFF/proxy side or is a stale placeholder. Trace in the Connect repository before moving/removing; do not treat it as a substitute for Resource API `CORS_ORIGINS` or issuer `GHM_AUTH_ISSUER_CORS_ORIGINS`. |

### 2. Variables that belong to a separate migration execution context

| Supplied variable | Source consumer | Required action |
|---|---|---|
| `GHM_MIGRATOR_DATABASE_URL` | `src/db/migrate.ts` only | Current value targets sandbox. It must not be exposed to the ordinary Resource API process. Production migrations require a separate approved connection as `ghm_migrator` to `ghm_db`, used only by a controlled migration execution context. |
| `GHM_MIGRATION_DATABASE_HOST` / `GHM_MIGRATION_DATABASE_NAME` | `src/db/migrate.ts` target guard | Current values identify sandbox. Keep with the controlled migration context only and set to the exact approved production host/database when a production migration is separately authorized. |
| `GHM_NONPRODUCTION_DATABASE_NAME` / `GHM_QUALIFICATION_DATABASE_NAME` | No consumer found in current Resource API, Actor Gateway, Auth Issuer or migration runner source inspected | Remove-candidate from the production Resource API environment after confirming no external Render command/job references them. Never repoint these non-production/qualification markers to production. |

The migration runner asserts the configured target host/database, authenticates as `ghm_migrator`, then SET ROLE `ghm_schema_owner`. It is not part of the normal `npm start` Resource API process. Do not store its credential on the public-facing API service merely for convenience.

### 3. Actor Gateway — target service variables absent from supplied inventory

The isolated Actor Gateway entry point requires:
- `GHM_ACTOR_GATEWAY_DATABASE_URL` — dedicated production `ghm_actor_gateway` login on `ghm_db`.
- `DATABASE_SSL_MODE` — service-specific TLS mode with verified topology.
- `GHM_JWT_ES256_PUBLIC_KEY_PEM` and `GHM_JWT_ES256_KID` — public verification material only.
- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` — required operation assertion secret.
- `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET` — required by the Resource API/gateway storage workflow when storage is enabled.
- `PORT`, `NODE_ENV` as service runtime values.

The supplied Resource API environment has no Actor Gateway URL, gateway database URL, assertion secret, or service-specific TLS setting. No separate production Actor Gateway service is present in the inspected Render service inventory. PR #272 explicitly records that a private Render service requires paid compute and that no additional paid service may be created or sandbox service repurposed under current constraints.

**Result:** the Actor Gateway candidate is not deployable in the current Render topology. The production Resource API candidate also fails closed with storage enabled if its gateway URL and storage attestation secret are absent. Do not bypass those checks or point the URL at the Resource API itself.

### 4. Authentication Issuer — target service variables absent from supplied inventory

The isolated Authentication Issuer entry point requires:
- `GHM_AUTH_ISSUER_DATABASE_URL` — dedicated `ghm_auth_issuer` login on production `ghm_db`.
- `GHM_AUTH_ISSUER_DATABASE_SSL_MODE` — explicit service-specific TLS mode.
- `GHM_AUTH_ISSUER_CORS_ORIGINS` — exact HTTPS origins for supported auth clients.
- `GHM_AUTH_ISSUER_TRUST_PROXY_HOPS` — explicit verified proxy hop count in production.
- `GHM_AUTH_TOKEN_PEPPER` and `GHM_JWT_ES256_PRIVATE_KEY_PEM` — issuer-only secrets.
- Public ES256 verification key/KID as appropriate for issuer token issuance and verification.

The supplied environment has the pepper/private key on the Resource API but no issuer DB URL, issuer TLS mode, issuer CORS list, or issuer proxy-hop configuration. No separate production Authentication Issuer service was present in the inspected Render service inventory. The current no-additional-paid-service constraint also blocks creating the separate service required by this architecture.

**Result:** do not remove the current Resource API signing secrets yet; doing so would break the currently deployed mainline auth path. Conversely, do not deploy the PR #276 isolated issuer cutover until its dedicated process, database login, network path and client routing exist and are qualified. This is an infrastructure/topology blocker, not an environment-variable rename.

### 5. PayFast callback — do not move its variables into the Resource API

The callback entry point requires `PAYFAST_CALLBACK_DATABASE_URL`, `PAYFAST_CALLBACK_DATABASE_SSL`, `PAYFAST_MERCHANT_ID`, optional passphrase, explicit `PAYFAST_ENVIRONMENT`, and optional proxy-hop configuration. It authenticates as `ghm_payment_provider`. The supplied Resource API environment has no callback DB URL or callback TLS variable, and its `PAYFAST_NOTIFY_URL` points to the retired sandbox callback service.

No callback service is present or authorized. Keep PayFast paused. Do not create a callback service, provision a provider credential, change notify URL, or switch to live as part of this reconciliation.

### 6. Exact disposition summary

**Keep on current Resource API for now:** `NODE_ENV`, `PORT`, `DATABASE_SSL`, `INVITE_CODE`, verified `CORS_ORIGINS`, verified proxy setting, production R2 `STORAGE_*`, public ES256 verification material, and current transitional issuer secrets until issuer cutover is actually possible.

**Must be provisioned before a PR #275/#276 Resource API rollout:** `GHM_RUNTIME_DATABASE_URL` targeting `ghm_db` as `ghm_runtime`; and, because storage is enabled, a real `GHM_ACTOR_GATEWAY_URL` plus the shared workflow attestation secret after the gateway is provisioned.

**Belongs outside the Resource API:** `GHM_MIGRATOR_DATABASE_URL` and its target-guard host/name; Actor Gateway DB URL/assertion secret; Authentication Issuer DB URL/private signing key/token pepper; PayFast callback DB URL/provider credential.

**Remove-candidates after consumer and external-job confirmation:** `GHM_NONPRODUCTION_DATABASE_NAME`, `GHM_QUALIFICATION_DATABASE_NAME`, and the unused-on-GHM-process `GHM_WEB_AUTH_ALLOWED_ORIGINS` / cookie settings. The sandbox `DATABASE_URL`, migrator URL and migration target metadata must not be used for production; do not silently replace them with production values on the Resource API service.

**Needs an explicit functional decision:** PayFast checkout variables/credentials; canonical CORS origin set; sandbox-labelled ES256 KID transition.

### 7. Deployment feasibility conclusion

The source-level audit shows the current environment is not simply missing a few production variable values. It is missing two required isolated service topologies (Actor Gateway and Authentication Issuer) and their dedicated database identities, secrets and network endpoints. The current Render cost constraint prohibits adding the separate paid services. The PR #276 candidate also deliberately fails closed for production storage if the Actor Gateway endpoint/attestation secret are absent.

Therefore the correct next action is **not** to bulk-edit Render variables or deploy PR #276. First resolve the hosting/topology constraint without weakening service isolation. Until then, preserve the current deployed mainline and its transitional auth secrets, keep auto-deploy OFF, and do not deploy the stacked candidate. The runtime database URL remains a separate required correction, but by itself it does not make the full candidate deployable.

No Render variables, secrets, services, deployments, database roles, memberships, grants, schema, data or traffic were changed by this source-level audit.


### 8. ZAID Connect cross-origin caller audit — CORS origin must be reconciled

A read-only source inspection of `zaidhqdev-sys/zaid-connect` mainline confirms two GHM access modes:

- The legacy bearer-token client calls `https://ghm-internal-runtime.onrender.com` directly from the browser. Such browser requests require the canonical Connect production origin in GHM Resource API `CORS_ORIGINS`.
- The same-origin browser-auth/proxy path uses Vercel `/api/ghm/*`. The proxy requires `CONNECT_WEB_ORIGIN` and `GHM_INTERNAL_RUNTIME_URL`; it forwards the configured canonical Connect origin as the upstream `Origin` header. The GHM Resource API must also allow that exact canonical origin when this path is used.
- The proxy supports explicitly constrained same-origin Vercel preview hosts; it does not make arbitrary preview origins trusted.
- `GHM_WEB_AUTH_ALLOWED_ORIGINS` is not the control used by this Vercel proxy implementation. The proxy uses its own `CONNECT_WEB_ORIGIN` and validates preview origins from the request host. The variable on the supplied GHM service has no GHM source consumer identified.

The operator-supplied GHM `CORS_ORIGINS` contains localhost and Cloudflare Pages origins but does not include the canonical Connect production origin `https://zaid-connect.vercel.app`. Therefore the supplied list is not yet demonstrably complete for Connect. Do not remove/add origins blindly: first establish which Connect auth/API mode is enabled in the production Vercel deployment and retain the exact canonical origin required by its active caller. Preview origins should remain narrowly scoped and temporary.

Vercel project environment metadata could not be retrieved through the connected Vercel project lookup (project not found under the available scope), so the current value of `VITE_GHM_WEB_AUTH_ENABLED` and the Vercel `CONNECT_WEB_ORIGIN` were not independently verified. No Vercel variables were read or changed.


## 2026-11-14 02:05 SAST — operator-supplied GHM-Internal-Runtime environment baseline (verbatim non-secret values)

The operator explicitly requested that the complete environment inventory they supplied in chat be preserved in this handover and that the handover remain the running operational record. Values below preserve the supplied spelling and content. Secret values were already redacted by the operator and remain redacted here; no attempt was made to retrieve them.

### Supplied current environment

| Variable | Supplied value |
|---|---|
| `CORS_ORIGINS` | `http://localhost:5173,https://ghm-cu1.pages.dev,https://c135fd05.ghm-cu1.pages.dev` |
| `DATABASE_SSL` | `true` |
| `DATABASE_URL` | `postgresql://ghm_runtime:REDACTED@dpg-db4416vlk1mc73eocug0-a.frankfurt-postgres.render.com/ghm_payfast_sandbox_db` |
| `GHM_AUTH_TOKEN_PEPPER` | `REDACTED` |
| `GHM_JWT_ES256_KID` | `ghm-sandbox-20261012-01` |
| `GHM_JWT_ES256_PRIVATE_KEY_PEM` | `REDACTED` |
| `GHM_JWT_ES256_PUBLIC_KEY_PEM` | `REDACTED` |
| `GHM_MIGRATION_DATABASE_HOST` | `dpg-db4416vlk1mc73eocug0-a.frankfurt-postgres.render.com` |
| `GHM_MIGRATION_DATABASE_NAME` | `ghm_payfast_sandbox_db` |
| `GHM_MIGRATOR_DATABASE_URL` | `postgresql://ghm_migrator:REDACTED@dpg-db4416vlk1mc73eocug0-a.frankfurt-postgres.render.com/ghm_payfast_sandbox_db` |
| `GHM_NONPRODUCTION_DATABASE_NAME` | `ghm_payfast_sandbox_db` |
| `GHM_QUALIFICATION_DATABASE_NAME` | `ghm_payfast_sandbox_db` |
| `GHM_WEB_AUTH_ALLOWED_ORIGINS` | `https://zaid-connect-git-construction-ghm-iden-fe5b54-zaid-technologies.vercel.app` |
| `INVITE_CODE` | `REDACTED` |
| `NODE_ENV` | `production` |
| `PAYFAST_CANCEL_URL` | `https://zaid-connect.vercel.app/` |
| `PAYFAST_ENVIRONMENT` | `sandbox` |
| `PAYFAST_MERCHANT_ID` | `REDACTED` |
| `PAYFAST_MERCHANT_KEY` | `REDACTED` |
| `PAYFAST_NOTIFY_URL` | `https://ghm-payfast-sandbox-runtime.onrender.com/api/v1/commercial/payfast/itn` |
| `PAYFAST_PASSPHRASE` | `(blank; not setup)` |
| `PAYFAST_RETURN_URL` | `https://zaid-connect.vercel.app/workspace/commercial/payment-return` |
| `STORAGE_ACCESS_KEY_ID` | `REDACTED` |
| `STORAGE_BUCKET` | `zaid-ghm-production` |
| `STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS` | `3600` |
| `STORAGE_ENDPOINT` | `https://REDACTED.r2.cloudflarestorage.com` |
| `STORAGE_FORCE_PATH_STYLE` | `false` |
| `STORAGE_PROVIDER` | `s3` |
| `STORAGE_REGION` | `auto` |
| `STORAGE_SECRET_ACCESS_KEY` | `REDACTED` |
| `STORAGE_UPLOAD_GRANT_TTL_SECONDS` | `900` |

The operator's original label for the service was “GHM Internal Runtime”. The supplied `DATABASE_URL` and `GHM_MIGRATOR_DATABASE_URL` both target the sandbox database and host. The original message contains no `GHM_RUNTIME_DATABASE_URL` entry.

### Handling and provenance

- This is the operator-supplied Render Environment inventory, received 2026-11-13 23:37 SAST (19:37 UTC).
- It is an inventory copied by the operator, not a fresh API read-back of Render.
- The passwords, tokens, signing key material, merchant credentials and R2 access credentials were redacted in the supplied content. Their actual values are intentionally not stored in Git.
- The R2 endpoint hostname was redacted in the supplied content and remains redacted.
- The blank PayFast passphrase is recorded as blank, not as a secret placeholder.
- No environment variables were modified while recording this inventory.

### Change log policy

Continue appending dated findings, actions, commits, CI results and explicit no-change statements to this handover after each meaningful work unit. Preserve this baseline as historical evidence; later Render changes must be recorded as a separate dated after-state rather than overwriting the supplied original values.


## 2026-11-14 02:10 SAST — live Render topology and deployment-state reconciliation

Read-only Render workspace inventory was retrieved directly for workspace `tea-d9svua6417fc73bhcutg`.

### Current Render web services

| Service | Render ID | Plan | Branch | Auto-deploy | Interpretation |
|---|---|---|---|---|---|
| `GHM-Internal-Runtime` | `srv-damupsek1f9s73eq8kkg` | Free | `main` | Off | Existing production Resource API; do not change without explicit reviewed plan. |
| `ghm-identity-qualification` | `srv-dbahvenbtjjs73f83rlg` | Free | `integration/ghm-identity-merge-candidate-20261018` | On | Qualification-only service; not a production issuer or Actor Gateway. Do not repurpose. |
| `ghm-payfast-sandbox-runtime` | `srv-db5vtgl9fdbs73eaclbg` | Free | `main` | On | Legacy sandbox runtime; PayFast remains excluded. |
| `ghm-payfast-callback-sandbox` | `srv-dbma100u01pc738qpavg` | Free | `release/payfast-settlement-isolation-main-20261104` | Off | Legacy sandbox callback; not authorized as production provider service. |
| `zaid-ai-workforce` | `srv-d9t1la7avr4c73fc46c0` | Free | separate repository | Off | Unrelated product service; not an available GHM security boundary. |

### Current Render Postgres resources

| Resource | Render ID | Database | Plan/status | Interpretation |
|---|---|---|---|---|
| `ghm-db` | `dpg-dag0sdtbedkc7389vi2g-a` | `ghm_db` | `0.1c-256mb`, available, PostgreSQL 18 | Production database. |
| `ghm-payfast-sandbox-db` | `dpg-db4416vlk1mc73eocug0-a` | `ghm_payfast_sandbox_db` | Free, suspended by billing; expired 2026-11-08 | Retired sandbox; do not revive or use. |
| `ghm-identity-qualification-20261018` | `dpg-dba0tu3rjlhs738fs2sg-a` | `ghm_identity_qualification_20261018` | `basic_256mb`, available | Qualification database; do not use for production. |

### Important topology conclusion

The only live GHM production application service is the existing Free `GHM-Internal-Runtime`. The two other GHM services are explicitly qualification and PayFast sandbox services. There is no separately provisioned production Actor Gateway or Authentication Issuer service, and no separate production database connection context has been established for either.

The qualification service and qualification database are not repurposing candidates: they are already designated for qualification, and their credentials/data/branch are not approved for production identity traffic. The old PayFast services are not repurposing candidates either. The unrelated AI Workforce service is not part of GHM and cannot be treated as available infrastructure.

The current Render inventory therefore confirms that the intended separate service topology cannot be deployed using an existing GHM production service. A new paid service is disallowed by the current cost constraint; no free/qualification service may be silently reassigned. The isolated service cutover remains blocked pending an explicitly approved architecture/hosting decision that preserves secret and database identity separation.

### Production runtime deployment state independently checked

Render deployment history for `GHM-Internal-Runtime` confirms:
- Current live deployment: `dep-dbpmv8jrjlhs73abkli0`.
- Commit: `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`.
- Deployment completed 2026-11-10 19:26:11 UTC.
- Trigger: manual.
- Latest observed status: live.
- Render service auto-deploy: off; trigger setting off.
- Latest deployment history contains no deployment of the current PR #276 candidate.

The handover documentation commit `514d738b72614d148d0e4c9d4547e53db2dfcf7e` currently has no combined-status entries returned by GitHub. This is not a passing CI result; it is an absence of reported statuses. No CI qualification is claimed for that documentation-only commit.

### Vercel topology lookup limitation

The connected Vercel account lists only the `zaid-technologies-website` project under team `team_6faNqq4JxLWBA4aR1SB8PspJ`; no `zaid-connect` or GHM project is visible in that account scope. The Connect repository itself was inspected read-only for caller/CORS behaviour, but its live Vercel environment variables could not be read or confirmed. Do not infer that the Vercel deployment is absent globally; only that it is not visible in the connected account scope used for this lookup.

### No-change statement

This was a read-only inventory and deployment-history check. No Render service, plan, environment variable, credential, database, deployment, auto-deploy setting, Vercel project or environment variable was changed.


### PR integration status checked after the live inventory

Read-only GitHub PR inspection confirms:
- PR #272 remains open, draft and unmerged. Head `c81e2bf2534febef9c5e49b39f60f85415f04ff1`; base `main`.
- PR #276 remains open, draft and unmerged. It stacks on PR #272 and currently points at `5c5284259b4a6029066296816d7a824f7ff6bab2` (this handover update).
- PR #272's body records earlier exact-head successful runs, but it also explicitly states the Authentication Issuer isolation is not completed in #272 alone.
- PR #276's body records successful exact-head qualification for earlier code head `cc926fa5991ee393ab5222f0ca62cc2d621be183`, including 65/65 quality, 11/11 web-quality, 994 passing main tests, 8 comparator tests, and disposable PostgreSQL issuer lifecycle/rollback qualification. Those results do not automatically qualify the later documentation-only head.
- For current PR #276 head `5c5284259b4a6029066296816d7a824f7ff6bab2`, the connected GitHub workflow-run lookup returned no PR-triggered workflow runs and combined commit status returned no status entries. This is **not** a green CI result. No current-head CI qualification is claimed.

No PR was merged, retargeted, rebased or otherwise modified in this check.


### Historical production connection records reconciled with the latest supplied inventory

The older `docs/operations/handover-production-db-and-render-2026-10-24.md` contains multiple dated environment snapshots and an earlier production configuration report. It records a production `ghm_db` connection in one section, while a later snapshot records the service's `DATABASE_URL` targeting the sandbox resource. The operator's latest 2026-11-13 inventory now explicitly confirms the current visible GHM-Internal-Runtime `DATABASE_URL` targets the suspended sandbox database. The latest operator-supplied inventory is the active baseline for present configuration; the October notes are historical evidence only.

That October handover also records that a production `GHM_MIGRATOR_DATABASE_URL` had once been validated against `ghm_db`. The latest current inventory instead shows the Render service's `GHM_MIGRATOR_DATABASE_URL` points to the suspended sandbox. Therefore the historical production migrator credential cannot be assumed to remain configured, available, or valid. It must be re-established/verified separately before any production migration activity.

Production `ghm_runtime` is a SQL-created login role already observed in the production database, but no current production connection URL/password for it is present in the operator-supplied inventory. The old sandbox `DATABASE_URL` must not be used to infer or recover that production credential. Provisioning or resetting the production `ghm_runtime` password requires a controlled administrator session and a separately recorded authorization/rollback procedure; no such action has been taken.

This reconciles the chronology without overwriting the historical record or claiming a currently usable production runtime/migrator credential.


## 2026-11-14 02:20 SAST — hosting alternatives researched against cost and security constraints

Official platform documentation was checked to determine whether the missing isolated services can be hosted without creating another paid Render service or weakening isolation.

### Render Free is not an acceptable production substitute

Render's current official free deployment documentation explicitly says Free instances should not be used for production applications. Free web services spin down after 15 minutes without inbound traffic and can take about a minute to restart; free services cannot receive private network traffic and may restart at any time. See:
- https://render.com/docs/free
- https://render.com/docs/service-types

The existing Render service inventory shows the qualification and PayFast services are Free. Creating or repurposing another Free web service would not provide a production-grade always-on isolated issuer/gateway. Do not use those services as a workaround.

### Cloudflare Workers + Hyperdrive — technically possible, not yet qualified/approved

Official Cloudflare documentation confirms:
- Workers can run Express applications through `cloudflare:node` / `httpServerHandler`.
- Hyperdrive supports PostgreSQL and the `pg` driver, with per-Worker Hyperdrive bindings and TLS modes including certificate validation.
- Hyperdrive is included on Workers Free, currently limited to 100,000 database queries/day.
- Workers Free is currently limited to 100,000 requests/day and 10 ms CPU per invocation; Workers Paid has a $5/month minimum account charge and higher CPU allowance.

References:
- https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- https://developers.cloudflare.com/hyperdrive/platform/pricing/
- https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/

The GHM Authentication Issuer currently uses Argon2id password hashing (`argon2` package) for registration/login and dummy verification. That CPU-intensive password operation makes the Workers Free 10 ms CPU ceiling a material qualification risk; it must not be assumed to fit. A Cloudflare Workers Paid plan would be a new $5/month minimum and is not approved under the present no-funds constraint. A dedicated Worker per trust boundary with separate Hyperdrive bindings/secrets could preserve process/secret isolation in principle, but would require a deliberate deployment adapter, database egress/TLS review, full Argon2id compatibility/performance tests, request-limit review, and explicit owner approval. No Cloudflare account, Worker, Hyperdrive, secret, database connection or deployment was changed.

### Vercel — no connected project scope for GHM/Connect

The connected Vercel account exposes only `zaid-technologies-website`; neither `zaid-connect` nor a GHM issuer/gateway project is visible in the authenticated team/account scope. Therefore a separate Vercel Node runtime is not currently an actionable hosting path from this connected session. Do not create a project or assume billing/plan entitlements without owner approval and access to the correct project/team.

### Hosting decision

As of this review, no production-grade isolated hosting option has been demonstrated that simultaneously satisfies:
1. separate issuer and Actor Gateway secret/process boundaries;
2. access to production `ghm_db` with distinct SQL-created logins;
3. authenticated TLS/network requirements;
4. existing no-additional-paid-Render-service and no-funds constraints;
5. current deployment/account access constraints.

The secure default is to **hold the isolated service cutover**. Keep PR #272/#276 draft/unmerged, keep Render auto-deploy OFF, preserve the current deployed mainline and transitional auth secrets, and do not place gateway/issuer secrets on the Resource API. Revisit Cloudflare Workers only if the operator confirms account access and an acceptable cost/performance envelope; no assumption that Free tier is sufficient is permitted.


### Cloudflare Worker compatibility detail — Argon2id is the decisive issuer concern

Further source/documentation reconciliation found:
- GHM's issuer calls `createArgon2idPasswordHasher()` and the repository dependency is `argon2@^0.41.1`.
- Cloudflare documents Express support through `cloudflare:node` and `httpServerHandler`, so Express itself is not a categorical blocker.
- Cloudflare Workers do not support arbitrary native Node add-ons; Cloudflare's runtime compatibility documentation distinguishes supported built-in APIs from non-functional shims, and its sandbox/runtime documentation explicitly notes native add-ons are unavailable.
- A Workers deployment would therefore need a Workers-compatible Argon2id implementation (for example a reviewed WASM build), plus verification of the exact hash encoding/parameters and compatibility with existing stored hashes. It must not silently change the password hash algorithm or reset users.
- The Free CPU budget remains 10 ms per request, which is an additional material risk for memory-hard Argon2id verification. Workers Paid raises CPU limits but has a $5/month minimum.

References:
- https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/runtime-apis/webassembly/

Thus Cloudflare remains a possible research track, not a validated no-cost drop-in host. Any prototype must first demonstrate exact Argon2id hash compatibility, timing/CPU limits, and isolated per-Worker database credentials without touching production data or credentials.


## 2026-11-14 02:35 SAST — owner decision: Cloudflare only while genuinely $0

The operator approved investigating Cloudflare-hosted isolated services **only if they incur no cost until ZAID Technologies generates revenue**. This is a hard constraint, not permission to activate a paid plan.

### Non-negotiable cost guardrails

- Cloudflare Workers Free only.
- Hyperdrive Free only.
- No Workers Paid subscription (official minimum $5 USD/month).
- No Cloudflare Containers: current official Containers pricing marks Free as unavailable (N/A); included usage is part of the Workers Paid $5/month plan.
- No paid Render service, paid database, or new paid infrastructure.
- No paid add-on, usage-based billable resource, automatic upgrade, or billing-plan change.
- If a free-tier limit is reached, the relevant service must fail closed / stop accepting the affected operation; do not upgrade or incur charges.
- Reassess paid infrastructure only after the operator explicitly confirms the business is generating revenue and separately approves a budget.

Official current pricing/limits reviewed 2026-11-14:
- Workers Free: 100,000 requests/day, 10 ms CPU per HTTP invocation, 128 MB memory; usage beyond included Free quotas fails rather than becoming a Workers Paid overage unless the account is upgraded.
- Hyperdrive Free: 100,000 SQL statements/day; maximum ~20 origin DB connections per configuration; 10 configured databases per Free account.
- Workers Paid minimum: $5/month.
- Cloudflare Containers: Free is N/A; usage is included only in Workers Paid, so Containers cannot be used under this $0 mandate.

References:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/hyperdrive/platform/limits/
- https://developers.cloudflare.com/containers/platform/pricing/
- https://developers.cloudflare.com/containers/platform/limits/

### Actor Gateway — viable technical prototype route, not deployed/qualified

Cloudflare's current official docs recommend `pg@8.16.3+` with Hyperdrive for Workers. The current GHM repository pins `pg@^8.12.0`, below the documented minimum, so the Worker package must use a separate compatible dependency boundary or a separately reviewed dependency upgrade; do not assume the current dependency version works with Hyperdrive.

Cloudflare documents:
- PostgreSQL through Hyperdrive on Free.
- `pg` support with `nodejs_compat`.
- Node HTTP server support via `cloudflare:node` / `httpServerHandler`, enabling a possible adapter around the existing Express Actor Gateway app.

This makes a dedicated Actor Gateway Worker a plausible no-new-compute-cost prototype, subject to all of the following before any deployment:
1. Separate Hyperdrive configuration with only the `ghm_actor_gateway` database credential on the production `ghm_db`.
2. Worker secret containing only public ES256 verification key/KID and the gateway capability assertion secret; never the issuer private key/token pepper.
3. Port the existing Express/server startup safely to the Workers request lifecycle; do not run the Render `server.listen` bootstrap unchanged.
4. Verify `pg` and all imported packages in the actual Workers runtime.
5. Preserve every existing gateway identity, ACL, signed-assertion, replay, authorization and storage attestation guard.
6. Test using a disposable PostgreSQL database and local Wrangler/Workers runtime first; no production database connection until separately approved.
7. Confirm free quota behavior, no account upgrade, and no chargeable dependency (Containers, Paid Durable Object backends, paid observability, etc.).

Official references:
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/

No Worker, Hyperdrive configuration, database role, credential, DNS route, production connection or Cloudflare deployment was created or changed.

### Authentication Issuer — hard Free-tier compute blocker identified

The existing GHM password implementation is not a generic/lightweight hash. `src/auth/foundation/password.ts` uses native `argon2` with fixed parameters:
- Argon2id.
- Memory cost: 65,536 KiB (64 MiB).
- Time cost: 3.
- Parallelism: 1.
- Hash output: 32 bytes.
- Salt: 16 bytes.

This is a security policy and compatibility contract. It must not be silently weakened to fit a hosting quota. The current dependency is `argon2@^0.41.1`, which is a native Node addon and cannot simply be assumed to run in Workers.

A pure-WASM Argon2 implementation is a research possibility, but it must verify the exact PHC strings and the existing 64 MiB / t=3 / p=1 profile. One newly surfaced Workers-oriented package documents a maximum memory cost of 32 MiB, which is insufficient for GHM's current profile. Other WASM implementations require exact compatibility, memory, side-channel and performance review.

Most importantly, Workers Free imposes 10 ms CPU per invocation. Argon2id is deliberately CPU- and memory-intensive; the current 64 MiB/t=3 profile has not been demonstrated to complete under that limit. Lowering memory/time cost or changing algorithms to fit Free is not acceptable without a separately approved security migration, and would risk existing password compatibility.

Cloudflare Containers do not solve this under the cost mandate: official Containers pricing says Free is N/A and that included CPU/memory is part of the $5/month Workers Paid plan. Workers Paid is expressly disallowed for now.

Therefore:
- Do not deploy the Authentication Issuer to Workers Free yet.
- Do not change password hashing parameters or existing password hashes.
- Do not move issuer private key/token pepper into the Actor Gateway or Resource API.
- Do not route authentication traffic to an unqualified Worker.
- Research/benchmark a Workers-compatible Argon2id implementation only in a local/disposable environment, proving PHC interoperability and 64 MiB/t=3/p=1 performance within the 10 ms CPU budget. If it cannot meet that limit, record the issuer as blocked under the $0 constraint rather than weakening the password policy.

Official references:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/runtime-apis/webassembly/
- https://github.com/orgShtora-1/argon2w (published implementation documentation reports max 32 MiB; not accepted for current GHM parameters)
- https://github.com/phi-ag/argon2 (WASM implementation surfaced for further review only; not qualified)

### Corrected hosting conclusion

The earlier generic possibility of using Cloudflare Workers for both isolated services is now narrowed:

- Actor Gateway: plausible Workers Free + Hyperdrive route; prototype and qualify before production.
- Authentication Issuer: not currently shown to fit Workers Free due the existing 64 MiB/t=3 Argon2id profile and 10 ms CPU ceiling. Remains blocked until exact compatibility/performance is proven.
- Cloudflare Containers: excluded because not available on Free.
- Render Free: excluded for production due sleep/availability limitations.
- Any paid Cloudflare/Render path: excluded until the operator confirms revenue and approves spend.

This is an architecture feasibility result, not an authorization to change production. Keep PR #272/#276 draft/unmerged, Render auto-deploy OFF, current Resource API unchanged, and PayFast paused.

### No-change statement

This checkpoint consisted of source inspection and official platform documentation research. No code, package manifests, lockfiles, Worker, Hyperdrive, Cloudflare setting, Render setting, database role, credential, migration, DNS record, deployment or production traffic was changed.


## 2026-11-14 02:45 SAST — owner $0 approval recorded; current Cloudflare quota verified

The operator explicitly approved proceeding with Cloudflare only on the condition that it costs **$0 until the company generates revenue**. This authorizes research and local/disposable qualification only. It does not authorize paid-plan activation, billable usage, production DB access, production secret transfer, DNS changes or production traffic cutover.

### Official Cloudflare pricing/limits rechecked

As of 2026-11-14:
- Workers Free: 100,000 requests/day across the account, 10 ms CPU/request, 128 MB memory. On limit exhaustion, Workers terminate/return limit errors; no automatic upgrade is authorized.
- Hyperdrive Free: 100,000 SQL statements/day. Exceeding the Free limit causes further Hyperdrive operations to fail; it does not require enabling Workers Paid.
- Workers Paid minimum: $5/month. Explicitly prohibited under the current owner instruction.
- Cloudflare Containers: the current official developer documentation says Free = N/A and Containers compute is included with Workers Paid ($5/month). The general Cloudflare marketing pricing page has a conflicting Free allowance summary; for this implementation decision, use the product-specific Containers developer pricing page and treat Containers as unavailable at $0. No Containers deployment.
- Cloudflare Free Worker route behavior for security-critical routes must be fail-closed on quota exhaustion. Never configure fail-open for authentication or Actor Gateway routes.

References:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/hyperdrive/platform/pricing/
- https://developers.cloudflare.com/containers/platform/pricing/

### Confirmed code-level constraints

The exact construction branch source was inspected:
- src/auth/foundation/password.ts uses native argon2.
- Parameters are fixed at 65,536 KiB memory (64 MiB), time cost 3, parallelism 1, 32-byte output, 16-byte salt.
- package.json currently pins argon2@^0.41.1 and pg@^8.12.0.
- src/auth-issuer/server.ts and src/actor-gateway/server.ts are Node HTTP servers which instantiate pg.Pool, perform database principal/privilege checks at startup, and call server.listen. They cannot be copied unchanged into a Worker module.
- The Worker-compatible gateway path requires an explicit Worker request adapter and Hyperdrive-aware database pool integration. Cloudflare's current Hyperdrive Node-postgres guidance recommends pg@8.16.3+; the existing pg@^8.12.0 dependency is below that documented recommendation.

### Implementation sequence approved under $0 guardrail

1. **Local Actor Gateway Worker adapter prototype:** create a separate Worker entry point/package boundary; preserve existing gateway app/guards, use a Worker request lifecycle, and bind a disposable PostgreSQL database through local development configuration. No Cloudflare account changes or production DB credentials.
2. **Actor Gateway qualification:** run existing gateway identity/privilege/assertion/replay/storage test suite plus Worker-runtime compatibility and Hyperdrive adapter tests. Only proceed if all pass.
3. **Authentication Issuer feasibility spike:** test a Workers-compatible Argon2id implementation against existing PHC hashes and exact 64 MiB/t=3/p=1 settings. Measure CPU under Workers Free limit. If any required auth path exceeds 10 ms CPU, stop; do not lower the password policy.
4. **Free-tier Cloudflare setup:** only after local prototype passes, ask the operator to verify their Cloudflare account is on Workers Free and has no paid add-ons/upgrade requirement. Give exact step-by-step dashboard instructions. Do not deploy until the account and billing state are confirmed.
5. **Production identity provisioning and connection:** separate authorization step. Create/use only the dedicated production DB roles and Hyperdrive credentials after the Worker is qualified and the owner approves a specific cutover. Never place administrator, runtime, migrator, issuer or gateway credentials in the wrong Worker.
6. **Gradual production rollout:** not yet authorized; requires a new production cutover runbook, rollback procedure, readiness tests, origin/route plan, and exact CI qualification.

### Immediate next work

Begin with the local Actor Gateway Worker adapter design/prototype. Keep Authentication Issuer blocked until exact Argon2id CPU compatibility is proven. The current GHM Resource API, Render service, database, keys, users, traffic and PayFast remain unchanged.

No Cloudflare account, billing plan, Worker, Hyperdrive, secret, DNS record or production connection was changed in this checkpoint.


## 2026-11-14 03:15 SAST — first Cloudflare Actor Gateway Worker adapter committed (prototype only)

Owner decision remains: Cloudflare infrastructure must remain $0 until revenue; no paid plan, no Containers, no production database access, no production secret transfer, and no production traffic cutover.

### Source files added

A first isolated Worker adapter has been added on the existing construction branch:

- `workers/actor-gateway/index.ts`
- `workers/actor-gateway/wrangler.jsonc`
- `workers/actor-gateway/tsconfig.json`
- `workers/actor-gateway/cloudflare-node.d.ts`
- `workers/actor-gateway/worker-contract.test.mjs`

The adapter reuses the existing `createActorGatewayApp` and all existing Postgres gateway readers rather than duplicating route logic. It maps:
- Hyperdrive `HYPERDRIVE.connectionString` to a short-lived node-postgres Client.
- Public ES256 verification key and KID to the existing public-key-only token verifier.
- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` to the existing signed actor assertion readers.

The Worker does not declare or load:
- `GHM_JWT_ES256_PRIVATE_KEY_PEM`
- `GHM_AUTH_TOKEN_PEPPER`
- `GHM_AUTH_ISSUER_DATABASE_URL`
- Render Resource API or migrator database URLs.

The adapter performs the existing exact Actor Gateway session/current-user and role-membership identity check, then calls the existing full database ACL verifier. The internal HTTP server is not started until both checks pass. Startup errors are logged without secret/connection detail and return a no-store 503. It uses Cloudflare's `handleAsNodeRequest` adapter to route Worker requests into the existing Express app.

### Hyperdrive client boundary

The gateway reader classes use the `Pool.connect()` / `PoolClient.query()` / `release()` contract. The Worker adapter supplies a narrow adapter which creates one `pg.Client` per reader transaction and closes it on release. Hyperdrive owns the remote connection pool; the Worker does not retain its own pool/socket between operations. Startup identity/ACL qualification uses a separate short-lived client.

Official Cloudflare Hyperdrive documentation (retrieved 2026-11-14) recommends node-postgres `pg@8.16.3` or later and demonstrates creating a Client per request using `env.HYPERDRIVE.connectionString`. The repository lockfile already resolved `pg@8.23.0`, so the previous statement that the resolved lockfile version was below the Hyperdrive minimum was inaccurate. The declared dependency range was `^8.12.0`, however, which permitted a future lockfile refresh to resolve a version below the documented minimum. Both `package.json` and the lockfile root metadata have now been tightened to `^8.16.3`; the currently resolved package remains `8.23.0`. No driver code or database schema was changed by this dependency-range correction.

Official references:
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/

### Wrangler configuration guardrails

The local Worker configuration:
- Uses compatibility date `2026-11-14` and `nodejs_compat`.
- Declares one Hyperdrive binding named `HYPERDRIVE`.
- Contains a clearly non-production all-zero placeholder Hyperdrive ID.
- Contains only a dummy local disposable PostgreSQL connection string for local development.
- Sets `workers_dev=false` and `preview_urls=false`.
- Disables observability by default to avoid unintended paid/retention add-ons.
- Does not configure Containers, Queues, Durable Objects, routes, custom domains or any paid product.

The placeholder ID is deliberately not a usable production Hyperdrive ID. This configuration is not deployable until a separately approved free-tier Hyperdrive resource exists and its ID is substituted. No such resource has been created.

### Qualification coverage added

A separate Worker TypeScript configuration and static contract tests have been added. The root test command now includes:
- Worker adapter TypeScript type-check.
- Worker contract tests for request adapter, Hyperdrive binding, public-key-only secret boundary, DB identity/ACL-before-listener ordering, fail-closed startup, disabled preview/public routes, and absence of paid Cloudflare product configuration.

These are source-level checks only. They do not prove that the adapter runs under the real Cloudflare runtime, that the installed `pg` build works with Hyperdrive, that PostgreSQL TLS/network access is possible, or that production database ACL checks pass.

### Known open qualification risks

1. **Cloudflare runtime execution not yet proven.** Must run a local Wrangler/Workers runtime smoke test and the complete Actor Gateway route/security suite against a disposable PostgreSQL 18 database.
2. **Per-isolate rate limiting.** Existing `express-rate-limit` MemoryStore is isolate-local and not a global account-wide quota across multiple Worker isolates. It is an abuse-control layer, not an authorization boundary; before production, design a $0-compatible edge/account rate-limit control or explicitly qualify the residual risk. Do not add a paid Durable Object.
3. **Hyperdrive and Render connectivity.** No production Hyperdrive has been configured. Confirm Render PostgreSQL external TLS/network compatibility only against disposable test resources first; do not use production credentials in the prototype.
4. **Storage provider workflow attestation.** The existing gateway readers require storage workflow attestations. The adapter must preserve the separate attestation secret flow and prove it does not expose the secret to clients.
5. **HTTP server lifecycle.** The Worker creates a single module-lifetime Node HTTP server only after database checks. Verify concurrency, isolate restart, initialization failure/retry and request body handling in the actual Workers runtime.
6. **Build toolchain.** Wrangler is not yet pinned as a repository dependency and no Worker bundling/dry-run has been completed. Pin a known Wrangler toolchain in a subsequent reviewed change before CI/runtime qualification.

### Current qualification status

- Worker adapter source: committed, prototype only.
- Root TypeScript build: not yet run against this commit.
- Worker TypeScript check: not yet run.
- Worker contract tests: not yet run.
- Wrangler dry-run: not yet run.
- Local Workers runtime smoke: not yet run.
- Disposable PostgreSQL Actor Gateway qualification: not yet rerun through the Worker adapter.
- Production deployment / Hyperdrive / secrets / DNS: not created.
- Production GHM database and Render runtime: unchanged.

### No-change statement

No Cloudflare account, plan, Worker deployment, Hyperdrive resource, production DB connection, DB role, credential, secret, DNS record, route, production environment variable or production traffic was changed. Render auto-deploy remains OFF. PayFast remains excluded. PR #272/#276 remain draft/unmerged.


### First Worker adapter CI result — exact tested source head passed

GitHub Actions run **43531629356** (run #4569) completed successfully for exact commit:
`5f2da3bb8863c6465e7904981c5544eab5d62c78`

- Quality job: passed.
- Web-quality job: passed.
- Root TypeScript build: passed.
- Complete repository test suite: passed. This includes the new Worker TypeScript type-check and six Worker source-contract tests.
- Disposable PostgreSQL migration and security qualification sequence: passed.
- Web build, web tests, dependency audit and toolchain checks: passed.
- No failed steps.

Run: https://github.com/zaidhqdev-sys/GHM/actions/runs/43531629356

This is a real exact-head CI pass, but it is not yet a Cloudflare runtime/Hyperdrive integration qualification. The workflow has now been extended with a pinned Wrangler 4.0.0 `deploy --dry-run` bundle step (no deployment) so the next exact-head run also validates the Worker bundle. The newer workflow change is commit `ddfec0204f0e7aafdbfa64e8fb00318056f77168`; its CI run must be checked separately and is not yet claimed green.

### CI qualification boundary

The passed run used the existing GitHub Actions disposable PostgreSQL 18 service. It did not connect to production `ghm-db`, did not provision Hyperdrive, did not execute in Cloudflare's production runtime, and did not deploy or publish a Worker. The all-zero Hyperdrive ID remains a placeholder. Do not interpret CI success as authorization to deploy.


### Wrangler Worker bundle dry-run — passed

The CI workflow now invokes pinned Wrangler `4.0.0` with `deploy --dry-run`, using the placeholder-only local Worker config. No Cloudflare credentials are provided and no deploy/upload command is executed.

Run `43531950923`, exact workflow-change commit `ddfec0204f0e7aafdbfa64e8fb00318056f77168`:
- Root build passed.
- Wrangler Actor Gateway Worker bundle dry-run passed.
- The quality job then proceeded to disposable PostgreSQL migrations/qualification; the overall workflow was still in progress at the time of this handover update.
- No Wrangler deployment or Cloudflare account operation occurred.

A second push run `43531961783` is testing the latest documentation head `3f1170aca9af6fad0cd97dd1d6242250bc4be3fb`; its Worker bundle step was in progress when checked. The earlier exact source head `5f2da3bb8863c6465e7904981c5544eab5d62c78` already passed both quality and web-quality jobs in run `43531629356`.

The Worker is therefore source-typechecked, static-contract-tested, and now successfully bundled by Wrangler in dry-run mode. Actual Workers runtime execution and Hyperdrive-to-Postgres integration remain outstanding.


## 2026-11-14 03:35 SAST — replace isolate-only rate-limit reliance with Cloudflare Free Rate Limiting API

A follow-up review identified that Express's default MemoryStore is isolate-local and therefore cannot provide account-level coordination across multiple Worker isolates. Cloudflare's official Workers Rate Limiting binding API is available as an additional Free-tier edge control; its documented behavior is approximate and per Cloudflare location, not a strict global counter.

### Implementation

- Added optional `rateLimitDecision(accountId)` support to the existing Actor Gateway Express app.
- JWT is verified first; the account ID is taken only from the verified token subject.
- The Worker calls `ACTOR_GATEWAY_RATE_LIMITER.limit({ key: "actor:<verified-account-id>" })` before protected route execution.
- A denied decision returns HTTP 429 before any database reader runs.
- An unavailable limiter returns HTTP 503; it never silently bypasses the edge control.
- When the edge decision callback is configured, the Express in-memory limiter is skipped to avoid applying a second isolate-local account limit. Existing Node/Render tests without the callback retain their previous MemoryStore behavior.
- Wrangler config declares a Free Rate Limiting binding: 120 requests / 60 seconds per verified actor key and Cloudflare location.
- Wrangler dry-run toolchain was raised from 4.0.0 to 4.36.0 because Cloudflare's Rate Limiting API documentation requires Wrangler 4.36.0 or later.

Official reference:
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

### Accuracy and security boundary

Cloudflare documents that its Rate Limiting API is approximate and each limit is enforced separately in each Cloudflare location; requests can exceed the configured threshold while counters update. This is an abuse-control layer, not a strict global quota, authorization decision, or replacement for database authorization. Signed actor assertions and SQL privilege checks remain authoritative. If strict cross-region global rate enforcement becomes a requirement, it needs a separately evaluated design; do not add a paid Durable Object under the $0 mandate.

### Additional tests

Added three application tests proving:
1. Edge limiter receives the verified token account ID.
2. A denied edge decision returns 429 before database access.
3. An edge limiter error fails closed with 503 before database access.

The Worker static contract test now checks the declared binding and 120/60 configuration. These tests await the next CI run; no pass is claimed yet.

### No-change statement

No Cloudflare account, binding, Worker, Hyperdrive, production database credential, secret, route, DNS record or production traffic was changed. The Rate Limiting binding exists only as repository configuration and local/CI build input until a later, separately approved free-tier setup.


### Local Workers runtime + disposable Hyperdrive smoke test added to CI

The CI workflow has now been extended beyond static checks and Wrangler bundling. After migrations and Actor Gateway principal qualification, it will:
1. Generate an ephemeral P-256 keypair in the GitHub runner and expose only the public key to local Worker secrets.
2. Write a temporary ignored `.dev.vars` file containing the disposable JWT public key/KID and existing disposable gateway assertion secret.
3. Start Wrangler `4.36.0 dev --local` using the configured local Hyperdrive connection string to the GitHub Actions PostgreSQL 18 service.
4. Exercise `/healthz`, which requires Worker initialization to establish the Hyperdrive connection and pass the exact Actor Gateway database identity and full ACL checks before the Node HTTP server starts.
5. Fail the job and print the Wrangler log if startup/health is not successful; remove the temporary `.dev.vars` file on exit.

The private ephemeral test key remains in the runner's temporary directory and is not passed to the Worker; no production key is involved. The Worker receives public verification material only.

This is a disposable CI test design, not yet a passing result. The next exact-head CI run must validate that Wrangler's local Rate Limiting binding, Worker Node HTTP bridge, Hyperdrive local connection, and PostgreSQL startup ACL checks all work together. No production database or Cloudflare account is used.


### First local Workers runtime smoke attempt — failed; diagnosis open

GitHub Actions run `43532286311` reached the new local Worker smoke step after:
- Root build success.
- Wrangler `4.36.0` bundle dry-run success.
- Disposable PostgreSQL 18 migrations success.
- Actor Gateway principal qualification success.

The local Wrangler/Hyperdrive Worker smoke step then failed immediately (step duration approximately two seconds). The job's step conclusion is failure. The connected GitHub workflow-run interface exposes the job/step conclusion but not the text log contents, and this run had no uploaded diagnostic artifact. Therefore the failure cause is **not yet established**; I will not guess whether it is Wrangler local binding support, Worker startup, database ACL, or the local database connection.

Corrective diagnostic change committed: `c6b80031f991342b1d94ac2f8338a524c372f410`. The workflow now uploads only `wrangler.log` and `health.json` as a short-retention artifact after the smoke step, even when it fails. It deliberately does not upload the ephemeral private test key or `.dev.vars`. The next run will provide inspectable failure evidence. No production credentials or data are involved.


### Runtime smoke root cause identified — Wrangler runtime was stale

The uploaded diagnostic artifact from run `43532472479` (artifact `14087931918`) was downloaded and inspected.

Exact runtime output:
- Wrangler `4.36.0` warned that the latest Workers Runtime compatibility date it supported was `2025-09-06`, while the Worker requested `2026-11-14`.
- It then failed to start the Worker with `Uncaught Error: No such module "node:fs"`.
- The local binding inventory showed Hyperdrive, the Rate Limiting binding, and all three expected Worker environment variables were loaded successfully.

Official Cloudflare documentation confirms `node:fs` is available under Node.js compatibility and that compatibility dates from `2026-08-04` enable the newer Node.js compatibility implementation by default. The failure was therefore caused by using a Wrangler/Workers Runtime build too old to implement the requested 2026 compatibility date, not evidence that GHM itself requires removing filesystem APIs.

References:
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/
- https://developers.cloudflare.com/workers/configuration/compatibility-flags/
- https://developers.cloudflare.com/changelog/post/2026-08-04-nodejs-compat-default/

Corrective change: the CI Wrangler pin has been advanced from `4.36.0` to `4.162.0`, the version explicitly identified by the failing runtime as the current available update. This remains a local dry-run/runtime-only toolchain change; it does not deploy anything or change account billing. The next CI run must confirm that the newer runtime starts the Worker and reaches the disposable PostgreSQL health check. No pass is claimed yet.


### Wrangler 4.162.0 bundle check — failure pending diagnosis

The first CI run using Wrangler `4.162.0` (run `43532654073`, source commit `bf3db4fa14a55ab3668cd61ee0ca90bc7728361a`) passed the application build but its Worker bundle dry-run step failed. The job interface exposed the failure conclusion but not the underlying step output. This is separate from the prior local runtime failure caused by the old 2025 runtime.

The bundle step has now been changed to capture its stdout/stderr in `tmp/actor-gateway-worker-build/wrangler-bundle.log` and upload that file as a short-retention artifact even on failure. The next run will provide the exact cause. No deployment occurred.


### Wrangler 4.162.0 bundle failure root cause — Node 20 is below its engine requirement

The diagnostic artifact from run `43532758846` (artifact `14088281226`) was downloaded and inspected. It gives the exact error:

- Wrangler `4.162.0` requires Node.js `>=22.12.0`.
- The GitHub Actions quality job was still using Node.js `20.20.2`.
- npm emitted EBADENGINE warnings and Wrangler exited with: `Wrangler requires at least Node.js v22.12.0. You are using v20.20.2.`

This is a CI toolchain mismatch, not a GHM source or Cloudflare service defect.

Corrective change committed: `33b64e2691f3f6511bf6f95657738af56109fe14`. The GHM quality job now uses Node.js 22, which satisfies Wrangler 4.162.0 while remaining within the repository's `node >=20` engine contract. The separate web-quality job remains on Node.js 20. The next exact-head CI run must confirm the bundle and local runtime smoke tests; no success is claimed yet.


### Node 22 resolved Wrangler bundling; runtime now reaches Express CommonJS incompatibility

The run using Node 22 and Wrangler 4.162.0 (exact source head `33b64e2691f3f6511bf6f95657738af56109fe14`) produced:
- Root build: passed.
- Wrangler bundle dry-run: passed.
- Local Worker startup: failed while loading Express's `body-parser` dependency chain.

The uploaded runtime log reports:
`Uncaught TypeError: require_streams(...) is not a function`
with the first application dependency frame in `iconv-lite/lib/index.js`, imported through `raw-body` and `body-parser`.

This is a second, distinct runtime compatibility issue. The previous missing `node:fs` problem was resolved by using a current Wrangler runtime and Node 22. The remaining issue is CommonJS/Node stream interoperability in the Express body-parser/iconv-lite dependency chain under workerd.

I am testing the immediately preceding stable Wrangler `4.161.0` (rather than the just-published `4.162.0`) with the same Node 22 runtime to distinguish a new runtime regression from a general Express dependency incompatibility. No production traffic or credentials are involved.


### Express body-parser incompatibility — Worker-specific bounded JSON parser introduced

The smoke test repeated under Wrangler `4.161.0` and produced the same `require_streams(...) is not a function` error from Express's `body-parser -> raw-body -> iconv-lite` dependency chain. This confirms it is not specific to Wrangler 4.162.0.

The Worker adapter now avoids loading that unsupported body-parser chain:
- Added a Wrangler module alias mapping `body-parser` to `workers/actor-gateway/body-parser-worker-stub.cjs`. The stub deliberately fails if any body-parser method is accidentally invoked.
- Added injectable `jsonBodyParser` to the existing Actor Gateway app options. Normal Node/Render execution continues to use the original `express.json({ limit: '16kb' })`.
- The Cloudflare Worker supplies its own bounded JSON parser using the Node HTTP request data/end/error events and Buffer. It enforces the same 16 KiB limit, only processes `application/json`, accepts JSON objects/arrays, returns 413 for oversize payloads and 400 for malformed/primitive JSON, and fails closed.
- Added static Worker contract assertions and an app test proving that the injected parser is used.

This is a compatibility boundary, not a relaxation of request validation. The Express body-parser stub is only selected by the Worker Wrangler config; the Render/Node runtime path remains unchanged. The next Wrangler bundle and local runtime smoke must prove the alias is applied and that no other unsupported dependency fails during startup. No success is claimed yet.


### Build correction before next Worker runtime attempt

The first CI build after introducing the Worker-native parser failed. Source review found two implementation mistakes in that change:
- The shared app's Express import did not yet include the newly referenced `RequestHandler` type.
- The Worker content-type regular expression had been double-escaped in the generated TypeScript source.

Both are corrected in commits `d08baa804d4ebef430d20bf443e9cae85a4645da` and `ef8acec38496b3abf1c097efa2d4c1aeefb06418`. The exact app-import commit is recorded in GitHub history immediately before the Worker regex fix. The next exact-head CI build must confirm these corrections; no pass is claimed.


### Worker body-parser alias resolution correction

The first Wrangler bundle attempt after adding the Worker-only body-parser stub failed because Wrangler resolves `alias` replacement paths relative to the repository working directory, not relative to the Wrangler config file. The alias initially used `./body-parser-worker-stub.cjs`, which could not be found from the repository root.

Corrected the alias to the repository-root path:
`./workers/actor-gateway/body-parser-worker-stub.cjs`
Commit: `27745e02bf7bdcaab93a157e8fd32e12bc59cfae`.

This is a configuration path correction only. The next CI run will re-run the Worker bundle and local runtime tests; no pass is claimed yet.


### Wrangler alias packaging correction

The previous relative-path correction still failed: Wrangler's alias plugin resolves replacement modules through Node's package resolution rooted at the Worker project root. Relative alias strings were being resolved from the Wrangler CLI module, not from the Wrangler config directory.

The replacement is now a proper local package:
- Package: `ghm-worker-body-parser-stub`
- Source: `workers/actor-gateway/body-parser-worker-stub/index.cjs`
- Local package manifest: `workers/actor-gateway/body-parser-worker-stub/package.json`
- Added as a local devDependency in `package.json` and `package-lock.json`.
- Wrangler alias now uses the package specifier `"body-parser": "ghm-worker-body-parser-stub"`, which Node package resolution can find from the project root.

This avoids path ambiguity and keeps the stub available only through the Worker bundler alias; the regular Node/Render runtime still resolves the real Express body-parser dependency. Exact-head CI must validate npm ci, Worker bundling, and runtime smoke before this workaround is accepted.


### First successful local Worker + Hyperdrive startup — parser assertion initially unauthenticated

Run `43533834824` (source head `76c219f77660b7beee4a0d113de98c42f01e79d9`) produced:
- Root build: passed.
- Wrangler bundle dry-run: passed after the body-parser alias was changed to a local npm package.
- Disposable PostgreSQL migrations: passed.
- Actor Gateway database principal qualification: passed.
- Local Wrangler/Workers runtime: started successfully.
- Hyperdrive connected to the disposable PostgreSQL service.
- Worker startup identity and full database ACL verification passed; `GET /healthz` returned HTTP 200 with `{"status":"ok"}`.

The smoke job still concluded failure because the subsequent malformed-JSON test request was unauthenticated. The Actor Gateway correctly returned HTTP 401 before reaching its JSON parser; the test incorrectly expected 400. The diagnostic log proves Worker startup and database ACL checks are now working. This is a test sequencing issue, not a Worker startup failure.

Corrective CI change: generate a short-lived ES256 test token using the ephemeral CI-only private key and send it with the malformed JSON request. This allows the request to pass JWT verification and the local edge rate-limit binding, then exercise the Worker-native parser. The private key and test token remain in runner temp files and are not included in uploaded artifacts. The next exact-head run must confirm the parser returns HTTP 400 and complete the remaining qualification suite.


### Runtime smoke now passes; full test suite exposed a separate failure

GitHub Actions run `43534053528` (exact source head `fc545c488662f0484e142367db0806889d47f564`) confirms:
- Worker TypeScript build and Wrangler bundle passed.
- Disposable PostgreSQL migrations and Actor Gateway principal qualification passed.
- Local Workers runtime started.
- Hyperdrive connected to disposable PostgreSQL.
- Startup database identity and ACL checks passed.
- `GET /healthz` returned 200.
- The authenticated malformed-JSON request returned the expected HTTP 400; the local Worker smoke step passed.

The workflow later failed in the full `npm test` step. The connected GitHub job interface exposes only the step conclusion, not the test output. A diagnostic change now captures the complete test output in `tmp/test-suite.log` and uploads it as a short-retention artifact even on failure. The next run will identify the exact failing assertion or Worker type-check issue. No green full CI claim is made yet.


### Full test-suite failure diagnosed — stale static assertion only

The uploaded test log from run `43534285873` was inspected. Results:
- Existing repository suite: **998 passed, 0 failed**.
- Worker TypeScript type-check: passed.
- Worker contract tests: 5 passed, 1 failed.
- The sole failure was a stale expected Wrangler alias value in `worker-contract.test.mjs`: it still expected `./body-parser-worker-stub.cjs`, while the actual config correctly uses the local package specifier `ghm-worker-body-parser-stub`.

Corrected in commit `7e3b832002b216a498e0964f10028622fdaf9f5c`. This is a test expectation correction only; the package alias, Worker bundle, runtime startup, Hyperdrive, and database ACL smoke had already passed in that run. The next exact-head CI run must confirm all 6 Worker contract tests and the full quality/web-quality jobs pass.


## 2026-11-14 03:55 SAST — Actor Gateway Cloudflare Worker local qualification PASS

Exact latest handover/source commit: `2c3c7706ec72eb63b8cab99a9b996e2f303e271e`.

GitHub Actions run **43534569203** completed successfully:
- Quality: **70/70 steps passed**, no failures.
- Web-quality: **11/11 steps passed**, no failures.
- Root TypeScript build: passed.
- Wrangler `4.161.0` Worker bundle dry-run: passed; no deployment/upload.
- Disposable PostgreSQL 18 migrations: passed.
- Isolated Actor Gateway database principal qualification: passed.
- Local Wrangler/Workers runtime smoke: passed.
- Hyperdrive local connection to the disposable PostgreSQL service: passed.
- Actor Gateway startup identity and full ACL verification before listener creation: passed.
- `GET /healthz`: HTTP 200, `{"status":"ok"}`.
- Authenticated malformed JSON request: HTTP 400, `{"error":"invalid_request"}`, proving the Worker-specific bounded JSON parser runs after JWT authentication and edge rate-limit evaluation.
- Full existing repository suite: 998 tests passed, 0 failed.
- Worker TypeScript type-check: passed.
- Worker source contract tests: 6/6 passed.
- Additional disposable gateway, Connect provisioning, capability, storage, marketplace and issuer qualification stages: passed.

Run:
https://github.com/zaidhqdev-sys/GHM/actions/runs/43534569203

### What this proves

The Worker adapter now runs in the local Cloudflare Workers runtime, can reach a disposable PostgreSQL database through Hyperdrive, verifies the dedicated Actor Gateway SQL identity and ACL before accepting requests, enforces the configured edge rate-limit binding, and handles JSON requests without Express's incompatible body-parser/iconv-lite chain.

### What this does not prove

- No Cloudflare account or Free-tier Hyperdrive resource has been created.
- No production database credential or Hyperdrive connection has been used.
- No Worker was deployed, routed or exposed publicly.
- No production database role, ACL, environment variable, DNS, or traffic was changed.
- Rate Limiting API is approximate/per-location, not a strict global counter.
- Production connectivity, TLS/network allow-list behavior and live credential separation still require a separately approved production qualification.
- Authentication Issuer is still not hosted; Argon2id 64 MiB/t=3/p=1 Free CPU compatibility remains unresolved.

The current local Worker prototype is now green at exact-head CI. Keep PR #272/#276 draft/unmerged, Render auto-deploy OFF, and PayFast excluded.


## 2026-11-14 04:05 SAST — latest documentation-head CI also green

The handover-only commit `2c3c7706ec72eb63b8cab99a9b996e2f303e271e` was independently checked by run `43534569203`:
- Quality: 70/70 steps passed.
- Web-quality: 11/11 steps passed.
- No failed or skipped steps.
- The exact Worker bundle, local runtime, Hyperdrive, database ACL, authenticated JSON parser, 998-test suite and 6 Worker contract tests all passed.

The resulting handover update is committed separately; no application source changed after the qualified source head. Continue treating the Actor Gateway as locally qualified but not production-deployed.


## 2026-11-14 04:20 SAST — Authentication Issuer Argon2id WASM feasibility spike added

The next phase tests whether the current GHM password policy can run in a Cloudflare Worker under the Free 10 ms CPU limit without weakening password security.

### Existing GHM password contract (must remain unchanged)

From `src/auth/foundation/password.ts`:
- Algorithm: Argon2id v1.3.
- Memory: 65,536 KiB (64 MiB).
- Time cost: 3.
- Parallelism: 1.
- Hash length: 32 bytes.
- Salt length: 16 bytes.
- Existing native implementation: `argon2` npm package.
- Existing stored hash format: standard PHC string.

No parameter reduction, algorithm switch, hash rewrite, or user password reset is permitted to fit a hosting limit.

### WASM candidates assessed

- `@hallaxius/argon2w` advertises standard PHC compatibility and a Cloudflare Workers export, but its documented `memoryCost` maximum is 32,768 KiB. It cannot verify GHM's current 65,536 KiB hashes under its published input limits; excluded for this policy.
- `hash-wasm@4.13.0` supports Argon2id, PHC-encoded output, verification, and a 65,536 KiB memory setting. It is selected for a compatibility/performance spike only, not accepted as the production password implementation.

References:
- https://github.com/Daninet/hash-wasm
- https://www.npmjs.com/package/hash-wasm
- https://github.com/orgShtora-1/argon2w
- https://developers.cloudflare.com/workers/platform/limits/

### Benchmark files added

- `workers/auth-issuer-argon2-benchmark/package.json`
- `workers/auth-issuer-argon2-benchmark/wrangler.jsonc`
- `workers/auth-issuer-argon2-benchmark/index.ts`
- `workers/auth-issuer-argon2-benchmark/compat.mjs`
- `workers/auth-issuer-argon2-benchmark/smoke.mjs`

The benchmark Worker is isolated from the production app and contains no database bindings, secrets, routes or production credentials. Its Wrangler config explicitly sets `limits.cpu_ms=10`, disables public/preview routes and disables observability.

The CI feasibility test:
1. Installs hash-wasm only inside the benchmark package, without changing the root dependency lockfile.
2. Generates a native GHM-profile Argon2id PHC string using the existing native `argon2` package.
3. Verifies the native PHC using hash-wasm at the exact 64 MiB/t=3/p=1 profile.
4. Generates a hash using hash-wasm and verifies that PHC using native `argon2`.
5. Starts the local Workers runtime with a 10 ms CPU budget.
6. Measures Worker-side hash verification and generation separately.
7. Records whether operations complete, exceed 10 ms, or fail under the local Worker CPU budget.
8. Uploads the benchmark result and runtime logs as a short-retention CI artifact.

This benchmark is intentionally non-gating for the overall GHM suite when the result is simply over budget: an over-budget result is an architectural blocker to record, not a reason to weaken Argon2id. PHC interoperability failures or unexpected runtime errors remain test failures.

### Current status

The benchmark source and CI steps are committed, but no compatibility or performance result is claimed yet. The next exact-head CI run will determine whether hash-wasm can interoperate with existing GHM PHC strings and whether its 64 MiB/t=3/p=1 operations fit the Free Worker CPU limit. A local measurement below 10 ms would still be only a candidate; final confirmation would require a controlled Cloudflare Free runtime test before any production use.

No Cloudflare account, billing plan, Worker deployment, production secret, production database connection or authentication traffic was changed.


### Argon2id WASM PHC interoperability — passed; Worker CPU benchmark pending

The first CI run `43535196133` completed:
- Isolated `hash-wasm@4.13.0` installation: passed.
- Native GHM Argon2id hash generation at 65,536 KiB / t=3 / p=1 / 32-byte tag / 16-byte salt: passed.
- hash-wasm verification of the native PHC string: passed.
- hash-wasm generation at the exact same profile: passed.
- Native `argon2.verify` verification of the hash-wasm PHC string: passed.
- PHC profile check (`$argon2id$v=19$m=65536,t=3,p=1$`): passed.

This establishes bidirectional PHC interoperability at the exact GHM password parameters in Node/WASM. It does not yet prove Cloudflare Worker performance.

The subsequent local Workers benchmark step did not return during the initial run's diagnostic window. It is still running; the cause and CPU result are not established. I have bounded each local Worker request with a hard 20-second diagnostic timeout and will record timeout/operation errors instead of leaving CI hung. The workflow now also uploads the PHC interoperability report immediately after that step, so it remains available even if the Worker benchmark stalls.

No password algorithm, cost parameter, existing stored hash, production issuer or user account was changed.


### Argon2id Worker benchmark execution bounded

The first local Worker Argon2 benchmark request did not return within the initial run's expected window. Because the Workers local runtime may execute WASM on the same event loop, an in-process JavaScript timeout is not a sufficient hard stop if the WASM computation blocks the event loop.

The CI step now uses an external OS-level `timeout --kill-after=5s 90s` around the benchmark process. A 90-second timeout is recorded as `local_worker_benchmark_exceeded_90s_timeout`, not silently interpreted as a passing measurement. The script also writes progress stages (`starting_worker`, `worker_ready`, `operation_started`, `operation_completed`) so uploaded artifacts identify where execution stopped. The 10 ms Worker CPU budget remains explicit in Wrangler config.


## 2026-11-14 04:45 SAST — Argon2id WASM compatibility PASS, Free CPU feasibility NO-GO

The PHC interoperability artifact from run `43535797694` was downloaded and inspected. It proves bidirectional compatibility at the exact GHM profile:
- Native GHM Argon2id PHC verified successfully by hash-wasm.
- hash-wasm Argon2id PHC verified successfully by native `argon2`.
- PHC parameters confirmed: `$argon2id$v=19$m=65536,t=3,p=1$`.
- No password policy or hash-format changes.

### Measured Node 22 WASM timings

| Operation | Measured time | Free Worker CPU budget |
|---|---:|---:|
| Native GHM Argon2id hash | 146.62 ms | 10 ms |
| hash-wasm verify native PHC | 317.27 ms | 10 ms |
| hash-wasm generate PHC | 275.15 ms | 10 ms |

The WASM verify and hash operations measured approximately 31.7x and 27.5x the Workers Free 10 ms CPU allowance, respectively. These are GitHub Actions Node 22 measurements, not Cloudflare production timings, so they are not a formal Cloudflare benchmark. They nevertheless show that this implementation is nowhere near the Free CPU budget. A production Worker would need an extraordinary 27–32x speedup to fit, which has not been demonstrated.

### Local Worker runtime attempt

The separate local Worker benchmark was configured with `limits.cpu_ms=10`, but the Argon2 operation did not return within the diagnostic window. This is not treated as a measured Cloudflare CPU result; local Workerd execution did not provide a usable timing. The hanging Worker benchmark harness was removed from CI to avoid leaving runners blocked. The Node/WASM PHC compatibility benchmark remains, records timings and classifies them against the 10 ms Free budget.

### Architecture decision

**Do not deploy the Authentication Issuer to Workers Free using hash-wasm or weaken GHM's Argon2id settings.** The issuer remains blocked under the current $0 infrastructure constraint.

- Do not lower memory from 64 MiB, time cost from 3, or change parallelism/algorithm.
- Do not migrate stored password hashes or force password resets.
- Do not move the private signing key or token pepper into the Actor Gateway or Resource API as a workaround.
- Do not enable Workers Paid ($5/month) or Containers.
- Revisit the issuer host only after revenue and explicit budget approval, or if a materially faster Workers-compatible Argon2id implementation is independently demonstrated at the exact existing profile.

The Actor Gateway Worker remains locally qualified and can be considered for a separately controlled production cutover once production database identity, Hyperdrive connectivity, TLS and routing are qualified. That would not complete Authentication Issuer isolation; the existing issuer remains a documented transitional boundary.

No production database, Render configuration, Cloudflare account, billing plan, Worker deployment, DNS, secret, password hash or authentication traffic was changed.


### CI efficiency and benchmark evidence retention

The Worker-local Argon2 execution harness has been removed from the CI path because it stalled without returning a reliable measurement under the local 10 ms CPU configuration. The standalone bidirectional PHC compatibility/performance script remains in CI; it reports the exact GHM parameters, interoperability checks, measured WASM timings and whether both operations exceed the 10 ms Free budget. The measured report is preserved immediately as an artifact.

The CI workflow now:
- Uses a concurrency group per workflow/ref with `cancel-in-progress: true` to avoid accumulating redundant same-branch runs.
- Ignores documentation-only changes for push and pull-request triggers, while source/workflow changes still trigger qualification.
- Retains explicit manual `workflow_dispatch` support.

This is intended to keep the qualification pipeline useful while handover-only commits no longer start the full PostgreSQL/security suite.


## 2026-11-14 05:10 SAST — fresh production ghm_db role, ACL and runtime-target audit

Read-only inspection was performed through the Render workspace connector against production Postgres resource `dpg-dag0sdtbedkc7389vi2g-a`.

### Production database metadata

- Render resource: `ghm-db`
- Database: `ghm_db`
- PostgreSQL: 18
- Region: Frankfurt
- Plan: existing `0.1c-256mb`
- Status: available
- Render default database user: `ghm_app_user`
- IP allow-list: `0.0.0.0/0` (broad external access; hardening item, unchanged)

### Render SQL connector identity and default role setting

A read-only SQL session reports:
- `current_database() = ghm_db`
- `session_user = ghm_app_user`
- `current_user = ghm_db_user`
- `current_setting('role') = ghm_db_user`

The catalog contains a global `pg_db_role_setting` entry for `ghm_app_user`: `role=ghm_db_user` (not limited to one database). The membership from `ghm_app_user` to `ghm_db_user` is `INHERIT=true`, `SET=true`, `ADMIN=false`.

The `ghm_db_user` role itself is not superuser, but has `CREATEDB=true` and `CREATEROLE=true`. It also has administrative membership options over protected service roles. Consequently, any client authenticating as `ghm_app_user` receives the configured `ghm_db_user` role by default and runs with its elevated authority. This is a serious credential-boundary risk for any application configured to use the default Render database user.

**Important attribution:** this is the identity used by the Render SQL connector session. It is not proof that the GHM-Internal-Runtime application itself currently connects as `ghm_app_user`; the operator-supplied `DATABASE_URL` instead names `ghm_runtime` and targets the suspended sandbox. Do not conflate the Render dashboard/query connector identity with the application connection.

### Duplicate administrator-to-runtime membership

Production `pg_auth_members` contains two grants making `ghm_db_user` a member of `ghm_runtime`:

| Grantor | ADMIN | INHERIT | SET | Assessment |
|---|---:|---:|---:|---|
| `postgres` | true | false | false | Intended controlled administrative membership |
| `ghm_db_user` | false | true | true | Unintended/redundant membership; permits role assumption and inheritance |

The second grant conflicts with the intended rule that the administrator must not inherit or SET into the service runtime role. It must be reconciled in a separately qualified production privilege change. No revocation was performed.

### Production service-role state

| Role | Login | Key findings |
|---|---:|---|
| `ghm_runtime` | yes | NOINHERIT; no superuser/createdb/createrole/replication/bypassrls. Has ghm schema USAGE, no CREATE; 39 table SELECT, 3 INSERT, 1 UPDATE, 1 DELETE grants; 47 routine EXECUTE grants. |
| `ghm_actor_gateway` | yes | Restricted role attributes, but no ghm schema USAGE, no ghm routine grants, and no Actor Gateway SQL functions found in production. Not production-operational. |
| `ghm_migrator` | yes | Restricted login; can SET ROLE to `ghm_schema_owner` (membership has SET=true, INHERIT=false). It is the intended migration principal. |
| `ghm_schema_owner` | no | Owns the migration ledger and schema objects; non-login. |
| `ghm_payment_provider` | yes | Role exists; PayFast remains paused. |
| `ghm_auth_issuer` | no | No production role by this name was found. Issuer DB identity is not provisioned. |

The expected Actor Gateway entry points are absent, including the actor assertion, actor identity lookup and gateway supplier/business-profile write functions. This confirms the production database is not yet at the Actor Gateway migration cutover state even though the login role exists. The local disposable database qualification does not imply these functions or grants exist in production.

### Production migration ledger access

The table `ghm.ghm_schema_migrations` exists and is owned by `ghm_schema_owner`. Its ACL is owner-only. The current Render SQL connector session (`ghm_db_user`) and `ghm_app_user` cannot SELECT it; `ghm_migrator` cannot SELECT without first executing its authorized `SET ROLE ghm_schema_owner` transition. This is consistent with the intended ownership boundary, but means the migration ledger count/version list has **not** been read in this session. Do not infer that the production migration ledger is empty or complete. Obtain it through the dedicated migrator connection and authorized owner-role transition.

### Current deployed code versus the construction branch — correct variable name

The current Render GHM-Internal-Runtime live deployment remains commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`. Its `src/config.ts` reads `DATABASE_URL` for the runtime pool. Its `src/db/migrate.ts` reads `GHM_MIGRATOR_DATABASE_URL`, `GHM_MIGRATION_DATABASE_HOST` and `GHM_MIGRATION_DATABASE_NAME` for migration execution/target checks.

The current deployed `/healthz` handler returns `{status:"ok"}` without checking database connectivity. Therefore the earlier HTTP 200 health check is not evidence that the runtime can reach its configured database.

The operator-supplied 2026-11-13 environment baseline has:
- `DATABASE_URL` -> host/resource `dpg-db4416vlk1mc73eocug0-a`, database `ghm_payfast_sandbox_db` (suspended/expired).
- `GHM_MIGRATOR_DATABASE_URL` -> same suspended sandbox host/database.
- `GHM_MIGRATION_DATABASE_HOST` -> same suspended sandbox host.
- `GHM_MIGRATION_DATABASE_NAME` -> `ghm_payfast_sandbox_db`.

Thus the currently deployed code is configured to use the retired sandbox for both runtime and migration connections, based on the operator-supplied live environment inventory. Database-backed routes are at risk of connection failure even while `/healthz` returns 200. This is a configuration diagnosis from the supplied variable values and deployed source; no live application database request was executed.

The draft construction branch for PR #276 has changed the runtime variable contract to require `GHM_RUNTIME_DATABASE_URL`. That branch is not deployed. **Do not add only `GHM_RUNTIME_DATABASE_URL` to the current live service and assume it will be used:** the deployed `c7cf1eb` source reads `DATABASE_URL`. The final variable migration must be coordinated with the exact source deployment. The production runtime URL must target `ghm_db` using the restricted `ghm_runtime` login; the production migrator URL must separately target `ghm_db` using `ghm_migrator`.

The migration host/name and nonproduction/qualification guard variables must be handled according to their source consumers. Do not simply replace all sandbox-named safety variables with production values or delete them before reviewing the target guard.

### Next production-safe sequence

1. Complete the source consumer audit and settle the exact runtime/migrator environment contract for the candidate deployment.
2. Prepare controlled password provisioning for the existing production `ghm_runtime` and `ghm_migrator` logins; passwords must be generated/stored in Render and never pasted into chat or Git.
3. Prepare a least-privilege correction for the global `ghm_app_user` default role setting and duplicate `ghm_db_user` -> `ghm_runtime` grant, preserving a supported Dashboard-managed administrator path.
4. Obtain migration ledger evidence through `ghm_migrator` with `SET ROLE ghm_schema_owner`.
5. Apply/qualify the production Actor Gateway SQL migrations only after exact source, ledger, ACL and rollback evidence are reconciled.
6. Only then prepare a Cloudflare Free Hyperdrive production connection and route plan.

No production role, membership, ACL, password, database, migration, Render environment variable, service, deployment, Cloudflare account, DNS or traffic was changed during this audit.


## 2026-11-14 05:25 SAST — production Connect browser-auth and CORS configuration audit

Read-only inspection of the deployed GHM source at `c7cf1eb` and ZAID Connect `main` confirms the following configuration contract.

### GHM browser-cookie auth requirements

The deployed `src/http/auth-router.ts` builds browser-cookie configuration from:
- `GHM_WEB_AUTH_ALLOWED_ORIGINS`
- `GHM_WEB_AUTH_COOKIE_PATH`
- `GHM_WEB_AUTH_COOKIE_MAX_AGE_SECONDS`

It returns `browser_auth_not_configured` (HTTP 503) unless:
- at least one allowed origin is configured;
- each origin is a valid exact HTTPS origin (or localhost for development);
- cookie path is exactly `/api/ghm`;
- max age is an integer between 60 and 2,592,000 seconds.

The operator-supplied GHM-Internal-Runtime inventory contains `GHM_WEB_AUTH_ALLOWED_ORIGINS` with only the Connect preview origin, but does **not** contain `GHM_WEB_AUTH_COOKIE_PATH` or `GHM_WEB_AUTH_COOKIE_MAX_AGE_SECONDS`. Therefore browser-cookie auth is not configured in the supplied baseline and those endpoints will return 503. Even if the missing cookie settings are later added, the canonical production Connect origin `https://zaid-connect.vercel.app` is not currently in the supplied allow-list, so production browser-auth requests would be rejected with 403.

### ZAID Connect proxy requirements

The Connect mainline proxy `api/ghm/[...path].js` requires Vercel-side:
- `CONNECT_WEB_ORIGIN`
- `GHM_INTERNAL_RUNTIME_URL`

It maps same-origin `/api/ghm/auth/web/*` requests to GHM `/api/v1/auth/web/*`, forwards cookies, and sets the upstream `Origin` to `CONNECT_WEB_ORIGIN`. Thus, when the production proxy is enabled, the GHM `GHM_WEB_AUTH_ALLOWED_ORIGINS` list must include the exact canonical production origin. The proxy also constrains preview origins to trusted same-origin Vercel preview hosts.

The Vercel project environment could not be read in the connected Vercel account scope, so the live values of `CONNECT_WEB_ORIGIN`, `GHM_INTERNAL_RUNTIME_URL` and any Connect feature flag enabling the browser-auth client remain unverified. The source confirms the contract, not the live toggle state.

### Direct bearer-token browser API CORS

The deployed GHM `src/config.ts` parses `CORS_ORIGINS`, and `src/http/app.ts` applies that allow-list to browser API responses. The supplied list contains localhost and two Cloudflare Pages origins, but not `https://zaid-connect.vercel.app`. Direct browser requests from the production Connect origin therefore do not have a matching CORS allow-list entry. Server-to-server proxy requests are distinct from direct browser requests, but the cookie-auth route has its own exact Origin gate described above.

### Required before Connect auth cutover

Do not blindly add origins or guess cookie lifetimes. Before enabling or migrating the Connect browser-auth path:
1. Confirm whether the production Connect feature flag is enabled.
2. Confirm the actual Vercel `CONNECT_WEB_ORIGIN` and `GHM_INTERNAL_RUNTIME_URL` values.
3. Decide the intended cookie max age and confirm `/api/ghm` path.
4. Add only the canonical production origin to the appropriate GHM origin controls; retain preview origins only where needed.
5. Test both the direct bearer-token API and same-origin cookie proxy independently.

No GHM or Vercel environment variable, CORS policy, cookie setting, route, deployment or user session was changed.


### Latest source/workflow CI after Argon2 feasibility changes

Run `43536273084` tested exact commit `30d418d2498f765ac87f2c050dc4f18b0b46df36`:
- Quality: **73/73 passed**.
- Web-quality: **11/11 passed**.
- No failed steps.
- The bidirectional Argon2id PHC compatibility step passed and the benchmark report was preserved.
- The local 10 ms Worker benchmark that stalled was removed from the CI path; its incomplete execution is not treated as a performance measurement.
- The Node/WASM timings remain the current evidence for rejecting `hash-wasm` as a Free-tier candidate at the unchanged GHM password profile.

Run:
https://github.com/zaidhqdev-sys/GHM/actions/runs/43536273084

Subsequent handover-only commits do not trigger the full CI suite by design; the latest source/workflow commit above remains the qualified code head.


### Latest Argon2id WASM artifact — authoritative timing update

The latest preserved artifact from run `43536273084` was downloaded and inspected:
- PHC interoperability: both directions passed.
- Exact profile: Argon2id v=19, m=65,536 KiB, t=3, p=1, 32-byte tag, 16-byte salt.
- Native hash: 110.94 ms.
- WASM verification: 183.88 ms.
- WASM generation: 173.62 ms.
- 10 ms Free CPU comparison: verification 18.4x over; generation 17.4x over.
- Artifact status: `phc_compatible_but_over_free_cpu_budget`.

These latest values supersede the earlier slower measurements from run `43535797694`; the conclusion is unchanged. The local Worker runtime attempt did not yield a valid timing, so the Node 22 measurements are evidence of a large performance gap, not a formal Cloudflare production benchmark.

### Deployed-main environment consumer map — confirmed source references

At deployed commit `c7cf1eb`:
- `DATABASE_URL`: required by `src/config.ts` and used by the Resource API pool in `src/db/pool.ts`.
- `DATABASE_SSL`: controls TLS configuration for the pool.
- `GHM_MIGRATOR_DATABASE_URL`, `GHM_MIGRATION_DATABASE_HOST`, `GHM_MIGRATION_DATABASE_NAME`: consumed by `src/db/migrate.ts` for the dedicated migrator connection and explicit target guard.
- `CORS_ORIGINS`: parsed by `src/config.ts` and applied by the HTTP app.
- `GHM_WEB_AUTH_ALLOWED_ORIGINS`: consumed by `src/http/auth-router.ts` for exact browser-cookie Origin validation.
- `GHM_WEB_AUTH_COOKIE_PATH` and `GHM_WEB_AUTH_COOKIE_MAX_AGE_SECONDS`: also required by that browser-cookie config but absent from the operator-supplied environment inventory.
- `PAYFAST_*`: loaded by the commercial config; PayFast remains paused.
- `STORAGE_*`: loaded by storage config.
- `GHM_JWT_ES256_PRIVATE_KEY_PEM`, `GHM_JWT_ES256_PUBLIC_KEY_PEM`, `GHM_JWT_ES256_KID`: required by ES256 key loading. The supplied KID `ghm-sandbox-20261012-01` is sandbox-labelled; the redacted key pair cannot be independently classified here.
- `GHM_RUNTIME_DATABASE_URL`: not read by deployed `c7cf1eb`; it is the new runtime variable required by the draft construction branch, not by the live deployment.
- `GHM_NONPRODUCTION_DATABASE_NAME` and `GHM_QUALIFICATION_DATABASE_NAME`: no consumer found in the deployed core config or migration runner inspected so far. They may be referenced by qualification scripts; keep them until the broader script consumer audit is complete rather than deleting or repointing them.

The supplied environment is therefore not a single interchangeable set of "database variables": runtime and migrator connections have distinct source consumers, and qualification/guard values must remain distinct from production targets.


## Operator action pending — provision and verify production ghm_runtime credential

This is the next required Render action. It is deliberately limited to rotating the password of the existing least-privilege `ghm_runtime` login and verifying a read-only connection. It does not grant new privileges, alter memberships, run migrations or change application traffic.

### PowerShell password generation (keep the value local)

```powershell
Write-Host "=== Generate production ghm_runtime password ==="
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$runtimePassword = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$rng.Dispose()
$runtimePassword
```

The output is a 64-character hex password. Do not paste it into ChatGPT, GitHub, a handover, or screenshots.

### Render Dashboard SQL action

1. Open the existing Render PostgreSQL resource `ghm-db` (database `ghm_db`, resource ID `dpg-dag0sdtbedkc7389vi2g-a`).
2. Confirm its status is Available and open its Query/SQL console.
3. Confirm the selected database is `ghm_db`.
4. Run the following statement, replacing the placeholder with the locally generated hex value:

```sql
ALTER ROLE ghm_runtime WITH PASSWORD 'PASTE_LOCAL_64_CHARACTER_HEX_VALUE';
```

5. Do not change role attributes, memberships, grants, schema ownership or any other role.

If Render rejects the statement or the Query console is read-only, stop and record the exact non-secret error. Do not try a different role or alter the administrator memberships.

### Verify the credential from the operator's Windows machine

Copy the exact external hostname shown by Render under `ghm-db` > Connect. The expected Render hostname follows the resource ID, but use the exact value displayed in the dashboard.

```powershell
Write-Host "=== Verify direct production runtime login ==="
$dbHost = "PASTE_EXACT_GHM_DB_EXTERNAL_HOST"
$env:PGPASSWORD = $runtimePassword
psql "host=$dbHost port=5432 dbname=ghm_db user=ghm_runtime sslmode=require" -X -v ON_ERROR_STOP=1 -c "SELECT current_database() AS database_name, session_user, current_user, has_schema_privilege(current_user, 'ghm', 'USAGE') AS ghm_usage, has_schema_privilege(current_user, 'ghm', 'CREATE') AS ghm_create;"
Remove-Item Env:PGPASSWORD
```

Expected non-secret result:
- database_name = `ghm_db`
- session_user = `ghm_runtime`
- current_user = `ghm_runtime`
- ghm_usage = `true`
- ghm_create = `false`

This proves the restricted login connects directly without assuming `ghm_db_user` or another role.

### After verification — do not perform until the psql result is confirmed

Only after the direct psql check succeeds, update GHM-Internal-Runtime's `DATABASE_URL` to the production `ghm_runtime` URL. Keep `DATABASE_SSL=true`. The current live deployment `c7cf1eb` reads `DATABASE_URL`; do not add only `GHM_RUNTIME_DATABASE_URL` yet because that name is required by the unmerged construction branch, not the deployed source. The migrator URL and migration host/name remain unchanged until a separate production migration credential and ledger-read procedure are ready.

The Render environment update will restart the existing service even though repository auto-deploy is OFF. No service environment change has yet been made.


### Current PR/branch state at this handover checkpoint

- PR #272: open, draft, unmerged; head `integration/capability-gateway-qualification-20261110`, base `main`.
- PR #276: open, draft, unmerged; head `construction/auth-issuer-stacked-on-pr272-20261113`, base `integration/capability-gateway-qualification-20261110`.
- Latest handover branch head: `475d19d388b7f7d6f9c47dcb6d78990433eceedc`.
- Latest source/workflow qualification: run `43536273084`, exact tested source/workflow commit `30d418d2498f765ac87f2c050dc4f18b0b46df36`, quality 73/73 and web-quality 11/11. Subsequent commits are documentation-only and are excluded from full CI by the workflow's paths-ignore rule.
- No PR was merged, no Render auto-deploy was enabled, and no production change was performed.


## 2026-11-14 — Actor Gateway Worker adapter qualification and review

### Scope and implementation recovered

The Actor Gateway Worker adapter is present in this stacked integration branch under `workers/actor-gateway/`. It is a separate Cloudflare entry point over the existing GHM Actor Gateway implementation; the Node/Render entry point and shared security readers remain unchanged.

Reviewed files:
- `workers/actor-gateway/index.ts`: Cloudflare Node HTTP bridge, Worker-specific bounded JSON parser, Hyperdrive-backed node-postgres client adapter, public-key-only ES256 verification, signed database assertion secret, edge rate-limit binding, and startup database identity/ACL verification before the listener is made available.
- `workers/actor-gateway/wrangler.jsonc`: Workers Node compatibility, Hyperdrive and rate-limit bindings, no Workers.dev hostname, no preview URLs, observability disabled, and a local disposable connection string / placeholder Hyperdrive ID for local qualification only.
- `workers/actor-gateway/worker-contract.test.mjs`: static contract checks for the adapter, secret boundary, startup ordering, fail-closed behavior and disabled public routes.
- `workers/actor-gateway/tsconfig.json` and `cloudflare-node.d.ts`: isolated Worker type-check boundary.

The Worker receives only ES256 public verification material. It does not load the issuer private signing key, token pepper, or issuer database URL. The capability assertion HMAC secret is a distinct gateway secret required by the existing database assertion wrappers.

### Exact qualification evidence

GitHub Actions run [43536273084](https://github.com/zaidhqdev-sys/GHM/actions/runs/43536273084) completed successfully on exact source/workflow commit `30d418d2498f765ac87f2c050dc4f18b0b46df36`:
- `quality`: passed, including Worker bundle dry-run, Worker local-runtime smoke, disposable PostgreSQL principal/ACL checks, full migration chain and test suite.
- `web-quality`: passed.
- Step 27, `Bundle Actor Gateway Cloudflare Worker without deploying`: passed.
- Step 33, `Smoke-test Actor Gateway in local Cloudflare Workers runtime`: passed.
- The smoke step exercised local Wrangler/Workerd, the local Hyperdrive binding to disposable PostgreSQL, startup principal/ACL verification, `/healthz`, and invalid JSON rejection with HTTP 400.
- The Worker TypeScript check and Worker contract test are included in the repository test script executed by the quality job.

The current PR #276 head is `b573b92c061630e440dc9dec76720d98c6d4fca5`. A Git comparison against the qualified commit reports 7 commits ahead, 0 behind, with the only changed file being this handover document. Therefore the Worker source and CI workflow tested by run 43536273084 are unchanged at the current PR head. The seven documentation-only commits themselves have not rerun the full suite by design.

### Production and cost boundary

This is local/disposable qualification and a non-deploying bundle check only. It does not prove a live Cloudflare-to-Render Hyperdrive connection, production TLS identity, production Actor Gateway database privileges, secret provisioning, domain routing, or production traffic behavior.

No Cloudflare Worker was deployed. No Hyperdrive resource was created or modified. No Cloudflare route, DNS record, secret, billing plan or account setting was changed. No production database role, grant, credential, migration, Render environment variable, service or deployment was changed.

Cloudflare's current Hyperdrive pricing documentation states that Hyperdrive is included on Workers Free with a limit of 100,000 database queries per day; exceeding a Free limit causes further operations of that type to fail rather than silently authorizing a paid upgrade. Workers Paid remains prohibited under the current zero-cost constraint. Source: https://developers.cloudflare.com/hyperdrive/platform/pricing/

### Review item before production consideration

The Worker-specific JSON parser currently emits the 413 response for an oversized body only from the request `end` handler. It stops buffering after the 16 KiB threshold, but a client that continues or stalls the upload can delay the response until the stream ends. Harden this to reject as soon as the limit is crossed, and add a regression test for the oversized-body path. This is a Worker adapter hardening item; do not alter the shared Node/Render parser.

### Remaining gates

1. Harden and test early oversized-body rejection without changing Node/Render behavior.
2. Re-run exact-head Worker typecheck, contract tests, Wrangler bundle dry-run and local Workerd/Hyperdrive smoke on the corrected source.
3. Keep production Hyperdrive connectivity, TLS identity, production Actor Gateway role/ACL, and route configuration as separate read-only/design gates until the production role and migration/backup reconciliation is complete.
4. Do not deploy, create Hyperdrive resources, provision production secrets, attach a domain, or route traffic without a separately recorded zero-cost and rollback-qualified plan.

**Current disposition:** Worker adapter source is locally qualified on the unchanged source commit; production connectivity and deployment are not qualified or authorized. Authentication Issuer isolation remains a separate security gate and must not be represented as completed by the Worker work.


### Worker oversized-body early rejection correction — 2026-11-14

The Worker-specific JSON parser was hardened without changing the shared Node/Render parser.

- When the streamed JSON body crosses 16 KiB, the middleware now marks the request complete, clears buffered chunks, immediately sends HTTP 413 `payload_too_large`, and resumes/drains the request stream without retaining further bytes.
- The later `end` handler returns immediately because the request has already been completed; it cannot emit a second response.
- The Worker contract test now asserts that the 413 response is in the data-event threshold branch, that completion is marked, that buffered chunks are cleared, and that stream draining follows the immediate response.
- Changed files: `workers/actor-gateway/index.ts` and `workers/actor-gateway/worker-contract.test.mjs`.
- Branch: `security/actor-gateway-worker-body-limit-20261114`.
- Source commits: `e15cb634e6aacf43cadd89159a6bd439390436ea` and `1e4a5d4d6786db5260f0b41b6e3b4775a1ee9e8c`.

This is source-level remediation only. Exact-head CI, Worker bundle, TypeScript check and local Workerd/Hyperdrive smoke must pass before calling the correction qualified. No production or Cloudflare account changes have been made.


### Worker transient-startup retry correction — 2026-11-14

A second adapter reliability issue was found while reviewing the startup lifecycle. The module-level `initialization` promise previously remained rejected after a transient Hyperdrive connection or startup ACL failure. Every later request in the same isolate would therefore return 503 without retrying initialization.

Correction:
- Attach a rejection handler to the shared initialization promise.
- Clear `initialization` when startup fails, then rethrow so the current request still fails closed with 503.
- A later request may retry initialization using the current Worker bindings.
- Add a Worker contract regression test that asserts failed initialization is cleared before the error is rethrown.

This does not bypass startup identity/ACL checks. Each retry must pass the same checks before the listener is created. Source commits: `067a3012ffcd391f207f3ca4bc634f7a6d89b2a2` and `5c9dba91dc66bf51c6e4441eb7b4852641faa4f3`.

The PR #277 exact-head CI remains the qualification gate for both Worker hardening changes. No production change was made.


### Worker hardening PR and exact-head CI trigger — 2026-11-14

- Draft PR #277: https://github.com/zaidhqdev-sys/GHM/pull/277
- Head branch: `security/actor-gateway-worker-body-limit-20261114`
- Parent/base branch: `construction/auth-issuer-stacked-on-pr272-20261113`
- Latest source/workflow head at this checkpoint: `c95c3f3cf06ccdb7d7233518dace37e7addb368f`.
- The CI workflow's push branch allow-list was extended only on this feature branch so its source changes can receive an exact-head run without opening a misleading PR against main.
- The GitHub combined-status lookup and PR-filtered workflow-run lookup returned no run/status for this SHA at the time of inspection. A fresh exact-head CI run is therefore **not yet confirmed**. Do not mark the Worker corrections qualified until the run is visible and both quality jobs complete.
- PR #277 remains draft and unmerged; it is stacked on the existing issuer/Actor Gateway integration. No production or Cloudflare account changes were made.


### Exact-head Worker hardening qualification completed — 2026-11-14

GitHub Actions run [43549310157](https://github.com/zaidhqdev-sys/GHM/actions/runs/43549310157) completed successfully on exact PR #277 head `09ecb58add2f3c68d0acdc26299d320d5c169d1a`.

Final results:
- `quality`: **73/73 steps passed**.
- `web-quality`: **11/11 steps passed**.
- Worker TypeScript and contract checks passed as part of the quality workflow.
- Wrangler Cloudflare Worker bundle dry-run passed.
- Local Workerd + disposable Hyperdrive smoke passed, including startup database identity/ACL checks, health endpoint and malformed JSON rejection.
- Disposable PostgreSQL migrations, Actor Gateway and Authentication Issuer principal qualification, full test suite, issuer lifecycle/runtime denials, and before/after SECURITY DEFINER authority inventory comparison all passed.
- No failed steps.

This run qualifies the current Worker hardening source and the full stacked disposable qualification suite. It does not establish live Cloudflare-to-Render Hyperdrive connectivity, production TLS/ACL identity, production role separation, production secret provisioning, DNS/routes, or production traffic behavior.

PR #277 remains an open draft, unmerged, stacked on `construction/auth-issuer-stacked-on-pr272-20261113`. It must not be merged independently of its parent security integration. The PR description's earlier "Validation pending" text is superseded by this completed exact-head run.

No production database, grants, credentials, Render environment/services/deployments, Cloudflare resources, DNS, secrets, billing settings or traffic routes were changed. No paid service was created.


### Live production Render role inventory — read-only verification, 2026-11-14

Read-only inspection was performed directly against the Render PostgreSQL instance:
- Render service: 'ghm-db'
- Render Postgres ID: 'dpg-dag0sdtbedkc7389vi2g-a'
- Database: 'ghm_db'
- PostgreSQL major version: 18
- Query method: Render read-only SQL transaction. No DDL, DML, grants, revocations, credential changes or connection setting changes were issued.

#### Observed role attributes

- 'ghm_db_user': LOGIN, INHERIT, CREATEDB and CREATEROLE; not superuser, not replication, not BYPASSRLS.
- 'ghm_app_user': LOGIN, INHERIT; no CREATEDB/CREATEROLE/superuser/replication/BYPASSRLS.
- 'ghm_actor_gateway': LOGIN, NOINHERIT; no CREATEDB/CREATEROLE/superuser/replication/BYPASSRLS.
- 'ghm_runtime': LOGIN, NOINHERIT; no elevated role attributes above.
- 'ghm_migrator': LOGIN, NOINHERIT; no elevated role attributes above.
- 'ghm_payment_provider': LOGIN, NOINHERIT; no elevated role attributes above.
- 'ghm_schema_owner': NOLOGIN, NOINHERIT; no elevated role attributes above.
- 'ghm_auth_issuer' was not present in the returned production role inventory.

#### Observed production role memberships

The live pg_auth_members query returned:
- 'ghm_app_user' is a member of 'ghm_db_user' (grantor 'postgres').
- 'ghm_db_user' has ADMIN OPTION over 'ghm_actor_gateway', 'ghm_migrator', 'ghm_payment_provider', 'ghm_runtime', and 'ghm_schema_owner' (grantor 'postgres').
- An additional 'ghm_db_user' to 'ghm_runtime' membership row exists with grantor 'ghm_db_user', no ADMIN OPTION, INHERIT true and SET true.
- 'ghm_migrator' is a member of 'ghm_schema_owner' (grantor 'ghm_db_user'), with INHERIT false and SET true.
- The query also returned expected platform memberships in 'pg_read_all_stats' and 'pg_signal_backend'.

#### Security interpretation and hold

Production role separation remains NOT QUALIFIED. In particular, the production connection principal 'ghm_db_user' has database/role creation attributes and delegated ADMIN OPTION over the security principals that are intended to be separated. 'ghm_app_user' inherits membership in that principal. This is a live production authority boundary, not a disposable-test failure.

The Worker and issuer disposable qualification results do not override this finding. No production changes were made. Do not attempt REVOKE, ALTER ROLE, role recreation, credential rotation, connection-string changes, Render environment updates or deployment until all of the following are established:
1. A current, verified production backup and tested restoration path (the previously identified Nov 4 backup alone is not sufficient evidence of current recoverability).
2. A complete dependency map of ownership, grants, default privileges, SECURITY DEFINER functions, connection pool/session role assumptions, and application runtime usage for each affected role.
3. A staged, reversible migration/role-transition plan that preserves application availability and has a clear rollback route.
4. The exact intended production login principals and their least-privilege effective grants, verified read-only before and after the controlled cutover.

The role inventory did not prove whether the 'ghm_db_user' ADMIN OPTION memberships can be safely removed from the current application session; that earlier attempted revoke did not resolve the membership. Do not repeat it. Render support's prior escalation remains relevant.

**Current production disposition:** read-only findings confirmed; privilege remediation blocked pending recovery evidence and complete authority/dependency mapping. No paid infrastructure was created or modified.


### Production Actor Gateway ACL compatibility — read-only check, 2026-11-14

Additional read-only checks were run against the same Render ghm_db instance to compare the live grants with the Worker startup contract in workers/actor-gateway/index.ts and src/actor-gateway/database-privileges.ts.

#### Current Render query connection identity

The Render read-only query session reported database 'ghm_db', session_user 'ghm_app_user', and current_user 'ghm_db_user'. This confirms the current queried application connection path still resolves to the legacy privileged principal; it is not the identity required by the new Worker adapter.

#### Actor Gateway role ACL versus Worker contract

Live effective privilege checks for 'ghm_actor_gateway' returned:
- USAGE on schema 'ghm': false.
- CREATE on schema 'ghm': false.
- Executable SECURITY DEFINER functions in schema 'ghm': 0.
- Executable Actor Gateway contract functions (assert_actor_gateway / assert_actor_gateway_capability / gateway_* non-trigger functions): 0.
- The only 14 ghm functions visible to the earlier broad EXECUTE check were trigger-returning functions; they are not the adapter's callable gateway contract.

The Worker startup contract requires schema USAGE, no schema CREATE, no direct relation privileges, and the exact expected Actor Gateway function allow-list. The live production ACL therefore does not satisfy the Worker startup contract. The Worker would fail closed at startup if connected using the dedicated 'ghm_actor_gateway' login with the currently observed grants. This is a production integration blocker, not a reason to weaken or bypass the Worker checks.

#### Related ownership and authority inventory

- Database 'ghm_db' is owned by 'ghm_schema_owner'; this role consequently has database CREATE (schema creation) privilege, despite its NOLOGIN role attributes.
- Schema 'ghm' is owned by 'ghm_schema_owner'. Schema 'public' is owned by 'ghm_db_user'.
- In schema 'ghm', 'ghm_schema_owner' owns 59 ordinary tables, 48 sequences, 1 view and the associated indexes/toast objects reported by pg_class.
- 'ghm_schema_owner' owns 63 SECURITY DEFINER functions in schema 'ghm'. The current check counted 46 of those as executable by 'ghm_runtime' and 46 as executable by 'ghm_app_user'/'ghm_db_user'.
- The only default ACL row returned for the reviewed principals was a schema-owner default sequence ACL in schema 'ghm' granting USAGE to 'ghm_runtime'. No function default ACL row was returned for 'ghm_schema_owner'.

#### Disposition

Do not add schema USAGE or function grants ad hoc. First reconcile the intended migration-defined gateway function allow-list, exact grantors/ACLs, direct relation grants, ownership, default ACLs and the current production connection string. The production role and Worker adapter cutover must be designed together, with a verified restore point and rollback. Do not weaken the adapter startup checks to accommodate the current production ACL.


### Additional production ACL and migration-evidence limits — 2026-11-14

Further read-only checks confirmed 'ghm_actor_gateway' has zero direct privileges on ordinary/partitioned tables, views, materialized views, foreign tables, and sequences in schema 'ghm'. This part of the intended least-privilege contract is satisfied.

However, schema USAGE is absent and the exact callable signed gateway allow-list is absent (zero executable 'gateway_*' / assertion contract functions), so the Worker startup ACL contract still fails. This is not a case for adding broad direct relation grants; the intended remedy must be the exact migration-defined schema USAGE and function allow-list after the production authority cutover is understood.

The Render read-only query connection (session_user 'ghm_app_user', current_user 'ghm_db_user') could not SELECT from 'ghm.ghm_schema_migrations' (PostgreSQL 42501 permission denied). This is consistent with application roles not having migration-ledger read access. Therefore this connection cannot establish the production migration ledger's latest applied version/checksum. Do not infer the migration head from schema object presence. A separate approved migration-authority/backup-backed evidence path is required to reconcile the production ledger without granting runtime access.


### Source allow-list documentation reconciliation — 2026-11-14

Cross-checking the live ACL findings against the exact source startup verifier found a stale count in docs/architecture/SQL_PRIVILEGE_INVENTORY.md. The current Actor Gateway verifier in src/actor-gateway/database-privileges.ts defines 33 exact signed/typed gateway function signatures (including the assertion function); the architecture inventory still said 25. The four stale references were corrected to 33 in the existing PR #277 branch. This is documentation-only; no migration or ACL was changed. The Worker contract remains fail-closed against production until all 33 expected signatures and schema USAGE are present and the full startup verifier passes.


### Production Actor Gateway migration objects absent — read-only confirmation, 2026-11-14

Read-only catalog inspection now distinguishes missing objects from merely missing grants. In production schema 'ghm':
- Count of current source-contract 'gateway_*' non-trigger functions: 0.
- Count of SECURITY DEFINER 'gateway_*' non-trigger functions: 0.
- 'ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text)' is absent.
- The earlier 'ghm.assert_actor_gateway(bigint)' helper is absent.
- 'ghm.actor_gateway_capability_assertion_nonce' table is absent.
- 'ghm.actor_gateway_capability_assertion_secret' table is absent.
- 'ghm.ghm_schema_migrations' exists, but its rows are not readable through the current application query identity (42501).

This confirms the production database does not currently contain the Actor Gateway SQL objects required by the source branch. The exact migration ledger head cannot be read with the current connection, so we cannot yet distinguish an unapplied migration range from later manual object removal. Do not assume the migrations have been applied, and do not apply them directly as a shortcut. Reconcile the ledger using the approved migration-authority path, compare every expected migration checksum, and first establish a verified current backup and restoration route. Production remains on its current legacy application path until that reconciliation and controlled cutover are complete.


### Cloudflare zero-cost hosting assessment — documentation review, 2026-11-14

Reviewed current official Cloudflare documentation (pricing pages last updated June/October 2026; Workers limits last updated 13 November 2026):
- Workers Free includes 100,000 incoming requests per day and a 10 ms CPU-time limit per invocation.
- Hyperdrive is included on Workers Free with 100,000 database statements per day; the daily quota resets at 00:00 UTC and further operations fail when the free limit is exceeded. A statement includes reads and writes.
- The Workers Paid plan has a minimum account charge of USD 5/month and is prohibited by the current cost constraint.
- The Cloudflare Rate Limiting binding API is available in Workers; its documentation describes limits as approximate and separately applied in each Cloudflare location. It must be treated as abuse mitigation, not a globally strict security quota.
- Current Worker configuration deliberately has workers_dev=false, preview_urls=false and observability disabled; its Hyperdrive ID is a placeholder and its local connection string targets disposable PostgreSQL only. No Cloudflare Worker, Hyperdrive resource, rate-limit binding, secret, route, DNS record or paid plan has been provisioned or changed.

Zero-cost feasibility is plausible on the Workers Free plan within the published limits, but it is not yet account-verified or deployment-qualified. Do not upgrade to Workers Paid. Before any resource creation, confirm the account remains on Free, check that rate-limit namespace ID 41001 is unused within the account, and confirm a suitable domain/route and external Render PostgreSQL TLS/network path. Keep production deployment blocked by the missing production gateway SQL objects, unresolved production authority/backup gates, and absence of a deployed dedicated gateway service.

Official references:
- https://developers.cloudflare.com/hyperdrive/platform/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/


### Exact open-stream oversized-body runtime qualification — 2026-11-14

Added a real local Workerd/HTTP regression to the existing .github/workflows/ci.yml smoke step. The test opens a chunked POST to '/v1/actor/me', writes 16 KiB + 1 byte, deliberately does not end the request stream, and requires HTTP 413 with 'payload_too_large' within 1.5 seconds. This verifies the Worker responds before request end rather than merely asserting source-code ordering.

Exact-head GitHub Actions run [43550565894](https://github.com/zaidhqdev-sys/GHM/actions/runs/43550565894) completed successfully on workflow/source commit 'bc7f2afa15aa4cb2483cf7f489fbfb6ce8d893bd':
- 'quality': 73/73 passed, including the updated local Cloudflare Workers + disposable Hyperdrive smoke step.
- 'web-quality': 11/11 passed.
- The Worker bundle dry-run, database startup ACL checks, malformed JSON rejection, and the new open-stream oversized-body 413 check all passed within the quality job.
- No failed steps.

This is the new Worker hardening qualification run. The earlier run 43549310157 remains valid for the previous source state; run 43550565894 is the evidence for the added open-stream test. No production DB, role, grant, secret, Render service/environment/deployment, Cloudflare resource, DNS/route, or paid plan was changed.


### Render PostgreSQL ↔ Cloudflare Hyperdrive network compatibility — documentation review, 2026-11-14

Reviewed official Cloudflare and Render connection documentation:
- Cloudflare Hyperdrive supports PostgreSQL through node-postgres 'pg' (minimum supported version 8.16.3) and supports PostgreSQL versions through 18.x.
- Hyperdrive PostgreSQL TLS defaults to 'require'; its documented 'require' mode validates the server certificate using WebPKI. Render external PostgreSQL connections require TLS 1.2+ and accept 'sslmode=require'. The production Hyperdrive origin must use the Render external hostname/URL, not a Render internal hostname; the local Wrangler connection string remains disposable-only.
- Cloudflare documents a maximum of 20 origin connections for a Free Hyperdrive account. This is compatible with a carefully bounded Worker pool, but the exact production pool and Render database connection budget still need calculation.
- The live Render metadata currently shows the production ghm-db external IP allowlist as 0.0.0.0/0 ('everywhere'). This makes external Hyperdrive reachability plausible, but it is broad internet exposure and is not an approved final security posture. Do not change it until Cloudflare Hyperdrive egress requirements and Render-supported allowlist options are verified; do not leave it described as a hardened allowlist.

This supports protocol/TLS compatibility at the documentation level only. No Hyperdrive connection to production has been attempted. No Hyperdrive resource, secret, connection URL, allowlist, DNS, route, Worker deployment or Cloudflare plan was created or changed.

Official references:
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- https://developers.cloudflare.com/hyperdrive/platform/pricing/
- https://render.com/docs/postgresql-creating-connecting


### Production migration-ledger authority path and current role graph — 2026-11-14

Fresh read-only Render catalog queries against production 'ghm-db' / database 'ghm_db' (PostgreSQL 18) reconfirmed the following:

- The migration ledger is 'ghm.ghm_schema_migrations', owned by 'ghm_schema_owner'. Its relation ACL is NULL (no explicit grants). The current query identity ('session_user=ghm_app_user', 'current_user=ghm_db_user') has no SELECT privilege. 'ghm_migrator' also has no direct schema USAGE or ledger SELECT, by design.
- The source migration runner in 'src/db/migrate.ts' uses 'GHM_MIGRATOR_DATABASE_URL', verifies the login as 'ghm_migrator', then executes 'SET ROLE ghm_schema_owner' before resolving and reading the ledger's version/name/checksum rows. Its principal guard explicitly requires no direct 'ghm' schema USAGE and no direct relation/sequence privileges for the migrator, plus the exact SET-only owner membership. Therefore the intended authoritative ledger inspection path is the approved migrator identity/runner, not the Resource API connection. The live Render service inventory/environment does not currently prove that a production migrator credential is provisioned or safely available; do not print or request secret values.
- The read-only Render query tool accepts one prepared SQL statement per call. A two-command 'SET LOCAL ROLE; SELECT ...' attempt was rejected with PostgreSQL 42601 before execution. No role was changed and no ledger data was read. No workaround or ad hoc grant was applied.

The current role membership rows were captured with grantor and all three membership options:

| Granted role | Member | Grantor | ADMIN | INHERIT | SET |
|---|---|---|---:|---:|---:|
| 'ghm_actor_gateway' | 'ghm_db_user' | 'postgres' | true | false | false |
| 'ghm_migrator' | 'ghm_db_user' | 'postgres' | true | false | false |
| 'ghm_payment_provider' | 'ghm_db_user' | 'postgres' | true | false | false |
| 'ghm_runtime' | 'ghm_db_user' | 'postgres' | true | false | false |
| 'ghm_schema_owner' | 'ghm_db_user' | 'postgres' | true | false | false |
| 'ghm_runtime' | 'ghm_db_user' | 'ghm_db_user' | false | true | true |
| 'ghm_schema_owner' | 'ghm_migrator' | 'ghm_db_user' | false | false | true |
| 'ghm_db_user' | 'ghm_app_user' | 'postgres' | false | true | true |

'ghm_db_user' remains LOGIN/INHERIT with CREATEDB and CREATEROLE, and has ADMIN OPTION over the five sensitive roles above. 'ghm_app_user' inherits 'ghm_db_user'. The duplicate runtime membership rows are distinct grant paths and must both be accounted for. These are read-only findings; no membership or role changes were made.

Render metadata for 'ghm-db' reports PostgreSQL 18, status available, region Frankfurt, plan '0.1c-256mb', 1 GB disk, no HA, no connection pool, and external IP allowlist '0.0.0.0/0'. This is a current metadata snapshot, not a backup/restore verification. The broad external allowlist remains a network-hardening issue; do not change it until the Hyperdrive egress design is verified.

**Next authoritative step:** establish a safe, approved way to run the existing migration runner in read-only/audit mode using the exact production 'ghm_migrator' credential, or a separately approved equivalent that preserves the same identity checks. It must emit only the ledger version/name/checksum inventory and compare it against repository migrations without applying pending SQL. Do not weaken the runner's identity contract, grant the Resource API access to the ledger, run the ordinary mutating migration command, or attempt a production cutover. First verify current backup/restore evidence and the exact production migrator connection target.


### Existing read-only forensic migration audit located — 2026-11-14

A source inspection found that the safe audit path already exists; no duplicate audit command is needed:

- 'npm run audit:migrations' runs 'scripts/forensic-migration-reconciliation.mjs'.
- It connects with 'GHM_MIGRATOR_DATABASE_URL', begins a 'READ ONLY' transaction, checks 'session_user=current_user=ghm_migrator' and the expected database, executes 'SET ROLE ghm_schema_owner', verifies the effective identity, and reads only ledger 'version/name/checksum/applied_at'. It does not execute migration SQL or write to the ledger.
- It compares every live ledger row against repository migration versions/names and canonical SHA-256, supported legacy CRLF checksums, documented historical exceptions, retained historical entries and the production pending-migration allowlist. Its normal production mode reports pending migrations as INVESTIGATE; 'npm run audit:migrations:predeploy' is the explicit allow-pending comparison mode.
- The script chooses the production-only exception/retained/pending config when database is 'ghm_db'; the target guard rejects unsupported database/target combinations. The normal command is an audit, unlike 'npm run migrate'.

This resolves the earlier assumption that a new read-only audit mode must be built. The remaining blocker is credential/runner availability, not missing source functionality. Current Render service inventory shows only 'ghm-internal-runtime' as the production GHM web service (branch 'main', auto-deploy off, /healthz); there is no dedicated production migrator service or Actor Gateway service. Render service metadata does not expose environment-variable names or prove that 'GHM_MIGRATOR_DATABASE_URL' is configured. Do not inspect or print secret values. The current app service is not an approved place to add or expose the migrator credential.

No production audit was executed: the available Render read-only query identity cannot read the ledger, and no safe production migrator invocation/credential has been established. The next step is to identify an existing authorized operator execution path for the already-existing read-only command, or establish one only after checking it requires no additional paid service and does not expose the secret. Until then, exact production migration head/checksums remain unknown. No source code, runtime configuration, service, environment variable, migration, grant or database data was changed by this finding.


### Fresh production gateway catalogue recheck — 2026-11-14

A further read-only PostgreSQL catalog pass on production 'ghm_db' confirmed the live state without relying on the migration ledger:

- 'ghm_actor_gateway' has no USAGE or CREATE on schema 'ghm'. It has no direct privileges on 'ghm' tables/sequences from the earlier relation privilege audit.
- The exact Actor Gateway startup contract expects 33 signed gateway function signatures (with a compatibility allowance for the three campaign-review functions being absent together). Production has **zero** routines matching 'assert_actor_gateway', 'assert_actor_gateway_capability', or the 'gateway_*' contract namespace. 'ghm_actor_gateway' has **zero executable routines**. The only two routines whose names match the broader gateway/assertion/nonce search are unrelated legacy 'connect_service_assertion_consume(...)' and 'replace_business_capability_assertions(...)'.
- Production currently has 62 SECURITY DEFINER routines. All 62 are owned by 'ghm_schema_owner'; 5 have the exact pinned 'search_path=pg_catalog, ghm, pg_temp' configuration. This count alone does not prove the remaining 57 are unsafe: their complete per-routine config/ACL comparison must be reconciled against the reviewed authority inventory before any changes. No SECURITY DEFINER routine was changed.
- The migration ledger exists, is owned by 'ghm_schema_owner', and has no direct relation ACL. The audit query identity cannot read it. The existing read-only migration audit remains the only approved route to exact production migration versions/checksums.

This makes the immediate live prerequisite explicit: production Actor Gateway is not merely missing one grant; the schema USAGE and entire signed gateway routine contract are absent. Do not fix by granting broad EXECUTE or by manually creating routines. Reconcile the live migration ledger and reviewed catalog inventory first. No production objects, grants, roles, data, credentials or runtime configuration were changed.


### SECURITY DEFINER ACL and search_path deep inventory — 2026-11-14

A second read-only production catalog pass enumerated all 62 non-trigger SECURITY DEFINER routines in schema 'ghm' (the prior count is reproducible when excluding trigger-returning functions). Exact aggregate results:

| Measure | Production count |
|---|---:|
| SECURITY DEFINER routines | 62 |
| Exact reviewed search_path 'pg_catalog, ghm, pg_temp' | 5 |
| Not exact reviewed search_path | 57 |
| Any configured search_path explicitly including 'pg_temp' | 8 |
| PUBLIC EXECUTE | 0 |
| 'ghm_runtime' EXECUTE | 46 |
| 'ghm_app_user' effective EXECUTE | 46 |
| 'ghm_payment_provider' EXECUTE | 2 |
| 'ghm_actor_gateway' EXECUTE | 0 |

All 62 are owned by 'ghm_schema_owner' and use trusted SQL or PL/pgSQL languages. No PUBLIC EXECUTE grant was found. The 57 non-exact settings are not yet approved as safe: most use 'search_path=pg_catalog, ghm' (which omits explicit 'pg_temp'); one observed function uses 'search_path=ghm, pg_catalog', and others use 'search_path=ghm, pg_temp'. Exact per-function settings and definitions must be compared to the repository's approved migration history before proposing remediation. Do not bulk ALTER FUNCTION or assume all 57 have the same risk.

The role ACL inventory also shows the 46 runtime-executable SECURITY DEFINER routines are effectively executable by 'ghm_app_user' because the application user inherits 'ghm_db_user', which in turn inherits 'ghm_runtime'. This is an additional consequence of the production role graph and must be included in the planned runtime authority cutover. Payment-provider-only routines remain separate (2); Actor Gateway routines remain absent (0).

Default function ACLs are also differentiated by object creator: 'ghm_schema_owner' has a schema-scoped default ACL granting EXECUTE to 'ghm_runtime' only; PostgreSQL's global default function ACL for 'postgres' includes PUBLIC EXECUTE and 'ghm_db_user'. The latter is not evidence that current SECURITY DEFINER routines have PUBLIC EXECUTE (the live routine ACL query found zero); it is a prospective default risk for functions created by 'postgres' and must be accounted for in any future migration execution path. No defaults or grants were changed.

No function definitions, owners, ACLs, search_path settings, role memberships, or database objects were modified. This remains a diagnostic inventory pending exact migration reconciliation and definition-by-definition review.


### Investigation closure register — SECURITY DEFINER production inventory, 2026-11-14

This section is the durable record for future sessions. Re-read this register and the SQL privilege inventory before repeating production catalog queries. The aggregate and exact path distribution below were captured from production 'ghm_db' using read-only Render catalog queries on 2026-11-14. No database state was changed.

**Exact non-trigger SECURITY DEFINER search_path distribution (62 routines):**

| Configured function setting | Count | Disposition |
|---|---:|---|
| 'search_path=pg_catalog, ghm' | 53 | Missing explicit 'pg_temp'; inspect definition/temporary-object exposure and compare migration intent individually. |
| 'search_path=pg_catalog, ghm, pg_temp' | 5 | Matches the exact reviewed path. |
| 'search_path=ghm, pg_temp' | 3 | 'pg_catalog' absent and schema resolution order differs; individually review. |
| 'search_path=ghm, pg_catalog' | 1 | Schema resolution order differs; individually review. |
| **Total** | **62** | No blanket ALTER FUNCTION is approved. |

This replaces the earlier approximate description that the 57 non-exact routines were mostly one category: the exact distribution is now 53 + 5 + 3 + 1. It also resolves the earlier 62-versus-63 count discrepancy: the authoritative comparable count is 62 non-trigger SECURITY DEFINER functions in schema 'ghm'; one earlier broad aggregate included a trigger-returning routine. Keep the scope predicate 'p.prorettype <> trigger'::regtype' when reproducing the 62 count.

**ACL/effective execution snapshot (same scope):** PUBLIC EXECUTE 0; 'ghm_runtime' EXECUTE 46; effective 'ghm_app_user' EXECUTE 46; 'ghm_payment_provider' EXECUTE 2; 'ghm_actor_gateway' EXECUTE 0. All 62 are owned by 'ghm_schema_owner'. The 46 effective app-user executions follow the current role inheritance path; they are not 46 direct grants to 'ghm_app_user'. No current function definitions, grants, settings, memberships, owners or default ACLs were changed.

**Known interpretation and non-repeat instructions:**
1. Do not rerun aggregate counts just to reconfirm them. The current exact result is 62 routines with path groups 53/5/3/1 and ACL counts above.
2. Do not assume the 53 routines with 'pg_catalog, ghm' are automatically vulnerable solely because explicit 'pg_temp' is absent. Review PostgreSQL's actual name-resolution/temp-schema behavior and each function's body/qualified references before deciding.
3. The three 'ghm, pg_temp' and one 'ghm, pg_catalog' routines are distinct cases, not members of the 53 group. Inspect their function bodies and migration provenance separately.
4. The current repository script 'scripts/audit-security-definer-authority.mjs' explicitly refuses any target except local 'ghm_disposable_test'. It is a disposable qualification/reporting tool, not a production audit runner. Do not weaken its target guard or point it at production.
5. The production migration ledger remains unreadable through the available app query identity. The separate 'npm run audit:migrations' script is read-only and validates the production migrator identity, but no approved invocation path/credential has been established. Do not use 'npm run migrate' for inspection.
6. Production Actor Gateway SQL contract remains absent: zero expected gateway routines, no schema USAGE for 'ghm_actor_gateway', zero executable routines for that role. Do not manually create functions or grant broad EXECUTE.
7. Current role membership, 5 ADMIN OPTION memberships held by 'ghm_db_user', inherited application/runtime path, and global 'postgres' default function ACL are already recorded in the sections above. Do not repeat discovery queries unless the database has changed or a new source/migration commit makes comparison necessary.

**Next useful work is not another aggregate catalog pass.** Build a source-to-production comparison of the 62 exact signatures, definitions, per-function ACLs and 'proconfig' against repository migration history and the approved SQL privilege inventory. Because production ledger provenance is still unknown, mark matches as source-compatible/observed rather than claiming migration application. Prioritize the four nonstandard search-path routines, then the 53 missing explicit 'pg_temp' cases, with a per-function rationale. Any eventual remediation must be a reviewed migration, qualified on disposable PostgreSQL, backed up, and separately approved for production.


### Source-to-production SECURITY DEFINER comparison — first four non-standard cases, 2026-11-14

This is the next durable checkpoint. The previous production inventory is not to be repeated. A read-only production query retrieved the exact function definitions, owners, direct ACLs and 'proconfig' for all four routines in the non-standard path groups. Repository source was then checked on branch 'security/actor-gateway-worker-body-limit-20261114'. No production state was changed.

**Exact source matches found:**

| Production signature | Production path | Repository source | Source comparison / ACL |
|---|---|---|---|
| 'ghm.auth_bootstrap_founder_system_admin(text)' | 'ghm, pg_temp' | 'database/migrations/20261005211000_correct_founder_system_admin_bootstrap_existing_account.sql' (blob 'ee3d17e71be187374e249a05b867c2592b0be269') | Body matches the promotion-only function. Owner-only EXECUTE; runtime revoked in source and production ACL is owner-only. |
| 'ghm.auth_create_account(text,text,text,text,text,integer,integer,integer)' | 'ghm, pg_temp' | 'database/migrations/20261004020000_create_auth_account_registration.sql' (blob '9b737df2e1fedd57cfa79f061f6f255dd1952471') | Body matches account + password credential registration. Source grants runtime EXECUTE; production ACL shows owner and 'ghm_runtime'. |
| 'ghm.auth_read_connect_identity_authority(bigint)' | 'ghm, pg_temp' | Exact creating migration not located in the targeted source review | Production definition is schema-qualified for its table references and reports only identity/Connect authority fields. Owner and runtime ACL present. Do not claim source provenance or migration application until located. |
| 'ghm.replace_business_hours(bigint,bigint,jsonb)' | 'ghm, pg_catalog' | 'database/migrations/20260916223000_create_business_hours.sql' (blob 'ef4f0b07b9f46ca14081494dc5e1b77ecc6dd0c7') | Body matches the Business Hours replacement primitive. Source grants runtime EXECUTE; production ACL shows owner and 'ghm_runtime'. The later signed gateway wrapper migration deliberately leaves this legacy grant in place until a separate manual cutover. |

**Critical normalization migration found:** 'database/migrations/20261112090000_pin_security_definer_search_path.sql' (blob 'd0d3ce9eb9d76ac23ba6ec9d8f27df7ec30f73df') contains a preflight requiring every 'ghm' SECURITY DEFINER routine to be owned by 'ghm_schema_owner', then iterates over every such function and executes 'ALTER FUNCTION ... SET search_path = pg_catalog, ghm, pg_temp'. Its comment explicitly explains that when 'pg_temp' is omitted PostgreSQL implicitly searches the temporary schema before ordinary schemas; explicitly placing it last prevents caller-created temporary relations shadowing privileged function references.

**Interpretation of the exact production path groups:**

- The 53 routines with 'search_path=pg_catalog, ghm' omit explicit 'pg_temp'. This is the concrete temp-object shadowing concern described by the repository normalization migration.
- The 3 routines with 'search_path=ghm, pg_temp' have 'pg_catalog' implicitly searched before ordinary path entries because it is not explicitly listed; 'pg_temp' is explicitly last. Their effective ordering is therefore temporary-schema-safe, although they do not match the repository's canonical explicit setting.
- The single 'search_path=ghm, pg_catalog' routine is different: it omits explicit 'pg_temp' and places 'pg_catalog' after 'ghm'. It needs the canonical normalization; do not group it with the 3 safe-effective 'ghm, pg_temp' cases.
- The 5 routines already on 'pg_catalog, ghm, pg_temp' match the canonical setting.

The production catalog therefore does not currently show the all-functions normalized state intended by migration '20261112090000'. Because the production migration ledger is still unreadable through the app query principal, we cannot yet distinguish 'migration not applied' from post-migration catalog drift or later recreation. Do not state that the migration is definitely pending until the existing read-only production migration audit is run.

**Business Hours cutover relationship:** 'database/migrations/20261111130000_add_signed_business_hours_gateway.sql' creates the signed 'gateway_replace_business_hours' wrapper but explicitly says the old runtime grant remains until separate manual cutover approval. 'database/cutovers/20261111130000_revoke_legacy_business_hours_runtime.sql' is marked MANUAL CUTOVER ONLY and requires deployed/qualified Actor Gateway, verified role identities, and a fresh independently verified production backup before revoking 'ghm_runtime' EXECUTE and direct table/sequence access. None of those cutover statements were run. Production currently still exposes the legacy function to 'ghm_runtime'; this is known and must remain a cutover gate, not be silently changed during this investigation.

**Next work (do not repeat completed discovery):**
1. Locate the creating migration/provenance for 'auth_read_connect_identity_authority(bigint)' or record it as an unresolved historical object after a bounded search of source migrations/cutovers.
2. Use the existing production read-only migration audit to determine whether '20261112090000_pin_security_definer_search_path.sql' is in the live ledger; do not use the ordinary mutating migration runner.
3. Compare all remaining SECURITY DEFINER signatures/definitions/ACLs against their source migrations and the normalization migration. Keep observed live state separate from ledger-confirmed migration state.
4. Do not execute the Business Hours manual cutover until its explicit deployment, identity and backup prerequisites are satisfied.

No role, grant, function, setting, migration, data, service, environment variable or deployment was changed. All production queries in this checkpoint were read-only.


### Post-normalization migration review — later function creators, 2026-11-14

A bounded source review of all 2026-11-12 migration files was performed after locating '20261112090000_pin_security_definer_search_path.sql'. This prevents a false assumption that the canonical pin migration is the only source of live path settings.

**Later migrations inspected (ordered by version):**

- '20261112020000_add_token_bound_password_recovery_reset.sql' creates/replaces 'ghm.auth_reset_password_with_recovery(...)' with 'SET search_path = pg_catalog, ghm' (no explicit 'pg_temp').
- '20261112030000_add_conditional_password_rehash.sql' creates/replaces 'ghm.auth_rehash_password_if_unchanged(...)' with 'SET search_path = pg_catalog, ghm' (no explicit 'pg_temp').
- '20261112080000_signed_connect_business_provisioning_gateway.sql' creates/replaces 'ghm.assert_actor_gateway_capability(...)' and 'ghm.gateway_provision_connect_business(...)' with 'SET search_path = pg_catalog, ghm' (no explicit 'pg_temp').
- '20261112090000_pin_security_definer_search_path.sql' then normalizes all GHM SECURITY DEFINER routines to 'pg_catalog, ghm, pg_temp'.
- Later '20261112140000_add_signed_storage_metadata_actor_gateway.sql' and '20261112150000_add_storage_provider_workflow_attestation.sql' explicitly create/alter their new gateway routines with 'pg_catalog, ghm, pg_temp'.

This establishes a source-level inconsistency: several functions introduced immediately before the canonical pin migration omit explicit 'pg_temp', while later gateway migrations correctly include it. If the pin migration is applied after those earlier migrations, it should normalize their functions too. Therefore the live 53/5/3/1 distribution still cannot be explained by the source declarations alone. The likely possibilities remain: the pin migration is absent from production ledger, later DDL reintroduced old definitions, or an external/manual change occurred. The production ledger and function definition checksums are needed to distinguish them. Do not claim one cause without that evidence.

**No new production query is needed to rediscover this source fact.** Keep these file-level findings as completed. The remaining next step is the already-recorded read-only production migration audit, followed by a bounded check for later function replacements after the pin migration. No source or production database changes were made in this checkpoint.
