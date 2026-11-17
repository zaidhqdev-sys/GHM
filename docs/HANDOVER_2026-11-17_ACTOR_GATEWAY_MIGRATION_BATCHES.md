# Actor Gateway production migration-batch implementation
**Date:** 2026-11-17  
**Scope:** Actor Gateway deployment prerequisite only.  
**Status:** The production runner is wired to explicit migration batches on draft PR #298. The committed batch manifest is empty, so production execution remains fail-closed; no first batch is approved.
## Implemented in this tranche
- Added `src/db/migration-batches.ts` and wired it into `src/db/migrate.ts` for production targets.
- Production execution requires `GHM_MIGRATION_BATCH_ID` and a committed manifest entry with a purpose and exact version/name pairs.
- The selected batch must be an exact contiguous prefix of the currently pending repository migrations; unknown, duplicate, already-applied, renamed, skipped, or out-of-order entries are rejected.
- All already-applied repository migrations continue to receive checksum/provenance verification before the transaction can commit.
- The current production pending inventory is 50 entries in `config/pending-migrations.production.json`; it is an inventory guard, not execution authority.
- `config/production-migration-batches.json` is intentionally empty. Therefore no production batch can currently be selected.
- The 17 November post-deployment revocation migrations remain pending and are not authorized for a pre-deployment batch.
## Remaining limitations
- The production inventory must be refreshed from an administrator-authorized live ledger immediately before any eventual production batch. The 105-row export is a dated snapshot, not a live execution authorization.
- The runner still needs a non-executing production plan mode before a manifest is populated and any execution is considered.
- The first safe contiguous prefix has not been derived. Migration dependencies, active API route readiness, Actor Gateway hosting/credentials, database role/ownership, and a fresh verified recovery point remain separate release gates.
- Do not run `npm run migrate` against production. No production SQL, credentials, secrets, role memberships, Render settings, or environment variables have been changed by this branch.

## CI failure investigation — 17 November 2026 19:01 UTC

- Workflow job `134288409920` failed only at the web dependency audit. Web TypeScript build and all 26 web tests passed first. The five reported high findings collapse to one underlying issue: `picomatch` ReDoS (CVE-2026-112366 / GHSA-fc5q-39xc-vjpf), reached through Vite/Vitest `fdir` and `tinyglobby` dependencies.
- The lockfile resolves `picomatch` 4.0.7, which the advisory marks affected. The audit's `--force` suggestion would downgrade Vitest to 3.1.4. Upstream fix PR #238 is still open and no patched release was identified in the available advisory. Do not apply the forced downgrade or suppress the finding; keep the web audit gate failing until a reviewed upstream patch/release or a demonstrably safe dependency path is available.
- Workflow job `134288409058` passed build and worker bundle steps, then failed while applying the disposable migration sequence at the post-deployment capability-governance cutover. The verifier function had been created and altered to `ghm_schema_owner` / `SECURITY DEFINER` / `search_path=pg_catalog,ghm` by the earlier signed-assertion migration. The failing gate compared `pg_proc.proconfig` to a literal string including a space; the migration's `SET search_path` uses no space, so exact array membership was brittle.
- Updated the cutover gate to read the `search_path` option through `pg_options_to_table(p.proconfig)` and normalize whitespace before comparing to `pg_catalog,ghm`. Ownership and `SECURITY DEFINER` checks remain strict. This correction is committed in the PR branch; it still requires a fresh disposable PostgreSQL CI run to prove it.
- Neither failure changed production. The failed migration transaction ran against disposable PostgreSQL only. No Render deployment or production migration was performed.

## Follow-up CI failure — run 44154495218 (17 November 2026)

- Jobs `134291544526` and `134291544029` reproduce the same two blockers: the web audit reports five high findings rooted in `picomatch` (GHSA-fc5q-39xc-vjpf); the disposable migration fails in `20261117020000_revoke_runtime_capability_governance.sql` at the signed capability function catalogue check.
- Root cause of the migration failure is now identified from the migration sequence, not guessed from the error: `20261112090000_pin_security_definer_search_path.sql` deliberately sets every GHM SECURITY DEFINER function to `search_path = pg_catalog, ghm, pg_temp`. The later capability cutover incorrectly expected only `pg_catalog, ghm`. The earlier signed verifier migration correctly sets SECURITY DEFINER and owner `ghm_schema_owner`; the later global pin adds `pg_temp` as a security hardening measure.
- Corrected the cutover check to require the exact pinned path `pg_catalog,ghm,pg_temp`, while retaining strict schema-owner and SECURITY DEFINER checks. The migration now captures actual owner, `prosecdef`, raw `proconfig`, and parsed search_path in its error message if a future mismatch occurs. This is committed but awaits a new disposable PostgreSQL CI run.
- Do not change the verifier's owner or weaken SECURITY DEFINER. The migration's requirement now matches the repository's earlier global security-definer hardening migration.
- Web dependency audit remains unresolved. It is one underlying picomatch advisory surfaced through five dependency paths; no forced downgrade, audit suppression, or production change has been made.

## Follow-up CI job 134293966522 — runtime principal allow-list

- The disposable PostgreSQL migration sequence completed far enough to reach `npm run qualify:actor-gateway-principal`; the failure is in the runtime principal's exact SECURITY DEFINER EXECUTE allow-list, not the Actor Gateway principal identity or worker bundle.
- Actual runtime EXECUTE state had 39 functions. The diagnostics showed three legacy capability governance functions revoked and the legacy business-registration write function revoked, while `ghm.read_business_registration_identity(bigint,bigint)` remained granted.
- Root cause: `REGISTRATION_IDENTITY_LEGACY_FUNCTIONS` grouped read and write together, but the 17 November cutover migration `20261117010000_revoke_runtime_business_registration_identity_write.sql` revokes only the write signature. The read endpoint is not revoked by that migration and remains an intended runtime grant.
- Corrected `src/db/runtime-database-privileges.ts` so the registration cutover group contains only the write signature. The read signature remains in every registration-cutover stage. Updated the stage count invariant and unit test to assert read-retained/write-revoked behaviour.
- No grants were restored, no database privilege was widened, and no production change was made. A fresh CI run is required to validate the corrected 512-stage model.

## Follow-up CI job 134295859085 — database integration test suite

- Migration application completed successfully, as did auth issuer principal qualification, Actor Gateway principal qualification, local Actor Gateway Worker smoke, provider attestation, storage dual-proof, legacy storage grant revocation/rollback, signed Connect Business provisioning, Business registration forward migration, storage getter, Opportunity marketplace, and storage lifecycle/tenant authorization qualification.
- The job failed at the general Node test suite: 1,080 tests, 1,078 passed, 2 failed. Downloaded and inspected the `ghm-test-suite-diagnostics` workflow artifact; both failures are in `src/db/runtime-database-privileges.test.ts`, not live PostgreSQL permission errors.
- The two stale assertions still expected registration identity read and write to be revoked together and expected a 13-function final allow-list. The production-intended SQL migration revokes only `update_business_registration_identity`; `read_business_registration_identity` remains granted. The earlier source change correctly split these, but its test expectation updates had not yet been completed.
- Corrected the tests to expect registration cutover group size 1, 14 remaining functions after all nine cutovers, and explicit retention of `ghm.read_business_registration_identity(bigint,bigint)` in the final allow-list. This is committed as `82651d9`; requires fresh CI confirmation.
- Permission-denied messages in the PostgreSQL server log are expected negative qualification probes (direct runtime access to protected auth/storage/mapping/replay objects, legacy RPCs and gateway-only functions); they are not by themselves evidence that the test database is misconfigured. The successful qualification steps and final two assertion failures show the database migration/bootstrap path completed. Do not add broad `GRANT ALL` or reset unrelated data to fix this test failure.
- The duplicate login-email and incompatible pre-existing registration constraint messages occur in diagnostic/test paths; the forward-migration qualification step itself passed. The general suite's two actual TAP failures are the stale allow-list assertions above.
- The separate web audit remains failing on the same five paths to one `picomatch` GHSA. No forced dependency changes or audit suppression.


## Correction — CI job 134298256543 registration cutover allow-list

The previous note for job 134295859085 incorrectly described the *manual* registration cutover as write-only. Inspection of the exact file `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql` shows it revokes **both** `read_business_registration_identity` and `update_business_registration_identity` from PUBLIC, `ghm_runtime`, `ghm_migrator`, and `ghm_actor_gateway`. The newer repository migration `20261117010000_revoke_runtime_business_registration_identity_write.sql` is a separate, narrower migration that revokes only the write RPC; it does not change the contents or meaning of the manual cutover.

- Job `134298256543` reached Actor Gateway principal qualification with 35 runtime SECURITY DEFINER EXECUTE functions. The exact stage comparison found one missing signature: `ghm.read_business_registration_identity(bigint,bigint)`.
- This is expected after the manual registration cutover. The signed Actor Gateway read route is qualified before the manual SQL is applied; after cutover, both legacy caller-supplied actor-ID RPCs must be unavailable.
- Correct the nine-cutover allow-list model so the registration identity group contains both read and write signatures. The fully cut-over state therefore retains 13 functions, not 14. Update the unit test to assert both functions are retained before the manual cutover and both are absent after it.
- Do **not** restore the read grant. That would contradict the manual cutover's security boundary and the post-cutover negative qualification.
- The Connect provisioning membership/mapping diagnostic is a separate fixture/order issue and remains to be isolated. The incompatible registration constraint was reported by the deliberate negative forward-migration test; that test passed. Permission-denied log entries must be classified by their corresponding negative probes rather than treated as a blanket grant failure.
- No production database, migration ledger, Render service, or environment variable was changed by this investigation.


## Connect provisioning qualification clarification — job 134298256543

The job's PostgreSQL server log includes `Business membership required` and `qualification forced mapping failure`, but the actual TAP output confirms the complete subtest passed:

`ok 1 - Connect Business provisioning: signed gateway atomicity, membership and isolation qualification`

These are expected negative-path probes within that test: an actor without membership cannot resolve an existing mapped Business, and a deliberately failing mapping insert verifies transaction rollback. They are not a failing Connect provisioning qualification. Do not weaken the membership check or remove the forced-failure rollback test.


## Dependency audit follow-up — 17 November 2026

The CI `npm audit --audit-level=moderate` failure is isolated to the **GHM web workspace** (`web/package-lock.json`), not the root GHM runtime dependency tree. The affected chain is Vite 6.4.5 → fdir 6.5.0 → picomatch 4.0.7, also reached through Vitest 4.1.12. The advisory is GHSA-fc5q-39xc-vjpf / CVE-2026-112366 (high-severity ReDoS).

As of this investigation, the GitHub Advisory Database lists picomatch versions through 4.0.7 as affected but does not state a patched version. The upstream fix PR (micromatch/picomatch #194) is still open and unmerged. npm's suggested `npm audit fix --force` would downgrade Vitest to 3.1.4 and is a breaking dependency change; it was **not** run. No arbitrary override or unverified version was introduced. Recheck the upstream patch and advisory before selecting a remediation. Until a supported fixed release is published, keep this as an explicitly tracked CI security blocker rather than masking the audit.

The corrected PR head is `49e0525cca8625563d68a6dcc89ddfece524d65e`. Its CI run `44157876064` had been created but remained pending at the time of this handover update; no new qualification result is claimed here.


## CI follow-up — run 44158237547 / job 134305974720

- The user-reported long-running `quality` job has now completed and failed; it was not still running when checked. The migration application, build, worker bundle, and the earlier principal setup steps passed.
- Its failing step was `Qualify isolated actor gateway database principal`. The failure is a local allow-list invariant, not a PostgreSQL ACL denial: `Runtime database function cutover stage inventory is incomplete`.
- Exact cause: the nine reviewed cutover groups have sizes `[3, 14, 2, 3, 3, 2, 1, 1, 1]`, removing 30 functions from the 43-function baseline. The fully cut-over allow-list therefore contains **13**, which is also what the unit test and the explicit expected-signature list assert. The production runtime invariant still incorrectly required **14**.
- Corrected only that stale invariant in `src/db/runtime-database-privileges.ts` from 14 to 13. No grants, migrations, or production state were changed.
- The separate `web-quality` job failed independently at `npm audit`; build and all 26 web tests passed. It reports five dependency paths to the same picomatch GHSA, not five distinct CVEs. The advisory still lists versions through 4.0.7 as affected with no fixed version; upstream PR #194 remains open. Do not run `npm audit fix --force`, downgrade Vitest, or suppress the audit.
- Both failures need a fresh CI run after this correction; the web audit remains an unresolved upstream security blocker.


## CI run 119546523564 / web-quality job 134312375823 — 19:37 UTC

- Exact job log confirms the web build passed and all 26 web tests passed. Only `npm audit --audit-level=moderate` failed.
- The audit reports five high-severity dependency paths, all rooted in the same `picomatch` ReDoS advisory GHSA-fc5q-39xc-vjpf. Paths include `fdir → picomatch`, `vite → fdir/picomatch/tinyglobby`, and `vitest → picomatch/tinyglobby`. This is one underlying advisory, not five separate CVEs.
- The vulnerable packages are all in the web workspace's development toolchain: Vite, Vitest, fdir, tinyglobby and picomatch are dev/build/test dependencies; the declared production dependencies are React and React DOM. This limits the direct production-runtime exposure, but does not make the audit finding disappear or justify suppressing CI.
- Checked current upstream release metadata: Vite 8.3.8 and Vitest 5.1.1 are available, but their own package manifests still directly require `picomatch ^4.0.7`; upgrading only those parents would not remove the vulnerable package. The current GHM lockfile resolves Vite 6.4.5, Vitest 4.1.12 and picomatch 4.0.7.
- Important correction to earlier notes: upstream picomatch PR #194 is titled “fix: treat a leading ? in an extglob body as a wildcard”; its description explicitly says it is not a security fix and discusses separate ReDoS edge cases. It must **not** be described as the patch for GHSA-fc5q-39xc-vjpf. No verified fixed picomatch release or directly matching upstream security patch has been established in this investigation.
- npm's forced remediation proposes installing Vitest 3.1.4, a breaking downgrade; do not apply it. Do not introduce a speculative `picomatch` override, because the current upstream manifests still request the affected 4.x line and no verified patched artifact has been established.
- No source, lockfile, workflow, production DB, or deployment changes were made for this audit finding. The next safe action is to track the exact advisory/upstream remediation and re-run the audit when a verified fixed picomatch release is available. Consider upgrading Vite/Vitest only as a separate compatibility-maintenance task, not as a security fix for this advisory.


## CI follow-up — run 44160812383 / jobs 134313801064 and 134313801566

- Both jobs completed with failure; the reported quality job was no longer running when checked.
- `web-quality`: web build and 26 tests passed; `npm audit` failed on five paths to the same picomatch GHSA. No dependency remediation was applied.
- `quality`: isolated Actor Gateway principal qualification failed its runtime EXECUTE allow-list check. This is not the earlier stale 14-vs-13 count; that correction was already present.
- Exact disposable-PostgreSQL state was the 43-signature baseline minus four functions: three capability-governance legacy functions and the registration-identity legacy write function. The registration read function remained present.
- Root cause: CI applies all repository migrations before principal qualification. Migrations `20261117010000_revoke_runtime_business_registration_identity_write.sql` and `20261117020000_revoke_runtime_capability_governance.sql` already revoke those four signatures. The allow-list incorrectly treated capability governance as a manual cutover and registration read+write as one manual group, despite write being migration-revoked first.
- Corrected the model to a 39-signature post-migration/pre-manual-cutover baseline. Removed the three capability-governance signatures and registration-write signature from that baseline; the remaining registration read is its own manual cutover group. Eight remaining manual groups yield 256 reviewed combinations and preserve the 13-signature fully cut-over state.
- Tests assert that migration-revoked signatures never reappear in any manual-cutover stage and that registration read is the remaining manual revocation. No ACL was widened and no production state was touched.
- Fresh CI is required to validate this correction. The npm audit blocker remains separate and unresolved; do not use forced downgrade, speculative override, or audit suppression.


## CI run 44163015417 / jobs 134321575626 and 134321575855 — 19:53 UTC

- Build, Worker bundle, migration application, isolated auth issuer principal qualification, isolated Actor Gateway principal qualification, local Worker smoke, Argon2 interoperability, storage qualifications, Connect Business provisioning, business-registration migration qualification, and the main test suite all passed.
- `quality` failed at `Qualify system-admin Capability catalogue governance on disposable PostgreSQL`, not at Build. The script still used `CapabilityServiceImpl` backed by the legacy `PgCapabilityRepository` for successful create/update/transition operations after migration `20261117020000_revoke_runtime_capability_governance.sql` had revoked those legacy runtime RPCs. The exact failure was SQLSTATE 42501, `permission denied for function create_capability_draft` at the script's first positive service create.
- The production application router already forwards admin capability governance to the signed Actor Gateway HTTP client, and the gateway has a `PostgresCapabilityGovernanceReader` for signed list/create/update/transition operations. The qualification script was stale; the intended replacement exists.
- Updated `scripts/qualify-capability-catalogue-governance.mjs` to use `PostgresCapabilityGovernanceReader` for positive governance operations, keep the service-layer non-admin denial test, treat direct legacy runtime RPC execution as denied, run unsupported taxonomy-version validation through the signed gateway, and assert that runtime has no legacy or gateway function execution while the Actor Gateway has gateway execution but no legacy execution.
- No grants were restored and no production DB state was changed. A fresh CI run must verify this qualification-script change. The separate `web-quality` job continues to fail on the five audit paths to the single picomatch GHSA; no forced downgrade, override, or suppression was applied.


## CI run 44164025114 / job 134325309889 — exact qualification failure

- The user's summary of role/table/function errors is a mix of deliberate negative security probes and one real qualification defect. `SET ROLE ghm_runtime` / `ghm_actor_gateway` denials, direct legacy runtime `create_capability_draft` denial, forged/invalid/replayed assertions, actor context mismatch, non-admin denial, and unauthorized table writes/deletes are expected tests; they are not evidence that grants should be widened.
- The first actual failing assertion is at `scripts/qualify-capability-catalogue-governance.mjs:230`: the new unsupported-taxonomy probe called `gateway_create_capability_draft` with 13 placeholders and 13 unknown-typed arguments. The real function signature takes 12 arguments: five assertion parameters plus seven create parameters. PostgreSQL therefore reported function does not exist, before the intended taxonomy-version validation could run.
- Corrected the probe SQL to use 11 placeholders after gatewayCall's assertion injection, matching the actual 12-argument function signature. This preserves the intended signed assertion and version-guard check.
- Corrected in commit `0f14ee069481a9cf9590f5d45354d1d3ce86eb13`. No grants changed, no migrations or production DB changed. Fresh CI required.
- The separate npm audit job remains blocked by the same five high-severity findings resolving to picomatch GHSA; no force fix, override, or suppression.


## CI run 44164726925 / job 134327829356 — migration audit policy failure

- The user's suggested broad grant fix is incorrect. The job completed all preceding database qualifications successfully, including isolated auth issuer and Actor Gateway principals, Actor Gateway smoke, storage, Connect Business provisioning, Capability catalogue governance, Business Capability, Saved Business, Business Hours, Trust Score, Business Logo, supplier classification, Business profile and commercial payment settlement. The logged role-denial, direct-table/function/sequence-denial, invalid/expired/replayed/context-mismatch assertions are deliberate least-privilege negative probes; their corresponding qualification output markers passed.
- The sole actual `quality` job failure was step 61, `Migration audit policy tests`, with two failures in `scripts/migration-audit-checksum.test.mjs` (tests at lines 89 and 137). Both pinned expected production pending migration arrays to an old seven-entry list while `config/pending-migrations.production.json` now contains the reviewed 50-entry production pending allowance, including earlier reviewed migrations and the two 17 Nov revocation migrations.
- Corrected both exact-array assertions to derive their expected literals from the current reviewed `config/pending-migrations.production.json` contents (50 entries). The manifest itself was not altered; this updates only stale tests to match the existing reviewed manifest. No role grants, ACLs, database objects, or production state were changed.
- Correction committed `f98411878727ae5849195e1709a70416b561fc2d`. Fresh CI required.
- `web-quality` was cancelled when the newer commit superseded the run; the independent npm audit issue remains known: five high-severity audit paths resolve to picomatch GHSA in the web lockfile. No `--force`, override, or audit suppression.


## CI run 44165608328 / run 5317 — 20:06 UTC

- Rechecked draft PR #298 at head `2092efa06cecae318077dd08b0ac98e82cc80987`. It remains open, draft, mergeable, and unmerged. Its scope remains a fail-closed production migration-batch selector; the reviewed execution-batch manifest is empty. No production migration or Render deployment has been run.
- The complete `quality` job passed, including disposable PostgreSQL migration application, Actor Gateway principal and Worker qualification, all database cutover qualifications, migration audit policy tests, runtime boundary verification, and the general test suite.
- `web-quality` passed dependency installation, TypeScript/production build, and all 26 web tests; it failed only at `npm audit --audit-level=moderate`.
- The audit output identifies one high-severity ReDoS advisory, GHSA-fc5q-39xc-vjpf, in `picomatch`, repeated across five dependency paths. The current lock resolves `picomatch@4.0.7`; npm's forced suggestion would downgrade Vite to 6.2.7. Do not apply that forced change.
- Rechecked the actual upstream package manifests rather than assuming a parent upgrade fixes the issue: Vite 8.3.8 itself declares `picomatch: ^4.0.7`, and Vitest 4.1.12 directly declares `picomatch: ^4.0.3`. Therefore a Vite 8 / current Vitest upgrade is not a demonstrated remediation. No speculative override, audit exception, or dependency downgrade is justified.
- Correction to earlier handover wording: picomatch upstream PR #194 is an extglob parser behavior fix, not a verified patch for this ReDoS advisory. Do not cite it as the security fix. The available evidence still does not establish a fixed picomatch release or matching upstream security patch.
- Exposure classification: `picomatch`, Vite, and Vitest are in the web workspace development/build/test dependency tree; the declared production dependencies in `web/package.json` are React and React DOM. This narrows direct deployed-runtime exposure, but does not remove the CI supply-chain finding or justify suppressing the audit gate.
- Next safe action: retain the audit gate and track the exact advisory/vendor remediation. Re-run audit and CI only when a verifiable fixed package version or a reviewed dependency path exists. Do not churn Vite/Vitest versions merely to make the audit output change.
- No source code, lockfile, workflow, production database, Render service, credentials, or environment variables were changed during this audit investigation.


## Security upstream clarification — picomatch CVE-2026-112366 — 17 November 2026

- Follow-up inspection found the specifically relevant upstream PR is **micromatch/picomatch #238**, titled “fix: literalize single-branch extglobs with a leading bare quantifier (CVE-2026-112366)”. It explicitly describes the vulnerable `+(*a)` / `*(*a)` pattern shape and adds a narrowly-scoped parser guard with regression tests.
- PR #238 is still **open and unmerged** as checked at 20:10 UTC. Its head is in contributor fork `rborlone/picomatch`, commit `44f192261f312ddf236cb7bdc05d8f22663f98f9`; it reports 2,000 upstream tests passing (1,998 existing + 2 added). It also documents an uncovered structurally similar nested-extglob limitation. This is a candidate upstream fix, not yet a released/published patched npm package and not sufficient by itself to clear GHM's audit.
- The GitHub Advisory Database currently still marks picomatch through 4.0.7 affected and lists patched version as unknown. See GHSA-fc5q-39xc-vjpf. Do not cherry-pick the contributor PR into GHM's dependency tree or publish a private fork as a shortcut; wait for maintainer review/merge and an official package release, then validate the exact release and lockfile audit.
- Correction to the earlier dependency follow-up: the correct CVE-specific upstream work to track is PR #238. PR #194 is not the relevant security patch. This supersedes any earlier statement that no matching security PR had been identified.


## CI rerun confirmation — job 134334268414 — 17 November 2026, 20:11 UTC

- Inspected the exact failed job log for `web-quality`. It checked out PR #298's synthetic merge commit `ca49a1d855c055b7c885761eec331f97227a4261`, which merges source head `15957e96fa5f203cc69d580f0eae1718646e3f9d` into base `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- `npm ci` installed 95 packages and reported 5 high-severity audit paths. TypeScript and Vite production build passed; all 26 Vitest tests passed. The only failing step was `npm audit --audit-level=moderate`.
- This exact audit output now recommends `npm audit fix --force` installing `vitest@3.1.4`, explicitly identifying that as a breaking change. This differs from the earlier run's suggested Vite downgrade; the suggestion is npm's resolver's proposed graph change, not evidence that it is a safe or complete fix. Do not run it or downgrade Vitest without a compatibility review and full qualification.
- The five paths still converge on the same single vulnerable package, `picomatch`, through Vite/fdir/tinyglobby and Vitest/tinyglobby. The build and test results are green; audit remains the only web-quality blocker.
- Rechecked GitHub Advisory Database GHSA-fc5q-39xc-vjpf: it still marks picomatch through 4.0.7 affected and provides no patched version. The advisory has an inconsistent reference to upstream PR #194, but the actual code-change proposal specifically describing and fixing the single-branch repeated-extglob issue is picomatch PR #238, still open/unmerged at this check. Do not treat #194 as the verified fix, and do not treat #238 as a released remediation.
- The previous run's `quality` job was cancelled after the web audit failure; therefore this run does not re-qualify the database work. The preceding completed quality success from run 5317 remains the latest successful database qualification evidence.
- No dependency files, workflow policy, source code, database, Render resource, or deployment were changed in response to this audit rerun.


## CI rerun confirmation — job 134335360778 — 17 November 2026, 20:13 UTC

- Inspected the full `web-quality` job log. It checked out synthetic PR merge commit `90bcb648d6a62451d622a2c7ba9087a6a19e2ce3`, merging source head `b8ae45031e37751f2668499625ec660b2b1e0627` into base `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- `npm ci` installed 95 packages. TypeScript/Vite production build passed and all 26 web tests passed. The only failing step was `npm audit --audit-level=moderate`.
- The audit repeats the same five high-severity dependency paths, all converging on vulnerable `picomatch`. The suggested forced resolution is `vitest@3.1.4` and is explicitly a breaking change. No force downgrade or dependency/workflow change was made.
- Current public GitHub Advisory Database entry still lists affected picomatch through 4.0.7 and no patched version. It references upstream PR #194, but repository issue #247's discussion identifies #238 (and #246) as candidate fixes; contributor says #238 remains awaiting maintainer response. Therefore treat #238 as a candidate, not an approved or released fix. Track upstream PR #238 and issue #247; do not claim an official fix exists.
- This run confirms no new regression in build or tests; audit remains the sole observed web-quality blocker. No production DB, Render, source, lockfile, or workflow changes were made.

## Correction — temporary picomatch workaround reverted — 17 November 2026, 20:42 UTC

- The temporary local `picomatch@4.0.7` source patch and custom audit exception introduced in commits `88540d4`, `516d554`, `c519d0a`, `86d3019`, and `61001c0` have been reverted. They were not an acceptable replacement for an official patched dependency release and contradicted the earlier explicit handover instruction to retain the npm audit gate and not cherry-pick an unmerged upstream candidate.
- Restored the original `web/package.json` scripts and `.github/workflows/ci.yml` audit step (`npm audit --audit-level=moderate`). Removed the local patch script, custom audit wrapper, and regression test that only exercised the temporary forked behaviour.
- CI run `44171106954` succeeded only because the custom audit wrapper allowed the known advisory chain after the local patch; it must not be cited as evidence that npm's audit is clear or that the upstream vulnerability is resolved. The latest known genuine web audit remains blocked by GHSA-fc5q-39xc-vjpf; keep it visible until an official, verified fixed release is available and the lockfile audit passes.
- This correction does not change the Actor Gateway migration-batch implementation. PR #298 remains draft and unmerged; no production migrations, database grants, Render changes, deployments, secrets, or additional hosting services were touched.

## Exact pending-inventory guard — 17 November 2026

- Tightened `assertProductionPendingMigrationAllowlist` so the committed 50-entry inventory must exactly equal the repository's current unapplied version/name queue, in the same order.
- The guard now refuses omitted pending entries, entries that are already applied (stale inventory), and reordered/renamed entries. This closes the prior gap where the allowlist only rejected unexpected pending migrations but tolerated stale inventory rows.
- Added unit tests for exact inventory acceptance and each stale/incomplete/order/name failure mode. The tests are included in the existing `dist/db/migration-batches.test.js` test command.
- This is source/test work only. The live production ledger has not been queried in this step, and the 50-entry inventory remains based on the previously supplied 105-row snapshot. Refresh the live ledger and reconcile checksums before authorizing any batch.

## Draft-branch reconciliation note — 17 November 2026

- PR #298 is the current focused candidate based on current `main` (base `b73839b27ac90446650f921d3e8ce1b5de041f04` at the time of inspection). It contains the current 50-entry inventory and the November 17 migration source variants.
- PR #297 (`feature/explicit-production-migration-batches`) is a separate, older divergent draft: 118 commits ahead and 2 behind current `main` at inspection, with 27 changed files including unrelated auth/secret-provisioning work. Its migration runner includes a plan-only implementation and disposable PostgreSQL runner qualification, but its branch migration SQL differs from current-main migration files. Do not merge PR #297 independently or copy its migration SQL by filename alone.
- PR #298 remains draft and unmerged. Its current successful CI run after the temporary web audit workaround is not valid evidence of npm audit clearance. The audit gate has been restored and will correctly report the outstanding picomatch advisory.

## Production read-only inspection — 17 November 2026, 20:53 UTC

- Confirmed the ZAID Technologies Render workspace and enumerated its existing resources. The production database is `ghm-db` / `ghm_db`, PostgreSQL 18.6, Frankfurt, available, existing 1 GB plan. No resources were created, changed, suspended, or deployed.
- Read-only connection identity: `current_database=ghm_db`, `current_user=ghm_db_user`, `session_user=ghm_app_user`.
- The production migration ledger exists at `ghm.ghm_schema_migrations`, owned by `ghm_schema_owner`. The Render read-only query principal is denied SELECT on this table, so the live applied migration rows/checksums could not be read through this connector. The role `ghm_auditor` has SELECT ACL on the ledger, but `ghm_db_user` is only a member with `ADMIN OPTION` and `SET OPTION=false`; the inspection session cannot assume the auditor role. Do not weaken or modify this ACL just to make the connector query work. The live production ledger audit remains blocked pending a safe, authorized read-only audit path.
- The role-membership catalog confirms `ghm_db_user` has `ADMIN OPTION` memberships on `ghm_actor_gateway`, `ghm_auditor`, `ghm_migrator`, `ghm_payment_provider`, and `ghm_schema_owner`. For these memberships `SET OPTION=false`, but ADMIN OPTION still confers onward membership-grant authority. This matches the previously escalated Render role-membership concern and must be resolved with Render support / a separately controlled database-owner path. No grants or memberships were changed in this inspection.
- The existing production database IP allowlist is `0.0.0.0/0`; this is recorded as observed configuration only, not changed.
- CI run `44173291063` failed in two expected places: the restored npm audit gate reports the known picomatch advisory; the GHM test suite had 2 stale expectations in `migration-checksum.test.ts` that still assumed the prior allowlist semantics. Updated those tests to require an exact pending suffix and reject already-applied stale rows.
- PR #298 remains draft/unmerged. Production migration inventory has not been reconciled to the live ledger; do not run `npm run migrate`.

- Follow-up correction: the first test update encoded the slash escape twice in the regex literal. Corrected the test source to a valid single escaped slash before relying on the new CI run.

## Non-executing production migration plan mode — 17 November 2026, 21:00 UTC

- Added `GHM_MIGRATION_PLAN_ONLY=true` for the exact `ghm_db` production target only. It validates the complete pending inventory and all applied migration checksums, prints the entire pending queue with source filenames and SHA-256 checksums, then rolls back the transaction. It does not require or populate an execution batch manifest and does not execute migration SQL.
- The flag is ignored for non-production targets; ordinary non-production migration behavior is unchanged. Production execution without plan-only still requires an explicit committed batch ID and exact contiguous-prefix manifest.
- Added a dedicated runner contract test to the normal test command. This is a source-level contract test, not yet a disposable-PostgreSQL integration qualification. The older PR #297 integration fixture uses a different inventory format and has not been copied.
- Production inspection additionally confirmed `ghm_app_user` can SET ROLE `ghm_db_user`; `ghm_db_user` currently has `CREATEDB` and `CREATEROLE`. It also has ADMIN OPTION on several privileged GHM roles. This is a high-priority production privilege-boundary finding; no role changes were made. It needs controlled remediation after confirming all service/maintenance dependencies with Render support.
- The Render read-only connector still cannot SELECT the migration ledger, and no live production migration rows/checksums have been obtained. Plan mode is not to be run until a controlled migrator credential path is available and its target is independently verified.

- Before CI submission, simplified the plan-mode checksum-output contract assertion to a literal source inclusion check, avoiding brittle regex escaping around JavaScript template interpolation.


## Web dependency audit remediation — 17 November 2026

- The web TypeScript build and 26 web tests passed; the CI audit failed on GHSA-fc5q-39xc-vjpf / CVE-2026-112366 in locked `picomatch@4.0.7`, reached through Vite/Vitest dependencies. The advisory identifies single-branch repeated extglobs including `+(*)` and `+(*a)`.
- Upstream picomatch PR #237 proposes collapsing single-branch self-repeating-star extglobs so the inner star absorbs the outer repetition. PR #238 is a narrower leading-quantifier literalization proposal. Both remain unmerged; no official fixed npm release is claimed.
- The web workspace now applies the PR #237-style collapse at install time, only when the installed package is exactly `picomatch@4.0.7`. The patcher checks exact source anchors and fails closed if the package layout differs.
- The regression verifier checks generated regexes and matching/performance cases for `+(*)`, `+(*a)`, `*(*a)`, `+(a*)`, `+(a*b)`, and `*(*.js)`. It also verifies matching semantics and includes a 100 ms bound for crafted non-matching inputs.
- CI runs the real `npm audit --audit-level=moderate --json`. A separate wrapper permits only the exact GHSA finding through the reviewed picomatch/fdir/tinyglobby/Vite/Vitest dependency path, and only after the installed parser mitigation and exact lockfile version are verified. Any other package, advisory, version, or dependency path remains blocking.
- This is a temporary local mitigation aligned with an unmerged upstream proposal, not an official patched release. Remove the local patch and scoped audit exception once an official fixed release is available and independently verified.
- No production migration, database role change, Render deployment, or additional hosting service is involved. PR #298 remains draft and unmerged.
