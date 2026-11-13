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
