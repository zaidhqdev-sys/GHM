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


## Follow-up qualification — 17 November 2026

- The exact CI run after the web remediation passed both `quality` and `web-quality`. The dedicated `qualify:auth-issuer-cutover` step ran against disposable PostgreSQL and passed: 10 issuer-only functions, zero direct relation privileges, 19 runtime denials, preserved Connect lookup, registration/login/password rehash/concurrent reset/refresh/logout, recovery replay/session revocation, QuoteFlow migration reset, disposable privilege rollback, startup ACL verification, global and schema-scoped default ACL denials, SECURITY DEFINER owner/search_path checks, and no PUBLIC SECURITY DEFINER execution.
- The earlier structural inventory message saying “AUTH ISSUER ACLS REQUIRE DEDICATED CUTOVER QUALIFICATION” is a pre-cutover comparison decision, not the final result. The subsequent dedicated cutover qualification passed. No separate auth issuer ACL blocker remains in the disposable qualification evidence.
- Added a full plan-only integration qualification using a separately created, local-only disposable database named `ghm_db`. It seeds the first 95 currently tracked repository migrations as applied, then adds the 10 exact approved retained-history rows from `config/retained-historical-migrations.production.json`, reproducing the documented 105-row production snapshot while preserving the 50-entry pending suffix. It then runs the actual migration runner with `GHM_MIGRATION_PLAN_ONLY=true`, no batch ID, and an explicit test-only localhost qualification flag.
- The integration check requires all 50 committed pending migrations to be listed with checksums, verifies that no migration SQL is executed, and compares the ledger and GHM catalog before/after. The fixture is dropped with FORCE in cleanup. The test-only SSL exception is limited to `NODE_ENV=test`, the explicit plan-qualification flag, database name `ghm_db`, and localhost/127.0.0.1; production continues to require `DATABASE_SSL=true`.
- CI now runs this integration qualification after the ordinary disposable migration suite. This is a test-only database and does not connect to Render or the production database.
- Production ledger access remains a separate outstanding step. The local plan-only test proves runner behavior, not the live contents of Render `ghm_db`. Do not treat the dated 105-row export or the committed 50-entry inventory as a current production ledger.


## Production ledger evidence correction — 17 November 2026

- The production ledger evidence was already preserved in `docs/HANDOVER_2026-11-15_PRODUCTION_MIGRATION_RECONCILIATION.md`: the supplied full audit recorded **105 applied production ledger rows**, latest applied migration `20261109210000_deactivate_unrecognized_public_directory_records`, and **42 pending migrations** at that audit point. The 42-item inventory is listed in full in that handover; it must not be requested from the user again.
- The 14 November Render `ghm_db` archive also contains a 105-row ledger snapshot. It is a dated backup snapshot, not proof of a newly refreshed live ledger.
- The 17 November handover records the subsequent committed inventory as 50 pending migrations: the original 42 plus eight later migrations (six dated 16 November and two dated 17 November). The 50-entry manifest is therefore a later repository queue, not a new live-ledger export.
- The later Render connector inspection identified the ledger table and owner but was denied SELECT. It did not supersede the existing 105-row audit. The 105-row audit and 42 pending inventory remain the last recorded production ledger evidence; live refresh is still blocked by the documented ACL boundary.
- Corrected the disposable plan-only fixture to seed 105 applied ledger rows and test the current 50-entry queue. The prior draft test's 42-row seed was wrong: 42 was the earlier pending count, not the applied ledger count. No production database access or mutation was performed.


## Plan-only fixture correction — ledger row composition — 17 November 2026

- CI run 5342 exposed a mistaken assumption in the fixture: the production audit's 105 ledger rows are not 105 currently tracked repository migration files.
- The documented 105 rows consist of 95 currently tracked applied repository migrations plus 10 approved retained historical rows, as recorded in `config/retained-historical-migrations.production.json`. The current repository has 145 migration files, of which the exact 50-entry pending suffix leaves 95 applied current files.
- Corrected the fixture to seed the 95 current applied migration rows with repository-derived checksums and then seed the exact 10 retained historical rows with their registered names/checksums. The resulting fixture ledger has 105 rows and 50 pending current migrations, matching the documented production audit structure.
- The previous 105-current-files seed and 42-row ledger assertion were invalid and are superseded. No production database was queried or modified.


## CI and 50-migration production cutover review — 17 November 2026

### CI result

- Commit `743e3b601aba5be72e628fcca13b6e39d9af214f`, workflow run **#5343** (`44179911941`) completed successfully.
- Both `quality` and `web-quality` jobs passed.
- The quality job explicitly passed `Qualify production migration plan-only mode on isolated ghm_db fixture`, as well as the ordinary disposable PostgreSQL migration suite and the dedicated auth issuer principal/cutover qualifications.
- The plan-only fixture now models the historical production ledger composition: 95 current repository migrations applied + 10 approved retained historical rows = 105 ledger rows; 50 current repository migrations remain pending.
- This proves the runner's plan-only behavior against a disposable fixture. It does not refresh or independently prove the live Render ledger.

### Source-level review of all 50 pending SQL files

The 50 manifest entries were individually opened and reviewed for DDL, DML, SECURITY DEFINER, ownership, search_path, grants/revokes, and operational cutover effects. This is a source-level risk classification, not a production readiness approval.

1. **Foundation and data/read models (first 5 entries, 10 Nov):** supplier classification backfill/column/function; onboarding progress; business relationship/outcome tables and indexes; storage deletion-pending lifecycle; capability governance functions. These include data changes and new runtime-facing objects. Validate production row counts, lock/statement impact, existing data constraints, and app consumers before scheduling.
2. **Actor Gateway principal and capability foundation (next 9 entries, 10 Nov):** principal guard, self-identity and registration wrappers, cross-row capability invariants, capability gateway wrappers, supplier/profile legacy cutovers. These establish a dedicated role and move sensitive writes from `ghm_runtime` to `ghm_actor_gateway`. They are not safe to apply ahead of a compatible, deployed Gateway.
3. **Signed assertion and business gateway expansion (11 Nov, entries 15–26):** short-lived HMAC assertion secret/nonce storage, signed actor-bound wrappers, capability mutations, saved businesses, business hours, trust score and logo operations/read projections. The verifier secret row is a separate provisioning requirement; migrations do not prove that production secret is provisioned. Gateway role, service, signing secret, HTTP paths, and startup ACL checks must be ready first.
4. **Auth and QuoteFlow privilege cutovers (11–12 Nov, entries 27–35):** revoke direct account-external-identity table/sequence access, revoke unused auth entry points, token-bound recovery/reset and conditional rehash, then remove QuoteFlow migration and external identity bootstrap/link/reset entry points from runtime. These must be matched to the live GHM auth implementation and Connect/QuoteFlow callers; do not apply until authenticated end-to-end flows and rollback/recovery are qualified. PayFast remains excluded.
5. **Global privilege and signed Connect/storage operations (12 Nov, entries 36–42):** global default function EXECUTE revocation for `ghm_schema_owner`, removal of unsigned actor helper, signed Connect business provisioning, security-definer search_path pinning, signed storage metadata operations, provider-workflow attestation, and redundant migrator lookup revocation. The default-privilege change is broad and affects future function creation. Storage/provider attestation introduces a second secret/nonce boundary that must be provisioned and tested. Connect and storage provider workflows require deployed Gateway end-to-end proof.
6. **Commercial document and payment-consent foundations (16 Nov, entries 43–48):** provider-code generalization; immutable document version/status/consent evidence; scoped approval authority and immutable authority events; founder-only signed authority grant/revoke; founder-only approval of exact immutable document versions; atomic consent plus payment-attempt preparation. The founder-only SQL resolves the founder from the canonical bootstrap singleton and active account/credential state; it does not accept a caller-supplied approver ID or invent an employee. Before these migrations are considered, verify the existing founder bootstrap state matches the actual owner account, the commercial document catalogue/version content and pricing plan are ready, and the service/API path is implemented. Payment preparation explicitly does **not** call a provider, redirect to checkout, settle a payment, or activate a subscription. PayFast activation remains frozen and is not part of this cutover.
7. **Final legacy runtime revocations (17 Nov, entries 49–50):** registration identity legacy write and capability governance direct function revokes. Both SQL files contain explicit precondition checks for signed Gateway function ownership, grants, and deployment readiness. They are post-deployment cutovers and must remain last, only after the dedicated Gateway is deployed and authenticated registration/capability end-to-end tests pass.

### Current sequencing decision

- The 50 entries are **not one deployable batch**. Preserve chronological migration order and divide execution into independently reviewed batches only after the matching service code is deployed and qualified.
- No production batch is authorized by this review. No production SQL was run.
- First production cutover prerequisites remain: deployable Actor Gateway artifact and stable HTTPS URL; verified database role membership/grantor posture; provisioned Actor Gateway HMAC secret; provisioned storage-provider workflow attestation secret; startup identity/ACL checks; authenticated end-to-end smoke tests for each affected Connect/auth/storage/capability/registration path; and a controlled production pre-deploy ledger audit using the documented 105-row evidence as a baseline.
- The 16 November commercial approval/payment migrations need their own isolated PostgreSQL qualification and owner-account/document-catalogue review. They are not a reason to unfreeze PayFast or activate billing.
- The 17 November final revocations are explicitly gated by Gateway deployment and E2E checks. Keep them out of any earlier batch.
- Keep PR #298 draft/unmerged. No Render deployment, production migration, role/grant modification, secret provisioning, or added hosting spend has occurred.


## Commercial document and payment-consent qualification added — 17 November 2026

- Added `qualify:commercial-document-consent` to the disposable PostgreSQL CI sequence after migrations and plan-only qualification.
- The qualification checks all six commercial authority/approval/payment gateway functions for SECURITY DEFINER, schema-owner ownership, fixed search_path, Actor Gateway session binding, Actor Gateway-only EXECUTE, and no PUBLIC/runtime/migrator EXECUTE.
- It checks that all five commercial evidence tables deny direct runtime and Actor Gateway table access, retain migrator maintenance access, and have enabled UPDATE/DELETE/TRUNCATE immutability triggers.
- It performs rollback-only INSERT fixtures and verifies UPDATE, DELETE, and TRUNCATE are rejected by the append-only trigger.
- It statically verifies payment preparation requires explicit acceptance and an approved exact document version, writes payment-attempt/consent evidence, and contains no provider network call or subscription activation transition.
- Scope is intentionally schema/ACL/immutability qualification. It does not seed a real founder identity, grant actual legal approval, create live commercial document content, or initiate checkout/payment. Those remain separately gated by founder bootstrap state, owner-supplied legal documents, and a deployed Actor Gateway.
- This qualification runs only against CI disposable PostgreSQL. It does not connect to Render or production.


## End-to-end commercial workflow qualification added — 18 November 2026

- Added `qualify:commercial-workflow`, running only against disposable PostgreSQL CI.
- The fixture creates a synthetic canonical founder account with the existing account-creation primitive, then promotes that already-created account through the current one-argument, one-time founder bootstrap function. This reflects the actual migration history: the original seven-argument create-and-promote overload was replaced by a promotion-only overload. It uses a CI-only placeholder credential string; no real owner password, account ID, legal document, or production data is used.
- It creates a synthetic Business and active owner membership, CI-only plan/version/price, trialing subscription, and two immutable synthetic subscription-terms versions.
- A second PostgreSQL connection logs in as `ghm_actor_gateway`; the test asserts both `session_user` and `current_user` remain that principal and never SET ROLE.
- It exercises signed scoped authority grant, exact-version approval, explicit-consent payment preparation, idempotent retry, authority revocation, and post-revocation approval denial.
- Negative cases cover one-use nonce replay, forged HMAC, caller-selected non-founder identity, expired assertion, false consent, and an unapproved document version.
- Final state requires exactly one payment attempt and consent event for the idempotency key, one approval event for the exact version, `pending_checkout` attempt status, and unchanged `trialing` subscription lifecycle.
- No payment provider call, checkout, settlement, activation, production connection, production credential, or real legal approval is involved. PayFast remains excluded.
- This runs after all migrations and the commercial schema/ACL qualification using existing disposable CI roles and the test-only assertion secret. No extra database, Render service, or recurring schedule is added.


- CI #5352 exposed that the founder bootstrap function is now the one-argument promotion-only overload; the qualification fixture was corrected to create a disposable canonical founder account first, then promote it. The obsolete seven-argument call is not retained.


- CI #5353 caught the reconciled Business verification invariant: an approved synthetic Business must also set `is_verified=true`. The disposable workflow fixture now explicitly sets both values consistently, as required by migration `20260911210000`; this is test-fixture alignment, not a schema or production change.


- CI #5354 progressed past the synthetic Business fixture but exposed that the disposable database had not provisioned the HMAC verifier row. The commercial workflow qualification now seeds `ghm.actor_gateway_capability_assertion_secret` from the existing CI-only 32-byte test secret while connected as the migrator after `SET ROLE ghm_schema_owner`. This is isolated to the disposable test database; no hosted/production secret is changed. The next existing CI run will validate the table's exact insert contract and the full workflow.


- CI #5355 exposed test-order contamination: the commercial end-to-end qualification bootstraps the canonical founder singleton, but the Actor Gateway principal qualification correctly requires that singleton to be empty when it creates its own fixture. The CI steps are now ordered so Actor Gateway principal qualification runs first and cleans up its founder fixture; the commercial end-to-end qualification runs afterward. The Actor Gateway principal qualification also provisions the HMAC verifier row itself from the disposable CI-only secret, so it no longer relies on a later test's side effects. This corrects test isolation and ordering; no production data or credentials are involved.


- CI #5356 reached the Actor Gateway principal qualification and rejected the verifier row on its `secret` CHECK constraint. The test environment variable is base64-encoded, while the database column is `bytea`; passing the encoded text stored the wrong bytes. Both isolated qualification fixtures now decode the existing CI-only secret with `Buffer.from(value, 'base64')` before binding it to PostgreSQL. This aligns the stored 32-byte verifier with the signing code. No production secret or database was involved.


## Follow-up — CI timing and initial production batch boundary review — 18 November 2026

### CI timing evidence

- Inspected the exact-head CI run **44199544544** for commit `095f167003ff9e8b14b112a1525839571fb4652b`. Both `quality` and `web-quality` completed successfully; the complete workflow ran from 23:27:36 to 23:30:51 UTC (3 minutes 15 seconds).
- The disposable PostgreSQL `npm run migrate` step took approximately 7.5 seconds. The plan-only qualification took approximately 7.4 seconds, and the Actor Gateway principal qualification approximately 0.5 seconds. This run does not support the hypothesis that the migration replay itself consumed 20 minutes.
- The CI churn observed during the preceding work came from a sequence of pushed commits, each creating another pull-request CI run; the successive failures were fixture corrections, not a single migration step running for 20 minutes. The final exact-head run is green.
- No workflow change is made solely to optimise this already short successful run. Continue batching related code and fixture changes before pushing. Documentation-only handover updates are ignored by the workflow's configured `paths-ignore` rules.

### Initial static review of the pending migration prefix

- Reviewed the first 14 entries of the committed 50-migration pending inventory against their SQL at this PR head.
- The first explicit runtime-to-Actor-Gateway write cutover in that prefix is `20261110260000_gateway_supplier_classification_cutover`: it installs the gateway wrapper, grants it to `ghm_actor_gateway`, and revokes the legacy supplier-classification write RPC from `ghm_runtime`.
- The immediately following `20261110265000_reconcile_business_profile_legacy_contract` changes the Business profile schema/function contract; `20261110270000_gateway_business_profile_update` installs the gateway wrapper and revokes direct runtime execution on the legacy profile update RPC.
- Earlier entries are not a blanket “safe additive” batch: they include capability-governance functions and Actor Gateway principal/identity/registration/capability objects. The later gateway wrappers depend on the Actor Gateway assertion mechanism, and the signed request-context binding is not introduced until `20261111060000_bind_gateway_assertions_to_request_context`.
- Therefore this static prefix review does **not** approve a first production batch or establish a safe stop point. It identifies the first explicit runtime cutover boundary for the route-readiness review; it does not prove that applying the preceding entries is operationally safe.
- The production Actor Gateway has not been deployed and smoke-tested, the live production migration ledger has not been refreshed through an authorized read-only path, and the role-administration / fresh-recovery-point gates remain unresolved. The execution manifest stays empty. Do not run production migrations or set `GHM_MIGRATION_BATCH_ID`.

### Next evidence required

1. Complete the SQL/ACL dependency review for all 50 pending entries, distinguishing additive schema work, runtime grant changes, gateway-only cutovers, auth/session changes, and storage/provider workflow changes.
2. Map each cutover to the currently deployed GHM runtime and Connect/QuoteFlow call paths; do not infer route readiness from the presence of gateway SQL.
3. Refresh the production ledger and checksums only through an authorized read-only identity that can read `ghm.ghm_schema_migrations`; the dated 105-row snapshot and 50-entry repository queue are not a live reconciliation.
4. Keep the production batch manifest empty until those checks and the independent production recovery/role/service gates are satisfied.

No production SQL, database role/grant, secret, Render resource, deployment, or application data was changed during this review.


## Full pending-queue static review — 18 November 2026

### Coverage and method

- Reviewed the SQL source for all **50** entries in `config/pending-migrations.production.json` at the PR head, in repository order. This is a static source review, not an execution against production and not a live production-ledger refresh.
- Classified the queue by schema/data changes, privilege changes, Actor Gateway wrapper installation, signed-assertion evolution, auth/storage cutovers, commercial authority/payment preparation, and post-deployment revocations.
- No migration was applied, reordered, edited, or removed as part of this review.

### Queue dependency map

| Ordered segment | Main purpose | Operational character |
|---|---|---|
| 1–4 | Supplier classification; onboarding progress; relationship/outcome read models; pending storage deletion lifecycle | Schema/data and legacy runtime RPC additions. Supplier classification initially accepts a caller-supplied account ID and is not safe as a gateway cutover until the later signed wrapper and runtime revoke are in place. |
| 5–14 | Actor Gateway principal guard; identity/registration/capability wrappers; capability catalogue invariants; supplier and Business-profile cutovers; signed assertion binding | Security foundation plus first gateway cutovers. The principal guard has a strict external role-membership precondition. Assertion support evolves across several migrations; the v2 request-context-bound verifier is not present until migration 20261111060000. |
| 15–23 | Signed Business Capability, Saved Business, Business Hours, Trust Score and Business Logo operations/read projections | Feature gateway additions. Several deliberately retain legacy runtime grants pending a separately qualified cutover; adding wrappers alone does not move live API traffic. |
| 24–30 | External identity table/function restrictions; token-bound recovery result; removal of runtime auth administration, QuoteFlow provisioning, external identity link/bootstrap | Authentication and provisioning privilege reductions. These are service-behaviour cutovers, not merely additive DDL; active auth and recovery paths must be verified against the deployed Resource API and Authentication Issuer. |
| 31–35 | Token-bound password reset, conditional password rehash, reset-enrollment restriction, global PUBLIC function default revoke, removal of unsigned Actor Gateway helper | Authentication/security hardening. The global default-privilege change affects future functions created by `ghm_schema_owner`; later migrations must explicitly grant intended execution. |
| 36–38 | Signed Connect Business provisioning; SECURITY DEFINER search_path pin; signed storage metadata operations | Cross-service cutovers and broad security hardening. Storage provider-confirmed state transitions are deliberately separated from user-authorized metadata operations. |
| 39–44 | Provider-code generalization; immutable commercial document/consent evidence; scoped founder approval authority and approval transition; consent-bound payment preparation | New commercial governance model. No legal text, document version, approval authority or active provider is seeded. Payment preparation records consent and an attempt only; it does not call a provider or activate a subscription. |
| 45–46 | Revoke runtime Business registration write and legacy capability governance functions | Explicit post-deployment revocations. Their SQL preconditions check gateway functions, ACLs and ownership, but they do not replace the required live HTTP end-to-end smoke tests. |

### Release blockers and specific findings

1. **No first production batch is approved.** The queue is a chronological prefix, not a set of independently deployable feature groups. A safe prefix must be derived against the actual production catalog, role memberships, current API callers, and the deployed Actor Gateway. The final two revocations are explicitly post-deployment and remain excluded from pre-deployment execution authority.
2. **Actor Gateway database role prerequisite remains unresolved.** Migration `20261110210000_add_actor_gateway_principal_guard` requires `ghm_actor_gateway` to be LOGIN/NOINHERIT with no elevated attributes and requires a narrowly specified `ghm_db_user` membership with ADMIN OPTION but without INHERIT or SET. This intersects the previously escalated Render grantor/membership issue. Do not attempt to satisfy it by changing production grants during migration execution.
3. **Signed assertion sequencing matters.** The early wrappers using `assert_actor_gateway(bigint)` are transitional only. The one-use HMAC assertion evolves through the queue; request-context binding arrives at `20261111060000`. Feature wrappers created before their corresponding signed/context-bound replacement must not be treated as production-ready just because their function exists.
4. **API route readiness is not established by SQL.** The queue adds signed operations for supplier classification, Business profile, registration identity, capability governance/evidence, Saved Business, Business Hours, Trust Score, Business Logo, Connect provisioning, and storage. Each relevant deployed HTTP path must use the exact current function signature, mint the operation-specific assertion over the exact request context, and pass authenticated positive/negative end-to-end tests before its legacy grant is revoked.
5. **Legacy retired external provider identifier needs an explicit disposition.** Migration `20261112080000_signed_connect_business_provisioning_gateway` looks up and creates a `business_external_mapping` row with provider key `retired external provider`. This is an explicit historical identifier in a GHM migration, not evidence that the production system should depend on retired external provider. Before any production execution, confirm whether this is strictly a one-time legacy mapping/import compatibility path; otherwise it conflicts with the recorded provider-independent, no-retired external provider target and needs a forward-only correction.
6. **Storage provider attestation is a separate release dependency.** Migration `20261112150000` requires a separately provisioned provider-workflow secret and a second one-use attestation for provider-confirmed availability/deletion. Do not conflate this with the Actor Gateway user assertion or assume the secret is provisioned. No new paid storage/provider service is authorized by this migration review.
7. **Commercial/legal workflow is inert until deliberately configured.** The commercial migrations create immutable document/consent evidence and founder-scoped authority controls, but seed neither legal text nor an authority nor an approved version. This does not approve legal documents or activate PayFast/another payment provider. Legal approval remains a human owner action; the assistant is not an approver.
8. **Production evidence is still incomplete.** The pending inventory is derived from the supplied 105-row snapshot through 2026-11-09. The production ledger/checksums need a fresh read-only reconciliation, and the recovery-point and database-role/service gates remain open.

### Current decision

- Keep `config/production-migration-batches.json` empty.
- Keep PR #298 draft and unmerged.
- Do not set `GHM_MIGRATION_BATCH_ID`, run a production migration, alter production grants/roles, deploy the Actor Gateway, or enable payment activation.
- Next technical review should trace the actual GHM runtime and Connect/QuoteFlow route implementations against the signed operation names, canonical JSON assertion contexts, and SQL function signatures. The retired external provider mapping identifier above should be resolved as part of that source review, before proposing any batch.


## Runtime and Connect route-wiring review — 18 November 2026

### Confirmed route/client wiring

The source review compared `src/actor-gateway/app.ts`, its reader construction in `src/actor-gateway/server.ts`, the GHM Resource API composition in `src/http/app.ts`, and the corresponding gateway HTTP clients.

| Capability family | Actor Gateway endpoint(s) | GHM Resource API wiring | Status from source review |
|---|---|---|---|
| Actor identity | `GET /v1/actor/me` | No consumer identified in the reviewed Resource API composition | Gateway endpoint exists; caller path not established |
| Business registration identity | `GET/PUT /v1/businesses/:id/registration-identity` | Router uses gateway client when configured; production requires gateway and otherwise returns 503 | Wired, fail-closed |
| Capability catalogue governance | `GET/POST /v1/admin/capabilities...` | Admin catalogue router uses gateway client; missing client returns 503 | Wired, fail-closed for admin operations |
| Supplier classification / Business profile | `PUT /v1/businesses/:id/supplier-classification`; `PATCH /v1/businesses/:id/profile` | Gateway clients are constructed from `GHM_ACTOR_GATEWAY_URL`; request handlers return 503 when unavailable | Wired, fail-closed at operation |
| Business capability assertions / evidence | `PUT /v1/businesses/:id/capabilities`; verification and evidence submit/review routes | Mutation gateway client is passed to capability and evidence routers; production marks gateway required | Wired, fail-closed |
| Business hours | `GET/PUT /v1/businesses/:id/hours` | Gateway client is configured from the Actor Gateway URL; production marks it required | Wired, fail-closed |
| Saved Business | `GET/POST/DELETE /v1/saved-businesses...` | Gateway client is passed to Saved Business router; production marks it required | Wired, fail-closed |
| Trust score | `GET /v1/trust-scores...`; `POST /v1/trust-scores/:id/calculate` | Gateway client is passed to Trust Score router; production marks it required | Wired, fail-closed |
| Business logo | `PUT /v1/businesses/:id/logo` | Gateway client is passed into storage routes; production marks gateway required | Wired when storage routes are enabled |
| Storage metadata | `POST/GET /v1/storage/metadata...` and lifecycle transitions | Per-request store factory uses Actor Gateway URL, bearer token, and provider-attestation secret; production storage requires URL and secret | Wired, but requires a separate provider attestation configuration and provider workflow |
| Campaign directory review | Campaign create/update and business directory-review presentation endpoints | Campaign and directory-review repositories receive gateway client; production marks it required | Wired, fail-closed |
| Connect Business provisioning | `POST /v1/connect/businesses/provision-or-resolve` | Actor Gateway endpoint and reader exist; a gateway HTTP client and `ConnectBusinessAdapter` exist, but the reviewed `src/http/app.ts` and `connect-service-router.ts` do not instantiate or dispatch them | **Not connected to a confirmed GHM Resource API route** |
| Commercial document authority / approval / consent payment preparation | Founder authority, approval and payment preparation endpoints | Actor Gateway routes and readers exist; payment preparation is guarded by explicit feature/launch flags | Endpoint implementation exists; no production activation is authorized |

### Confirmed integration blockers

1. **Connect Business provisioning is not end-to-end wired in this repository.** `src/actor-gateway/app.ts` exposes the endpoint and `src/actor-gateway/server.ts` constructs its reader. `HttpConnectBusinessProvisioningGatewayClient` and `ConnectBusinessAdapter` exist, but the adapter is only referenced by its own unit test in the reviewed source tree. The Resource API composition does not construct it, and `src/http/connect-service-router.ts` has no Business provisioning dispatch. Therefore the SQL gateway function and Actor Gateway endpoint do not establish a usable Connect application path yet.
2. **The Connect service identity boundary still explicitly depends on retired external provider identity references.** `src/http/connect-service-router.ts` rejects any external identity provider other than `retired external provider`; `src/integrations/connect/trusted-request-context.ts` types and validates only `provider: 'retired external provider'`; `src/integrations/connect/authorization-binding.ts` rejects any other provider; and `src/integrations/connect/identity-adapter.ts` resolves through `EXTERNAL_IDENTITY_PROVIDER_retired external provider`. This is a real remaining retired external provider integration dependency, not merely the historical provider label in the Business mapping migration. The agreed re-sign-up path means the replacement should bind to an authenticated GHM account identity, not preserve a mandatory retired external provider identity lookup. Do not remove these checks piecemeal: change the trusted assertion/request contract, identity binding, account lookup, and Connect caller together with tests.
3. **Business provisioning's SQL migration still uses the `retired external provider` mapping key** in its advisory-lock namespace, mapping lookup, and mapping creation. Even if the old Connect UUID is retained as a legacy external identifier for data reconciliation, the active provider key and new mapping contract must be decided and made consistent with the GHM-native identity cutover before this migration is eligible for production.
4. **The Actor Gateway URL is not globally mandatory in Resource API startup.** It is read as optional configuration. Individual production routes are designed to fail closed (503) when their gateway is required but not configured; storage adds explicit startup checks only when storage is enabled. Thus a healthy Resource API process does not prove that all gateway-backed routes are usable. Deployment readiness needs an explicit gateway configuration and authenticated path qualification, not just `/healthz` or `/readyz`.
5. **The Actor Gateway itself is not shown as deployed or reachable by this source review.** Its startup requires `GHM_ACTOR_GATEWAY_DATABASE_URL`, ES256 verification keys, and a canonical 32-byte `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`; startup then checks exact database identity, memberships, and function ACL allow-list. These checks are intentionally strict. The unresolved Render role-membership issue means this startup gate remains unqualified.

### Route-readiness decision

- Existing route/client code is a useful implementation base, but it is not proof that the Actor Gateway is production-ready.
- Do not execute the production migration prefix or either post-deployment revoke migration based on this code review.
- The highest-priority implementation gap is the **Connect identity cutover and Business provisioning route wiring**. The next code change should move Connect's trusted end-user binding to the GHM account identity already established by the verified Connect service request, then wire Business provisioning through the internal Actor Gateway client without exposing the Actor Gateway URL or database credentials to the browser.
- Preserve the existing integration-principal assertion, replay store, lifecycle check, governed operation registry and end-user authorization binding. The Connect integration principal must not become the end-user account.
- Resolve the `retired external provider` Business mapping key as part of that coordinated change; do not silently rename historical mapping rows or strand existing Connect users.
- Keep the production migration manifest empty and PR #298 draft/unmerged. No production SQL, roles, grants, deployments, secrets, payment activation or paid resources were changed in this review.


## Correction — Connect's current identity path versus legacy service integration — 18 November 2026

The preceding route review overstated the scope of retired external provider identity usage. A targeted inspection of the current `zaid-connect/main` frontend and GHM Resource API establishes the following distinction:

### Current Connect browser identity is GHM-native

- `src/features/authentication/ghmWebAuthClient.js` obtains a GHM access token and canonical `accountId` from the GHM web-auth endpoints. The access token is held in memory and sent as a Bearer token to the same-origin GHM API proxy.
- `src/features/authentication/identity.js` loads `/api/v1/profile`, checks that the returned profile ID equals the authenticated GHM account ID, and loads `/api/v1/businesses/memberships`. It sets `authUserId` to the GHM account ID. There is no `externalIdentity`/retired external provider subject in this current identity resolution path.
- `BusinessCreationScreen.jsx` calls `POST /api/v1/businesses` through `ghmAuth.apiFetch`. GHM's Resource API protects that route with bearer authentication and registered `business.create` authorization, then creates the business and its active membership through the Business Identity service.
- The browser proxy forwards the GHM Bearer token to the Resource API and does not forward the refresh cookie on ordinary API calls.

Therefore, **do not redesign the active Connect browser identity around a new retired external provider-to-GHM mapping replacement**. The current user-facing path already uses GHM identity and direct GHM business/membership APIs. The earlier recommendation to replace retired external provider identity across that path is withdrawn.

### Legacy GHM Connect service route remains a separate concern

- GHM `src/http/connect-service-router.ts` exposes `POST /api/v1/connect/service`, requires a signed integration assertion, and currently accepts a `provider: 'retired external provider'` external identity which it resolves through `ConnectIdentityAdapterImpl`.
- A repository code search of `zaid-connect/main` for `/api/v1/connect/service` found only architecture/interface/handover documentation, not an application caller. A search for `externalIdentity` in that repository returned no code matches.
- This is evidence that the legacy server-to-server route is not used by the current Connect frontend, but not proof that no other integration consumer exists. Do not remove or change its contract until its registered integration consumers and operational usage are checked.
- The Connect Business provisioning gateway client/adapter/Actor Gateway endpoint likewise has no confirmed current browser application call path in the reviewed source. The active user flow creates GHM Businesses directly and receives the GHM business ID/membership.

### Remaining retired external provider investigation

A code search still finds retired external provider references in 25 files under Connect `src/`, including compatibility libraries and feature/service modules. That is a separate remaining-removal audit; it must distinguish active imports/runtime calls from historical schemas, migration fixtures, documentation and dead code. Do not infer that retired external provider is fully removed merely because the primary auth/business creation path is GHM-native.

### Corrected implementation sequence

1. Preserve the already-working GHM-native browser authentication, account identity, membership resolution and business creation paths.
2. Inventory all remaining Connect `src/` retired external provider imports and runtime call sites, grouped by feature, before editing them.
3. Trace the legacy `/api/v1/connect/service` integration registration/consumer list and decide whether it should be retained as a generic provider-neutral integration seam, migrated to GHM bearer identity, or retired.
4. Only wire Connect Business provisioning if a documented active caller and data requirement justify an external Business mapping. Do not introduce a mapping solely to satisfy an unused adapter.
5. Keep Actor Gateway production cutovers blocked until the runtime role, live migration ledger, recovery point and end-to-end gateway checks are qualified.

This correction is a source/documentation review only. No runtime code, production database, Render service, deployment, credential or application data was changed.


## Product terminology and dependency boundary — 18 November 2026

Owner direction: the retired provider is not part of ZAID Technologies' product vocabulary, architecture narrative, implementation plans, or user-facing documentation. Do not refer to it by name in future handovers, product discussions, route designs, or UI copy.

- GHM remains the system of record and identity authority.
- Connect and QuoteFlow use GHM account identity and GHM-owned business/membership records.
- Provider selection must remain an internal implementation detail behind portable interfaces; no retired provider is a target dependency.
- Any remaining legacy identifiers or modules are technical cleanup items only. Remove them through coordinated code changes and compatibility tests; do not elevate them into product concepts or introduce new external identity mappings.
- This terminology decision does not authorize deleting data, changing production identities, or altering production database objects.

The existing Connect browser login, account/profile verification, membership loading, and Business creation flows remain the canonical GHM-native paths. Preserve them while auditing and replacing any residual legacy implementation paths.


## Connect remaining legacy backend audit — 18 November 2026

This is a source-level audit of `zaid-connect/main` (111 files under `src/` at the inspected revision). It distinguishes live client/database calls from compatibility code, generated types and historical artifacts. It is not a claim that the Connect application has been fully migrated.

### Confirmed active legacy access paths

- `src/lib/lib_supabase.js` is a live client module. It creates a browser SDK client from build-time URL/anonymous-key variables and exposes direct Auth, profile, Business, membership, verification-document, storage, logo, analytics, referral, capability, trust-score, onboarding and commercial service operations.
- `src/features/projects/projectsService.js` still imports that client and contains direct project, quote and RPC operations. It also imports GHM project/list/quote services and has a feature-flagged GHM quote caller. The migration is therefore partial/fallback-based, not a complete cutover.
- `src/features/opportunities/opportunityService.js` still performs direct opportunity, type, capability-requirement reads and writes.
- `src/features/opportunities/OpportunityRequirementsEditor.jsx` directly checks authorization and reads capabilities through the legacy client.
- `src/features/marketplace/marketplaceService.js` has a direct Business directory query path while its enquiry path already uses GHM. This must be consolidated behind the GHM marketplace API.
- `src/features/administration/AdminCommercialLaunchPanel.jsx`, `AdminVerificationScreen.jsx`, `AdminCapabilitiesPanel.jsx`, `BusinessCommercialPanel.jsx`, `AnalyticsScreen.jsx`, `TrustScoreScreen.jsx`, `AIQuoteAnalyzerScreen.jsx`, `OnboardingPanel.jsx`, and `RelationshipOutcomeScreen.jsx` import service functions from the legacy client module. Each operation must be traced to its GHM endpoint and permission contract before removal.
- `src/components/components_index.jsx` still accepts a client object as a prop for referral and verification flows; callers and rendered routes must be traced before changing its contract.
- `src/lib/lib_notifications.js` still persists push subscriptions directly through the old client.
- `src/features/ai/aiProxyClient.js` calls a legacy edge-function endpoint directly using public build-time configuration.
- `src/supabase/supabase_edge_functions.ts` contains webhook/reminder implementations and direct subscription/business/notification writes. These are backend responsibilities and must be reconciled with GHM-owned webhook, subscription, notification and provider-neutral workflows before they are retired.
- `package.json` still declares `@supabase/supabase-js`; `src/lib/database.types.ts` is generated database typing, not by itself proof of runtime dependency.

### Already GHM-backed or mixed paths

- Browser authentication, canonical account ID, profile identity check, Business memberships and Business creation are GHM-native and must be preserved.
- Marketplace enquiries already use the GHM API.
- Project quote/list services include GHM callers, but the parent project service retains direct fallback code.
- Project lifecycle helper is pure logic with no I/O; no backend rewrite is needed there.

### Migration order — do not remove the client first

1. **Inventory contract parity:** map every exported function from `lib_supabase.js` to an existing GHM endpoint, authorization capability, response shape and pagination/filter contract. Mark genuine gaps rather than inventing new endpoints.
2. **Projects and Opportunities:** finish the existing GHM project/quote caller path, route all project operations through it, and implement the missing opportunity list/type/requirements API in GHM with the same owner/member/public visibility rules. Remove direct fallback only after contract and integration tests pass.
3. **Business directory and administration:** route directory, capability, trust, verification, commercial launch and onboarding operations through existing GHM routes or explicitly scoped new GHM endpoints. Keep server-side authorization authoritative.
4. **Notifications and media:** move push-subscription persistence and media metadata/storage operations behind GHM; keep provider-specific upload/attestation details server-side.
5. **AI and PDF:** move AI proxy configuration and any document metadata/storage persistence to GHM-owned server endpoints; do not expose service credentials in browser bundles.
6. **Webhook and subscription jobs:** reconcile the edge-function behaviours with GHM's existing webhook, subscription and notification modules. Payment activation remains frozen; do not call any payment provider or activate plans during this migration.
7. **Remove dead compatibility surface:** once no runtime import/caller remains, remove the old client package, environment variables, generated types and unused function bundles in one coordinated PR. Keep historical SQL/backup artifacts out of runtime builds; retain only what the recovery/audit policy requires.

### Immediate next implementation target

The largest shared blocker is the monolithic `lib_supabase.js` service surface and the direct project/opportunity fallback paths. Start with an export-to-GHM endpoint matrix and source-level contract tests, then implement one coherent project/opportunity caller cutover. Do not change the GHM-native auth or Business creation flow.

No production database, Render service, deployment, credentials, payment activation, or paid infrastructure was changed during this audit.


## Cross-PR reconciliation and web audit-gate conflict — 18 November 2026, 03:15 UTC

- Re-read the relevant migration handovers and inspected open PRs #298, #297, #296, #286 and #285 before selecting further work. PR #298 remains draft at `24ff81c0e9338d7d24015d4e511fd47ee36bf8d0`; PR #297 remains draft at `77e00a666557d5a2e6e990a570a3166c868e1539`. PR #299 is separately open/draft and is not part of this migration-runner decision.
- **Important branch/handover contradiction:** this branch's earlier section "Correction — temporary picomatch workaround reverted" records the workaround as reverted, but a later "Web dependency audit remediation" section describes reintroducing it. The current PR #298 source confirms the workaround is present: `web/package.json` runs `scripts/patch-picomatch-redos.mjs` as `postinstall`, and the patcher modifies `node_modules/picomatch/lib/parse.js` when the installed version is exactly 4.0.7. The new `audit:security` wrapper then accepts the exact GHSA finding through a narrow package path after checking the local patch. This makes the audit command succeed without an official fixed package release.
- This is not an upstream release or a published dependency fix. It mutates installed dependency code during `npm ci` and converts the active advisory into an accepted scoped exception. That conflicts with the current owner decision to keep the npm audit gate intact and not carry an unmerged upstream patch or audit waiver. **Do not merge PR #298 in its current form.** Remove the postinstall patcher, verifier and scoped audit exception from any future candidate; restore the direct `npm audit --audit-level=moderate` CI gate. Do not run another CI cycle merely to prove the current workaround.
- PR #297 provides a separate migration-runner implementation and does not contain the picomatch postinstall/audit wrapper: its `web/package.json` retains the normal build/test scripts and its workflow retains direct `npm audit --audit-level=moderate`. Its batch selector validates the complete 50-entry pending inventory against the live ledger and selects an exact contiguous prefix by named batch ID. It uses a separate 50-entry `production-pending-migration-inventory.json` while retaining the older seven-entry `pending-migrations.production.json` allowlist. PR #298 instead uses the 50-entry `pending-migrations.production.json` as its inventory input and a simpler `migration-batches.ts` selector. These are competing implementations, not safe to merge together or cherry-pick piecemeal without a full exact-head reconciliation.
- Both PR #297 and #298 keep the committed production batch manifest empty. Neither authorizes a production batch. The last recorded live production ledger evidence remains the dated 105-row snapshot; the current 50-entry inventory is not a fresh live audit. Actor Gateway hosting/credentials, role authority, fresh verified recovery point, active API route readiness, and the first safe contiguous prefix remain outstanding. No production migration or execution is authorized.
- PR #296 adds a later Business Identity column-level INSERT ACL migration and remains a separate draft; it must be included in a future repository inventory reconciliation if selected for integration. PRs #285 and #286 are earlier draft variants/related cutover work and must be reconciled against the chosen runner and current main before any adoption.
- Decision: retain all migration PRs as draft. Do not merge PR #298 or combine it with #297 until one canonical runner is selected after a full base/head diff and exact-main reconciliation. Preserve direct audit enforcement. No CI run, production database access/change, deployment, Render setting/credential change, payment activation, or paid resource was used in this review.


## Migration-runner exact-head reconciliation and corrective implementation — 18 November 2026, 03:18–03:20 UTC

- Re-read the migration handover, the full open-PR summaries and changed-file lists for #298, #297, #296, #286 and #285 before editing. Verified current `main` is `b73839b27ac90446650f921d3e8ce1b5de041f04`. PR #298 is based on that exact current main and remains draft; PR #297 is based on older `632a8fc67a0ca4c3f8e2d23db487e0ce6dcc595c`, is non-mergeable against current main, and must not be treated as merge-ready. PR #296 remains a separate draft ACL migration.
- Compared the actual migration runners, selectors, tests, CI workflows, inventories and manifests on both PR heads. PR #297 has a more complete inventory equality check and a disposable PostgreSQL batch-runner qualification; however its plan-only path still requires a named batch and its base is stale. PR #298 has the current 50-entry pending inventory, a non-executing full-plan mode that does not require a batch ID, and a disposable PostgreSQL plan-only fixture. Both manifests remain empty.
- Selected PR #298 as the current integration candidate because it is based on current main and contains the current migration/security/qualification chain. This is a candidate only, not merge approval. Carried the strongest relevant validation pattern from #297 into #298's batch selector: strict 14-digit version/name validation, unique and strictly ordered repository identities, strict batch ID/purpose/non-empty migration validation, unique and ordered batch identities, and exact contiguous-prefix selection. Expanded selector tests for malformed identities, ordering, duplicate versions/IDs, invalid batches and prefix behaviour. Corrected the 14-digit version regex after inspecting the committed source.
- Removed the unreviewed picomatch install-time patch and scoped audit exception from PR #298: removed `postinstall` and `audit:security` scripts from `web/package.json`; restored the direct blocking `npm audit --audit-level=moderate` step in `.github/workflows/ci.yml`; deleted `web/scripts/audit-security.mjs`, `patch-picomatch-redos.mjs` and `verify-picomatch-redos.mjs`. The advisory remains unresolved, so web CI is expected to remain blocked at the honest audit step until an upstream fix is verified. No dependency lockfile was changed.
- Changes committed on PR #298 branch:
  - `79fe1318d14bb799d9f175d414c8e804a0b46952` remove postinstall and scoped audit scripts from web package manifest.
  - `d94890f109346630307f4719ab9595415d46d5d5` restore direct npm audit in CI.
  - `a288941e9213efa8ea20fb4af9525803b70dbee8`, `e17fe092be7769819f4630debecd84d036f75221`, `5e88f4de911eae079a6dc957d79572fecfb3aa57` remove the three workaround scripts.
  - `b33efa58b209f11c672766758e310e4cf9f78263`, `7220a7b9e5a55d0912d92e305a4f6f0bd8d9cfed`, `67ffb874eb46333bd4d606efba07014611bf28b5` strengthen selector validation, expand tests, and correct the version regex.
- Re-fetched source after writes and verified: direct audit command restored; no mitigation wrapper remains in the CI workflow; web package has no postinstall/audit exception; all three workaround files are absent; inventory contains 50 entries; batch manifest remains `[]`; selector source contains the correct 14-digit regex. PR #298 head is now `67ffb874eb46333bd4d606efba07014611bf28b5`, still draft, based on current main.
- No CI workflow was dispatched and no local/disposable PostgreSQL qualification was run during this source-edit pass. Therefore the selector tests and full branch remain unqualified at this new head. Do not claim tests passed. Next validation should be bounded: run selector unit tests and plan-only disposable fixture first, then decide whether a full CI run is warranted. The full web audit is expected to fail honestly on the known picomatch advisory; do not rerun it until the package finding changes.
- PR #297 remains draft, stale-base and non-mergeable; do not merge it or cherry-pick it as a second runner. Its useful validation patterns have been selectively incorporated into #298. PR #296 remains separately pending ACL-chain reconciliation.
- Production batch manifest is still empty; the inventory is not execution authorization. No live production ledger refresh, production migration, production DDL/ACL change, Render credential/setting change, deployment, payment activation, or paid resource was used or authorized.


## Exact-head validation update — PR #298, 18 November 2026, 03:27 UTC

- After the selector test regex correction, GitHub Actions automatically started PR workflow run `44230418928` for head `614147ac4201374bae771f4b48699fd13610283a` (merge ref `e4318163d46108cd4e565fc0c302dd48e18c9410`). No workflow was manually dispatched or rerun.
- `web-quality`: web TypeScript/Vite build passed and all 26 web tests passed. The restored direct `npm audit --audit-level=moderate` failed exactly as expected on five high-severity path findings for the same picomatch advisory GHSA-fc5q-39xc-vjpf. npm's suggested `--force` action would install Vitest 3.1.4 and is a breaking change; do not use it.
- `quality` at the time of this note: repository build passed; all migrations applied successfully to disposable CI PostgreSQL; production migration plan-only qualification on the isolated disposable `ghm_db` fixture passed; commercial document authority schema qualification passed; auth issuer and Actor Gateway principal qualifications passed; founder authority/payment-consent end-to-end qualification passed; Actor Gateway local Worker smoke test passed. Remaining quality steps, including the full test suite and further disposable-PostgreSQL qualifications, were still running. No result is claimed for those pending steps yet.
- The migration plan-only fixture reported success without applying SQL; its assertions verified all 50 inventory migrations were listed with SHA-256 checksums and that the 105-row ledger/catalog remained unchanged. This validates the plan-only path at the current merge head, not production migration execution.
- The new selector unit tests are included in the still-pending repository test-suite step; they have not yet been separately reported as passing. The regex literal correction is committed at `614147ac4201374bae771f4b48699fd13610283a`.
- This is the first automatic PR run after the source changes, not a manually requested duplicate CI cycle. Do not dispatch or rerun another workflow for the known picomatch audit finding. Wait for the current quality job's terminal result, then record the exact final status.
- PR #298 remains draft and based on current main. PR #297 remains draft/stale-base. Production manifest remains empty. No production DB or deployment action occurred.


## Terminal CI result — exact PR #298 head — 18 November 2026, 03:32 UTC

- Re-read this handover and PR #298 before checking the terminal workflow result. PR #298 remains open/draft at exact head `6eb0ec8222336819984cb624e26dd840aa555251`, based on current main `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- The first automatic run `44230418928` was cancelled during the test-suite step; no conclusion is drawn from that cancelled attempt.
- The subsequent automatic PR run `44230605506` completed. The full `quality` job passed all 76 steps, including build, complete test suite, migration audit policy tests, runtime boundary verification, the full set of disposable PostgreSQL qualifications, and the production migration plan-only fixture. No steps failed or were skipped.
- The separate `web-quality` job passed its web build and all 26 web tests, then failed only at the restored direct `npm audit --audit-level=moderate` step. npm reported five high-severity path findings for the same picomatch GHSA-fc5q-39xc-vjpf advisory; this is the known unresolved toolchain dependency finding. No waiver, local patch, dependency exclusion or audit bypass was reintroduced.
- The migration plan-only qualification passed: all 50 pending inventory entries were enumerated with SHA-256 checksums and the disposable fixture's 105-row ledger/catalog were unchanged. This is plan-only validation and is not authorization to execute migrations against production.
- Net result: **all GHM quality and database/security qualification checks passed; the overall PR workflow remains red solely because the intentionally enforced web dependency audit detects the unresolved picomatch advisory.**
- No further CI rerun is warranted until the advisory/dependency finding changes or a substantive source change requires validation. Keep PR #298 draft. PR #297 remains the stale-base alternative and is not to be merged. Production batch manifest remains empty; no live production migration, deployment, Render change, payment activation or paid resource was used.


## Separate Business Identity INSERT ACL migration disposition — 18 November 2026, 03:34 UTC

- Re-read PR #296 and its dedicated hosting/credentials handover before considering its relationship to this branch. PR #296 is draft/non-mergeable, exact head `0228893c6a4597b15e10a619cb1e1a55121462dc`, based on stale `7236c82aff4fe6f100e20740c0bac8b9b94fe789`; current main is `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- PR #296 adds migration `20261116200000_narrow_business_identity_runtime_insert.sql` and its contract test. The migration is absent from current main and from this branch's 50-entry pending inventory. Do not silently absorb it into this runner PR or add it to the pending inventory/manifest: its exact position and full production-prefix dependencies still need reconciliation.
- PR #296's exact-head CI run `43951246621` passed both quality and web-quality. This validates that PR's code at its exact head only; it does not authorize production application or remove its stale-base status.
- Keep the ACL migration as a separately tracked pending change. If it is later accepted into current main, its inventory inclusion must be a separately reviewed change to the exact pending prefix, with checksums and disposable PostgreSQL qualification. No production batch can be selected while the execution manifest is empty.
- PR #296's production catalog evidence is read-only. Do not execute its revoke/grant migration, alter production roles, or change any ACL under this runner work.
- No PR #296 code was copied, rebased, cherry-picked or modified by this branch reconciliation. No CI rerun or production action occurred.


## Live production audit access blocker — 18 November 2026

- Re-read this PR #298 handover, the role-separation handover, the production migration reconciliation handover and PR #298 metadata before the read-only Render query.
- The existing Render `ghm-db` query interface connected as `session_user=ghm_app_user`, `current_user=ghm_db_user`. SELECT on `ghm.ghm_schema_migrations` failed with SQLSTATE 42501. The table is owned by `ghm_schema_owner`, and the current connection cannot SET ROLE to that owner.
- The visible `n_live_tup=105` statistic has a last auto-analyze date of 2026-09-21. It is not an exact or current ledger count. The 50-entry pending inventory remains a repository candidate, not a live production pending-list assertion.
- Live role catalogue confirms `ghm_db_user` still has CREATEROLE/CREATEDB and ADMIN OPTION over multiple protected roles, while `ghm_app_user` can SET ROLE `ghm_db_user`. Catalog search returned zero `ghm.gateway_%` and zero `ghm.assert_actor_gateway%` functions in schema `ghm`.
- Do not grant ledger access to the application login or alter production roles as an audit workaround. Resolve the existing Render role-separation support escalation and use the intended dedicated `ghm_migrator` identity with verified TLS and its documented schema-owner SET path. Obtain a fresh verified backup before any production change.
- No production ledger rows/checksums were read, no production migration was run, and no role/ACL/credential/secret/Render/deployment state was changed. No CI was run. The execution manifest remains empty and PR #298 remains draft.


## Exact production migrator contract failure — 18 November 2026

- Re-read this handover, the current role-separation and production reconciliation handovers, PR #298 and the exact source contract before the live read-only checks.
- The production `ghm_migrator` role exists and has safe basic role flags; its only direct membership is `ghm_schema_owner` with ADMIN=false / INHERIT=false / SET=true.
- The exact runner contract still fails because `ghm_db_user` is an ADMIN OPTION member of `ghm_migrator` (one member where zero is expected) and also an ADMIN OPTION member of `ghm_schema_owner` (two owner members where one is expected).
- The exact runner privilege predicate reports migrator relation/sequence privileges. ACL expansion confirms explicit grants by `ghm_schema_owner` on 16 relations (SELECT/INSERT/UPDATE/DELETE) and 23 sequences (SELECT/USAGE); no migrator-specific default ACL entries were found. The source migration/operation responsible has not yet been identified. Do not revoke or mutate these ACLs based on inference.
- The ledger ACL grants SELECT to `ghm_auditor`, not directly to `ghm_migrator`. The approved audit obtains ledger access only after the intended `SET ROLE ghm_schema_owner`, but the available Render query connection is `ghm_app_user` / `ghm_db_user` and cannot SET to the migrator or owner. Therefore the exact production ledger audit remains blocked.
- PR #298's 50-migration candidate and plan-only qualification do not establish production state. Keep its execution manifest empty and PR draft. Do not run production migrations, alter roles/grants, or use the app/admin connector as a substitute for the dedicated migrator login.
- No production mutation, deployment, paid service or CI run occurred during this inspection.


## 18 November 2026 — source trace of live migrator ACLs

Before tracing, the current three handovers, PR #298 metadata, migration runner contract, historical PostgreSQL role-separation runbook/SQL plan, and relevant migration source files were re-read.

**Source attribution — table grants**
- `database/migrations/20260914100000_create_opportunity_core.sql` explicitly grants `SELECT, INSERT, UPDATE, DELETE` on `ghm.opportunity`, `ghm.opportunity_type`, `ghm.country`, and `ghm.currency` to `ghm_migrator`.
- `database/migrations/20260916010000_create_opportunity_participant.sql` explicitly grants the same four table privileges on `ghm.opportunity_participant` to `ghm_migrator`.
- `database/migrations/20260915150000_create_commercial_schema.sql` explicitly grants the same four table privileges on 11 Commercial tables: `commercial_plan`, `commercial_plan_version`, `commercial_plan_entitlement`, `commercial_plan_price`, `commercial_trial`, `commercial_subscription`, `commercial_payment_attempt`, `commercial_payment_transaction`, `commercial_provider_event`, `commercial_event`, and `commercial_founding_allocation`.
- These three source migrations account for all 16 table names observed in the live explicit ACL expansion. Live ACLs identify `ghm_schema_owner` as grantor, consistent with execution under the migration owner; the original migration statements identify the source intent. The grants are explicit legacy migration-authority grants, not default ACL entries.

**Source attribution — sequence grants**
- The Opportunity Core migration grants `USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ghm TO ghm_migrator`.
- The Commercial schema migration repeats the same broad all-sequences grant.
- The Opportunity Participant migration adds explicit `USAGE, SELECT` on `ghm.opportunity_participant_id_seq`.
- Current live ACL expansion now counted **24 distinct sequences** (not 23): account_identity, business, business_membership, commercial_event, commercial_founding_allocation, commercial_payment_attempt, commercial_payment_transaction, commercial_plan_entitlement, commercial_plan, commercial_plan_price, commercial_plan_version, commercial_provider_event, commercial_subscription, commercial_trial, country, currency, enquiry, opportunity_capability_requirement, opportunity, opportunity_participant, opportunity_type, project, project_quote, and review identity sequences. Each has explicit `SELECT` and `USAGE` entries granted by `ghm_schema_owner`.
- The two historical `ON ALL SEQUENCES` statements explain the broad grant pattern, but exact per-sequence provenance cannot be proven from the current ACL alone: each all-sequences statement affects only sequences existing at its execution time, and the later participant migration adds one named sequence. Do not claim the two statements alone prove the origin of every one of the 24 current entries without exact production ledger chronology or a historical ACL snapshot.

**Why the current runner rejects this state**
- Current `src/db/migrator-principal.ts` explicitly requires `direct_relation_privileges=false`.
- Current `src/db/migrate.ts` computes that flag using effective `has_table_privilege` / `has_sequence_privilege` checks across every relation in schema `ghm`; the observed explicit grants cause the predicate to fail.
- The same source contract requires zero members of `ghm_migrator` (live count 1) and exactly one member of `ghm_schema_owner` (live count 2). The extra memberships are documented in the historical role-separation runbook as bootstrap-`postgres` grants with ADMIN OPTION. That handover says `ghm_db_user` cannot revoke them and an independent provider/bootstrap-authority path is required.
- The current `20261112170000_revoke_redundant_migrator_business_mapping_lookup.sql` removes one redundant function EXECUTE grant only; it does not remove relation/sequence ACLs or the bootstrap memberships.
- The current forensic connection still cannot authenticate as `ghm_migrator`; therefore no exact live ledger/checksum audit has been completed.

**Disposition and correction**
- Correct the prior 23-sequence statement: current live explicit ACL expansion reports **24 sequences**. The previous count omitted one sequence and must not be repeated.
- The source of all 16 table grants is now attributed to three named migrations. The broad sequence-grant policy is attributed to the Opportunity Core and Commercial schema migrations, with the Participant migration's named sequence grant also identified; exact historical per-sequence application chronology remains unproven.
- Do not add speculative revoke migrations or alter production grants. Any cleanup must be designed against the exact approved migration history, dependency checks, recovery plan, and provider/bootstrap authority path. In particular, do not remove migration-owner privileges merely to make the current preflight pass.
- No production role, membership, grant, ACL, data, migration, credential, Render setting, deployment, payment state, or paid resource was changed. No CI was run.


## 18 November 2026 — gated remediation plan created

A separate design-only plan was added at `docs/security/PRODUCTION_MIGRATOR_AUTHORITY_REMEDIATION_PLAN_2026-11-18.md` (commit `6f1a7808e3372ddd6e89b7a06713c6b74f146d89`). It sequences the work into: preserve evidence and verify backup; provider/bootstrap-owned removal of the two unintended membership edges; narrowly scoped removal of the 16 table and 24 sequence ACL entries while preserving ownership and the intended migrator SET edge; dedicated migrator read-only preflight and exact ledger export; then exact migration reconciliation before any separately approved execution plan.

This is explicitly a design, not an authorization. No production SQL, role/ACL changes, backup operation, secret access, deployment, migration or CI occurred. PR #298 remains draft and its execution manifest remains empty.


## 18 November 2026 — complete live bootstrap membership inventory correction

A fresh read-only production query of `pg_auth_members` and `pg_roles`, checked against the 12 November database grant-authority handover and PostgreSQL role-separation runbook, establishes **six** bootstrap-`postgres` ADMIN OPTION memberships held by `ghm_db_user`: `ghm_actor_gateway`, `ghm_auditor`, `ghm_migrator`, `ghm_payment_provider`, `ghm_runtime`, and `ghm_schema_owner`. Each has ADMIN=true, INHERIT=false, SET=false. Earlier remediation wording that only identified migrator and schema owner was incomplete.

There is a separate non-admin `ghm_db_user -> ghm_runtime` edge granted by `ghm_db_user` (ADMIN=false, INHERIT=true, SET=true). Preserve that runtime SET edge until the separately gated runtime credential cutover is qualified; do not conflate it with the bootstrap ADMIN OPTION edge. `ghm_app_user -> ghm_db_user` remains grantor postgres, ADMIN=false, INHERIT=true, SET=true. `ghm_db_user` remains LOGIN/INHERIT with CREATEDB=true and CREATEROLE=true, so the legacy application authority chain remains a critical isolation issue.

Live role flags show the target actor-gateway, auditor, migrator, payment-provider and runtime roles are non-elevated; auditor and schema owner are NOLOGIN. Those target flags do not neutralize `ghm_db_user`'s admin-option membership authority. Each of the six edges needs purpose-specific dependency and recovery analysis; do not bulk revoke them. The detailed remediation plan now contains the corrected complete inventory (commit `8994a57dc974690473725bed0792189423443fcb`).

No production membership, role attribute, grant, ACL, data, credential, service, setting, deployment, migration, backup or payment state was changed. No CI was run. PR #298 remains draft and its execution manifest remains empty.


## 18 November 2026 — production role/service dependency map

Added `docs/security/PRODUCTION_ROLE_SERVICE_DEPENDENCY_MAP_2026-11-18.md` (commit `f455277958d96783f235a2928073d95a3494c848`). This was preceded by re-reading the existing remediation plan, role/migration/hosting/Auth Issuer/PayFast handovers, relevant PR states, source principal contracts and live Render/DB inventory.

The map distinguishes:
- `ghm_runtime`: intended active Resource API identity; service is GHM-Internal-Runtime. The actual secret value was not read, so the configured identity remains to be independently verified without disclosing the credential.
- `ghm_migrator`: operator-controlled standalone migration identity; no Render service. Current live direct ACL and bootstrap membership contract still fails.
- `ghm_schema_owner`: NOLOGIN schema/ledger ownership identity; preserve its ownership and the one intended migrator SET edge.
- `ghm_actor_gateway`: role exists but has no gateway functions/grants or dedicated production service. The always-on Render host is explicitly cost-blocked; do not use the Resource API or a sandbox service as substitute.
- `ghm_auditor`: NOLOGIN audit privilege role with ledger SELECT; only observed member is legacy `ghm_db_user` via bootstrap ADMIN OPTION, so it is not an independent usable audit login.
- `ghm_payment_provider`: correct production LOGIN role and two PayFast settlement functions now exist; provider can execute both while runtime cannot. This corrects stale older PayFast handovers, but does not mean PayFast is activated or a production callback service exists. PayFast remains paused.
- `ghm_auth_issuer`: source implementation exists, but production role and dedicated service are absent.

Fresh role/privilege checks also reconfirmed six bootstrap-`postgres` ADMIN OPTION memberships held by `ghm_db_user`, plus the separate non-admin runtime SET edge and the app-user-to-db-user legacy edge. A point-in-time `pg_stat_activity` sample showed only the current connector as `ghm_app_user`; it is not evidence that services never connect.

No environment variable values or credentials were read. No role, ACL, service, secret, backup, deployment, migration, payment state or CI was changed. No additional cost.


## 18 November 2026 — production legacy runtime authority finding

Added `docs/security/PRODUCTION_LEGACY_RUNTIME_AUTHORITY_FINDINGS_2026-11-18.md` (commit `3f85fa345bcaa4acc6fb4da8146326efb62060be`). This follows the existing role/service map, migrator remediation plan, legacy role dependency and audit contracts, 12 November database authority handover, migration reconciliation/batch handovers, and PR #275/#298/#296/#299 review.

Critical correction: merged PR #275's dedicated runtime identity guard is **not deployed**. Render service `GHM-Internal-Runtime` is still on `main` at live commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`, with auto-deploy OFF. The 15 November attempts at `8f3ee574...` and `fe5a82d8...` failed. Source at live commit requires generic `DATABASE_URL`; startup only does `SELECT 1`; no runtime principal assertion. The exact current DB login remains unproven because Render env values were not read. Do not treat listening logs as identity proof.

Fresh read-only production checks: `ghm_app_user -> ghm_db_user` is ADMIN=false / INHERIT=true / SET=true. `ghm_db_user` remains LOGIN/INHERIT with CREATEDB and CREATEROLE; it has bootstrap ADMIN OPTION memberships. Effective privilege checks show `ghm_app_user` has public-schema CREATE and SELECT/INSERT/UPDATE/DELETE on five legacy public tables. `ghm_runtime` has no CRUD on those legacy tables; `ghm_migrator` has no direct CRUD there. `ghm_db_user` owns `public`, five legacy tables, five sequences and ten indexes (plus PostgreSQL TOAST internals). No owned routines/default ACLs/large objects/public triggers were returned. Two legacy `public.users` rows remain subject to the separate QuoteFlow provenance hold; no row contents were queried.

Next sequence is explicit: safely establish the dedicated runtime credential identity; resolve failed deployment blockers; perform a controlled, approved cutover and identity qualification; prove recovery/background/support dependencies absent; then separately qualify migrator and legacy object/data disposition. No revokes or role mutations are authorized.

No secret values, user records or env-var values read. No production changes, CI, deployment, migration, backup, payment action or additional cost.


## 18 November 2026 — exact Render deployment blockers established

Added `docs/security/PRODUCTION_RUNTIME_DEPLOYMENT_BLOCKERS_2026-11-18.md` (commit `ddfebdf6fbe90b4d893690254ce6335b0ad09419`). This review first re-read the runtime findings, role/service map, migrator plan, migration reconciliation, database authority, Actor Gateway hosting handover and PR #275/#298/#296/#299.

Render event/log evidence now establishes both November 15 failures:
1. Deploy `dep-dbsv8cuk1f9s73ada3ig`, commit `8f3ee574...`: build command was `npm ci && npm run build`; TypeScript failed TS7016 for `pg`, `express`, `jsonwebtoken`, plus TS7006 implicit-any errors caused by missing Express types. The exact repository manifest has `@types/pg`, `@types/express`, and `@types/jsonwebtoken` in devDependencies. Correct deployment build command is `npm ci --include=dev && npm run build`.
2. Deploy `dep-dbsva6c9v7es73bordlg`, commit `fe5a82d8...`: build succeeded, then process exited with `GHM_ACTOR_GATEWAY_URL is required when production storage is enabled`. This is the intentional fail-closed application guard. No dedicated production Actor Gateway host exists, and the hosting handover blocks another paid always-on service. No placeholder, self-reference, sandbox URL, or bypass is acceptable.

Therefore the build fix alone cannot make PR #275 deployable. Keep auto-deploy OFF; wait for an affordable/approved genuine gateway host, qualify its identity/credential/ACL/signed assertion contract, then prepare the runtime cutover. Do not deploy, edit environment variables, change roles/ACLs, or incur cost.

No Render configuration, secrets, deployment, database, CI, payment state or hosting resource was changed.


## 18 November 2026 19:09Z — owner boundary, production login evidence, and migration-chain review

### Owner's Render access boundary

The owner explicitly confirmed that Render is **read-only for assistant activity**. Permitted work is limited to inspection and read-only queries. Do not create, edit, submit, deploy, restart, pause, delete, or otherwise mutate any Render service, database, setting, environment variable, credential, role, membership, grant, migration, backup, or deployment. This restriction is permanent for this work unless the owner explicitly changes it. Repository review/documentation is separate from Render and must not be represented as a Render change.

### Dedicated gateway login — workstation evidence supplied by owner

The owner successfully authenticated through the existing Render external PostgreSQL hostname using the separately provisioned `ghm_actor_gateway` credential. The supplied psql output established:

- `current_database=ghm_db`
- `session_user=current_user=ghm_actor_gateway`
- TLS 1.3 encryption was negotiated.
- Earlier role-attribute inspection showed LOGIN and NOINHERIT, with no SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, or BYPASSRLS.
- The required bootstrap membership `ghm_db_user -> ghm_actor_gateway` is ADMIN OPTION true, INHERIT false, SET false. Preserve it; the principal-guard migration explicitly allows this exact relationship.
- A first read-only privilege query was interrupted by a server-closed-connection message. psql reconnected successfully; the query did not return a result, and no cause is inferred.
- The subsequent relation privilege query completed and returned zero rows for direct table DML and sequence USAGE/SELECT/UPDATE across `ghm`.

The psql connection used `sslmode=require`; this proves encryption, not strict certificate/hostname verification. Do not describe strict TLS verification as passed.

### Fresh read-only production catalogue inspection

The existing Render PostgreSQL query connector was used only for SELECT/catalogue inspection in the ZAID Technologies workspace against the existing `ghm-db` instance. The observed production state was:

- `ghm` schema exists.
- `ghm_actor_gateway` does not have effective `USAGE` on `ghm`.
- `ghm.assert_actor_gateway(bigint)` is absent.
- No Actor Gateway feature functions were present in `ghm`.
- No direct table DML or sequence privileges were found for `ghm_actor_gateway`.
- The `ghm_db_user -> ghm_actor_gateway` bootstrap membership is preserved as designed.

This means the dedicated database login is qualified for authentication, but the production database API/ACL prerequisite is not installed. The failed psql query must not be mistaken for a privilege denial or proof of a database crash.

### Source and PR reconciliation for the first pending migration prefix

Re-read current `main` source and the migration-batch branch, including the exact SQL for the first pending migrations and signed-assertion replacements.

- `20261110010000_add_business_supplier_classification` creates a SECURITY DEFINER write function accepting caller-supplied `p_account_id`, checks that supplied account's active Business membership, and grants the function to `ghm_runtime`. It does not independently bind that ID to the authenticated request principal.
- `20261110160000_add_admin_capability_catalogue_governance` creates SECURITY DEFINER capability governance functions accepting caller-supplied `p_actor_account_id`, checks the supplied account's administrator status, and grants those functions to `ghm_runtime`.
- `20261110210000_add_actor_gateway_principal_guard` creates the session-user assertion and grants the gateway schema USAGE/function EXECUTE, but explicitly states it is not yet wired to feature RPCs. It does not by itself complete the identity cutover.
- `20261110250000_add_gateway_capability_governance` initially adds unsigned gateway wrappers. Subsequent migrations replace these with one-use HMAC assertions: capability governance (`20261111020000`), supplier classification (`20261111030000`), Business profile (`20261111040000`), registration/self identity (`20261111050000`), and request-context binding (`20261111060000`). `20261111070000` adds signed Business Capability mutation operations.
- `20261117010000` and `20261117020000` are explicit post-deployment cutover/revocation migrations. Their SQL preconditions require the signed gateway operations and, in the operational comments, a deployed gateway with passing authenticated end-to-end tests. They must not be pulled forward into a pre-deployment batch.

The migration runner's execution normalizer strips each migration's outer BEGIN/COMMIT wrappers so the selected batch executes inside the runner's transaction. This preserves batch atomicity; do not treat the intermediate migration states as externally committed states within one correctly executed batch.

The exact first safe production prefix is **not yet selected**. It must include all required gateway assertion and feature dependencies while respecting the separate post-deployment revocation gates and currently active Resource API route behavior. A successful SQL login alone does not satisfy those gates.

### PR #298 exact status and remaining execution gates

- PR #298 remains draft/open/unmerged at head `f2e280005ce7f9bfc947a19ecbb6144957d4a340`, based on `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- Current `main` was observed at `ddb31ff59ab470973edf60a5078a75e5f962f803`; the PR branch is 136 commits ahead and 4 behind. Rebase/current-main reconciliation and exact-head CI are required before any merge decision.
- The branch's production execution manifest remains empty (`[]`). Its 50-entry pending inventory is not a live ledger refresh or execution authorization.
- No PR-triggered workflow runs, combined commit statuses, or review submissions were returned for that exact PR head during this inspection. Do not claim CI passed.
- PR #296 remains draft/open/unmerged and proposes an additional pending Business Identity ACL migration. If it is ever merged, refresh the complete production pending inventory and ordering before any batch plan.
- The 105-row production ledger export remains a dated snapshot through 2026-11-09, not a current pre-execution ledger.
- Production migration execution remains blocked by the dedicated migrator authority/ACL preflight, current live ledger refresh, fresh recoverable backup evidence, and the unapproved paid always-on Actor Gateway hosting decision.
- The local PostgreSQL 18.6 restore of the November 14 logical export is historical restore evidence only; it is not a fresh backup or a Render PITR/recovery test.

### Disposition

No production migration, role, membership, grant, ACL, data, credential, backup, Render setting, service, environment variable, deployment, payment state, or paid resource was changed. No Render write action was performed. No production execution batch was selected or authorized. The next work is source-to-ledger dependency and active-route cutover reconciliation, followed by refreshed evidence through the already-approved dedicated paths; do not repeat the successful gateway login test without a specific changed condition.


## 18 November 2026 19:16Z — active Resource API route-to-gateway cutover trace

### Source revision and PR state rechecked

This pass read the existing handover first, then current `main` route composition and gateway implementation, and checked the relevant merged/open PRs and changed-file lists.

- Current `main` remains `ddb31ff59ab470973edf60a5078a75e5f962f803` at the recorded comparison.
- PR #272 (unified Actor Gateway integration stack) is merged.
- PR #275 (Resource API runtime database login isolation) is merged. Its production config requires the runtime principal and retains the fail-closed gateway routing behavior.
- PR #296 (Business Identity runtime INSERT ACL narrowing) remains draft/open/unmerged.
- PR #297 (explicit contiguous production migration batches) remains draft/open/unmerged at head `304da520c5cfe1e77b479a97dfdd9d951fa6e245`.
- PR #298 (reviewed Actor Gateway migration batches) remains draft/open/unmerged at head `f2e280005ce7f9bfc947a19ecbb6144957d4a340`.
- The migration-batches branch is 137 commits ahead and 4 behind current `main`; its merge base is `b73839b27ac90446650f921d3e8ce1b5de041f04`. It is stale and must be reconciled before any PR/merge decision. No PR was merged and no CI was triggered by this documentation update.

### Active Resource API routing behavior in current main

The following route groups already have HTTP gateway clients and select them when `GHM_ACTOR_GATEWAY_URL` is configured. In production, the relevant `gatewayRequired` flags make the legacy repository fallback unavailable (the route returns 503 if the gateway client is absent). This is an existing fail-closed cutover design, not a request to add a fallback.

| Resource API surface | Gateway operations / route group | Production behavior |
|---|---|---|
| Business supplier classification | `PATCH /api/v1/businesses/:businessId` with only `isSupplier`; gateway `PUT /v1/businesses/:businessId/supplier-classification` | Gateway required; absent client returns 503 |
| Business profile update | `PATCH /api/v1/businesses/:businessId` for non-supplier profile fields; gateway `PATCH /v1/businesses/:businessId/profile` | Gateway required; absent client returns 503 |
| Capability governance | Capability catalogue list, draft create/update, lifecycle transition; gateway `/v1/admin/capabilities...` | Router has no direct repository fallback; absent gateway client returns 503 |
| Business capability assertions and evidence | Replace/verify capability assertions, submit/review evidence; gateway `/v1/businesses/:businessId/capabilities`, `/v1/business-capabilities/:id/verification`, `/v1/business-capability-evidence...` | Gateway required in production |
| Business registration identity | Read/update registration identity routes; gateway `/v1/businesses/:businessId/registration-identity` | Gateway required in production |
| Business hours | List/replace hours; gateway `/v1/businesses/:businessId/hours` | Gateway required in production |
| Saved Businesses | List/get/create/delete; gateway `/v1/saved-businesses...` | Gateway required in production |
| Trust scores | List/get/calculate; gateway `/v1/trust-scores...` | Gateway required in production |
| Business logo and storage metadata | Logo binding and object metadata lifecycle; gateway `/v1/businesses/:businessId/logo` and `/v1/storage/metadata...` | Gateway required in production when storage is enabled |
| Campaign/directory review authority | Campaign and directory review operations through the gateway-backed repository/readers | Production gateway-required repository behavior |

The gateway server currently wires the corresponding Postgres readers for capability governance, supplier classification, Business profile, Business Capability mutations/evidence, registration identity, hours, saved Businesses, trust scores, logos, storage metadata, Connect provisioning, campaign/directory review, and additional commercial-document operations. The gateway app authenticates the bearer token itself, derives the account ID from the verified access token, and passes that verified identity to each reader. The database reader creates a one-use HMAC assertion bound to actor, operation, and operation context before calling the signed `ghm.gateway_*` function.

### Important runtime startup distinction

Current `src/config.ts` parses `GHM_ACTOR_GATEWAY_URL` as optional. However, in production with storage configured, `createApp` throws during startup if the URL is absent; it also requires the storage workflow attestation secret. The November 18 deployment blocker handover records that the prior deployment reached this exact fail-closed guard after the build fix. The other gateway-required routes fail closed with 503 if their client is absent. Therefore the runtime URL is not a harmless optional setting for a production deployment with storage enabled.

Do not insert a placeholder URL, point the runtime to itself, use a sandbox endpoint, or deploy around the startup guard. The dedicated gateway host is a separate always-on Render Web Service in the selected architecture, and its recurring cost remains unapproved. No existing service is an approved substitute.

### Post-deployment revocations remain separate

The two migrations introduced by draft PR #297 are explicitly post-deployment cutover operations:

- `20261117010000_revoke_runtime_business_registration_identity_write` checks that the signed gateway registration function exists, is SECURITY DEFINER/owned by `ghm_schema_owner`, and is executable by `ghm_actor_gateway` but not `ghm_runtime`; its header requires a deployed gateway, authenticated registration read/write end-to-end tests, and a stable HTTPS runtime URL before execution.
- `20261117020000_revoke_runtime_capability_governance` checks the signed verifier and all four signed capability operations, their owner, SECURITY DEFINER setting, fixed `pg_catalog,ghm,pg_temp` search path, gateway EXECUTE, and absence of runtime EXECUTE before revoking the three legacy runtime governance functions. Its header requires deployed gateway startup checks and authenticated capability list/create/update/transition end-to-end tests.

These migrations must remain outside the pre-deployment installation batch. They are not generic ACL cleanup and must not be executed until their application-level operational gates have actually passed.

### Cutover conclusion

The active Resource API is already structured for a fail-closed HTTP gateway cutover. The missing production pieces are not additional client code or another connection-string attempt: they are (1) a cost-approved dedicated gateway host, (2) the exact signed gateway database function/ACL migration chain installed through a reviewed contiguous batch, (3) a strict verified-TLS database connection for the production gateway, and (4) authenticated positive/negative end-to-end checks before the separate legacy revocation migrations.

The current production catalogue still lacks `ghm_actor_gateway` schema USAGE and gateway functions. Thus the current main gateway server would fail its startup ACL assertion if pointed at production today. Do not deploy it or set the runtime URL before the DB prerequisite chain and host/cost gates are resolved.

### Disposition

This is source/PR/handover inspection and documentation only. No Render write action, production database mutation, migration, grant, role change, deployment, CI run, new branch, paid service, or application data change occurred. The next safe work is a migration-to-reader dependency matrix (each reader operation ↔ exact SQL function signature ↔ migration version ↔ grant principal ↔ route smoke test) and then an exact-main reconciliation of PR #297/#298. No production batch is selected or authorized.


## 18 November 2026 19:20Z — reader-to-SQL function and startup ACL dependency matrix

### Exact runtime startup contract

Re-read `src/actor-gateway/database-privileges.ts` and `src/actor-gateway/server.ts` on current `main`.

The gateway does not merely check that one assertion function exists. Before opening its HTTP listener, it:

1. verifies `session_user=current_user` is the dedicated gateway identity and validates its login attributes/membership boundary;
2. verifies database CONNECT, no database CREATE, schema `ghm` USAGE, no schema CREATE;
3. verifies zero direct table/view/sequence privileges;
4. compares the complete effective EXECUTE set against the explicit 39-signature allowlist in `src/actor-gateway/database-privileges.ts` (with a narrowly documented temporary allowance for the three campaign/directory-review functions to be absent);
5. rejects any gateway function executable by PUBLIC or `ghm_runtime`;
6. rejects unsafe default function grants, unsafe SECURITY DEFINER owner/search_path settings, public SECURITY DEFINER execution, and unexpected function grantees.

This exact startup contract is stricter than the earlier single-function presence check. The current production catalogue, which has no gateway schema USAGE and no gateway functions, cannot pass it.

### Reader-to-function mapping verified from current main

| Reader / API operation | Exact SQL function(s) called | Migration family identified |
|---|---|---|
| Actor identity read | `gateway_get_actor_identity` | `20261110210000` principal guard + `20261110220000` self-identity read |
| Registration identity read/write | `gateway_read_business_registration_identity`, `gateway_update_business_registration_identity` | `20261110230000`, `20261110233000`, then signed binding `20261111050000` |
| Capability governance | `gateway_list_capabilities`, `gateway_create_capability_draft`, `gateway_update_capability_draft`, `gateway_transition_capability_lifecycle` | `20261110250000`, then signed assertion binding `20261111020000` |
| Supplier classification | `gateway_update_business_supplier_classification` | `20261110260000`, then signed binding `20261111030000` |
| Business profile | `gateway_update_business_profile` | `20261110265000`, `20261110270000`, then signed binding `20261111040000` |
| Business Capability assertions/evidence | `gateway_replace_business_capability_assertions`, `gateway_transition_business_capability_verification`, `gateway_submit_business_capability_evidence`, `gateway_transition_business_capability_evidence` | signed mutation family `20261111070000` |
| Saved Businesses | `gateway_list_saved_businesses`, `gateway_get_saved_business`, `gateway_create_saved_business`, `gateway_delete_saved_business` | `20261111100000` |
| Business hours | `gateway_get_business_hours`, `gateway_replace_business_hours` | `20261111130000` |
| Trust scores | `gateway_get_trust_score`, `gateway_list_trust_scores`, `gateway_calculate_business_trust_score` | `20261111150000` plus read-projection support migrations |
| Business logo binding | `gateway_set_business_logo_object` | `20261111160000` |
| Storage object metadata | `gateway_storage_create_pending`, `gateway_storage_get_object`, `gateway_storage_mark_deletion_pending`, `gateway_storage_mark_available`, `gateway_storage_mark_deleted` | Storage metadata gateway migration family; exact full ordered migration mapping remains to be verified against the complete migration directory before batch selection |
| Campaign/directory review | `gateway_create_campaign`, `gateway_update_campaign`, `gateway_get_business_directory_review_presentation` | Campaign/directory-review gateway migration family; this is the only explicitly optional three-function subset in the current startup allowlist |
| Connect Business provisioning | `gateway_provision_connect_business` | Connect provisioning migration family; current browser path does not establish a requirement to wire this route without a confirmed caller |
| Commercial document/payment preparation | commercial authority, approval, and payment-prepare gateway functions | separate commercial workflow migrations and operational authorization gates; PayFast remains paused and excluded from current work |

The exact function signatures and complete expected allowlist are maintained in source, not duplicated here. Before execution, derive the manifest from that source and compare every signature/grant with the exact SQL migration file and live production ledger.

### Shared signed-assertion dependency

The HMAC assertion verifier `ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text)` is part of the gateway's expected executable set. The signed feature functions depend on it and on the provisioned assertion-secret/nonce objects. The current source migration family creates/replaces the verifier in the signed gateway migration files, and the repository contains a dedicated database-verifier secret provisioning workflow. This secret is not the database password and must never be pasted into chat, committed to Git, or placed in an unreviewed environment.

The production plan must therefore explicitly account for:
- the migration that creates the secret and nonce storage objects;
- an administrator-authorized, one-time secret provisioning path;
- matching the exact secret to the gateway service only after the hosting/cost gate is approved;
- a real signed request proving actor, operation, context, nonce replay rejection and failure on forged assertions.

Do not execute a migration prefix that leaves the service unable to pass its exact startup allowlist or signed assertion checks.

### Consequence for the production batch boundary

A pre-deployment batch must install the full database API/ACL contract required by the actual intended gateway deployment, including all functions that the server's exact allowlist expects (or the source-approved optional campaign subset). The two `20261117010000` / `20261117020000` legacy runtime revocation migrations remain post-deployment gates and must be excluded from this installation batch.

This matrix is a source mapping, not production execution authorization. The exact storage, campaign, commercial and Connect provisioning migration versions, plus the complete pending prefix and checksums, still require a fresh current-main migration-directory/ledger reconciliation. PR #297/#298 remain drafts and the batch branch is stale.

### Disposition

Source-only inspection and handover update. No Render writes, no SQL mutation, no migration execution, no role/ACL changes, no credential/secret provisioning, no CI, no deploy, no new service or paid resource. The next work is to resolve the remaining migration-version mapping from current main and reconcile the complete source migration order against the administrator-supplied production ledger evidence. The current dated ledger snapshot is insufficient for a batch.


---

## Follow-up source reconciliation — 18 November 2026, 19:35 SAST

This section records the next read-only source pass so that later sessions do not repeat it.

### Refs and inventory checked

- Read this handover at branch `feat/actor-gateway-production-migration-batches` before continuing.
- Compared that branch with current `main`: the branch remains divergent, 139 commits ahead and 4 behind; merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`. Do not merge, rebase, or treat the branch inventory as a current-main authority.
- Enumerated the complete `database/migrations` directory on both `main` and the migration-batches branch. Both currently expose 145 migration files and the same campaign/directory-review migration filenames.
- The current-main Actor Gateway privilege source is `src/actor-gateway/database-privileges.ts` (blob `41021badb1b2760ef5e26c1ab882ba0798316e0d`). It lists the three campaign/directory-review signed functions as the only optional subset:
  - `ghm.gateway_create_campaign(bigint, bigint, uuid, text, text, bigint, text)`
  - `ghm.gateway_update_campaign(bigint, bigint, uuid, text, text, bigint, text, text)`
  - `ghm.gateway_get_business_directory_review_presentation(bigint, bigint, uuid, text, text, bigint)`

### Confirmed legacy SQL versus missing signed replacement

The complete migration-directory listing and exact SQL reads establish the following:

1. `20260918180000_create_campaign.sql` creates only the legacy `ghm.create_campaign(bigint,bigint,text)` and `ghm.update_campaign(bigint,bigint,text,text)`. They are granted to `ghm_runtime`, not the signed gateway principal.
2. `20260918180100_fix_campaign_function_column_ambiguity.sql` replaces those same legacy signatures; it does not create signed gateway wrappers.
3. `20261105230000_create_founder_directory_review.sql` creates the legacy `ghm.get_business_directory_review_presentation(bigint,bigint)` (along with the legacy directory-review workflow functions), granted to `ghm_runtime`. It does not create `ghm.gateway_get_business_directory_review_presentation(...)`.
4. No migration filename in the complete 145-file directory on either checked ref identifies a campaign/directory-review signed gateway migration. The pending migration inventories (48/50 entries in their respective PR revisions) likewise have no such named migration.
5. Exact source search on current main did not return any other SQL definition for the three signed function names. The SQL definitions above are the confirmed legacy implementations, not evidence that the signed replacements exist.

**Conclusion:** the three signed campaign/directory-review SQL counterparts are not present in the inspected migration directory on either ref. This is now a confirmed repository-source gap, not merely an unclear mapping. Do not claim those three functions are installed or migration-ready.

### Additional runtime wiring finding

The three operations are not merely dormant optional capabilities:

- `src/actor-gateway/server.ts` unconditionally constructs `PostgresCampaignDirectoryReviewGatewayReader` and injects it as `campaignDirectoryReviewReader`.
- `src/actor-gateway/app.ts` registers POST `/v1/campaigns`, PATCH `/v1/campaigns/:campaignId`, and GET `/v1/businesses/:businessId/directory-review-presentation`; those handlers call the reader.
- The reader directly invokes the three missing signed SQL functions.

Therefore, the startup allowlist's optional-subset tolerance only allows the service to start without those functions; it does **not** make the wired endpoints operational. The deployment contract must either (a) add and qualify the three signed SQL implementations and their ACL/assertion contracts, or (b) explicitly remove/disable the corresponding routes and reader wiring and revise the allowlist/tests. No implementation choice has been made in this handover update.

### Exact source evidence already inspected

- `src/actor-gateway/campaign-directory-review-reader.ts` blob `e0674ef958d8c4e496c0dd0c88bd8145ee83fae5`: signed assertion operations `campaign.create`, `campaign.update`, `directory_review.presentation.read` and direct calls to the three signed function names.
- `src/actor-gateway/app.ts` blob `dc66f24318fd9c720628d365196484e6df5b0231`: three HTTP handlers listed above.
- `src/actor-gateway/server.ts`: unconditional reader construction and dependency injection.
- `20260918180000_create_campaign.sql` blob `6effa1cac6e2ce918a34b3ffff0c85334f505140`.
- `20260918180100_fix_campaign_function_column_ambiguity.sql` blob `c1de6b8a1945c40edd7d31bfe20c3da031ccd6fc`.
- `20261105230000_create_founder_directory_review.sql` blob `fb4f4dfc1579c93f6314f2af0c5f7c1f555022c6`.

### Other verified migration-family details

- `20261112140000_add_signed_storage_metadata_actor_gateway.sql` defines the signed storage metadata create/get/delete-pending functions and the signed capability assertion verifier, with schema-owner ownership, pinned search_path and explicit gateway EXECUTE grants.
- `20261112150000_add_storage_provider_workflow_attestation.sql` defines storage-provider attestation secret/nonce storage and the signed mark-available/mark-deleted functions. Its secret/nonce tables are not directly accessible to the gateway.
- Commercial migration source was read for `20261116150000` through `20261116190000`. The payment-prepare migration depends on the commercial consent evidence and authority/approval chain; PayFast remains paused and is not an activation workstream.
- The global security-definer search_path pin migration `20261112090000_pin_security_definer_search_path.sql` sets `pg_catalog, ghm, pg_temp`. The two 17 November legacy runtime revocation migrations must be evaluated against that exact pinned path and remain post-deployment cutover gates as documented elsewhere in this handover.

### Next work; do not repeat the checks above

1. Reconcile the 39 required/optional function signatures against every current-main migration definition, grant, owner, SECURITY DEFINER setting, and pinned search_path. Maintain a signature-to-migration matrix; do not infer from filenames.
2. Review the exact current-main dependency order for the remaining 36 functions, including the assertion verifier/secret/nonce prerequisites and storage/commercial dependencies.
3. Reconcile the four commits by which the migration-batches branch is behind current main before any branch integration decision.
4. Obtain fresh administrator-authorized production ledger evidence and a recoverable backup before deriving any production batch. The dated 105-row ledger snapshot is not sufficient authorization.
5. Keep the production batch manifest empty until the above evidence and gates are complete.

No production SQL, migration, role, ACL, credential, Render configuration, deployment, or hosting change was performed. Render remains read-only. This was a documentation-only update on the existing migration-batches branch; no code, migration, PR status, or execution manifest was changed.


---

## Follow-up signature/security reconciliation — 18 November 2026, 19:37 SAST

This pass continued from the previous handover section. It re-read this handover first and inspected the current-main privilege allowlist and all 50 migration candidates listed in the branch's `config/pending-migrations.production.json`. The migration SQL was fetched from **current main**, not assumed to be identical to the stale feature branch.

### Allowlist reconciliation: 39 total / 36 required / 3 optional

Current-main `src/actor-gateway/database-privileges.ts` (blob `41021badb1b2760ef5e26c1ab882ba0798316e0d`) contains 39 unique expected signatures. The three optional signatures are the previously documented campaign/directory-review functions. The remaining 36 required signatures have SQL definitions in the inspected current-main migration sources, grouped as follows:

| Function family | Required signatures | Current-main migration source |
|---|---:|---|
| Signed capability assertion verifier + capability catalogue read/write/lifecycle | 5 | `20261111060000_bind_gateway_assertions_to_request_context.sql` |
| Signed supplier classification | 1 | `20261111060000_bind_gateway_assertions_to_request_context.sql` |
| Signed business profile update | 1 | `20261111060000_bind_gateway_assertions_to_request_context.sql` |
| Signed actor identity read | 1 | `20261111060000_bind_gateway_assertions_to_request_context.sql` |
| Signed registration identity read/write | 2 | `20261111060000_bind_gateway_assertions_to_request_context.sql` |
| Signed business capability mutations | 4 | `20261111070000_add_signed_business_capability_mutations.sql` |
| Signed Saved Businesses | 4 | `20261111100000_add_signed_saved_business_gateway.sql` |
| Signed Business Hours | 2 | `20261111130000_add_signed_business_hours_gateway.sql`; `20261111140000_add_business_hours_read_projections.sql` |
| Signed Trust Score | 3 | `20261111150000_add_signed_trust_score_gateway.sql`; `20261111170000_add_trust_score_read_projections.sql` |
| Signed Business Logo | 1 | `20261111160000_add_signed_business_logo_gateway.sql` |
| Signed Connect Business provisioning | 1 | `20261112080000_signed_connect_business_provisioning_gateway.sql` |
| Signed Storage metadata/provider workflow | 5 | `20261112140000_add_signed_storage_metadata_actor_gateway.sql`; `20261112150000_add_storage_provider_workflow_attestation.sql` |
| Commercial authority assertion + authority gateway | 2 | `20261116170000_add_founder_only_commercial_document_authority_gateway.sql` |
| Commercial approval assertion + approval gateway | 2 | `20261116180000_add_founder_only_commercial_document_approval_transition.sql` |
| Commercial payment-preparation assertion + gateway | 2 | `20261116190000_add_commercial_consent_payment_prepare_gateway.sql` |
| **Total** | **36** | |

The 36 count comprises four assertion verifiers and 32 operational gateway functions. The 3 optional campaign/directory-review signatures remain absent from migration SQL, as documented in the previous section.

### Security source review

For the listed signed function families, the inspected SQL shows the intended SECURITY DEFINER pattern: `ghm_schema_owner` ownership, pinned search_path, revocation from `PUBLIC`/runtime/migrator as applicable, and EXECUTE grants to `ghm_actor_gateway`. The global normalizer migration `20261112090000_pin_security_definer_search_path.sql` explicitly audits SECURITY DEFINER ownership and sets the path to `pg_catalog, ghm, pg_temp`.

This is a **source-level review only**. It does not establish that any of these functions, grants, roles, tables or secrets exist in production, nor does it validate the live role membership/admin-option issue.

### Newly confirmed post-deployment migration defect

Current-main `database/migrations/20261117020000_revoke_runtime_capability_governance.sql` (blob `84c61e9c2c06f53a86b7a63b26e9329a609c5741`) checks the four signed capability gateway functions using:

```sql
p.proconfig @> ARRAY['search_path=pg_catalog, ghm']
```

But the preceding global migration `20261112090000_pin_security_definer_search_path.sql` (blob `d0d3ce9eb9d76ac23ba6ec9d8f27df7ec30f73df`) sets every SECURITY DEFINER function to:

```sql
search_path = pg_catalog, ghm, pg_temp
```

The Actor Gateway startup checker in `src/actor-gateway/database-privileges.ts` also explicitly expects `search_path=pg_catalog, ghm, pg_temp` (lines 198–199 in the inspected blob).

**These contracts conflict.** Once the global pin migration has run, the exact `proconfig` check in `20261117020000` will not match the resulting path for the signed capability functions. This is a deterministic source-level defect in a post-deployment revocation migration. Do not run `20261117020000` as currently written. It needs a reviewed correction that agrees with the global normalizer and startup checker, plus exact-head qualification before it can become a post-deployment gate.

The registration revocation migration `20261117010000` validates SECURITY DEFINER and schema-owner ownership, but does not have this explicit search_path equality check.

### Migration order/dependency observations

- The final six-argument request-context assertion contract is established by `20261111060000`; earlier signed migrations in the sequence contain earlier verifier/function shapes. Treat the ordered prefix as a chain; do not cherry-pick later family files out of sequence.
- `20261112080000` creates signed Connect provisioning and uses the six-argument request-context assertion contract.
- `20261112090000` normalizes all SECURITY DEFINER function owners/search paths and therefore must be evaluated after the function definitions it is intended to normalize.
- Storage provider workflow attestation (`20261112150000`) is a separate provider assertion domain; its verifier is deliberately not executable by the Actor Gateway role.
- Commercial migrations `20261116150000`–`20261116190000` build consent evidence, approval authority, founder-only authority/approval transitions and payment preparation in dependency order. PayFast remains paused; source mapping is not payment activation approval.
- `20261117010000` and `20261117020000` remain post-deployment revocation candidates, not pre-deployment installation steps. The latter is currently defective as noted above.

### Branch/current-main caution

The 50-entry pending list read for candidate enumeration is from the migration-batches branch. The SQL files above were read from current `main`; this was deliberate so that the function mapping is not silently attributed to stale branch contents. The migration-batches branch remains divergent and must be reconciled before any integration decision. The inventory is not an execution manifest.

### Next actions; do not repeat this source pass

1. Resolve the `20261117020000` search_path contradiction in source, with a narrowly scoped change and tests on the exact intended post-deployment state. Do not execute it in production.
2. Complete dependency-level review of the 36 mapped functions (including underlying table/sequence dependencies, signed assertion operations, route call sites and grants) and confirm no migration file has drifted between current main and the stale branch.
3. Resolve the three optional campaign/directory-review functions: implement signed SQL wrappers or disable the corresponding reader/routes and revise startup allowlist/tests.
4. Reconcile current-main migration order and checksums with fresh, administrator-authorized production ledger evidence and a recoverable backup before any batch is proposed.
5. Keep the production execution manifest empty and keep Render read-only.

No production SQL, migration, role, ACL, credential, Render configuration, deployment, or hosting change was performed. This update only records source findings in the existing handover on the existing migration-batches branch.


---

## Follow-up review of the search_path correction candidate — 18 November 2026, 19:44 SAST

Re-read this handover first, then inspected PR #298's exact head and changed-file patch before considering any code action.

### What changed since the previous note

- PR #298 head is now `3900bf7dbffe71226436e57e8d193603c43f07e2` (branch `feat/actor-gateway-production-migration-batches`); PR remains open, draft, and non-mergeable.
- The migration-batches branch's `database/migrations/20261117020000_revoke_runtime_capability_governance.sql` (blob `9083f813c999f6054b8066d12ffafd4f9a8e1a5e`) contains a proposed correction to the mainline search_path guard. It uses `pg_options_to_table(COALESCE(p.proconfig, ARRAY[]::text[]))` to extract the configured search_path and normalizes whitespace before comparing with `pg_catalog,ghm,pg_temp`. It also checks schema-owner, SECURITY DEFINER and both role EXECUTE conditions.
- This is consistent with the global normalizer and Actor Gateway startup checker. It corrects the previously identified mismatch **on the PR branch only**. Current `main` remains at `ddb31ff59ab470973edf60a5078a75e5f962f803` and still has the old exact-array comparison.
- PR #298 changed-file inventory includes the migration, runner/config, CI workflow, docs and tests, but no dedicated test was identified that executes or statically verifies this migration's parsed search_path guard.
- Exact PR-head workflow lookup returned zero workflow runs; combined commit status returned zero statuses. Therefore the correction has **no observed CI qualification** at this head. Do not describe it as tested, passed, merged or deployed.
- PR #298 base SHA remains `b73839b27ac90446650f921d3e8ce1b5de041f04`, while current main is `ddb31ff59ab470973edf60a5078a75e5f962f803`. The branch remains stale/divergent; do not merge it or cherry-pick the migration correction without first reconciling its base and exact-head checks.

### Decision

Do not duplicate the correction on another branch or alter current main in this pass. Retain the PR-branch implementation as a **candidate fix**, with qualification outstanding. The production migration remains prohibited until the branch/base issue, exact SQL qualification and all production cutover prerequisites are resolved.

### No repeated work

The source-level mismatch itself is already documented above. Future sessions should use this section as the status record: mainline defective; PR #298 contains a candidate parser-based correction; no exact-head CI evidence; PR draft/stale/non-mergeable.

No code, migration, PR state, production database, Render service, environment variable, role, ACL, deployment, or hosting resource was changed in this pass. Only this handover was updated.


---

## Follow-up migration-runner integration review — 18 November 2026, 19:47 SAST

Re-read this handover before inspecting the branch delta. Compared current `main` (`ddb31ff59ab470973edf60a5078a75e5f962f803`) with `feat/actor-gateway-production-migration-batches` (`3900bf7dbffe71226436e57e8d193603c43f07e2`, before this documentation commit). GitHub reports the branch is divergent: 143 commits ahead, 4 behind; merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`.

### Files reviewed in the source delta

- `src/db/migrate.ts`
- `src/db/migration-batches.ts`
- `src/db/migration-batches.test.ts`
- `src/db/production-pending-migration-allowlist.ts`
- `config/production-migration-batches.json`
- `scripts/qualify-production-migration-plan-only.mjs`
- `scripts/migration-audit-checksum.test.mjs`
- `package.json`
- `.github/workflows/ci.yml`

### Positive controls confirmed

- Production migration runner checks target DB/host, SSL certificate verification, the authenticated `ghm_migrator` identity, schema-owner role transition and role/privilege boundary before migration work.
- It takes a transaction-scoped advisory lock, reads the ledger, verifies checksums for every already-applied migration, checks the pending allowlist against the exact live pending queue and rejects out-of-order gaps.
- Normal production execution requires `GHM_MIGRATION_BATCH_ID`; batch selection requires an exact contiguous prefix of pending migration version/name identities.
- The production batch manifest is currently an empty array. Therefore no production batch ID can be selected and normal execution fails closed.
- `GHM_MIGRATION_PLAN_ONLY=true` selects the complete pending list for printing, then explicitly rolls back. The plan qualification script asserts the ledger/catalog remain unchanged on its local disposable fixture. This is source inspection only; no qualification script or PostgreSQL migration test was run in this pass.
- The branch's CI workflow creates a disposable PostgreSQL 18 service and has a 25-minute timeout. No workflow was triggered by this review. Respect the owner's instruction not to repeat long disposable-Postgres migration runs without a clear need.

### Critical gap: reviewed batch does not pin migration checksums

`MigrationBatchEntry` in `src/db/migration-batches.ts` contains only `version` and `name`. `selectProductionMigrationBatch()` validates uniqueness/order and compares selected entries with the live pending prefix using only the concatenated version/name identity. It does not compare a reviewed checksum, nor does the batch manifest contain one.

The runner calculates each pending migration's checksum, but that checksum is only used when printing plan-only output or recording the migration after execution. For a pending migration, the selected batch check does not compare the current SQL checksum with a checksum committed at batch review time.

**Consequence:** after a batch ID is reviewed/committed, the SQL body of a pending migration could change while retaining its filename/version/name; the same batch ID would still select it. The existing applied-history checksum checks do not protect not-yet-applied migration bodies. The current empty manifest prevents execution today, but this is a design defect to fix before any non-empty manifest is approved.

Required correction: each batch entry must pin the canonical migration checksum (and selection must compare it with the current repository migration checksum), with tests for modified SQL under an unchanged version/name. Keep the manifest empty until this is implemented and exact-head qualified.

### Plan-only qualification caveat

The plan-only test script builds a local disposable database, seeds a synthetic 105-row ledger (95 repository migrations plus 10 retained historical rows), then runs the plan-only path and checks that no ledger/catalog mutation occurs. It does not prove that the synthetic 105-row ledger matches current production. It is a runner behavior test only. Do not describe it as a live production plan or ledger audit.

### Integration disposition

- The migration-batches branch is not ready to merge based on this review.
- The empty manifest is the correct fail-closed state and must remain empty.
- Before a non-empty batch is approved: pin checksums in batch entries; add unchanged-name/changed-SQL rejection tests; qualify the exact runner source without an unnecessary repeat of the long disposable migration workflow; reconcile all four behind-main commits and the 143-commit ahead delta; and obtain fresh administrator-authorized production ledger plus verified recovery-point evidence.
- The search_path correction candidate in `20261117020000` remains branch-only and unqualified as documented above.
- The three campaign/directory-review signed SQL wrappers remain absent as documented above.

No code, SQL migration, batch manifest, test, CI workflow, PR state, production database, Render setting, credential, role, ACL, deployment, or paid resource was changed. Only this handover was updated.


---

## Implementation checkpoint — reviewed migration checksum pinning — 18 November 2026, 19:51 SAST

Continued from the checksum gap above. Re-read the handover and the exact branch files before making a narrowly scoped source change.

### Changes committed to the existing migration-batches branch

1. `src/db/migration-batches.ts` — commit `720791d12cbeaeaf47aa82bbf5d8f90ab73abfc6`, blob `ac8faf03de76b06d52085bb5c3e6e6000b2e0fa6`.
   - `MigrationBatchEntry` now requires `version`, `name`, and `checksum`.
   - Batch validation requires a lowercase 64-character SHA-256 hex digest.
   - After validating the exact contiguous pending version/name prefix, the selector compares each reviewed checksum with the current repository migration checksum and throws a migration-specific checksum mismatch before returning a selection.
   - The runner already passes loaded `Migration` records containing the canonical `migrationSqlChecksum` result, so this adds a reviewed-body comparison without changing how SQL is executed.

2. `src/db/migration-batches.test.ts` — commit `5c9f30077ce1b3ace530d8935450726158e7dd0e`, blob `faab3286b469552c85353d0c014a149040607235`.
   - Existing selector fixtures now carry valid SHA-256-shaped checksums.
   - Added a test proving that changed SQL represented by a different checksum is rejected even when version and name are unchanged.
   - Added malformed-checksum rejection coverage.

3. `config/production-migration-batches.json` remains exactly `[]`. No execution batch was created.

### Validation status — do not overstate

- PR #298 now points to head `5c9f30077ce1b3ace530d8935450726158e7dd0e`; it remains draft/open/non-mergeable.
- GitHub workflow-run lookup and combined commit status for that exact head returned no workflow runs/statuses at the time checked.
- Cloudflare Pages bot comment reported its build as **in progress** for this head; this is not a completed validation result.
- No local build or test execution was performed through the GitHub connector.
- Therefore TypeScript compilation and the new tests remain **unverified**. Do not call the checksum fix qualified until exact-head checks complete and results are inspected.

### Scope and safety

- Only the selector and its unit test were changed, on the existing feature branch.
- No migration SQL, production pending inventory, execution manifest, CI workflow, PR base, or PR draft state was changed.
- No production database query/write, migration, role/ACL/credential change, Render action, deployment, or paid resource was used.
- Continue to keep the execution manifest empty. Do not create a first batch until checksum pinning is qualified, the 36 required function dependency/cutover review is complete, the three optional campaign/directory-review operations are resolved, and fresh authorized production ledger plus recoverable backup evidence exists.

### Next action — avoid repeating implementation

1. Inspect the Cloudflare Pages build result for exact head `5c9f30077ce1b3ace530d8935450726158e7dd0e`; separately confirm GitHub CI status.
2. If validation fails, fix only the demonstrated failure and update this section.
3. If validation passes, continue dependency review; do not infer production readiness from selector tests.


### Exact-head status refresh after handover commit — 19:52 SAST

The handover commit itself advanced PR #298's head to `14db42f24027d6e5fd15e82894191556480838cd`. A fresh PR lookup confirms it remains draft/open/non-mergeable. The Cloudflare Pages bot now reports a build **in progress** for this exact head. GitHub workflow-run lookup and combined commit status still return no runs/statuses. No pass/fail result is available yet; the selector change remains unqualified.



---

## Validation checkpoint — checksum-pinning implementation — 18 November 2026, 21:52 SAST

Re-read this handover and inspected PR #298, its exact changed-file inventory, the committed selector, tests, package test command, CI workflow, hosting handover and production deployment blockers before continuing.

### Exact pre-update branch state

- PR #298: open, draft, non-mergeable.
- Branch: `feat/actor-gateway-production-migration-batches`.
- Exact inspected head: `17b42bf4ebee6631f8f965b2b70bc50d07ec5b78`.
- Current `main`: `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Compare reports 148 commits ahead and 4 behind, with merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`. The four behind-main commits remain documentation-only; their handover content was copied into the existing hosting/credentials handover. This is not a rebase or merge, and the branch is still divergent.

### Checksum implementation inspected

- `src/db/migration-batches.ts` now requires a lowercase 64-character SHA-256 checksum on every migration entry.
- The selector checks the reviewed version/name sequence against the exact contiguous pending prefix, then compares each reviewed checksum with the repository migration checksum before returning the selected batch.
- `src/db/migration-batches.test.ts` includes changed-SQL-under-unchanged-version/name rejection and malformed-checksum rejection tests.
- The package `test` script compiles TypeScript and includes `dist/db/migration-batches.test.js`.
- Source inspection found no further checksum-selector correction required. This is not a compilation or test result.

### Exact-head validation evidence

- Cloudflare Pages bot comment reports **Deploy successful** for exact pre-update head `17b42bf`, with preview deployment `91397c17`. This is a Pages preview result only.
- GitHub Actions workflow-run lookup for the full head SHA returned an empty list.
- Combined commit status lookup returned an empty list.
- No independently verified TypeScript build, migration-batch unit-test result, or PostgreSQL qualification result is available for this exact head.
- Therefore the checksum-pinning implementation remains **unqualified**. Do not describe the Cloudflare preview as a GHM test pass.

### Current safety and next action

- `config/production-migration-batches.json` remains exactly `[]`.
- Do not populate a batch, run `npm run migrate` against production, merge PR #298, rebase the divergent branch, or proceed to dependency-based batch approval on the strength of the Pages preview.
- Obtain exact-head GHM TypeScript/test evidence before continuing. If no workflow was triggered, determine a safe, cost-neutral validation route rather than assuming success or starting an unnecessary long disposable-PostgreSQL run.
- After validation, resume the already documented dependency review of the 36 signed gateway functions and three optional campaign/directory-review operations; do not repeat the completed source inventory.
- Render remains strictly read-only. No Render configuration, service, deployment, database, credential, role, ACL, migration, production data, payment state or paid resource was changed in this checkpoint.




---

## Follow-on validation attempt — 18 November 2026, 21:55 SAST

Re-read the current migration-batches handover, PR #298, current branch comparison, package scripts, TypeScript configuration and CI workflow before choosing the next validation route.

### Updated exact state after the preceding handover commit

- PR #298 head is now `db9cbe426442d55e4009a237c8443b665a189564` (the previous validation note's `17b42bf` was the pre-handover-commit head).
- PR remains open, draft and non-mergeable.
- Current `main` remains `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Branch comparison: 149 commits ahead / 4 behind; merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`. Four behind-main changes remain documentation-only and reconciled in the hosting handover. No rebase/merge performed.
- Exact-head workflow-run lookup returned an empty list; exact-head combined commit statuses returned an empty list. No exact-head build/test result is available.

### CI cost and trigger assessment

The checked-in `.github/workflows/ci.yml` runs on pull requests targeting `main`, but the exact head currently has no returned PR workflow run. Its single `quality` job provisions PostgreSQL 18 and has a 25-minute timeout; it applies the full migration set to disposable PostgreSQL and runs numerous qualification scripts, including migration-plan-only, commercial workflow, Actor Gateway, storage, campaign/directory and cutover suites. It is not a narrow checksum-selector test. Do not start/retry that full workflow merely to obtain the small validation needed here.

The workflow also has `workflow_dispatch`, but the connected GitHub actions available in this session expose read operations and rerun operations for existing runs, not workflow dispatch. There is no existing run to rerun. Do not create a dummy commit or alter CI triggers just to force this broad suite.

### Lowest-cost deterministic validation route

The checked-in package scripts establish:
- `npm run build` is `tsc`, using the root strict TypeScript configuration and compiling all `src/**/*`.
- `npm test` repeats that build and then runs the full large Node test list plus additional checks; it is broader than needed for the checksum fix.
- The focused unit test is already compiled into the build output and can be run independently after the build.

On an existing local checkout at this exact branch head, with dependencies already installed, the narrowly scoped validation is:

```powershell
PS C:\GHM-main> git status --short --branch
PS C:\GHM-main> git rev-parse HEAD
PS C:\GHM-main> npm run build
PS C:\GHM-main> node --require ./scripts/test-env.cjs --test dist/db/migration-batches.test.js
```

The expected `git rev-parse HEAD` must equal `db9cbe426442d55e4009a237c8443b665a189564`. If the local checkout is not already at this exact commit, stop rather than switching branches or pulling over local work. This focused route does not connect to PostgreSQL, execute migrations, run disposable DB qualification, or require a new paid service. It validates the full source TypeScript build and the migration-batch selector tests, but not the full GHM suite or production readiness.

### Current disposition

No local shell/repository checkout is exposed to this session, so I could not truthfully execute the commands or claim a pass. No GitHub workflow was dispatched, no dummy commit/CI change was made, and no PostgreSQL qualification was repeated. The checksum fix remains unqualified pending exact-head local build and focused unit-test output.

After those results are available, continue the existing documented dependency review; keep the execution manifest empty and PR #298 draft. Render remains strictly read-only. No production SQL/state, Render setting/service/deployment, secret, credential, role, ACL, application/payment state or paid resource changed.


---

## Exact-head local validation and fixture correction — 18 November 2026, 22:13 SAST

### Validation environment and first result

- Created isolated local worktree `C:\\GHM-pr298-validation` at the then-current PR #298 head `01e80dc88fe5267f19347306d12fa8040157cf4c`; existing worktrees and their untracked files were left untouched.
- Node.js `v24.18.0`, npm `11.16.0`. `npm ci` installed 167 packages and audited 169 packages with zero reported vulnerabilities. npm warned that the `argon2@0.41.1` install script was not approved by the current `allowScripts` policy; no script approval or dependency modification was performed.
- First `npm run build` failed at `src/db/migration-batches.test.ts:35` with TS2741: the malformed repository migration fixture supplied `version` and `name` but omitted the now-required `checksum` property from `MigrationBatchEntry`.
- This was a test-fixture typing defect. It did not indicate a failure in the checksum selector or any database/production operation.

### Narrow correction committed to this PR branch

- Updated only the malformed-identity test fixture to include a valid 64-character lowercase SHA-256-shaped checksum while retaining the deliberately invalid version `bad`.
- The test continues to exercise the intended invalid migration identity path; checksum enforcement in `src/db/migration-batches.ts` is unchanged.
- Correction committed through the GitHub repository contents API to this existing branch as `test(db): fix malformed migration fixture checksum`.
- Exact resulting commit: `7d8ac8f4bdeb8df2d6f11ef14a3945c954b0e255`.
- The focused test and TypeScript build have **not yet been rerun** against the corrected head. Do not describe this as qualified until the local worktree is advanced to the new exact PR head and both checks pass.

### Safety

- `config/production-migration-batches.json` remains `[]`; no production batch is authorized.
- No migration SQL, pending inventory, runner behavior, CI workflow, PR base/draft state, production database, Render service/configuration, credentials, role, ACL, deployment, payment state, or paid resource was changed.
- Render remains strictly read-only. No production connection or migration was run.
- Next: refresh PR #298 head, update the isolated worktree without disturbing other checkouts, rerun `npm run build` and `node --require ./scripts/test-env.cjs --test dist/db/migration-batches.test.js`, then record their exact results here.


---

## Exact-head local validation — successful build and focused tests — 18 November 2026, 23:36 SAST

### Exact validated source and commands

- Isolated worktree: `C:\\GHM-pr298-validation`.
- Exact PR #298 head checked out: `656b11f73edcad5cf2ac7e7a995961061136004a`.
- Worktree was clean before the guarded update; after update, `git status --short --branch` showed a clean detached HEAD at the exact expected commit.
- `config/production-migration-batches.json` was read locally and contained exactly `[]`.
- `npm run build` completed successfully (`tsc`, exit code 0).
- `node --require ./scripts/test-env.cjs --test dist/db/migration-batches.test.js` completed successfully: 16 tests, 16 passed, 0 failed, 0 skipped.
- The 16 passing tests cover explicit batch ID selection, unknown IDs, exact contiguous pending prefixes, skipped/already-applied/name-mismatched entries, duplicate identities, malformed identities and checksums, changed SQL checksum under unchanged version/name, ordered batch identities, and exact pending-inventory matching.

### Interpretation and boundaries

- The earlier TS2741 fixture error is resolved by the narrow test-only correction committed as `7d8ac8f4bdeb8df2d6f11ef14a3945c954b0e255`; the successful build and tests were run on its descendant, exact head `656b11f73edcad5cf2ac7e7a995961061136004a`.
- This validates TypeScript compilation and the focused migration-batch selector tests only. It is not a full GHM test-suite result, PostgreSQL migration qualification, live production ledger refresh, production plan, or release approval.
- No PostgreSQL connection or migration command was run. No production database, SQL, ledger, role, ACL, credential, Render service/configuration/deployment, payment state, or paid resource was changed.
- Render remains strictly read-only. The execution manifest remains empty and must stay empty. PR #298 remains draft/open/non-mergeable; do not merge, rebase, populate the manifest, or execute production migrations on the strength of this focused pass.

### Next work — resume the existing migration cutover review

- Do not repeat the completed selector implementation or focused build/test.
- Continue from the already documented inventory: review dependencies and active route readiness for the 36 signed Actor Gateway functions and resolve the three optional campaign/directory-review operations; do not reconstruct the source inventory from scratch.
- Before any future batch proposal, the branch/base divergence, current live production ledger, verified recovery point, gateway hosting/credential readiness, database role/ownership, and route cutover evidence remain independent gates.
- Keep the user handover current after each substantive batch of work.



---

## Route-readiness dependency review — first required function family — 18 November 2026, 23:38 SAST

Re-read this handover and rechecked PR #298, its current branch head, the branch comparison, and the current-main Actor Gateway privilege source before continuing. This is a source-only review; the stale migration-batches branch is not treated as current-main authority.

### Exact repository state

- PR #298 remains open, draft, unmerged and non-mergeable.
- Pre-update PR head: `3d2ff9afa8b6201bd60348480ad2cee0cb9ede59`.
- Current `main`: `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Branch comparison: 153 commits ahead / 4 behind; merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`. Do not merge, rebase, or treat the feature-branch inventory as current-main authority.
- The existing handover's 39-signature inventory was reused; no re-enumeration of all 36 required signatures was performed.

### First required family mapped: 10 signatures

The first family in the existing 36-function matrix contains the assertion verifier and nine operational signatures:

| Signed SQL function | HTTP route / caller | Reader |
|---|---|---|
| `ghm.assert_actor_gateway_capability(...)` | Called internally by the signed wrappers; no direct HTTP route | Shared SQL verifier |
| `ghm.gateway_list_capabilities(...)` | `GET /v1/admin/capabilities` | `PostgresCapabilityGovernanceReader.list` |
| `ghm.gateway_create_capability_draft(...)` | `POST /v1/admin/capabilities/drafts` | `createDraft` |
| `ghm.gateway_update_capability_draft(...)` | `PATCH /v1/admin/capabilities/:capabilityId/draft` | `updateDraft` |
| `ghm.gateway_transition_capability_lifecycle(...)` | `POST /v1/admin/capabilities/:capabilityId/transition` | `transition` |
| `ghm.gateway_update_business_supplier_classification(...)` | `PUT /v1/businesses/:businessId/supplier-classification` | `PostgresSupplierClassificationReader` |
| `ghm.gateway_update_business_profile(...)` | `PATCH /v1/businesses/:businessId/profile` | `PostgresBusinessProfileReader` |
| `ghm.gateway_get_actor_identity(...)` | `GET /v1/actor/me` | `PostgresActorIdentityReader` |
| `ghm.gateway_read_business_registration_identity(...)` | `GET /v1/businesses/:businessId/registration-identity` | `PostgresBusinessRegistrationIdentityReader` |
| `ghm.gateway_update_business_registration_identity(...)` | `PUT /v1/businesses/:businessId/registration-identity` | `PostgresBusinessRegistrationIdentityReader` |

Current-main source refs inspected:
- `src/actor-gateway/database-privileges.ts`, blob `41021badb1b2760ef5e26c1ab882ba0798316e0d`.
- `src/actor-gateway/app.ts`, blob `dc66f24318fd9c720628d365196484e6df5b0231`.
- `src/actor-gateway/capability-governance-reader.ts`, blob `e433df6a8067d989ea6375d078a632a0172165c4`.
- `src/actor-gateway/supplier-classification-reader.ts`, blob `b34c82b9ad51c7f563815121a90726226421d53e`.
- `src/actor-gateway/business-profile-reader.ts`, blob `98e668d442580f5d1a398a6ccd29d6a5d1f2941b`.
- `src/actor-gateway/actor-identity-reader.ts`, blob `1a3cb0adc483a0aa9e5bb78b4ad220a33c8fd9db`.
- `src/actor-gateway/business-registration-identity-reader.ts`, blob `96e9c0e07c9dffa3d37a6db142bc723d066100d6`.
- `database/migrations/20261111060000_bind_gateway_assertions_to_request_context.sql`, blob `f45833f833aa94cb5d661a6323a6af9cd3fb2cb2`.

### Confirmed route and assertion properties

- The Express app applies Bearer-token verification to all `/v1` routes before JSON parsing or route handlers. The verified account ID is placed in `res.locals.actorAccountId`; account-keyed rate limiting is applied, and the JSON parser is bounded to 16 KB.
- Each of the inspected readers creates a short-lived signed assertion bound to its operation and exact request context, then calls the corresponding `ghm.gateway_*` function inside a database transaction.
- The SQL verifier requires `session_user = 'ghm_actor_gateway'`, validates the active account, checks the 32-byte assertion secret, verifies the HMAC signature, enforces a 60-second assertion window, and inserts a one-use nonce; duplicate nonce insertion is rejected as replay.
- Capability catalogue operations additionally enforce an active system administrator account in SQL.
- The wrapper migration assigns the signed functions to `ghm_schema_owner`, revokes EXECUTE from PUBLIC, `ghm_runtime`, and `ghm_migrator`, and grants EXECUTE to `ghm_actor_gateway`. The later global search-path normalizer must still be applied in sequence and checked against the final pinned path.

### Dependency chain still open — do not call this family fully qualified

The wrapper bodies reveal the next database dependency edges to verify from their defining migrations and ACLs:
- Capability draft/list/lifecycle: `ghm.capability`, `ghm.create_capability_draft`, `ghm.update_capability_draft`, and `ghm.transition_capability_lifecycle`.
- Supplier classification: `ghm.update_business_supplier_classification` and its underlying Business relation dependencies.
- Business profile: `ghm.update_business_profile` and the Business columns/relations it mutates.
- Actor identity and assertion verification: `ghm.account_identity`, `ghm.actor_gateway_capability_assertion_secret`, `ghm.actor_gateway_capability_assertion_nonce`, and the `public.hmac` implementation/extension dependency.
- Registration identity: `ghm.read_business_registration_identity`, `ghm.update_business_registration_identity`, and their Business membership/ownership authorization dependencies.

This pass maps HTTP route -> reader -> signed SQL wrapper and verifies the wrapper-level assertion/grant pattern. It does **not** yet establish the complete underlying helper-function EXECUTE chain, table/sequence access required by `ghm_schema_owner`, extension availability, exact grants/ownership for every helper, or production presence. Those checks remain required before this family can be marked dependency-complete.

### Next bounded review

Continue with the defining SQL and authorization dependencies for the ten signatures above, beginning with the assertion secret/nonce and HMAC prerequisite, then the capability helper functions and Business/registration helper functions. Record each dependency's creating migration, owner, SECURITY DEFINER/search_path, ACL, table/sequence dependencies, and route authorization. Then proceed to the next family in the existing 36-function matrix. Do not re-run the selector tests, re-enumerate the 36 signatures, or treat this source review as live production evidence.

### Safety

- No code or migration SQL was changed in this review.
- No production database connection/query/write, migration, role/ACL/credential change, Render action, deployment, payment action, or paid resource was used.
- `config/production-migration-batches.json` remains exactly `[]`; PR #298 remains draft/open/non-mergeable.
- Render remains strictly read-only.


---

## Route-readiness dependency review — assertion, capability and Business helper chain — 18 November 2026, 23:52 SAST

Continued from the preceding handover section after re-reading the current handover, confirming PR #298 and current-main refs. This remains a source-only review of current `main`, not a production catalog audit.

### Exact refs

- PR #298 pre-update head: `0a12e368cd39adf68068f9404674068054dcc827`; open, draft, unmerged, non-mergeable.
- Current `main`: `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Migration files and relevant reader/wrapper source were read from current `main`, not the stale feature branch.

### Assertion verifier prerequisites

- `20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql` creates `pgcrypto` in schema `public`, then creates the 32-byte assertion-secret table and one-use nonce table in `ghm`. Both tables are owned by `ghm_schema_owner`; all direct table privileges are revoked from PUBLIC, `ghm_runtime`, `ghm_actor_gateway`, and `ghm_migrator`.
- The later `20261111060000_bind_gateway_assertions_to_request_context.sql` replaces the initial v1 verifier with the v2 context-bound verifier. Its HMAC payload binds actor ID, operation, issued timestamp, nonce and the UTF-8 request context (hex encoded). It calls `public.hmac(..., 'sha256')`, compares all 32 MAC bytes, enforces the 60-second window, checks active account status, prunes expired nonces and rejects nonce reuse.
- The final verifier and nine signed wrappers are explicitly assigned to `ghm_schema_owner`; PUBLIC, `ghm_runtime` and `ghm_migrator` are revoked and EXECUTE is granted to `ghm_actor_gateway`.
- The gateway login has no direct access to the secret/nonce tables. The SECURITY DEFINER verifier accesses them as `ghm_schema_owner`. The extension function is explicitly schema-qualified, so the later pinned search path does not need to include `public`.
- Source proves the migration attempts to create pgcrypto; it does not prove pgcrypto is installed/enabled on production or that its exact extension version and `public.hmac` catalog ACL are present. That requires a future read-only production catalog check.

### Underlying helper chain

| Signed operation family | Underlying helper(s) | Source ownership / authorization evidence |
|---|---|---|
| Capability list | `ghm.capability`, `ghm.account_identity` | Signed wrapper is SECURITY DEFINER; it enforces active system-admin status before selecting the catalogue. |
| Capability create/update/transition | `ghm.create_capability_draft`, `ghm.update_capability_draft`, `ghm.transition_capability_lifecycle`, `ghm.capability`, `ghm.account_identity` | Helpers are SECURITY DEFINER, explicitly owned by `ghm_schema_owner`, and have pinned search_path declarations. Signed wrappers independently enforce active admin status and call those helpers. |
| Supplier classification | `ghm.update_business_supplier_classification`, `ghm.business_membership`, `ghm.business` | Helper is SECURITY DEFINER and explicitly owned by `ghm_schema_owner`; checks active owner/administrator membership before updating Business. The legacy runtime EXECUTE grant is revoked by the gateway cutover migration; signed wrapper uses the assertion and invokes helper. |
| Business profile | `ghm.update_business_profile`, `ghm.business_membership`, `ghm.business` | Helper is SECURITY DEFINER and explicitly owned by `ghm_schema_owner`; validates allowed patch keys and active management membership. Legacy runtime EXECUTE is revoked by the profile gateway cutover migration; signed wrapper blocks supplier fields and invokes helper. |
| Actor identity | `ghm.account_identity` | Signed wrapper invokes the shared assertion verifier and returns only the verified active actor's own identity. |
| Registration identity read/write | `ghm.read_business_registration_identity`, `ghm.update_business_registration_identity`, `ghm.business_registration_identity`, `ghm.business`, `ghm.business_membership`, `ghm.account_identity` | Read/write helpers are SECURITY DEFINER and owned by `ghm_schema_owner`; both enforce active Business membership with owner/administrator role. The registration table is explicitly owned by `ghm_schema_owner` and has RLS enabled. The later signed wrappers bind request context. The legacy write helper's runtime/gateway direct EXECUTE is revoked by the gated 17 November migration. |

### Legacy grants and ordered cutover constraints

- Capability governance helpers retain a legacy runtime grant until `20261117020000_revoke_runtime_capability_governance.sql`; that migration first asserts that the signed verifier and all four signed capability functions exist, are SECURITY DEFINER, are owned by `ghm_schema_owner`, have the expected search_path, are executable by the gateway and not executable by runtime. It then revokes direct runtime/gateway execution on the legacy helper functions and checks for unexpected grantees.
- Registration identity write retains a legacy runtime grant until `20261117010000_revoke_runtime_business_registration_identity_write.sql`; it checks signed wrapper existence, owner/security-definer status and gateway/runtime EXECUTE state before revoking the legacy helper grant and checking for unexpected grantees.
- The supplier and Business-profile cutover migrations revoke the legacy runtime helper EXECUTE grants. These are distinct from the later assertion-bound wrapper migrations.
- The global search-path migration `20261112090000_pin_security_definer_search_path.sql` first refuses any SECURITY DEFINER function not owned by `ghm_schema_owner`, then normalizes every GHM SECURITY DEFINER function to `pg_catalog, ghm, pg_temp`. This is the final expected path, not the earlier per-migration `pg_catalog, ghm` declaration.
- The 17 November capability and registration revocation migrations are explicitly documented as post-deployment cutover gates. They must not be run merely because the SQL exists. Their own comments require successful Actor Gateway deployment/startup checks and authenticated end-to-end route tests first.

### What remains unproven / production gates

1. The source migration sequence creates the required objects and defines the intended owner/grant posture, but repository source cannot prove that the production ledger applied them in order.
2. The source files for the original `account_identity`, `business`, `business_membership` and `capability` tables do not themselves explicitly show all final table owners. Their actual owner, RLS/force-RLS state, relation privileges and any sequence dependencies must be checked in the production catalogs using read-only queries before claiming `ghm_schema_owner` has every required underlying relation permission.
3. Confirm production pgcrypto extension/schema/version and `public.hmac(bytea,bytea,text)` existence/ACL, plus final verifier/wrapper/helper owners, SECURITY DEFINER flags, pinned paths and EXECUTE grants.
4. Confirm that the 17 November cutover migrations are still unapplied or applied as expected from a fresh authoritative production ledger; do not infer their live state from this source review.
5. Confirm the dedicated Actor Gateway runtime is actually deployed/configured and pass authenticated end-to-end tests for the capability and registration routes before any legacy runtime EXECUTE revocation batch is considered.

### Result and next bounded task

The assertion secret/nonce/HMAC dependency and the helper-function authorization chain are now mapped from source for the first required family. The family is **not production-qualified**: actual production catalog state, table ownership/privileges, extension presence, migration ledger and deployed-route smoke evidence remain open.

Next: continue the same family by checking the exact signed wrapper signatures/argument order against reader SQL calls and migration declarations, then inspect the route-level authorization and response/error behavior for the ten operations. Do not re-run the 16 selector tests, re-enumerate the 36 signatures, or treat this source review as a live production audit.

### Safety

- No SQL, migration, application code, branch base, PR status, production database, Render setting/service/deployment, secret, role, ACL, credential, payment state or paid resource was changed.
- No production connection/query was made. Render remains strictly read-only.
- `config/production-migration-batches.json` remains `[]`; PR #298 remains draft/open/non-mergeable.


---

## Route-readiness review — signed wrapper argument reconciliation and HTTP behavior — 18 November 2026, 23:58 SAST

Re-read the latest handover and PR #298 before continuing. Source review used current `main` at `ddb31ff59ab470973edf60a5078a75e5f962f803`. No production connection or runtime action was performed.

### Exact source refs

- `database/migrations/20261111060000_bind_gateway_assertions_to_request_context.sql`, blob `f45833f833aa94cb5d661a6323a6af9cd3fb2cb2`.
- `src/actor-gateway/request-assertion.ts`, blob `36d671e57498e5908bd44d6c47fdbf14dc14d08e`.
- `src/actor-gateway/capability-governance-reader.ts`, blob `e433df6a8067d989ea6375d078a632a0172165c4`.
- `src/actor-gateway/supplier-classification-reader.ts`, blob `b34c82b9ad51c7f563815121a90726226421d53e`.
- `src/actor-gateway/business-profile-reader.ts`, blob `98e668d442580f5d1a398a6ccd29d6a5d1f2941b`.
- `src/actor-gateway/actor-identity-reader.ts`, blob `1a3cb0adc483a0aa9e5bb78b4ad220a33c8fd9db`.
- `src/actor-gateway/business-registration-identity-reader.ts`, blob `96e9c0e07c9dffa3d37a6db142bc723d066100d6`.
- `src/actor-gateway/app.ts`, blob `dc66f24318fd9c720628d365196484e6df5b0231`.

### Signature and argument-order reconciliation

The ten required signatures (shared verifier plus nine operations) were compared against the SQL declarations and each TypeScript reader call. The operation names, arities and positional order match:

| Operation | SQL wrapper | Reader SQL arity | Context binding |
|---|---|---:|---|
| Assertion verifier | `assert_actor_gateway_capability` | 6 parameters | actor, operation, issued time, nonce, context, signature |
| Capability list | `gateway_list_capabilities` | 5 | empty object |
| Capability create | `gateway_create_capability_draft` | 12 | name, slug, description, parentId, sortOrder, sourceReference, version |
| Capability update | `gateway_update_capability_draft` | 13 | capabilityId plus the create fields |
| Capability transition | `gateway_transition_capability_lifecycle` | 9 | capabilityId, targetStatus, replacedByCapabilityId, version |
| Supplier classification | `gateway_update_business_supplier_classification` | 7 | businessId, isSupplier |
| Business profile | `gateway_update_business_profile` | 7 | businessId, patch |
| Actor identity | `gateway_get_actor_identity` | 5 | empty object |
| Registration identity read | `gateway_read_business_registration_identity` | 6 | businessId |
| Registration identity update | `gateway_update_business_registration_identity` | 9 | businessId, registrationStatus, registrationNumber, legalName |

The registration reader's SQL chooses the correct `gateway_read_...` / `gateway_update_...` names and appends the Business ID and update fields after the five assertion arguments. The request assertion uses the same v2 payload format as SQL: `ghm-actor-gateway:v2|accountId|operation|issuedAt|nonce|hex(UTF-8 JSON context)`. The SQL wrapper's JSONB context comparisons match the context keys and values assembled by each reader, including explicit null/default values for capability drafts and registration updates.

**No signature/argument-order defect was found in these ten reader-to-wrapper paths.** This is static source reconciliation, not a live SQL execution or proof that the migrations are installed.

### HTTP authentication, validation and error behavior

- All `/v1` requests pass through Bearer-token verification before JSON parsing and route handlers. The verified account ID is stored in `res.locals.actorAccountId`; per-account rate limiting is applied. The optional external rate-limit decision fails closed with 503. JSON body parsing is limited to 16 KB.
- Capability list/create/update/transition routes validate UUIDs and request shape before calling the reader. Authorization is enforced in the signed SQL wrappers by active system-admin status, rather than a separate Express role check. SQLSTATE 42501 maps to 403; invalid/check failures map to 400; uniqueness/business conflicts map to 409; unexpected failures are logged without SQL details and return 503.
- Supplier/profile routes validate positive safe Business IDs and allowed body shape. SQL helper/wrapper authorization failures are mapped to 404 to avoid disclosing Business existence; validation errors map to 400; unexpected errors return 503.
- Actor identity maps SQLSTATE 42501 to 401 and unexpected errors to 503.
- Registration read/update validate positive decimal Business IDs; update requires exactly the three allowed fields and validates status/number/legal-name combinations. Authorization/not-found SQLSTATEs map to 404, validation/check SQLSTATEs map to 400, unexpected failures return 503.
- The application uses one common authenticated actor identity for the entire /v1 route tree; the SQL assertion independently binds that identity to the operation and arguments. Database authorization remains the authoritative Business membership/system-admin check.

### Readiness conclusion and follow-up

- Static SQL declaration ↔ TypeScript reader signature/argument order: **reconciled for all ten entries**.
- Request assertion payload ↔ SQL context comparison: **reconciled for all nine operations**.
- HTTP authentication, input validation and response/error mapping: **source-reviewed**.
- No runtime integration test, production migration-state verification, production catalog inspection, deployed-service check or authenticated end-to-end smoke test was performed. Those remain mandatory before a production cutover decision.
- No discrepancy requiring a source change was identified in this bounded pass. No code or SQL was modified.

Next bounded task: inspect the dedicated Actor Gateway service bootstrap/configuration and startup preflight against the exact required role, connection TLS, assertion secret, pool settings and reader wiring. Keep Render strictly read-only; source configuration inspection only until a separately authorized read-only production check is necessary.

### Safety

- No application or migration code was changed.
- No production database connection/query/write, migration, role/ACL/credential change, Render action/deployment, payment action, or paid resource was used.
- `config/production-migration-batches.json` remains `[]`; PR #298 remains draft/open/non-mergeable.


---

## Actor Gateway bootstrap, connection and startup preflight review — 19 November 2026, 00:06 SAST

Continued after re-reading the latest handover and verifying PR #298. Source review is pinned to current `main` `ddb31ff59ab470973edf60a5078a75e5f962f803`; it is not a Render inspection or production runtime test.

### Exact source refs

- `src/actor-gateway/server.ts`, blob `2ed8e9ffa36ead9eeb9a091f4b7061ae78ee6ceb`.
- `src/actor-gateway/database-principal.ts`, blob `ff32cd0ae0b4014041bc726790074a481ddd6006`.
- `src/actor-gateway/database-ssl.ts`, blob `18666ce9f8dedba17d5bc402bfdb53e14d635620`.
- `src/actor-gateway/database-privileges.ts`, blob `41021badb1b2760ef5e26c1ab882ba0798316e0d`.
- `src/actor-gateway/request-assertion.ts`, blob `36d671e57498e5908bd44d6c47fdbf14dc14d08e`.
- `src/actor-gateway/database-principal.test.ts`, blob `d071e8c23b21fc206bb399812714bfaaacdfeb81`.
- `src/actor-gateway/database-ssl.test.ts`, blob `aee9410ff2ffbdd624cbf079beae3298f148ccdf`.
- `src/actor-gateway/database-privileges.test.ts`, blob `8bc3a0c945a1390d418f1bc5be929844ce6d8f99`.
- `src/actor-gateway/database-startup-acl-contract.test.ts`, blob `c494be32f2e2b7e661ce4f3ab54efd2875b3b9d4`.

### Bootstrap and startup sequence

- Required environment inputs include `GHM_ACTOR_GATEWAY_DATABASE_URL`, explicit production `DATABASE_SSL_MODE`, `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`, and ES256 verification keys loaded by the auth foundation key loader. Missing/invalid inputs throw during module initialization.
- The assertion secret is canonical Base64 for exactly 32 bytes. Each wired reader constructor decodes and checks both byte length and canonical re-encoding before accepting the key; `createActorGatewayAssertion` independently rejects any non-32-byte Buffer.
- One shared pg Pool is created with max 10 connections, 5-second connection timeout and 30-second idle timeout. HTTP server timeouts are 10 seconds request, 5 seconds headers and 5 seconds keep-alive.
- The server wires all current reader families to that Pool and shared assertion secret, including capability, supplier/profile, registration, saved-business, hours, trust-score, logo, storage, Connect provisioning, campaign/directory-review and commercial readers. Payment-preparation feature/launch booleans default false unless explicitly set to the literal string `true`.
- Before listening, startup runs a database identity query, calls `assertActorGatewayDatabaseIdentity`, reads the function/relation/default-ACL catalog through `readActorGatewayDatabasePrivileges`, and calls `assertActorGatewayDatabasePrivileges`. The listener opens only after both checks pass. A startup error logs only the error name, closes the Pool and sets a failing process exit code.
- SIGTERM/SIGINT close the HTTP listener and Pool; uncaught exceptions and unhandled rejections log a bounded error and terminate nonzero.

### Database principal finding — known membership is explicitly allow-listed

The startup query requires both `session_user` and `current_user` to equal `ghm_actor_gateway`, LOGIN true, NOINHERIT, and all superuser/createdb/createrole/replication/bypass-RLS flags false. It rejects the gateway being a member of any other role and rejects any membership into the gateway role except one exact special case: member `ghm_db_user`, with `admin_option=true`, `inherit_option=false`, `set_option=false`.

The unit test explicitly names this exception as “the Render administrator member”. This is not a membership-free principal. It matches the previously documented unexpected membership anomaly; startup intentionally tolerates the narrowly constrained state. The role membership still carries ADMIN OPTION, so it is a residual governance dependency and must be resolved/confirmed through the existing Render support escalation and a later authorized read-only production catalog check. Do not infer that it has been removed. Do not attempt to change it.

### TLS / network transport finding

- Production refuses missing or ambiguous `DATABASE_SSL_MODE`; only `internal` or `external` are accepted.
- `internal` selects `ssl: false`, relying on the Render same-region private network/internal connection URL.
- `external` selects TLS with `rejectUnauthorized: false`. The source comment correctly says this encrypts traffic but does **not** authenticate the server certificate.
- For the intended same-region Render deployment, the target mode is `internal` with the Render internal database URL. Do not change service configuration here. The actual saved environment value and URL form have not been read/verified by this source review.
- The user-supplied dedicated role URL is not proof that the service has the correct saved environment, target host, TLS mode or credential.

### ACL verifier and secret handling

- Startup requires database CONNECT and `ghm` schema USAGE; rejects database/schema CREATE and any direct table/view/materialized-view/foreign-table or sequence privileges for the gateway login.
- It compares the exact executable function allow-list (including the explicitly supported pre/post optional campaign/directory-review set), rejects PUBLIC and runtime execution, unsafe default function ACLs, SECURITY DEFINER functions with unexpected owner/search_path, PUBLIC EXECUTE on SECURITY DEFINER functions and unexpected non-owner function grantees.
- The verifier is intentionally stricter than merely checking that each required function exists: the expected signatures remain present even when a function is absent, so the actual-vs-expected comparison fails closed.
- Secret format and all reader constructor validations are established by source. The actual configured production secret value/length is not and must never be exposed in chat or copied into logs.

### Readiness disposition

| Concern | Source review result | Production proof still required |
|---|---|---|
| Dedicated DB login identity | Strict startup check | Read-only production session_user/current_user and role attributes |
| Role membership | One exact `ghm_db_user` ADMIN OPTION exception tolerated | Resolve/confirm existing support escalation; read-only membership catalog check |
| TLS mode | Explicit mode required; internal mode disables TLS, external mode skips certificate verification | Verify saved service env and internal URL without exposing credentials |
| Assertion secret | Canonical Base64, exactly 32 bytes enforced in reader constructors | Confirm only presence/configuration through approved secure UI; never disclose value |
| Function/relation ACL | Exact startup allow-list and deny checks | Successful startup evidence from deployed target |
| Pool and reader wiring | Source wiring complete | Successful deployed startup and authenticated route smoke tests |

**No source defect was proven that justifies changing code in this pass.** The bootstrap is fail-closed on required environment, principal identity and ACL state. However, the membership exception is a known residual risk, and source code cannot prove the saved Render configuration or actual production catalogs.

### Next bounded task

Continue source-only by reviewing Actor Gateway health/readiness endpoint behavior and deployment artifact/start command assumptions, then reconcile the deployed service configuration requirements as a checklist for the user to inspect in Render (assistant remains read-only). No request to submit environment values, deploy, or change settings.

### Safety

- No code, SQL, migration, manifest, role, ACL, credential, Render setting/service/deployment, payment state or paid resource was changed.
- No production DB connection/query was made and no Render service was inspected or modified.
- `config/production-migration-batches.json` remains `[]`; PR #298 remains open, draft, unmerged and non-mergeable.


---

## Actor Gateway health, readiness and deployment artifact review — 19 November 2026, 00:14 SAST

Continued from the bootstrap review after verifying the current PR and re-reading the handover. Source reviewed against current `main` `ddb31ff59ab470973edf60a5078a75e5f962f803`.

### Exact source refs

- `src/actor-gateway/app.ts`, blob `dc66f24318fd9c720628d365196484e6df5b0231`.
- `src/actor-gateway/app.test.ts`, blob `c494be32f2e2b7e661ce4f3ab54efd2875b3b9d4`.
- `src/actor-gateway/server.ts`, blob `2ed8e9ffa36ead9eeb9a091f4b7061ae78ee6ceb`.
- `package.json`, blob read from current main; `start:actor-gateway` is `node dist/actor-gateway/server.js`; `build` is `tsc`.
- Root inventory on current main contains no `render.yaml` or `Dockerfile`; those paths return 404. The repository contains a single GitHub Actions workflow `.github/workflows/ci.yml`. Therefore repository source does not declare a Render Blueprint, Docker build, service health-check path, or deployed build/start settings.

### Health/readiness behavior

- `GET /healthz` is registered before `/v1` authentication and returns HTTP 200 with `{status:"ok"}`.
- The health handler is deliberately process-only: it does not query the database, verify pool connectivity, or re-check the startup ACL state. The app test explicitly describes and verifies this behavior.
- Database identity and exact ACL checks occur once during server startup, before `server.listen`. Startup failure closes the pool and exits nonzero; once listening, no ongoing DB readiness probe is exposed.
- There is no separate `/readyz` endpoint in the reviewed app source. A 200 from `/healthz` proves that the HTTP process responds, not that the database is currently reachable or that authenticated operations are succeeding.

### Deployment artifact and command assumptions

- TypeScript emits CommonJS into `dist` (`tsconfig.json`); `npm run build` produces the entrypoint expected by `npm run start:actor-gateway`.
- The service must build from the repository root with the committed lockfile/dependencies available. Its start command must run `npm run start:actor-gateway` after build; running the generic `npm start` would start `dist/server.js`, which is the main API and is not the Actor Gateway.
- The Actor Gateway listens on `PORT`, defaulting to 10000, and validates that it is an integer TCP port in range. Render must provide the assigned `PORT` or allow the default.
- No Render Blueprint or Dockerfile is present in the repository, so service root directory, build command, start command, health-check path, region, plan, internal database URL, and environment values cannot be inferred from this repo. They remain user-visible Render facts only; assistant has not inspected or changed Render.
- The worker under `workers/actor-gateway` is a separate artifact with its own typecheck/contract tests; it is not the HTTP service entrypoint. Do not confuse its worker deployment with the Node web service.

### Render inspection checklist — read-only, no changes

When the user next opens the existing Actor Gateway web service, verify only:

1. Service type is Web Service, not Background Worker.
2. Repository and branch point to the intended GHM Actor Gateway source/release ref.
3. Root directory is repository root (unless the service's saved configuration explicitly establishes another correct root).
4. Build command is `npm ci && npm run build` (or the already-saved equivalent that installs locked dependencies and runs the TypeScript build).
5. Start command is `npm run start:actor-gateway`, not generic `npm start`.
6. Health-check path is `/healthz`; interpret it only as process liveness, not database readiness.
7. Region matches the `ghm-db` Frankfurt region so the private/internal DB URL can be used.
8. Saved `GHM_ACTOR_GATEWAY_DATABASE_URL` targets `ghm_db` using username `ghm_actor_gateway` and the private internal hostname; inspect the host/database/user only, never reveal or copy the password.
9. `DATABASE_SSL_MODE` is exactly `internal` for that same-region internal connection.
10. `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` is present, but do not reveal, copy, screenshot, or paste its value. Verify presence only.
11. Required ES256 verification-key environment is complete using the existing auth foundation convention; do not reveal private signing keys. Only verification/public key material belongs in the gateway.
12. Payment-preparation and commercial-launch flags remain false/unset while PayFast is paused.
13. Auto-deploy remains off as previously directed. Do not deploy, save, submit, edit, or rotate anything during this inspection.

### Disposition

- No code defect was proven in this bounded review; no health endpoint change is being proposed.
- The current health check is suitable only as process liveness. Operational readiness still requires startup preflight success plus authenticated DB-backed route smoke tests; an HTTP 200 health response alone is insufficient.
- The Render checklist is a verification aid, not evidence that the live service currently matches it. The existing service's saved configuration remains unverified by the assistant.
- The known role-membership ADMIN OPTION exception and TLS/connection conditions remain open from the prior section.

### Next bounded task

Inspect the complete required environment contract, particularly the ES256 verification-key loader and any rate-limit worker binding/secret requirements, and produce a non-secret checklist that distinguishes required values, optional feature flags and forbidden secrets. Do not inspect or change Render; do not request secret values.

### Safety

- No application code, SQL, migration, manifest, service setting, deployment, role, ACL, credential or payment state was changed.
- No production DB connection/query and no Render inspection/action occurred.
- `config/production-migration-batches.json` remains `[]`; PR #298 remains open, draft, unmerged and non-mergeable.


---

## Actor Gateway environment contract — ES256 keys, rate limiting and deployment model distinction — 18 November 2026, 23:55 SAST

Continued from the preceding handover section. Re-read current handover and verified PR #298 before source review. Current-main source ref remains `ddb31ff59ab470973edf60a5078a75e5f962f803`.

### Exact source refs

- `src/actor-gateway/server.ts`, blob `2ed8e9ffa36ead9eeb9a091f4b7061ae78ee6ceb`.
- `src/actor-gateway/app.ts`, blob `dc66f24318fd9c720628d365196484e6df5b0231`.
- `src/auth/foundation/es256-keys.ts`, blob `e60524677a16feb9e0b47ad1c1117c926a3fc92d`.
- `src/auth/foundation/access-jwt-verifier.ts`, blob `a2e751fae3968ee2c82109ef51c9dbb5181ef08c`.
- `workers/actor-gateway/index.ts`, blob `259efb0c82ee6c2b85c7b378d5aff551134505a8`.
- `workers/actor-gateway/wrangler.jsonc`, blob `1753634ea381a09c2aafb92a9bc0b81b7ce40251`.
- `workers/actor-gateway/worker-contract.test.mjs`, blob `603247fdb228de7d4a1e2e901a6205bfab2d72b0`.
- `.github/workflows/ci.yml`, blob `1853e5f440744c7b2f5b4bcf11bb4eb646c0dad5`.

### Critical deployment distinction

The repository contains **two Actor Gateway deployment implementations**:

1. **Node/Render web service** — `src/actor-gateway/server.ts`, started by `npm run start:actor-gateway`. This is the Render checklist documented above. It uses Node `pg.Pool` and built-in `express-rate-limit` unless a worker decision callback is supplied.
2. **Cloudflare Worker** — `workers/actor-gateway/index.ts`, configured by `workers/actor-gateway/wrangler.jsonc`. This is a separate deployment adapter, with Hyperdrive and Cloudflare rate-limit bindings. It is not the same service configuration and does not use Render's Node server entrypoint.

The repo CI currently bundles and locally smoke-tests the Cloudflare Worker. That is not evidence of a production Worker deployment. No Render or Cloudflare service has been inspected or changed. Do not mix the Worker-only bindings into the Render Node service checklist.

### Node/Render web-service environment contract

**Required at startup:**

- `GHM_ACTOR_GATEWAY_DATABASE_URL` — dedicated connection string; verify only host/database/user in the UI, never expose password.
- `DATABASE_SSL_MODE` — exactly `internal` for the intended same-region Render private-network URL; production refuses unset/ambiguous values.
- `GHM_JWT_ES256_PUBLIC_KEY_PEM` — active PKCS#8 public key PEM; literal `\n` is normalized to line breaks.
- `GHM_JWT_ES256_KID` — active key ID, printable ASCII, 1–64 characters.
- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` — canonical Base64 encoding of exactly 32 bytes, validated by all wired reader constructors.

**Optional rotation inputs:**

- `GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM` and `GHM_JWT_ES256_PREVIOUS_KID` must either both be absent/empty or both be present and valid. Previous KID must differ from active KID. This permits verification during key rotation.
- `PORT` is optional; defaults to 10000. Render normally supplies its assigned port.

**Do not configure in the gateway:**

- `GHM_JWT_ES256_PRIVATE_KEY_PEM` — signing private key belongs only in the issuer.
- `GHM_AUTH_TOKEN_PEPPER` — issuer-only token pepper.
- `GHM_AUTH_ISSUER_DATABASE_URL` — issuer database URL.
- Any runtime/migrator/database-admin URL or secret; gateway must use only its dedicated role URL.
- Do not paste or share any secret/key values for review.

**Optional commercial flags:**

- `GHM_COMMERCIAL_PAYMENT_PREPARATION_ENABLED` and `GHM_COMMERCIAL_LAUNCH_AUTHORIZED` are enabled only by literal string `true`; keep unset/false while PayFast is paused.
- `GHM_COMMERCIAL_PAYMENT_PROVIDER` defaults to `payfast`; it is not a credential and must not be used to activate payment processing.

### Rate-limiting contract

- Node/Render service has local per-account `express-rate-limit`: default 120 requests per 60 seconds, applied after Bearer verification. If no external decision callback is supplied, this local limiter is used.
- The Cloudflare Worker adapter requires `ACTOR_GATEWAY_RATE_LIMITER`; it calls the binding with key `actor:<verified account id>`. A binding failure returns 503 (fail closed). Its Wrangler configuration defines 120 requests per 60 seconds.
- Worker also requires `HYPERDRIVE` with a connection string, public ES256 key/KID, assertion secret and optional previous public key/KID pair.
- Wrangler config has `workers_dev=false`, `preview_urls=false`, observability disabled, and a placeholder all-zero Hyperdrive ID plus a local disposable test connection string. This config is a source template/CI fixture, not a ready-to-deploy production binding. Do not deploy it or infer a configured production Worker from it.
- Worker CI creates an ephemeral ES256 keypair and disposable local test credentials, then removes its local `.dev.vars`. CI's presence of these test values is not a production secret inventory.

### Non-secret inspection checklist correction

For the existing Render Node web service, inspect only required variable **names and presence**, active public key/KID presence, paired optional previous public key/KID presence, exact SSL mode, and URL host/database/username. Never reveal or copy any values. Ensure the private key, token pepper, issuer DB URL and admin/migrator credentials are absent.

Do not add Cloudflare Worker bindings to Render. Only if the user later chooses the separate Cloudflare Worker deployment would its Hyperdrive and rate-limit bindings be relevant; that would require its own explicit deployment plan and configuration review.

### Result / open gates

- The ES256 contract is now exact: gateway loads public verification keys only; issuer private signing key is not needed by either gateway adapter.
- Required and optional key variables are distinguished; previous key variables are paired.
- Node local rate limiting and Worker binding rate limiting are distinct. Worker binding outage fails closed with 503.
- The Worker CI smoke path is local/disposable and does not prove a production Worker deployment.
- No runtime configuration was inspected; no service values were requested or exposed.
- Previously documented TLS mode, known database-role membership exception, live migration state, production catalogs, startup evidence and authenticated DB-backed smoke tests remain open.

### Timestamp correction

The preceding health/deployment handover section was labelled 19 November 00:14 SAST. That label was premature: the user's message timestamp for that work was still 18 November 21:50 UTC (23:50 SAST). Treat that section's actual review time as 18 November 2026, approximately 23:50 SAST. This section is 18 November 2026, 23:55 SAST.

### Safety

- No code, SQL, migration, manifest, secret, credential, service setting, deployment, role, ACL or payment state was changed.
- No production DB connection/query and no Render/Cloudflare service inspection/action occurred.
- `config/production-migration-batches.json` remains `[]`; PR #298 remains open, draft, unmerged and non-mergeable.


---

## 19 November 2026 — Actor Gateway environment contract source verification

Re-read this handover before continuing. The latest preceding checkpoint requested a source-level verification of the Node/Render environment contract and a strict separation from the unselected Cloudflare Worker adapter. This section records that bounded review; it does not authorize deployment or database changes.

### Exact source verification

Reviewed the current-main source at `ddb31ff59ab470973edf60a5078a75e5f962f803`:

- `src/actor-gateway/server.ts`, blob `2ed8e9ffa36ead9eeb9a091f4b7061ae78ee6ceb`.
- `src/actor-gateway/database-ssl.ts`, blob `18666ce9f8dedba17d5bc402bfdb53e14d635620`.
- `src/auth/foundation/es256-keys.ts`, blob `e60524677a16feb9e0b47ad1c1117c926a3fc92d`.
- `src/actor-gateway/actor-identity-reader.ts`, blob `1a3cb0adc483a0aa9e5bb78b4ad220a33c8fd9db`.
- `src/actor-gateway/database-principal.ts`, blob `ff32cd0ae0b4014041bc726790074a481ddd6006`.
- `src/actor-gateway/database-privileges.ts`, blob `41021badb1b2760ef5e26c1ab882ba0798316e0d`.
- Separate Cloudflare Worker source `workers/actor-gateway/index.ts`, blob `259efb0c82ee6c2b85c7b378d5aff551134505a8`; Wrangler template `workers/actor-gateway/wrangler.jsonc`, blob `1753634ea381a09c2aafb92a9bc0b81b7ce40251`.

### Confirmed Node/Render environment contract

Required:
- `GHM_ACTOR_GATEWAY_DATABASE_URL` — dedicated SQL-created `ghm_actor_gateway` login; never reuse Dashboard/admin, runtime or migrator credentials.
- `DATABASE_SSL_MODE` — explicit in production; `internal` is the intended setting for the same-region Render private-network URL.
- `GHM_JWT_ES256_PUBLIC_KEY_PEM` and `GHM_JWT_ES256_KID` — active public verification key and key ID.
- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` — canonical Base64 encoding of exactly 32 bytes; reader constructors validate decoded length and canonical re-encoding.

Optional:
- `GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM` and `GHM_JWT_ES256_PREVIOUS_KID` — both absent/empty or both valid; previous KID must differ from active KID.
- `PORT` — defaults to 10000 and must parse as a valid TCP port.
- Commercial flags are opt-in only. Keep `GHM_COMMERCIAL_PAYMENT_PREPARATION_ENABLED` and `GHM_COMMERCIAL_LAUNCH_AUTHORIZED` unset/false while PayFast remains paused. Provider code defaults to `payfast`; that default does not activate payment processing.

Forbidden in the gateway:
- `GHM_JWT_ES256_PRIVATE_KEY_PEM`, `GHM_AUTH_TOKEN_PEPPER`, `GHM_AUTH_ISSUER_DATABASE_URL`, and any admin/migrator/runtime credential. The Node server calls `loadEs256VerificationKeys()`, which loads only the public active/previous keys; the issuer private key is not needed.

### TLS correction

The source has two explicit modes: `internal` returns `ssl: false`; `external` returns `{ rejectUnauthorized: false }`. The latter encrypts traffic but does not authenticate the PostgreSQL server certificate. Therefore:
- The staged same-region Render private URL must use `DATABASE_SSL_MODE=internal` as recorded in the hosting handover.
- Do not describe the source's `external` mode as strict certificate verification.
- A separate workstation probe against an external endpoint must enforce its own strict certificate/hostname verification; it must not inherit the application's weaker external-mode setting.

### Deployment adapter distinction

The Node/Render server and Cloudflare Worker are separate adapters. The Worker requires Cloudflare `HYPERDRIVE` and `ACTOR_GATEWAY_RATE_LIMITER` bindings; its Wrangler file contains a zero-ID Hyperdrive placeholder and disposable local connection string. Worker CI/source configuration is not evidence of a deployed production Worker and must not be mixed into the Render service's environment checklist. The selected hosting path remains Node/Render; no Cloudflare deployment is selected here.

### Startup consequence and disposition

The Node server does not listen until it has connected using the dedicated gateway URL, verified `session_user=current_user=ghm_actor_gateway`, checked role flags/memberships, and passed the exact database privilege/function allow-list. The production evidence already recorded above says the gateway role lacks `ghm` schema USAGE and the gateway API functions are not installed. Thus, merely filling all environment variables cannot make startup pass; the database release gates remain blocking. Do not weaken these guards or attempt startup as a substitute for the ordered migration/ACL plan.

### Branch and action boundary

At this review, PR #298 branch head was `5b820086d8e4a187c1f6d52f9cc85e0e117b42e9`; comparison with main `ddb31ff59ab470973edf60a5078a75e5f962f803` reports 159 commits ahead and 4 behind. This documentation-only checkpoint does not reconcile those four commits, rebase the branch, or authorize merge. The manifest remains empty. No code, SQL, production DB, local PostgreSQL session, Render form/service, secret, role, ACL, migration, deployment, payment state or paid resource was changed. No repeated database probe or audit was run.

---

## 19 November 2026 — owner decision: Free Render early-access hosting

The owner has explicitly selected the Render **Free Web Service** for the initial Actor Gateway / free-directory early-access stage, with a later infrastructure review when ZAID Technologies is ready to move to paid live services. This supersedes earlier notes that treated the $7/month instance as a prerequisite or described Free as categorically unacceptable.

### Hosting decision now in force

- Initial service: ghm-actor-gateway, Node/Render adapter, Frankfurt, repository zaidhqdev-sys/GHM, branch main.
- Initial plan: **Free**, for early access and the free directory service.
- Later stage: reassess paid always-on hosting and provider requirements at the paid-launch decision; do not assume a date or activate paid providers automatically.
- The owner has accepted the Free instance lifecycle limitations for the early-access stage. Render Free may spin down after inactivity and cold-start latency may exceed the Resource API five-second gateway timeout. This is an explicit early-access reliability limitation, not a reason to silently substitute paid compute or weaken authorization.
- Before connecting production traffic, inspect the Resource API gateway timeout/retry behaviour and define how early-access clients recover from a cold-start timeout. Do not claim the Free service is always-on or meets the five-second bound.
- The existing Render form was supplied by the owner and is filled but not submitted. Preserve its settings; the owner will submit it. No Render service has been created or deployed by the assistant.

### Database and release gates remain unchanged

Free hosting does not remove the database prerequisites. The current production evidence recorded in this handover still says ghm_actor_gateway lacks ghm schema USAGE and the gateway API functions are not installed. Startup will fail closed until the exact, reviewed migration/ACL prerequisites are safely resolved.

- Keep config/production-migration-batches.json empty.
- Do not execute production migrations, alter roles/ACLs, or change production secrets as part of the hosting-plan decision.
- Exact production ledger reconciliation, verified recovery point, provider-authorized role/ACL remediation, dedicated gateway identity/function qualification, and route-level positive/negative tests remain required.
- Keep PayFast/payment activation paused.
- No Render form submission, service creation, deployment, database write, role/ACL change, migration execution, secret read, or paid-resource action occurred in this checkpoint.

### Next work

1. Review the exact migration chain and its function/schema dependencies against the branch candidate inventory and source callers; do not infer an executable prefix from repository order alone.
2. Review the four commits by which this branch is behind main before any integration decision. They were previously identified as documentation-only, but must be rechecked at the current exact refs.
3. Inspect Resource API gateway timeout/retry handling for the Free early-access cold-start case.
4. Keep the migration manifest empty until exact live ledger and all production release gates are satisfied.

---

## 19 November 2026 — migration dependency review and Free early-access timeout contract

### Migration chain findings from exact SQL source

Reviewed the candidate production pending inventory and the following migration bodies on this branch:
- 20261110210000_add_actor_gateway_principal_guard.sql
- 20261110220000_add_actor_gateway_self_identity_read.sql
- 20261110230000_add_gateway_business_registration_identity_read.sql
- 20261110233000_add_gateway_business_registration_identity_write.sql
- 20261110250000_add_gateway_capability_governance.sql
- 20261110260000_gateway_supplier_classification_cutover.sql
- 20261110270000_gateway_business_profile_update.sql
- 20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql
- 20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql
- 20261111060000_bind_gateway_assertions_to_request_context.sql
- 20261111070000_add_signed_business_capability_mutations.sql
- 20261111100000_add_signed_saved_business_gateway.sql

Confirmed dependencies:
1. 20261110210000 is the foundation: it requires the pre-provisioned LOGIN/NOINHERIT gateway role and the documented bounded administrator membership; it creates ghm.assert_actor_gateway, grants ghm schema USAGE, and grants the gateway principal function execution. The next identity/feature wrappers depend on this.
2. 20261110220000 adds the first own-identity reader; 20261110230000 and 20261110233000 add registration identity wrappers. These first-generation wrappers rely on the account-ID assertion.
3. 20261111020000 replaces capability wrappers with short-lived signed assertion verification, creates protected secret/nonce tables and the HMAC verifier. 20261111050000 extends signed assertion operations to identity and registration. 20261111060000 binds assertions to request context and replaces function signatures; subsequent signed feature migrations depend on this evolved contract.
4. 20261111070000 adds signed Business Capability operations; 20261111100000 adds signed Saved Business operations.
5. 20261110260000 and 20261110270000 revoke direct ghm_runtime EXECUTE on their legacy supplier-classification and Business-profile write functions. Those revocations are security cutovers, not merely additive gateway setup. Their position in the global pending queue must be evaluated against the deployed Resource API route clients and exact live state; do not isolate or reorder them by hand.
6. Later signed feature migrations (Business Hours, Trust Score, Business Logo, storage metadata, Connect provisioning, campaign/directory review, and commercial governance) extend the same assertion protocol and must be reviewed as a dependency chain before any production batch.

### Why no first production batch is selected

The branch's candidate inventory begins with five migrations earlier than the first Actor Gateway principal migration:
- 20261110010000_add_business_supplier_classification
- 20261110100000_create_account_onboarding_progress
- 20261110120000_create_business_relationship_outcome_read_models
- 20261110140000_allow_pending_storage_object_cleanup
- 20261110160000_add_admin_capability_catalogue_governance

The runner intentionally permits only an exact contiguous prefix of the *live* pending queue. Therefore the gateway foundation cannot be selected as a standalone first batch while those earlier candidate entries remain pending. The 50-entry inventory is not a live ledger; the dated 105-row ledger snapshot is not an execution authority. The dedicated migrator preflight/ledger reconciliation, backup/recovery and provider-authority gates remain unresolved. Keep config/production-migration-batches.json equal to [] and do not execute npm run migrate against production.

The disposable plan-only qualification script is a CI fixture that creates/drops its own local ghm_db and seeds 95 applied plus 10 retained rows. It is not a production audit or a substitute for the exact live ledger. It verifies that plan output leaves its disposable ledger/catalog unchanged; it does not authorize a live production plan.

### Free early-access Resource API timeout finding

Read the current-main Resource API gateway clients:
- src/http/business-registration-identity-gateway-client.ts
- src/http/saved-business-gateway-client.ts
- src/http/business-hours-gateway-client.ts
- src/http/capability-governance-gateway-client.ts

Each uses AbortController with a default 5,000 ms timeout and clears the timer after the request. No automatic retry or cold-start recovery is implemented in these clients. Render Free may sleep and cold-start longer than this bound. Thus a first request after sleep is expected to abort/fail at the Resource API client rather than wait for the gateway to wake.

Owner decision remains Free for early-access/free-directory stage. Before routing these gateway-backed operations through a Free instance, a separate source change/design must define bounded retry/client recovery or a deliberate early-access availability contract. Never weaken token verification, signed assertions, SQL authorization, or fail-closed behavior to hide a timeout. Paid always-on compute is a later owner decision, not a prerequisite to continue source qualification.

### Four commits behind main — exact diff confirmation

Re-fetched the four previously identified mainline commits and inspected their diffs:
- dc4cbd011ab75a8630e4ab8b111dd2c99c9969ef — appends hosting handover section 37 (production DB connection checkpoint).
- f52ec0a9fa199ca3855aa39e911b732e0f520ef0 — appends hosting handover section 38 (Amanda / Render Support authority handover).
- aa3842ddb67ec44f1e6fcdeb328cb2e77ddaade2 — appends hosting handover section 39 (production role/migrator and local connection reconciliation).
- ddb31ff59ab470973edf60a5078a75e5f962f803 — appends hosting handover section 40 (owner correction that the gateway DB URL is staged in the unsubmitted form).

All four diffs are documentation-only. The four sections had already been copied into the PR branch hosting handover in its documented reconciliation checkpoint. No source or migration code is hidden in these four behind-main commits. This does not reconcile the 163-commit ahead delta and does not authorize a merge/rebase.

### Current action boundary

No production ledger query/audit, local PostgreSQL command, Render inspection/action, form submission, service creation, deployment, migration execution, role/ACL/credential change, backup operation, payment action or paid resource action occurred during this review. The owner-filled Render form remains unsubmitted. The migration manifest remains empty.

## 19 November 2026 — owner clarification: one continuous Render service

The owner clarified the intended lifecycle for the already-filled, not-yet-submitted `ghm-actor-gateway` Render form:

- Create **one** dedicated Node Render Web Service named `ghm-actor-gateway` on the **Free** plan for now.
- That same service is used for early access and the initial free-directory users. “Early access” is not a separate service, environment, deployment, or architecture from the later paid/upgrade instance.
- When revenue and operational needs justify paid compute, upgrade the **existing Free service in place** to the appropriate paid plan. Keep the same Render service, repository/branch, service identity, configuration, secrets, database identity, and endpoint. This is a compute-plan change, not a second service, parallel deployment, or infrastructure migration.
- Do not create a second paid gateway or duplicate the service for a later launch.
- Free sleep/cold-start and the existing five-second Resource API client timeout remain real reliability constraints. Address them with a bounded, secure recovery/retry or early-access availability contract; do not weaken authentication, authorization, or fail-closed checks. These constraints do not change the one-service lifecycle decision.
- The owner-provided form remains **unsubmitted**. This clarification does not authorize the assistant to create, submit, configure, or deploy anything in Render.
- All production database, migration/ledger, backup/recovery, role/ACL authority, credential, and endpoint cutover gates remain independently outstanding. The plan upgrade does not clear those gates.

This section supersedes any wording elsewhere in this document that could imply a separate paid-stage service, a second deployment, or a migration from a Free service to a different paid instance.


## 19 November 2026 — Resource API route-to-Gateway and legacy database-call reconciliation

### Source scope and method

Re-read this handover and the current `main` implementations of `src/http/app.ts`, the Gateway HTTP clients, the corresponding HTTP routers, and resource repositories. Compared the supplier-classification and Business-profile cutover SQL against the PR #298 branch migrations. This is a source-code reconciliation only; it is not evidence of the live production catalogue or ledger.

### Confirmed route and operation map

| Resource API route / capability | Resource API Gateway client operation | Gateway endpoint | Legacy Resource API database path still present in source |
|---|---|---|---|
| `GET /api/v1/saved-businesses`, `GET /:savedBusinessId`, `POST /api/v1/saved-businesses`, `DELETE /:savedBusinessId` | list, get, create, delete | `GET/POST /v1/saved-businesses`; item `GET/DELETE /v1/saved-businesses/:id` | `ghm.create_saved_business`, direct reads of `ghm.saved_business`, `ghm.delete_saved_business`; production marks Gateway required |
| `GET/PUT /api/v1/businesses/:businessId/registration-identity` | readRegistrationIdentity, updateRegistrationIdentity | `GET/PUT /v1/businesses/:id/registration-identity` | `ghm.read_business_registration_identity`, `ghm.update_business_registration_identity`; production marks Gateway required |
| `GET/PUT /api/v1/businesses/:businessId/hours` | list, replace | `GET/PUT /v1/businesses/:id/hours` | `ghm.replace_business_hours`, direct `ghm.business_hours` read; public read path uses `ghm.get_public_business_hours`; production marks Gateway required for authenticated routes |
| `PATCH /api/v1/businesses/:businessId` when the patch contains only `isSupplier` | update | `PUT /v1/businesses/:id/supplier-classification` | Legacy function `ghm.update_business_supplier_classification`; migration `20261110260000` creates `ghm.gateway_update_business_supplier_classification` and revokes direct `ghm_runtime` EXECUTE on the legacy function |
| `PATCH /api/v1/businesses/:businessId` for Business profile fields | update | `PATCH /v1/businesses/:id/profile` | Legacy function `ghm.update_business_profile`; migration `20261110270000` creates `ghm.gateway_update_business_profile` and revokes direct `ghm_runtime` EXECUTE on the legacy function |
| `GET /api/v1/admin/capabilities`, `POST /api/v1/admin/capabilities/drafts`, `PATCH /api/v1/admin/capabilities/:capabilityId/draft`, `POST /api/v1/admin/capabilities/:capabilityId/transition` | list, createDraft, updateDraft, transition | Matching `/v1/admin/capabilities...` endpoints | `ghm.create_capability_draft`, `ghm.update_capability_draft`, `ghm.transition_capability_lifecycle`; catalogue reads remain SQL-backed in the Resource API repository |
| `PUT /api/v1/business-capabilities` (business capability assertion replacement) and verification transition | replace, verify | `PUT /v1/businesses/:id/capabilities`; `POST /v1/business-capabilities/:id/verification` | `ghm.replace_business_capability_assertions`, `ghm.transition_business_capability_verification`; reads remain direct table queries |
| `POST /api/v1/business-capability-evidence`, `PATCH /api/v1/business-capability-evidence/:evidenceId/review` | submitEvidence, reviewEvidence | `POST /v1/business-capability-evidence`; `PATCH /v1/business-capability-evidence/:id/review` | `ghm.transition_business_capability_evidence`; evidence reads and business-capability lookups remain SQL-backed |
| `GET /api/v1/trust-scores`, `GET /api/v1/trust-scores/:businessId`, `POST /api/v1/trust-scores/:businessId/calculate` | list, get, calculate | `GET /v1/trust-scores`, `GET /v1/trust-scores/:id`, `POST /v1/trust-scores/:id/calculate` | SQL table reads and `ghm.calculate_business_trust_score`; public trust-score routes remain separate and call `ghm.get_public_trust_score` / `ghm.list_public_trust_scores` |
| `PUT/DELETE /api/v1/businesses/:businessId/logo` | bind | `PUT /v1/businesses/:id/logo` | Legacy logo binding calls `ghm.set_business_logo_object`; public logo resolution calls `ghm.storage_get_public_business_logo`. Production requires Gateway for protected logo mutation |
| Storage upload completion, object access, deletion and metadata lifecycle | storage metadata create/read/deletion-pending/available/deleted | `/v1/storage/metadata` and item lifecycle endpoints | Legacy store calls `ghm.storage_create_pending`, `ghm.storage_get_object`, `ghm.storage_mark_available`, `ghm.storage_mark_deletion_pending`, `ghm.storage_mark_deleted`; production storage requires Gateway and provider workflow attestation |
| `POST/PATCH /api/v1/campaigns` | createCampaign, updateCampaign | `POST /v1/campaigns`, `PATCH /v1/campaigns/:id` | `ghm.create_campaign`, `ghm.update_campaign`; campaign list/get remain direct Resource API SQL reads in current source |
| `GET /api/v1/businesses/:businessId/directory-review-presentation` | getDirectoryReviewPresentation | `GET /v1/businesses/:id/directory-review-presentation` | `ghm.get_business_directory_review_presentation`; admin directory-review authority/list/mutation routes are distinct and are not shown as Gateway-backed by this router |
| Connect Business provisioning | Gateway operation identified in the existing Gateway endpoint inventory | `POST /v1/connect/businesses/provision-or-resolve` | The exact current Resource API route/adapter and legacy database function mapping is not established by the files reviewed in this checkpoint; keep as an explicit unresolved mapping item rather than assuming it is fully cut over |

### Important route-level distinctions

- The public trust-score and public business-hours reads are separate public Resource API paths; they are not evidence that authenticated Gateway-backed operations can bypass the Gateway.
- Campaign creation/update are Gateway-routed when configured, but campaign list/get still execute through the Resource API repository. Do not describe all campaign operations as cut over.
- Business capability and evidence mutations are Gateway-routed, while related list/read queries remain SQL-backed in the Resource API. Their direct relation/function privileges must be considered separately from the Gateway mutation allowlist.
- The business profile and supplier classification routes are two mutually exclusive PATCH shapes in `app.ts`; the supplier route accepts only the `isSupplier` field, while other profile patches use the profile Gateway.
- The production app marks saved-business, registration-identity, business-hours, trust-score, business-logo, storage-metadata and campaign/directory-review Gateway paths required. Capability mutation is also production-required. Capability catalogue governance is constructed from the Gateway URL and its router returns 503 if the client is unavailable. No legacy fallback is permitted when the production-required Gateway dependency is missing.

### Free-plan timeout evidence expanded

The following additional current-main clients were checked and each has a default 5,000 ms AbortController timeout: supplier classification, Business profile, capability mutation, trust score, business logo, storage metadata, and campaign/directory review. Together with saved business, business registration identity, business hours and capability governance, the source confirms the timeout assumption spans the Gateway-backed capability set, not just four clients. The inspected clients do not implement automatic cold-start retry.

Do not implement blanket retries. Safe retry classification remains operation-specific:
- Read-only GETs may receive one bounded retry for a narrowly classified transport timeout/cold-start failure, subject to a total request deadline and no retry on authorization/validation responses.
- PUT operations require an endpoint-specific idempotency/replace-semantics proof before retry.
- POST, PATCH and DELETE mutations must not be automatically replayed after an ambiguous timeout unless a durable idempotency key or equivalent deduplication contract is implemented and tested.
- Never replay with a refreshed/altered actor identity, drop the bearer token, bypass signed assertions, or turn a Gateway failure into direct Resource API database fallback in production.

### Migration-order consequence

The source map demonstrates that the Gateway is not an isolated new service: multiple production Resource API routes depend on its signed actor context, while some adjacent reads still use Resource API database access. Therefore each migration must be evaluated against:
1. the exact function signature and ACL change;
2. the current production route path and whether it is Gateway-required;
3. any remaining Resource API direct read or fallback call that depends on the same table/function;
4. the contiguous pending migration order and the deployed Resource API version;
5. positive and negative tests for both Gateway authorization and the remaining Resource API access path.

In particular, migrations `20261110260000` and `20261110270000` revoke `ghm_runtime` EXECUTE on the supplier-classification and Business-profile legacy functions. They must not be treated as harmless additive Gateway migrations or deployed ahead of the corresponding live route/client cutover.

### Still unresolved — do not infer

- Exact live production installed-function signatures, owners, grants and relation privileges.
- The current production migration ledger and exact contiguous pending prefix.
- Exact Connect provisioning route/adapter-to-function mapping.
- Whether any route not explicitly described above has additional hidden database-function dependencies through its service/repository layer.
- Production backup/recovery evidence and provider-authorized role/ACL remediation.
- A tested, bounded Free cold-start recovery contract.

Keep `config/production-migration-batches.json` equal to `[]`. No production query, SQL write, migration, Render action, deployment, credential change, or payment action was performed for this source reconciliation.


### Follow-up correction — Connect provisioning endpoint is not a current Resource API route

A further inspection of current-main `src/http/connect-service-router.ts` and its registration in `src/http/app.ts` narrows the earlier unresolved Connect item:

- The current Connect service router dispatches governed operations for saved-business reads, customers, quotes, enquiries, projects, opportunities, opportunity participants and project quotes.
- It does not define a Business provisioning route or dispatch a Business identity/provisioning capability.
- The Gateway-side endpoint `POST /v1/connect/businesses/provision-or-resolve` remains an item from the previously recorded Gateway endpoint inventory, but this source review did not establish a current Resource API caller for it.
- Therefore do not treat Connect Business provisioning as an active Resource API route awaiting a migration mapping. Its current product caller, if any, must be identified before including it in a live cutover plan. No route or SQL function is inferred.

This supersedes the table row's implication that an existing Resource API provisioning route is awaiting mapping. The accurate state is: Gateway-side endpoint listed; current Resource API caller not found in the inspected router; product usage and any remaining direct database path remain unverified.


## 19 November 2026 — confirmed Resource API evidence-read privilege conflict

### Route and wiring verified on current main

Inspected:
- `src/http/app.ts` — constructs `BusinessCapabilityEvidenceServiceImpl(new PostgresBusinessCapabilityEvidenceRepository())` without a Gateway-backed read repository and registers the evidence router with the capability-mutation Gateway client.
- `src/http/business-capability-evidence-router.ts` — `POST /api/v1/business-capability-evidence` and `PATCH /api/v1/business-capability-evidence/:evidenceId/review` dispatch to the Gateway when the client is configured/required; `GET /api/v1/business-capability-evidence` always calls the Resource API service/repository directly.
- `src/resources/business-capability-evidence/repository.ts` — list/read queries select from `ghm.business_capability_evidence` joined to `ghm.business_capability`, `ghm.business` and `ghm.capability`.
- `database/migrations/20261109140000_close_evidence_and_founder_review_authority.sql` — explicitly executes `REVOKE SELECT ON TABLE ghm.business_capability_evidence FROM ghm_runtime`.

### Finding

The authenticated evidence-list GET route is not migrated behind the Actor Gateway, while the earlier authority-hardening migration revokes the Resource API runtime role's direct SELECT privilege on the evidence table. The signed capability mutation migration (`20261111070000_add_signed_business_capability_mutations.sql`) supplies Gateway operations for evidence submission and review, but does not add a Gateway evidence-list/read operation or change the Resource API GET route.

This is a concrete route/ACL dependency conflict to resolve before production cutover. Depending on the effective production ACL (including inherited grants), the current GET route will fail with a database permission error once the revocation is effective. Do not claim the route is already broken in live production without checking the actual effective privilege; the live catalogue/role state has not been re-inspected for this checkpoint.

### Required disposition

- Keep the existing evidence-list route out of any migration batch that would remove its last effective read privilege until the read path is deliberately resolved.
- Preferred security-preserving options for a source change: add a narrowly scoped, tenant-authorized signed Actor Gateway evidence-read operation and route the GET through it; or provide a reviewed SECURITY DEFINER read projection with a strict actor/tenant authorization contract and grant only the required execution privilege. The first option keeps the sensitive evidence read behind the existing signed gateway boundary.
- Do not simply re-grant broad `SELECT` on `ghm.business_capability_evidence` to `ghm_runtime` to make the endpoint work. That would undo the explicit confidentiality boundary introduced by `20261109140000`.
- Add route tests proving the GET route calls the selected protected read path in production, tests denying cross-business evidence disclosure, and a negative SQL/ACL test proving `ghm_runtime` cannot directly read the evidence table.
- Reconcile the current production effective ACL and actual route deployment version using existing handover evidence before planning any live migration. No repeat production audit was performed here.

### Adjacent direct-read paths retained

The same source review confirmed that business-capability assertion reads and related evidence joins remain Resource API SQL reads. The direct table-read privileges for `ghm.business_capability`, `ghm.capability`, `ghm.business` and `ghm.business_membership` must be mapped separately; the evidence-table revocation alone does not establish their ACL state. Public business-hours and trust-score reads intentionally use separate SECURITY DEFINER projections (`ghm.get_public_business_hours`, `ghm.get_public_trust_score`, `ghm.list_public_trust_scores`) granted to `ghm_runtime`; those public projection grants are not equivalent to granting direct table access.

### Cutover impact

The production migration chain must be reviewed as at least three distinct access classes:
1. Gateway-only signed actor mutations and sensitive reads.
2. Resource API runtime SQL reads that intentionally remain and therefore require narrow, explicit effective privileges or protected read projections.
3. Public read projections whose function EXECUTE grants are intentionally retained for `ghm_runtime`.

Do not revoke runtime table/function privileges based solely on the fact that a related mutation now uses the Gateway. Route-level read and write paths must be evaluated independently. The production batch manifest remains `[]`; no SQL, ACL, Render, deployment, credential, or payment change was made.


## 19 November 2026 — business-capability direct read/create paths and evidence ACL reconciliation

### Source and migration evidence checked on the PR branch

Reviewed the current-main Resource API routers/repositories and the exact migration files on this PR branch:
- `src/http/business-capability-router.ts`
- `src/http/business-capability-evidence-router.ts`
- `src/resources/business-capability/repository.ts`
- `src/resources/business-capability-evidence/repository.ts`
- `src/http/app.ts`
- `20260916210000_create_business_capability.sql`
- `20260916213000_narrow_business_capability_runtime_insert.sql`
- `20261105213000_create_business_capability_evidence.sql`
- `20261105220000_replace_business_capability_assertions.sql`
- `20261109110000_reconcile_capability_evidence_pending_state.sql`
- `20261109120000_serialize_business_capability_assertion_replacement.sql`
- `20261109140000_close_evidence_and_founder_review_authority.sql`
- `20261111070000_add_signed_business_capability_mutations.sql`

### Confirmed route map

| Resource API route | Current production behaviour in source | Database dependency / consequence |
|---|---|---|
| `GET /api/v1/business-capabilities?businessId=...` | Always calls `BusinessCapabilityService.listBusinessCapabilities` directly | Repository SELECTs `ghm.business_capability`, `ghm.business`, `ghm.capability`; `ghm_runtime` SELECT on `ghm.business_capability` was explicitly granted in `20260916210000` and is not revoked by the reviewed later capability migrations |
| `GET /api/v1/business-capabilities/:id` | Always calls Resource API service/repository directly | Same direct SELECT dependency; must remain covered by a reviewed runtime read privilege or be moved to a protected Gateway read |
| `POST /api/v1/business-capabilities` | Calls `service.createBusinessCapability` directly; unlike PUT replacement and PATCH verification, it does not branch to `capabilityMutationGatewayClient` even when `gatewayRequired=true` | Repository checks `ghm.capability` and directly INSERTs `ghm.business_capability`; the initial table migration grants runtime INSERT and the follow-up narrows it to an explicit column list. The current source therefore retains a Resource API direct-create path instead of the signed Gateway operation |
| `PUT /api/v1/business-capabilities` | Uses the signed Gateway replacement operation when Gateway is configured/required | Gateway wrapper calls `ghm.replace_business_capability_assertions`; the legacy runtime EXECUTE grant on that function is deliberately retained by `20261111070000` pending a separately approved manual cutover |
| `PATCH /api/v1/business-capabilities/:id/verification` | Uses the signed Gateway verification operation when Gateway is configured/required | Gateway wrapper calls the legacy transition function internally; `20261111070000` retains legacy runtime grants pending separately approved cutover |
| `POST /api/v1/business-capability-evidence` | Uses signed Gateway submission when Gateway is configured/required | The signed wrapper writes evidence; the Resource API fallback repository still has direct INSERT/readback code but production route dispatches to Gateway |
| `GET /api/v1/business-capability-evidence` | Always calls Resource API repository directly, for both business evidence reads and admin pending-review list | Repository SELECT joins `ghm.business_capability_evidence`, `ghm.business_capability`, `ghm.business` and `ghm.capability`; `20261109140000` revokes `SELECT` on the evidence table from `ghm_runtime` |
| `PATCH /api/v1/business-capability-evidence/:id/review` | Uses signed Gateway review when configured/required | Gateway wrapper calls `ghm.transition_business_capability_evidence`; the legacy runtime EXECUTE grant on the underlying function remains from earlier migrations unless a later reviewed cutover removes it |

### Confirmed implications

1. **Evidence GET remains incompatible with the evidence-table ACL boundary.** Migration `20261105213000` originally grants `SELECT` on the evidence table to `ghm_runtime`; migration `20261109140000` explicitly revokes it. The current evidence GET still directly selects from that table. The SECURITY DEFINER function `ghm.is_business_capability_publicly_evidence_eligible(bigint)` is a separate public eligibility projection and does not satisfy the authenticated evidence-list route. Do not restore broad evidence-table SELECT merely to make the route work.
2. **Business-capability POST is not Gateway-routed in current source.** The app passes `capabilityMutationGatewayRequired` into the router, but the POST handler does not consult it and directly calls the Resource API service. This means the current source does not enforce a Gateway-only create path for that endpoint, despite the signed capability operation vocabulary and Gateway architecture.
3. **The direct business-capability reads are intentionally still supported by an explicit runtime SELECT grant in the initial table migration.** This is a different access class from the evidence table and must not be removed without a protected replacement read path.
4. **The signed mutation migration explicitly says legacy runtime grants remain pending separately approved manual cutover.** It revokes runtime access to the new signed wrapper functions, grants those wrappers to `ghm_actor_gateway`, but does not itself revoke the old runtime EXECUTE grants on `ghm.replace_business_capability_assertions` or `ghm.transition_business_capability_evidence`. The source still has fallback paths for non-Gateway operation; production route wiring must be tested before any legacy grants are removed.
5. The existing evidence mutation Gateway wrappers return joined evidence rows from SECURITY DEFINER functions, but there is no signed evidence-list operation in the reviewed migration or client contract. A read endpoint must be added with actor/tenant scope and admin pending-review authorization, not inferred from the mutation response functions.

### Required source correction before production cutover

- Add a signed Actor Gateway operation for evidence list/read. It must bind the signed actor, requested business scope, and operation context; enforce active business membership for business reads; enforce explicit admin review authority for pending evidence; and return only the fields authorized for that caller.
- Route both business and admin variants of `GET /api/v1/business-capability-evidence` through that operation in production. Add tests for cross-business denial, admin-only pending-review reads, and fail-closed behaviour when Gateway is absent.
- Route `POST /api/v1/business-capabilities` through a signed Gateway create operation (or explicitly document and security-review a deliberate non-Gateway exception). The production-required flag must actually control this handler; it must not be silently ignored.
- Keep `GET /api/v1/business-capabilities` and item GET on the existing narrowly scoped runtime SELECT privilege until a tenant-authorized signed read replacement is implemented and tested. Do not remove the required read grant just because mutations moved to Gateway.
- Keep legacy mutation function grants until the matching production routes are Gateway-only, the Gateway functions and assertions are installed, end-to-end tests pass, and a separately reviewed post-deployment revocation migration is qualified.
- Add SQL ACL tests covering direct runtime SELECT/INSERT/EXECUTE and Gateway EXECUTE for each relation/function. Assert intended privileges by exact object and role, not a blanket “runtime has no capability access” rule.

### Production-state limitation

This is a source and migration-file review only. It does not establish which of these migrations are installed in `ghm_db`, the effective production ACL after inherited memberships, or which Resource API commit is live. Do not infer a live outage or permission grant from repository state. The existing handover evidence remains the authority for what was last inspected in production; do not repeat those inspections without a specific new reason.

The PR #298 manifest remains `[]`. No production query, SQL/ACL change, migration, Render action, deployment, credential change, or payment action was performed.


## 19 November 2026 — storage, trust-score, business-hours and directory-review route/ACL reconciliation

### Scope and source files checked

Re-read this handover and PR #298 first. Then checked current-main:
- `src/http/app.ts`
- `src/http/storage-router.ts`
- `src/storage/repository.ts`
- `src/storage/authorization-adapter.ts`
- `src/storage/service.ts`
- `src/resources/trust-score/repository.ts`
- `src/http/trust-score-router.ts`
- `src/resources/business-hours/repository.ts`
- `src/http/directory-review-router.ts`
- `src/resources/directory-review/repository.ts`
- `src/resources/campaign/repository.ts`
and the exact branch migrations listed below. This remains source/migration-file review only, not a production catalogue/ledger inspection.

### Storage: confirmed split responsibility and a legacy function privilege gap

The current Resource API storage routes remain responsible for provider interactions:
- `POST /api/v1/storage/business-logos/upload` creates a provider upload grant.
- `POST /api/v1/storage/objects/:objectId/complete` checks provider object metadata and bytes, then requests metadata availability.
- `GET /api/v1/storage/objects/:objectId/access` creates a provider download grant after authorization.
- `DELETE /api/v1/storage/objects/:objectId` deletes the provider object and then completes metadata deletion.
- Business logo bind/unbind routes call the Gateway for the protected business-logo binding when the production-required flag is active.
- Public logo resolution intentionally calls `ghm.storage_get_public_business_logo` through the Resource API and redirects to a short-lived provider download grant.

The Gateway owns the protected metadata persistence operations and signed database assertions:
- `20261112140000_add_signed_storage_metadata_actor_gateway.sql`: signed create-pending, get-object and mark-deletion-pending wrappers.
- `20261112150000_add_storage_provider_workflow_attestation.sql`: signed actor plus provider-workflow attestation for mark-available and mark-deleted.
- Both migrations grant the new wrappers to `ghm_actor_gateway` and revoke those wrapper functions from `ghm_runtime` and `ghm_migrator`.
- The Resource API still runs `createPostgresStorageAuthorization` for business membership/owner checks. It reads `ghm.business` and uses the existing authorized/tenant transaction helpers. This is not a metadata-table read and should not be mistaken for Gateway bypass.

**New security finding:** the older persistence-boundary migrations `20261004221000` and `20261004222000` revoke direct runtime access to `ghm.storage_object` but explicitly grant `ghm_runtime` EXECUTE on the legacy SECURITY DEFINER functions `ghm.storage_create_pending`, `ghm.storage_mark_available`, `ghm.storage_mark_deletion_pending`, `ghm.storage_mark_deleted` and `ghm.storage_get_object`. The later signed Gateway migrations add protected wrappers but do not revoke those legacy runtime EXECUTE grants.

Those legacy functions do not carry the new signed actor assertion or provider attestation contract. In particular, the legacy mark-available/mark-deleted functions do not themselves verify provider-workflow attestation. Although production app wiring sets `storageMetadataGatewayRequired = config.isProduction || ...` and `businessLogoGatewayRequired = config.isProduction || ...`, and refuses to start production storage without `GHM_ACTOR_GATEWAY_URL`, the database role retains a direct function invocation surface if those old grants remain effective.

**Required disposition:** add a separately reviewed post-deployment revocation migration for the legacy runtime EXECUTE grants only after the production Resource API is confirmed Gateway-only, the Gateway wrappers and provider attestation are installed, the provider workflow is qualified, and rollback/recovery is documented. Test direct invocation denial for each legacy function under `ghm_runtime`, while proving Gateway wrappers continue to work. Do not revoke the grants in an early additive batch and do not alter production now.

### Trust score: Gateway-backed authenticated routes, intentionally retained public projections

Current authenticated routes:
- `GET /api/v1/trust-scores` → signed Gateway list when configured.
- `GET /api/v1/trust-scores/:businessId` → signed Gateway read.
- `POST /api/v1/trust-scores/:businessId/calculate` → signed Gateway calculate.

Production app wiring sets `trustScoreGatewayRequired = config.isProduction || ...`; the router returns 503 rather than using the Resource API repository if the Gateway client is unavailable. The signed database operations are:
- `20261111150000_add_signed_trust_score_gateway.sql`: `ghm.gateway_calculate_business_trust_score`.
- `20261111170000_add_trust_score_read_projections.sql`: `ghm.gateway_get_trust_score` and `ghm.gateway_list_trust_scores`.
All three wrappers are SECURITY DEFINER, owned by `ghm_schema_owner`, revoked from PUBLIC/`ghm_runtime`/`ghm_migrator`, and granted to `ghm_actor_gateway`.

Public routes are separate and remain Resource API calls:
- `GET /api/v1/public/trust-scores` → `ghm.list_public_trust_scores`.
- `GET /api/v1/public/trust-scores/:businessId` → `ghm.get_public_trust_score`.
The migration intentionally grants only these public projection functions to `ghm_runtime`. Do not remove those grants as part of the authenticated Gateway cutover.

The fallback repository still contains direct authenticated table reads and calls `ghm.calculate_business_trust_score`, but production route wiring requires the Gateway. This legacy fallback must not be treated as the active production route. Any later removal of its grants should be a separate post-deployment revocation after live version confirmation and tests.

### Business hours: authenticated operations are Gateway-required; public read is a distinct path

- `GET /api/v1/businesses/:businessId/hours` uses signed Gateway `business.hours.read` in production.
- `PUT /api/v1/businesses/:businessId/hours` uses signed Gateway `business.hours.replace` in production.
- Production app wiring sets `businessHoursGatewayRequired = config.isProduction || ...`; missing Gateway yields 503, not a database fallback.
- `20261111130000_add_signed_business_hours_gateway.sql` adds signed `ghm.gateway_replace_business_hours`.
- `20261111140000_add_business_hours_read_projections.sql` adds signed `ghm.gateway_get_business_hours` for authenticated reads and `ghm.get_public_business_hours` for public visibility. The authenticated wrapper enforces active membership; the public projection limits output to active, verified, approved Businesses and is granted to `ghm_runtime`.
- The public projection grant is intentional and must remain. Do not confuse it with direct table SELECT or authenticated Gateway access.
- The legacy Resource API repository still contains fallback reads/writes. Production-required routing prevents those paths when configured. No post-cutover runtime function revocation is established by the two reviewed Gateway migrations; preserve this as a separate post-deployment ACL review item, not an inferred live vulnerability.

### Directory review: founder moderation routes are disabled, owner presentation is Gateway-backed

Current router behaviour:
- `GET /api/v1/admin/directory-reviews/authority` returns `isFounderReviewer: false`.
- Founder submit/list/review endpoints return the explicit disabled response and do not call legacy SECURITY DEFINER functions.
- `GET /api/v1/businesses/:businessId/directory-review-presentation` calls the directory-review repository. The repository uses the campaign/directory-review Gateway client when present and fails closed when Gateway is required; its legacy fallback calls `ghm.get_business_directory_review_presentation`.
- Production app constructs the repository with the Gateway client and `campaignDirectoryReviewGatewayRequired` set true.

Migration `20261105230000_create_founder_directory_review.sql` originally grants legacy founder review functions to `ghm_runtime`; migration `20261109140000_close_evidence_and_founder_review_authority.sql` is the explicit founder-review shutdown boundary. Do not re-enable founder moderation or treat it as a pending Gateway route. The active owner-facing presentation read is the only directory-review route in the current router.

### Campaign read/write split reaffirmed

Current campaign list/get handlers use Resource API repository SQL reads, while create/update use the Gateway client when configured/required. The production Gateway-required setting therefore does not imply campaign list/get have moved to Gateway. Keep the campaign read-side SQL privileges and membership authorization dependencies in the route map until a protected read operation is designed or those reads are deliberately retained under narrow runtime access.

### Current cutover disposition

1. Storage legacy runtime EXECUTE grants are an explicit post-deployment revocation candidate; the signed wrappers alone do not remove the older grants.
2. Preserve public trust-score and business-hours projection EXECUTE grants to `ghm_runtime`.
3. Preserve Resource API business/membership reads used by storage authorization and campaign reads unless a protected replacement is introduced.
4. Do not revive founder directory-review moderation routes.
5. Keep all production migration batches empty until exact live ledger, effective ACLs, deployed Resource API version, verified recovery point and provider authority are reconciled.

No production query, SQL/ACL change, migration, Render action, deployment, credential change, or payment action was performed during this review.


## 19 November 2026 — business-logo legacy function grant remains after signed Gateway wrapper

### Reconciliation performed

Re-read the PR #298 handover, hosting handover and current PR state before this pass. Then inspected current-main `src/http/storage-router.ts`, current-main `src/http/app.ts`, and these exact PR-branch migrations:
- `20261106090000_business_logo_storage_binding.sql`
- `20261111160000_add_signed_business_logo_gateway.sql`
- `20261112140000_add_signed_storage_metadata_actor_gateway.sql`
- `20261112150000_add_storage_provider_workflow_attestation.sql`

### Route behaviour

- `PUT /api/v1/businesses/:businessId/logo` and `DELETE /api/v1/businesses/:businessId/logo` call the signed Business Logo Gateway client in production. The production app sets `businessLogoGatewayRequired = config.isProduction || ...`; if the client is missing, the handler fails closed rather than executing the legacy repository fallback.
- `GET /api/v1/public/businesses/:businessId/logo` deliberately uses `ghm.storage_get_public_business_logo(bigint)` to resolve the public provider key. That public projection is separate and must remain available to `ghm_runtime`.
- The Gateway wrapper `ghm.gateway_set_business_logo_object(...)` is SECURITY DEFINER, owned by `ghm_schema_owner`, revoked from PUBLIC/`ghm_runtime`/`ghm_migrator`, and granted to `ghm_actor_gateway`. It validates the signed actor assertion before calling the underlying binding function.

### New ACL finding

The original migration `20261106090000_business_logo_storage_binding.sql` grants `EXECUTE` on legacy `ghm.set_business_logo_object(bigint,bigint,bigint)` to `ghm_runtime`. The later signed Gateway migration adds the protected wrapper but does not revoke the legacy runtime grant.

Therefore, while the production Resource API route is Gateway-required, the database runtime principal retains a direct invocation surface for the old actor-ID-parameterized function if that grant remains effective. This is the same category of residual legacy invocation surface identified for the five storage metadata functions; it is a distinct function and must be included explicitly in the post-deployment ACL revocation inventory.

### Required disposition

- Add `ghm.set_business_logo_object(bigint,bigint,bigint)` to the separately reviewed post-deployment runtime EXECUTE revocation candidate list.
- Before revocation, verify the deployed Resource API version uses the signed Gateway wrapper in production and verify `ghm_actor_gateway` can execute the wrapper successfully with valid signed assertions.
- Keep `ghm.storage_get_public_business_logo(bigint)` EXECUTE available to `ghm_runtime`; it is the intended public logo projection and is not the legacy write function.
- Add SQL tests proving `ghm_runtime` cannot execute the legacy binding function after cutover, `ghm_actor_gateway` can execute only the signed wrapper, and public logo resolution remains available through the public projection.
- Do not revoke either function in the additive pre-deployment batch and do not alter production now.

### Consolidated post-deployment revocation candidates identified so far

These are source/migration-derived candidates, not an approved executable migration:
1. Storage legacy functions: `ghm.storage_create_pending`, `ghm.storage_mark_available`, `ghm.storage_mark_deletion_pending`, `ghm.storage_mark_deleted`, `ghm.storage_get_object`.
2. Business logo legacy binding: `ghm.set_business_logo_object(bigint,bigint,bigint)`.
3. Business registration identity legacy write: handled by the existing guarded candidate migration `20261117010000_revoke_runtime_business_registration_identity_write.sql`.
4. Capability governance legacy write functions: handled by the existing guarded candidate migration `20261117020000_revoke_runtime_capability_governance.sql`.

Do not include public projection functions (`ghm.storage_get_public_business_logo`, `ghm.get_public_business_hours`, `ghm.get_public_trust_score`, `ghm.list_public_trust_scores`) in that revocation set. Their narrowly scoped `ghm_runtime` EXECUTE grants are intentional.

This list is not exhaustive for every legacy function in the entire database. It only consolidates the specific Gateway cutover families inspected in this handover. A complete function-level ACL matrix and exact live effective privileges remain prerequisites before producing any revocation migration or execution batch.

No production query, SQL/ACL change, migration, Render action, deployment, credential change, or payment action was performed.


## 19 November 2026 — supplier classification, Business profile and registration identity cutover recheck

### Reconciliation performed

Re-read the latest migration and hosting handovers, PR #298 metadata/comments, changed-file list and branch comparison before this pass. Reviewed current-main `src/http/app.ts`, `src/resources/business-identity/repository.ts`, `src/http/business-registration-identity-router.ts`, `src/resources/business-registration-identity/repository.ts`, and the PR-branch migrations:
- `20261110010000_add_business_supplier_classification.sql`
- `20261110260000_gateway_supplier_classification_cutover.sql`
- `20261110265000_reconcile_business_profile_legacy_contract.sql`
- `20261110270000_gateway_business_profile_update.sql`
- `20261111030000_bind_supplier_gateway_actor_to_signed_assertion.sql`
- `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion.sql`
- `20261108150000_reconcile_business_registration_identity_authorization.sql`
- `20261117010000_revoke_runtime_business_registration_identity_write.sql`

### Supplier classification — signed Gateway cutover is explicit

- The Resource API route is `PATCH /api/v1/businesses/:businessId` with an `isSupplier`-only patch. It calls `supplierClassificationGatewayClient.update(...)`; it does not use the repository's direct write method.
- Production app construction supplies the client from the Actor Gateway URL; absence returns 503. The route reads the Business again through `service.getManagedBusiness` after the Gateway mutation to form its response.
- The original migration `20261110010000` grants `ghm_runtime` EXECUTE on `ghm.update_business_supplier_classification(bigint,bigint,boolean)`.
- `20261110260000` revokes PUBLIC and `ghm_runtime` from that legacy function and grants the initial Gateway wrapper only to `ghm_actor_gateway`.
- `20261111030000` replaces that wrapper with the short-lived, one-use HMAC assertion contract bound to `supplier.classification.update`; wrapper EXECUTE is revoked from PUBLIC/`ghm_runtime`/`ghm_migrator` and granted to `ghm_actor_gateway`.

**Disposition:** no residual direct runtime EXECUTE gap was found in the reviewed supplier-classification function chain. Preserve the narrow Business SELECT required for post-mutation response hydration; do not misclassify it as a supplier write bypass. Add/retain tests that runtime direct EXECUTE is denied, signed Gateway execution succeeds, invalid/replayed assertions fail, and non-`isSupplier` fields cannot enter this operation.

### Business profile — signed Gateway cutover is explicit; readback remains direct

- The Resource API route is `PATCH /api/v1/businesses/:businessId` for non-`isSupplier` profile fields. It calls `businessProfileGatewayClient.update(...)`, then calls `service.getManagedBusiness` to return the updated representation.
- The repository's `updateBusiness` deliberately throws and states that Business profile must be updated through the authenticated Actor Gateway.
- `20260916250000` originally grants runtime EXECUTE on `ghm.update_business_profile(bigint,bigint,jsonb)`; `20261110270000` revokes PUBLIC and `ghm_runtime` from that legacy function and grants only the Gateway wrapper to `ghm_actor_gateway`.
- `20261111040000` replaces the wrapper with the short-lived, one-use HMAC assertion contract bound to `business.profile.update`, again granting the wrapper only to `ghm_actor_gateway`.
- `20260916251000` narrows direct `ghm.business` UPDATE to the review aggregate columns (`rating`, `review_count`, `updated_at`) and retains SELECT. This is consistent with the Gateway write plus Resource API readback split.

**Disposition:** no residual direct runtime EXECUTE or broad profile UPDATE grant was identified in the reviewed migration chain. Preserve the narrowly scoped review aggregate UPDATE and Business SELECT privileges; do not revoke them as part of the profile write cutover. The later profile legacy-contract reconciliation (`20261110265000`) uses CREATE OR REPLACE on the underlying function; its ACL does not become a new runtime grant merely by replacing the function body, but exact production ACL still requires live reconciliation before cutover approval.

### Business registration identity — read and write must remain separate

- `GET /api/v1/businesses/:businessId/registration-identity` uses the signed Gateway read client in production; the Resource API fails closed when Gateway is required and no client exists.
- `PUT /api/v1/businesses/:businessId/registration-identity` likewise uses the signed Gateway write client in production.
- The original registration migration grants `ghm_runtime` EXECUTE on both `ghm.read_business_registration_identity` and `ghm.update_business_registration_identity`.
- The guarded candidate migration `20261117010000` checks the dedicated Gateway role and the signed replacement function before revoking runtime EXECUTE on the legacy update function. It does not revoke the read function.

**Disposition:** retain legacy read EXECUTE only until production route/version and the Gateway read path are proven; the current guarded candidate targets the write function only. Do not widen the candidate to revoke the read function without a separate read-path/ACL review.

### Connect provisioning scope boundary

The signed database operation `ghm.gateway_provision_connect_business` is added by `20261112080000_signed_connect_business_provisioning_gateway.sql`; it verifies the version-2 signed assertion and grants the wrapper only to `ghm_actor_gateway`, while revoking direct runtime and other service-role access to the legacy mapping helper. The Actor Gateway itself mounts the authenticated `/v1/connect/businesses/provision-or-resolve` route. The separate Resource API app does not construct or invoke its HTTP client, and the current ZAID Connect business-creation journey uses the GHM-native `/api/v1/businesses` route instead. See the later section “Connect Business provisioning caller traced across GHM and ZAID Connect” for the cross-repository caller trace and the legacy external-mapping disposition.

### Updated disposition

- Confirmed post-deployment revocation candidates remain the storage metadata legacy functions and `ghm.set_business_logo_object(bigint,bigint,bigint)`.
- Supplier classification and Business profile legacy runtime function grants are already revoked by their reviewed migrations; do not add them to a new revocation migration without finding a distinct surviving grant.
- Registration identity legacy write is covered by its guarded candidate; keep the read side separate.
- Preserve Business SELECT and review-aggregate UPDATE used for safe Resource API readback and review workflows.
- Connect provisioning requires caller/deployment tracing, not an assumption based solely on the database wrapper or client adapter.

This is repository source/migration review only. It does not establish installed production migrations or effective inherited privileges in `ghm_db`. No production query, SQL/ACL change, migration, Render action, deployment, credential change, or payment action was performed.


## 19 November 2026 — Connect Business provisioning caller traced across GHM and ZAID Connect

### Repositories and handovers checked first

Re-read the current PR #298 migration/hosting handovers and PR metadata before tracing this cross-repository boundary. Inspected:
- GHM `src/actor-gateway/app.ts`, `src/actor-gateway/server.ts`, `src/actor-gateway/connect-business-provisioning-reader.ts`, `src/http/connect-business-provisioning-gateway-client.ts`, `src/integrations/connect/business-provisioning-contracts.ts`, and their tests.
- GHM `20261112080000_signed_connect_business_provisioning_gateway.sql` and `src/db/actor-gateway-connect-business-provisioning-migration-contract.test.ts`.
- ZAID Connect `src/features/authentication/BusinessCreationScreen.jsx`, `src/features/authentication/identity.js`, `api/ghm/[...path].js`, and `docs/06_Implementation/GHM_BACKEND_MIGRATION_HANDOVER_2026-10-13.md`.

### Confirmed GHM Gateway implementation

This capability is not merely a database function without an HTTP surface:
- `src/actor-gateway/app.ts` mounts authenticated `POST /v1/connect/businesses/provision-or-resolve`.
- The route takes actor identity only from the verified GHM bearer token; request body is restricted to `externalBusinessId` and `name`.
- `src/actor-gateway/server.ts` wires `PostgresConnectBusinessProvisioningReader` into the production Gateway server.
- The reader creates the one-use signed assertion and invokes `ghm.gateway_provision_connect_business`.
- The SQL function performs the resolve-or-provision flow in one transaction, applies the external-identity advisory lock, establishes the owner membership, and calls the existing LINK-ONLY mapping function.
- The Gateway app tests cover authenticated invocation, membership denial and invalid input. The client tests cover URL/body/bearer forwarding, denial propagation and malformed responses.

### Caller trace — no active caller found in the inspected Connect mainline

The separate GHM HTTP client `HttpConnectBusinessProvisioningGatewayClient` is implemented and tested, but the inspected GHM Resource API routers/app do not construct or invoke it. Its only in-repository references are its own implementation/tests and the shared interface. The Gateway endpoint is therefore server-wired, but a Resource API-to-Gateway caller is not evidenced in GHM main.

The active ZAID Connect business-creation screen does not call the resolve-or-provision endpoint. `BusinessCreationScreen.jsx` sends `POST /api/v1/businesses` through the authenticated GHM API client. Connect's identity loader then obtains canonical Business memberships from `GET /api/v1/businesses/memberships`. The Connect BFF proxies these GHM API calls to the GHM Internal Runtime; it does not target the Actor Gateway provisioning route.

The existing Connect provisioning contract is specifically a legacy external UUID mapping adapter: provider `supabase` plus an external Business UUID resolves to a canonical GHM Business. It is not the current new-Business creation path, and the provider string is provenance for an external mapping, not an authentication authority. The current Connect mainline uses GHM-native account/session and canonical Business IDs for the inspected creation journey.

### Cutover disposition

1. Do not list Connect provisioning as an active Resource API route dependency or as a prerequisite for the current Connect new-Business creation journey.
2. Keep the Gateway route and SQL operation as a separately bounded legacy external-mapping capability until the product owner explicitly decides whether historical Connect UUID mappings still need resolution.
3. Before enabling or removing it, establish whether any deployed server-side consumer still sends legacy `supabase` external Business UUIDs. The repository source inspected here does not establish production traffic or the existence/absence of historical mapping rows.
4. If no historical consumer or required mapping remains, decommissioning is a separate product/data decision; do not silently repurpose this operation for GHM-native Business creation.
5. No Resource API client wiring should be added merely to make the old contract appear active. New GHM-native Business creation already has its own authenticated route and canonical identity lifecycle.

This closes the caller-trace question at repository-source level. It does not inspect production traffic, mapping rows, or deployed Connect runtime configuration. No production query, SQL/ACL change, migration, Render action, deployment, credential change, or payment action was performed.


## 19 November 2026 — Business Capability create and evidence-read routes are not fully Gateway-cut over

### Handovers and branch state checked first

Re-read this migration handover, the hosting/credentials handover, PR #298 metadata, current changed-file inventory and branch comparison before inspecting the remaining capability routes. This section supersedes any earlier assumption that all Business Capability mutation routes are Gateway-backed.

### Business Capability create — confirmed production route bypass

Inspected current-main:
- `src/http/business-capability-router.ts`
- `src/resources/business-capability/repository.ts`
- `src/http/app.ts`

Inspected current-main migration history:
- `20260916210000_create_business_capability.sql`
- `20260916213000_narrow_business_capability_runtime_insert.sql`

Inspected the Gateway implementation and signed migration already recorded above:
- `src/actor-gateway/business-capability-mutation-reader.ts`
- `20261111070000_add_signed_business_capability_mutations.sql`
- `database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql`

**Finding:** `PUT /api/v1/business-capabilities` and `PATCH /api/v1/business-capabilities/:businessCapabilityId/verification` use the signed Gateway client when production requires it. However, the separate `POST /api/v1/business-capabilities` route still calls `service.createBusinessCapability(...)` directly and does not inspect `gatewayRequired` or use the Gateway client.

That service reaches `PostgresBusinessCapabilityRepository.createBusinessCapability`, which performs a direct INSERT into `ghm.business_capability`. The historical migration `20260916213000` intentionally narrows but does not remove `ghm_runtime` INSERT: it still grants INSERT on `business_id`, `capability_id`, `proficiency_level`, `description`, `effective_from`, `effective_until`, `source_reference`, and `created_by`. The signed Gateway migration adds a signed replacement for assertion replacement and verification, but not a distinct signed single-create operation. The existing manual cutover file revokes legacy assertion/evidence functions and evidence table INSERT; it does not revoke this remaining `business_capability` column-level INSERT grant.

**Disposition / blocker:**
1. Treat the POST route as an active production legacy-write path, not as an already-cut-over route.
2. Add a signed Gateway create operation (with explicit operation name, context binding, tenant/owner authorization, active/selectable capability validation and replay protection) and route production POST through it; alternatively, make the product/API contract intentionally use the existing signed replacement operation, but only if semantics and clients are proven equivalent.
3. Only after the replacement route is deployed and qualified should a separately reviewed cutover revoke the remaining `ghm_runtime` INSERT column privileges and sequence privileges that are no longer required. Do not revoke the INSERT grant now.
4. Add route tests proving production POST fails closed without the Gateway and never reaches the direct repository method; add SQL ACL tests proving the old INSERT is denied after the approved cutover and signed create succeeds.

### Business Capability Evidence — read operations remain direct Resource API SQL

Inspected:
- `src/http/business-capability-evidence-router.ts`
- `src/resources/business-capability-evidence/repository.ts`
- `src/http/app.ts`
- `src/actor-gateway/business-capability-mutation-reader.ts`
- `20261111070000_add_signed_business_capability_mutations.sql`
- `database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql`

**Finding:** evidence submission and review are Gateway-backed in production, but `GET /api/v1/business-capability-evidence` remains a direct Resource API repository read for both:
- business-scoped evidence list (`listForBusiness`); and
- admin pending/verified evidence queue (`listForVerification`).

The repository executes SELECTs against `ghm.business_capability_evidence` joined to Business Capability, Business and Capability. The Gateway reader and signed SQL wrappers inspected here provide evidence submit/review operations, but no corresponding signed evidence-list operations. The original evidence migration grants `ghm_runtime` SELECT on the evidence table, and the manual mutation cutover revokes INSERT/sequence access and legacy mutation functions, not SELECT.

**Disposition / blocker:** this is a missing Gateway read path, not evidence that the existing read is automatically an authorization bypass. The Resource API applies operation authorization and tenant/admin checks before querying. Nevertheless, if the intended production boundary requires all sensitive evidence access to pass through Actor Gateway, implement signed tenant-scoped business evidence listing and a separately authorized admin verification queue read before removing the Resource API SELECT grant. Do not revoke SELECT until both read paths exist, are tested, and production routes use them. Review whether the admin queue should expose only pending items; current repository query includes both `pending` and `verified`, so preserve/adjust that product behavior only through an explicit contract decision.

### Updated capability cutover status

| Route / operation | Current production behaviour | Status |
|---|---|---|
| PUT `/api/v1/business-capabilities` | Signed Gateway assertion replacement | Gateway-backed |
| PATCH `/api/v1/business-capabilities/:id/verification` | Signed Gateway transition | Gateway-backed |
| POST `/api/v1/business-capabilities` | Direct Resource API INSERT | **Uncut legacy write — blocker** |
| POST `/api/v1/business-capability-evidence` | Signed Gateway submit | Gateway-backed |
| PATCH `/api/v1/business-capability-evidence/:id/review` | Signed Gateway review | Gateway-backed |
| GET `/api/v1/business-capability-evidence` | Direct Resource API SELECT for tenant list/admin queue | **Gateway read path missing** |

The signed capability Gateway is therefore not yet a complete replacement for all Business Capability and Evidence routes. Do not describe this family as fully cut over. Keep the existing cutover file and production migration manifest unchanged until the new create operation, read operations, route wiring, tests, live dependency review and migration ordering are complete.

No production query, SQL/ACL change, migration, Render action, deployment, credential change, or payment action was performed.


## 19 November 2026 — Capability catalogue, Campaign reads, Directory Review and Trust Score reconciliation

### Handovers and branch state checked first

Re-read this migration handover and the hosting/credentials handover, checked PR #298 metadata and branch comparison, and confirmed the production batch manifest remains empty. Then inspected the current-main Resource API routers/repositories and the exact PR-branch migration/cutover files listed below. This is repository-source reconciliation only; no production state is inferred.

### Capability catalogue

Current-main routes:
- GET /api/v1/capabilities calls CapabilityService.listSelectableCapabilities and reads ghm.capability through PgCapabilityRepository.
- Admin list/draft/create/update/lifecycle routes call the Capability Governance Gateway client and fail closed with 503 when the client is absent.
- Gateway routes are mounted at /v1/admin/capabilities and corresponding draft/transition operations.

Privilege/migration chain:
- 20260914150000_create_capability_catalogue.sql grants ghm_runtime SELECT on ghm.capability and deliberately makes runtime catalogue access read-only.
- 20261110160000_add_admin_capability_catalogue_governance.sql initially grants the legacy SECURITY DEFINER admin draft/update/transition functions to ghm_runtime.
- 20261110250000_add_gateway_capability_governance.sql adds the Gateway wrappers; 20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql replaces the first-generation account-ID wrappers with signed one-use assertions.
- 20261117020000_revoke_runtime_capability_governance.sql is the guarded revocation candidate for the three legacy runtime governance functions. It checks the gateway role, schema owner and signed replacement function privileges before revocation, and rejects unexpected direct EXECUTE grantees.

Disposition: the public selectable catalogue read is an intentional read-only Resource API query; preserve ghm_runtime SELECT on ghm.capability. Admin governance writes are Gateway-routed and have a guarded legacy-function revocation candidate already in the migration chain. Do not add duplicate revocation logic. The guarded migration remains pending/unexecuted until the production prefix, role/authority and route-version prerequisites are established.

### Campaign routes — create/update cut over; reads remain direct SQL

Current-main routes:
- POST /api/v1/campaigns and PATCH /api/v1/campaigns/:campaignId call the Gateway-backed Campaign repository methods in production.
- GET /api/v1/campaigns and GET /api/v1/campaigns/:campaignId still query ghm.campaign directly in the Resource API repository, including an explicit active-membership check for business list reads.
- Gateway server mounts create and update routes only; there is no Campaign get/list Gateway route or reader method in the inspected src/actor-gateway/app.ts / src/actor-gateway/campaign-directory-review-reader.ts.

Privilege/migration chain:
- 20260918180000_create_campaign.sql grants ghm_runtime SELECT on ghm.campaign, revokes direct table INSERT/UPDATE/DELETE, and initially grants runtime EXECUTE on ghm.create_campaign and ghm.update_campaign.
- Manual cutover database/cutovers/20261112160000_campaign_directory_review_actor_gateway.sql installs signed create/update wrappers, grants those wrappers to ghm_actor_gateway, and revokes runtime EXECUTE on the legacy create/update functions. It does not revoke Campaign table SELECT.
- The matching rollback file restores the old function grants and removes Gateway wrapper access; it is a rollback artifact, not an executable migration.

Disposition / remaining read boundary: Campaign writes are Gateway-routed after the coordinated manual cutover, but Campaign list/detail reads remain direct Resource API SQL. This is not currently a direct write bypass: table writes are revoked and the read route checks membership. If the intended steady-state boundary requires all tenant Campaign data reads to pass through Actor Gateway, add signed, tenant-scoped Campaign get/list operations and route the GET endpoints through them before considering removal of ghm_runtime SELECT. Preserve the current SELECT grant until then. Do not revoke or migrate this read privilege now.

### Directory Review

Current-main routes:
- GET /api/v1/businesses/:businessId/directory-review-presentation calls the Gateway-backed repository in production.
- Founder submission/list/review endpoints are deterministically disabled with 403; the router explicitly avoids invoking the old SECURITY DEFINER functions from the shared runtime.
- GET /api/v1/admin/directory-reviews/authority returns isFounderReviewer: false; it is not a database-backed reviewer-authority read.

The signed presentation wrapper and the allow-list extension are part of the manual Campaign/Directory Review cutover file above. Its legacy presentation function runtime grant is revoked there; the new wrapper is granted only to ghm_actor_gateway.

Disposition: owner presentation read is Gateway-backed; founder review operations are disabled, not an uncut live route. Do not treat the disabled endpoints as active migration prerequisites. Keep the cutover's coordinated-release requirement.

### Trust Score

Current-main routes:
- Private authenticated GET /api/v1/trust-scores, GET /api/v1/trust-scores/:businessId, and POST /api/v1/trust-scores/:businessId/calculate use the Gateway client in production and return 503 if the Gateway is required but unavailable.
- Public GET /api/v1/public/trust-scores and GET /api/v1/public/trust-scores/:businessId use narrowly scoped public projection functions through the Resource API.

Migration chain:
- 20261111150000_add_signed_trust_score_gateway.sql installs signed calculation wrapper ghm.gateway_calculate_business_trust_score.
- 20261111170000_add_trust_score_read_projections.sql installs signed ghm.gateway_get_trust_score and ghm.gateway_list_trust_scores wrappers for private reads, granting EXECUTE only to ghm_actor_gateway.
- The same read-projection migration deliberately preserves ghm.get_public_trust_score(bigint) and ghm.list_public_trust_scores(text) EXECUTE for ghm_runtime, and revokes PUBLIC/ghm_migrator.

Disposition: private reads and calculation are Gateway-backed; public projections remain intentional Resource API reads. Preserve the two public projection EXECUTE grants. Do not add them to the legacy runtime revocation candidates.

### Consolidated update to the route/read inventory

| Capability | Production route status | ACL disposition |
|---|---|---|
| Capability catalogue selectable list | Direct Resource API SELECT | Preserve read-only ghm.capability SELECT |
| Capability admin governance | Signed Gateway writes/list | Existing guarded legacy function revocation candidate |
| Campaign create/update | Signed Gateway after manual cutover | Legacy functions revoked by manual cutover |
| Campaign list/detail | Direct Resource API SELECT + membership check | Gateway read methods missing; preserve table SELECT |
| Directory Review owner presentation | Signed Gateway read | Legacy presentation function revoked by manual cutover |
| Directory Review founder submit/list/review | Disabled 403 | Not an active route dependency |
| Trust Score private read/list/calculate | Signed Gateway | Gateway-only wrapper EXECUTE |
| Trust Score public projections | Resource API public functions | Preserve narrow public projection EXECUTE |

This review does not establish which of these migrations/cutovers are installed in production or the effective privileges of the live role memberships. Production ledger/effective-ACL reconciliation and the coordinated Resource API/Gateway release remain prerequisites. No production query, SQL/ACL change, migration, Render action, deployment, credential change, or payment action was performed.


## 19 November 2026 — storage metadata, business-logo and Resource API residual dependency reconciliation

### Required pre-workflow checks

Before this review, re-read this migration handover and the hosting/credentials handover, fetched PR #298 metadata and changed-file inventory, checked the branch ref, and compared the branch with main. The PR branch is `feat/actor-gateway-production-migration-batches`, current PR head at the start of this review was `a1e63742ab16913c19e4c73656a59f596d25a168`; PR #298 remains open, draft and non-mergeable, 183 commits ahead / 4 behind main. The reviewed branch already contains the previous route/read reconciliation. Do not use older conversational checkpoint SHAs as current branch state.

### Source files inspected on current main

- `src/http/app.ts` (storage and logo dependency construction / production-required flags)
- `src/http/storage-router.ts` (Resource API route wiring)
- `src/storage/service.ts` (provider/metadata/authorization orchestration)
- `src/storage/repository.ts` (legacy PostgreSQL metadata store)
- `src/storage/authorization-adapter.ts` (remaining Resource API authorization reads)
- `src/http/storage-metadata-gateway-client.ts`
- `src/http/business-logo-gateway-client.ts`
- `src/actor-gateway/app.ts` (Gateway HTTP routes)
- `src/actor-gateway/storage-metadata-reader.ts`
- `src/actor-gateway/business-logo-reader.ts`

### Storage metadata: active production route is Gateway-backed

In `src/http/app.ts`, production sets `storageMetadataGatewayRequired = config.isProduction`. When storage is enabled, production startup also requires `GHM_ACTOR_GATEWAY_URL` and `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET`. The storage metadata factory creates `HttpStorageMetadataGatewayClient`; `src/http/storage-router.ts` uses that factory for metadata operations and returns 503 rather than falling back to `createPostgresStorageMetadataStore` when Gateway is required but unavailable.

The Resource API routes use the Gateway metadata store for:
- upload metadata creation;
- metadata lookup before logo binding, upload completion, object access and deletion;
- mark deletion pending;
- mark available after provider upload;
- mark deleted after provider deletion.

The Actor Gateway exposes matching `POST /v1/storage/metadata`, `GET /v1/storage/metadata/:objectId`, and state-transition endpoints for deletion-pending, available and deleted. Its reader calls signed SQL wrappers using request assertions. This is a complete source-level metadata route path for the operations inspected; do not describe storage metadata as an unimplemented Gateway read path.

### Residual Resource API database dependencies are intentional and must be mapped separately

The Resource API still performs authorization reads through `src/storage/authorization-adapter.ts`:
- business-manager membership/role checks via `withTenantTransaction`;
- public-business active-state check via a narrowly scoped `SELECT 1 FROM ghm.business WHERE id = $1 AND is_active = true`;
- tenant membership check for non-public object reads.

These checks are not direct storage-metadata writes and are not evidence of a metadata bypass. Preserve the narrow business/membership read privileges required by the Resource API until authorization itself is deliberately moved. Do not revoke generic business SELECT, membership, or tenant-transaction dependencies as part of the storage metadata cutover without a separate route/ACL proof.

The Resource API also remains responsible for the external storage provider workflow: issuing upload/download grants, validating/authorizing object access, deleting provider objects, and orchestrating cleanup. This provider work is intentionally outside the database Gateway. Provider workflow attestations bind the provider completion/deletion evidence to the signed Gateway state transitions. Do not move provider credentials or provider side effects into the Gateway as an assumed requirement of database isolation.

### Business logo: split between protected binding and public projection

- Authenticated `PUT /api/v1/businesses/:businessId/logo` and `DELETE /api/v1/businesses/:businessId/logo` use the Gateway client in production; `businessLogoGatewayRequired = config.isProduction` prevents the legacy SQL fallback.
- Gateway `PUT /v1/businesses/:businessId/logo` calls `BusinessLogoGatewayReader.bind`, which invokes signed `ghm.gateway_set_business_logo_object`.
- The Resource API continues to validate the selected object metadata through the storage Gateway before binding, and orchestrates cleanup of the previous object through the storage provider + Gateway metadata workflow.
- Public `GET /api/v1/public/businesses/:businessId/logo` intentionally remains a Resource API projection call to `ghm.storage_get_public_business_logo`, then issues a short-lived provider download grant. Preserve this public projection EXECUTE grant for `ghm_runtime`; it is not the legacy authenticated binding function.

### Legacy function grants: candidate versus active caller

The old Resource API metadata repository in `src/storage/repository.ts` still contains fallback calls to:
- `ghm.storage_create_pending`
- `ghm.storage_mark_available`
- `ghm.storage_mark_deletion_pending`
- `ghm.storage_mark_deleted`
- `ghm.storage_get_object`

Likewise, `src/http/storage-router.ts` retains a non-Gateway fallback to `ghm.set_business_logo_object`. Those fallbacks remain in source for non-production/test compatibility, but the production-required flags route production away from them. The previously identified legacy `ghm_runtime` EXECUTE grants therefore remain a post-deployment least-privilege revocation candidate, not proof that the active production request path still invokes those functions. Before revocation, verify deployed Resource API version, Gateway endpoint readiness, live effective grants, rollback compatibility, and any other callers outside the inspected HTTP routes. Keep `ghm.storage_get_public_business_logo` available for the public projection.

### Route and privilege disposition

| Operation | Production path from current source | Disposition |
|---|---|---|
| Storage metadata create/read/transitions | Resource API -> signed Actor Gateway -> Gateway SQL wrappers | Gateway-backed; legacy runtime metadata function grants are post-cutover revocation candidates |
| Storage business membership/role checks | Resource API -> authorized/tenant PostgreSQL transaction | Retain narrow authorization dependencies pending separate review |
| Provider upload/download/delete | Resource API -> configured object-storage provider | Intentionally remains outside DB Gateway |
| Authenticated business-logo bind/unbind | Resource API -> signed Actor Gateway -> `gateway_set_business_logo_object` | Gateway-backed; legacy `set_business_logo_object` grant is a post-cutover revocation candidate |
| Public business-logo lookup | Resource API -> `storage_get_public_business_logo` -> provider download grant | Preserve narrow public projection EXECUTE |

### Deployment/configuration dependency reminder

Production storage startup requires `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET` in the Resource API runtime in addition to the Actor Gateway URL. This is distinct from the Gateway's `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` and distinct from the provider's own credentials. The Render form for the new Actor Gateway is not a substitute for configuring the existing Resource API runtime. Do not disclose, copy, or rotate any secret as part of this source-only review. Verify the existing runtime's configured variable through the already documented read-only operational process before a coordinated storage cutover; no Render inspection or change was performed in this review.

No production query, SQL/ACL change, migration, Render action, deployment, credential change, object-storage action, or payment action was performed. Production effective privileges and deployed code versions are not inferred from repository source.


## 19 November 2026 — business-hours public projection and residual SQL dependency reconciliation

### Required pre-workflow checks and authoritative branch state

Re-read this migration handover and the hosting/credentials handover before starting this workstream. Re-fetched PR #298 metadata, its changed-file inventory, and compared the PR branch with `main`. At the start of this review the authoritative PR head was `e0f0698616884bf8db94237ba2fd0955d4fb6067`; PR #298 was open, draft and non-mergeable, 184 commits ahead and 4 behind `main`. The earlier storage/logo section contains a stale “pre-review head” copied from its initial drafting checkpoint; use the actual GitHub PR head and this section for current checkpoint tracking, not that historical value.

### Source files inspected on current `main`

- `src/http/app.ts`
- `src/http/business-hours-gateway-client.ts`
- `src/resources/business-hours/repository.ts`
- `src/resources/business-hours/service.ts`
- `src/actor-gateway/app.ts`
- `src/actor-gateway/business-hours-reader.ts`

### Authenticated Business Hours routes

Production sets `businessHoursGatewayRequired = config.isProduction` in `src/http/app.ts`. The authenticated routes are:
- `GET /api/v1/businesses/:businessId/hours`
- `PUT /api/v1/businesses/:businessId/hours`

Both route to `HttpBusinessHoursGatewayClient` when configured. If the Gateway client is absent while the production-required flag is true, the route returns 503 instead of falling back to the Resource API repository. The Actor Gateway mounts:
- `GET /v1/businesses/:businessId/hours`
- `PUT /v1/businesses/:businessId/hours`

Its `PostgresBusinessHoursGatewayReader` uses signed request assertions and the SQL wrappers `ghm.gateway_get_business_hours` and `ghm.gateway_replace_business_hours`. Therefore the authenticated read/replace paths are Gateway-backed in production source. The repository's legacy `getBusinessHours` and `replaceBusinessHours` methods remain fallback paths, not evidence of the active production route invoking them.

### Public Business Hours route is intentionally not Gateway-backed

The active public route is `GET /api/v1/public/businesses/:businessId/hours`. It calls `businessHoursService.listPublicBusinessHours`, which calls `PostgresBusinessHoursRepository.listPublicBusinessHours`. That repository:
1. directly checks `ghm.business` for `is_active = true`, `is_verified = true`, and `verification_status = 'approved'`;
2. reads the public hours through `ghm.get_public_business_hours($1)`.

This is a public projection path and is separate from the authenticated Gateway-backed route. Do not classify it as an authenticated Gateway bypass or revoke its required narrow privileges as part of the Gateway cutover. The public route is registered with `requireRegisteredPublicAccess('business_hours', 'readPublic')`.

The repository also contains `getPublicBusinessHours(context, businessId)`, which uses `withAuthorizedTransaction` and directly reads `ghm.business_hours`. No invocation of this method was identified in the inspected `src/http/app.ts` route wiring; treat it as a repository capability / possible unused or elsewhere-injected path, not as a proven active HTTP route. Trace all call sites before any ACL decision.

### Privilege and migration conclusion — source proof is not live ACL proof

This source review establishes the required public dependencies (`ghm.business` approved/active predicate and `ghm.get_public_business_hours`) and the signed Gateway SQL wrapper names. It does **not** establish the exact current grants, grantors, ownership, PUBLIC privileges, or effective production privileges. Do not invent a grant matrix from the TypeScript call sites. Before production migration planning, map the exact migration definitions and ACL statements for:
- `ghm.get_public_business_hours`;
- the `ghm.business` columns needed by the public active/verified/approved predicate;
- `ghm.gateway_get_business_hours` and `ghm.gateway_replace_business_hours`;
- the legacy `ghm.replace_business_hours` fallback;
- direct `ghm.business_hours` access used by the repository's `getPublicBusinessHours` method, if any live caller exists.

Preserve the public projection and its minimum required privileges. Do not restore broad table SELECT or remove public projection access without proving a replacement and all callers.

### Timeout and retry implication

The inspected `HttpBusinessHoursGatewayClient` defaults to a 5,000 ms AbortController timeout for both list and replace. The authenticated `GET` is read-only and may be eligible for a bounded cold-start retry after careful response/error classification. The `PUT` replaces a complete hours collection; although it may be state-idempotent for identical input, no retry should be added until the endpoint's authorization, assertion nonce/replay behavior, and retry semantics are tested end-to-end. No blanket retry is approved by this review.

### Current disposition

| Route / operation | Production source path | Cutover disposition |
|---|---|---|
| Authenticated hours GET | Resource API -> signed Actor Gateway -> `gateway_get_business_hours` | Gateway-backed; legacy repository read is fallback only |
| Authenticated hours PUT | Resource API -> signed Actor Gateway -> `gateway_replace_business_hours` | Gateway-backed; legacy repository write is fallback only |
| Public hours GET | Resource API -> approved/active business predicate -> `get_public_business_hours` | Preserve narrow public projection privileges |
| Repository `getPublicBusinessHours` | Authorized transaction -> direct `business_hours` SELECT | No active router caller identified; trace before privilege changes |

No production SQL/query, migration, ACL/role change, Render inspection/change, deployment, credential operation, backup operation, or payment action was performed. Production grants and deployed service versions remain unverified by this source-only review.


## 19 November 2026 — Business Hours migration ACL reconciliation

### Pre-workflow rule and branch checkpoint

Re-read the migration and hosting handovers, PR #298 metadata, changed-file inventory, and branch comparison before this task. At review start, PR #298 head was `33bab1e8600a85fb6addc6ec8189730f709e3d77`, open/draft/non-mergeable, 185 commits ahead and 4 behind `main`. Source SQL below was fetched from the current `main` branch; it is source evidence, not proof of the live production ledger or effective ACLs.

### Exact migration definitions inspected

- `database/migrations/20260916223000_create_business_hours.sql`
- `database/migrations/20261111130000_add_signed_business_hours_gateway.sql`
- `database/migrations/20261111140000_add_business_hours_read_projections.sql`

### Confirmed grants and function boundaries in source

**Original table grant:** `20260916223000_create_business_hours.sql` creates `ghm.business_hours`, transfers ownership to `ghm_schema_owner`, then explicitly grants:
- `USAGE` on schema `ghm` to `ghm_runtime`;
- `SELECT` on table `ghm.business_hours` to `ghm_runtime`;
- `USAGE` on sequence `ghm.business_hours_id_seq` to `ghm_runtime`.

The same migration defines `ghm.replace_business_hours(bigint,bigint,jsonb)` as SECURITY DEFINER, revokes PUBLIC, and grants EXECUTE to `ghm_runtime`. It grants no runtime INSERT/UPDATE/DELETE table privileges.

**Signed write wrapper:** `20261111130000_add_signed_business_hours_gateway.sql` creates `ghm.gateway_replace_business_hours(...)`, verifies a signed `business.hours.replace` assertion, delegates to `ghm.replace_business_hours`, revokes wrapper EXECUTE from PUBLIC/runtime/migrator and grants it to `ghm_actor_gateway`. It explicitly says existing runtime grants remain until a separate manual cutover is approved. It does not revoke runtime EXECUTE on the legacy `ghm.replace_business_hours` function or the table SELECT grant.

**Signed member read and public projection:** `20261111140000_add_business_hours_read_projections.sql` creates `ghm.gateway_get_business_hours(...)`, verifies signed `business.hours.read`, checks active membership with owner/administrator/member role, revokes wrapper EXECUTE from PUBLIC/runtime/migrator and grants it to `ghm_actor_gateway`. It also creates `ghm.get_public_business_hours(bigint)` as SECURITY DEFINER, revokes its EXECUTE from PUBLIC/migrator and grants EXECUTE to `ghm_runtime`. It does not revoke `SELECT` on `ghm.business_hours` from `ghm_runtime`.

### Route/caller interpretation

Current Resource API source in `src/http/app.ts` routes authenticated Business Hours GET and PUT through the Gateway in production, returning 503 rather than falling back when the production-required Gateway is absent. The public route `GET /api/v1/public/businesses/:businessId/hours` uses `PostgresBusinessHoursRepository.listPublicBusinessHours`, which checks approved/active business state and calls `ghm.get_public_business_hours`. The public function grant is therefore a real active production dependency.

The repository also contains legacy methods `getBusinessHours` and `replaceBusinessHours`, plus `getPublicBusinessHours` (direct table SELECT). The production route wiring inspected selects Gateway for authenticated GET/PUT. No active HTTP route invocation of `getPublicBusinessHours` was identified in the inspected router wiring. A repository-wide call-site proof is not yet complete: the available GitHub code-search queries returned no indexed matches, which is not evidence that no callers exist. Do not claim the method is unused globally.

### Security/cutover conclusion

The source proves that `ghm_runtime` receives broad table-level SELECT in the original migration and that the later signed Gateway migrations do not revoke it. The public projection is separately available through a SECURITY DEFINER function, so it does not inherently require direct table SELECT. However, the remaining repository methods and any non-HTTP callers must be exhaustively accounted for before removing the table grant.

Record the following as a **post-deployment ACL revocation candidate, not an approved immediate migration**:
- revoke `SELECT ON ghm.business_hours` from `ghm_runtime`, only after proving no active production Resource API or other runtime caller depends on direct reads;
- separately evaluate revoking EXECUTE on legacy `ghm.replace_business_hours(bigint,bigint,jsonb)` from `ghm_runtime`, after confirming production route cutover and other callers;
- preserve EXECUTE on `ghm.get_public_business_hours(bigint)` for `ghm_runtime`;
- preserve the Gateway wrapper EXECUTE grants for `ghm_actor_gateway`;
- do not revoke sequence USAGE merely because table SELECT is removed; inspect actual sequence consumers/privileges separately.

Do not bundle this candidate into the initial Gateway installation prefix. It is a least-privilege post-cutover step and must be based on the exact production deployed version, live ledger, effective ACL/ownership state, complete caller inventory, rollback plan, and verified recovery point. No live production ACL has been queried or changed.

### Evidence limitations and next work

The source migration definitions establish intended grants, not production effective privileges. The GitHub code-search endpoint returned zero/incomplete indexed results for `getPublicBusinessHours` and `ghm.business_hours`; treat that as an indexing limitation, not a clean call-site audit. Next source task: inspect the complete repository call graph and remaining migration history for direct business-hours table/function use, then map the exact migration prefix. Production ledger/ACL verification remains a separate gated activity and must not be repeated without a documented reason.

No production SQL/query, migration, ACL/role change, Render action, deployment, credential or backup operation was performed.


## 19 November 2026 — Business Hours caller trace completed; existing manual cutover corrected

### Reconciliation correction

The preceding section identified the Business Hours table SELECT and legacy replacement EXECUTE grants as post-deployment revocation candidates. That is true as a description of the required privilege change, but the repository already contains the exact manual cutover file:
`database/cutovers/20261111130000_revoke_legacy_business_hours_runtime.sql`.

It performs, in one transaction:
- `REVOKE ALL ON FUNCTION ghm.replace_business_hours(bigint,bigint,jsonb) FROM PUBLIC,ghm_runtime`;
- `REVOKE SELECT ON TABLE ghm.business_hours FROM PUBLIC,ghm_runtime`;
- `REVOKE ALL ON SEQUENCE ghm.business_hours_id_seq FROM PUBLIC,ghm_runtime`.

It is explicitly marked MANUAL CUTOVER ONLY and documents the preconditions: Gateway routes deployed and qualified, role identities verified, and a fresh independently verified production backup. This cutover file is already present on `main`; do not create a duplicate migration or new cutover for the same privilege set.

### Repository method-level trace

Inspected current `main`:
- `src/resources/business-hours/repository.ts`
- `src/resources/business-hours/service.ts`
- `src/http/business-hours-http.test.ts`
- `src/db/actor-gateway-business-hours-migration-contract.test.ts`
- the recursive Git tree (not truncated) to enumerate Business Hours source/test files and all existing manual cutovers.

Repository methods:
- `listPublicBusinessHours` checks public business status and reads via `ghm.get_public_business_hours($1)`;
- `getBusinessHours` uses `withTenantTransaction` and also reads via `ghm.get_public_business_hours($1)`, not direct `ghm.business_hours`;
- `getPublicBusinessHours` uses `withAuthorizedTransaction` and directly SELECTs `ghm.business_hours`;
- `replaceBusinessHours` uses `withTenantTransaction` and calls legacy `ghm.replace_business_hours`.

The service class exposes all repository methods, but the inspected production HTTP route wiring selects the Gateway client for authenticated GET/PUT when `businessHoursGatewayRequired` is true. The HTTP test explicitly proves PUT returns 503 and does not invoke the legacy repository when Gateway is required but unavailable, and separately proves that the configured Gateway client is used. The existing contract test reads the manual cutover file and asserts that the legacy function, table SELECT and sequence privileges are revoked.

The method-level source review therefore narrows the remaining direct table SELECT concern to `getPublicBusinessHours`. No invocation was found in the inspected HTTP route wiring; the service API still exposes it. The repository-wide caller trace is **not conclusively complete**: GitHub code search returned zero/incomplete results, and the full 453-file source set was enumerated but not downloaded and text-scanned. Do not label the method globally unused. It remains a residual call-site verification item before applying the cutover.

### Correct Business Hours disposition

- The exact manual cutover already exists. No duplicate SQL should be authored.
- The public projection function `ghm.get_public_business_hours(bigint)` remains granted to `ghm_runtime`; it supports both public list and the tenant-authorized repository read method.
- The direct table SELECT and legacy replacement function privileges are only removed by the manual cutover; source existence does not establish that it has run in production.
- The cutover also revokes sequence USAGE. This is intentional in the existing file and should not be omitted from any review of its effect.
- Do not apply the cutover until all documented production preconditions are independently met, including live role/identity authority, exact deployed Gateway/Resource API versions, complete caller inventory, and verified backup/recovery point.
- No production ledger or ACL query was repeated in this task. No production SQL, migration, ACL/role change, Render action, deployment, credential or backup operation occurred.

### Repository cutover inventory note

The recursive `main` tree currently contains distinct manual cutovers for capability governance, registration identity, business-capability mutations, saved businesses, Business Hours, trust scores, business logos, authentication issuer privileges, and campaign/directory review (including rollback files for the latter two). This inventory is a source-tree fact only; it is not evidence that any cutover ran in production. Use these existing files when reconciling subsequent capability families rather than assuming a missing cutover or creating duplicates.


## 19 November 2026 — Trust Score and Business Logo cutover reconciliation

### Pre-workflow state

Re-read the migration and hosting handovers, checked PR #298 and its changed-file inventory, and compared the branch to `main`. At review start the branch head was `378bfa00692189cca30351a259cbdf2cbc584a0f`; PR #298 was open/draft/non-mergeable, 187 commits ahead and 4 behind `main`. All source and SQL findings below are from current `main`; none establish production deployment or applied-ledger state.

### Trust Score — routes, SQL grants and existing manual cutover

Inspected:
- `src/http/trust-score-router.ts`
- `src/resources/trust-score/repository.ts` and `service.ts`
- `src/http/trust-score-gateway-client.ts`
- `src/actor-gateway/trust-score-reader.ts`
- `database/migrations/20260916240000_create_trust_score.sql`
- `database/migrations/20261111150000_add_signed_trust_score_gateway.sql`
- `database/migrations/20261111170000_add_trust_score_read_projections.sql`
- `database/cutovers/20261111150000_revoke_legacy_trust_score_runtime.sql`
- `src/db/actor-gateway-trust-score-migration-contract.test.ts`

**Active production route split:**
- Authenticated `GET /api/v1/trust-scores`, `GET /api/v1/trust-scores/:businessId`, and `POST /api/v1/trust-scores/:businessId/calculate` use the signed Gateway client when configured; when `gatewayRequired` is true and no client exists they return 503 instead of falling back to the repository.
- Public `GET /api/v1/public/trust-scores` and `GET /api/v1/public/trust-scores/:businessId` intentionally use Resource API repository methods backed by `ghm.list_public_trust_scores(text)` and `ghm.get_public_trust_score(bigint)`.
- The Gateway read wrappers `gateway_get_trust_score` and `gateway_list_trust_scores` require signed `trust.score.read` assertions and grant EXECUTE only to `ghm_actor_gateway`. Calculation uses signed `trust.score.calculate`.

**Original migration privileges:** `20260916240000_create_trust_score.sql` grants `ghm_runtime` table SELECT and sequence USAGE on `ghm.trust_score`, revokes runtime INSERT/UPDATE/DELETE, and grants runtime EXECUTE on `ghm.calculate_business_trust_score(bigint,bigint)`.

**Public projections:** `20261111170000_add_trust_score_read_projections.sql` creates SECURITY DEFINER public projection functions and grants EXECUTE to `ghm_runtime`; it does not itself revoke the original table SELECT, sequence, or legacy calculation function privileges.

**Existing manual cutover:** `database/cutovers/20261111150000_revoke_legacy_trust_score_runtime.sql` already exists. It revokes runtime/PUBLIC EXECUTE on `calculate_business_trust_score`, table SELECT on `trust_score`, and sequence privileges. It is marked MANUAL CUTOVER ONLY and requires Gateway routes deployed/qualified, role identities verified, and a fresh independently verified production backup. Do not create a duplicate migration or cutover.

**Disposition:** preserve runtime EXECUTE on the two public projection functions and Gateway-only EXECUTE on signed wrappers. The existing manual cutover is the post-deployment privilege removal candidate for legacy direct reads/calculation. The source-level production router requires the Gateway for authenticated paths, while public paths use the SECURITY DEFINER projections. The repository still contains legacy direct table-query methods as non-production fallback. The cutover must remain unapplied until deployed Resource API version, complete non-HTTP caller inventory, live effective ACL/role state and documented recovery prerequisites are established. No production ledger/ACL query was repeated.

### Business Logo — authenticated binding versus public projection/provider work

Inspected:
- `src/http/storage-router.ts`
- `src/http/business-logo-gateway-client.ts`
- `src/actor-gateway/business-logo-reader.ts`
- `database/migrations/20261106090000_business_logo_storage_binding.sql`
- `database/migrations/20261111160000_add_signed_business_logo_gateway.sql`
- `database/cutovers/20261111160000_revoke_legacy_business_logo_runtime.sql`
- `src/db/actor-gateway-business-logo-migration-contract.test.ts`

**Authenticated logo binding:** `PUT /api/v1/businesses/:businessId/logo` and `DELETE /api/v1/businesses/:businessId/logo` validate the target object through the storage metadata Gateway and call `bindLogo`. Production sets `businessLogoGatewayRequired = config.isProduction`; the route must not fall back to the legacy database function when the Gateway is unavailable. The Actor Gateway calls signed `ghm.gateway_set_business_logo_object` with operation `business.logo.bind`.

**Legacy grant:** `20261106090000_business_logo_storage_binding.sql` grants `ghm_runtime` EXECUTE on `ghm.set_business_logo_object(bigint,bigint,bigint)`. The signed wrapper migration grants its wrapper only to `ghm_actor_gateway` but does not revoke the original function grant. Existing manual cutover `20261111160000_revoke_legacy_business_logo_runtime.sql` revokes that exact legacy function EXECUTE from PUBLIC/runtime. Do not create a duplicate cutover.

**Public logo route:** `GET /api/v1/public/businesses/:businessId/logo` intentionally calls `ghm.storage_get_public_business_logo(bigint)`, then requests a short-lived provider download grant and redirects. The migration defines that function as SECURITY DEFINER and grants EXECUTE to `ghm_runtime`. Preserve this grant; it is not the authenticated logo-binding function.

**Provider work:** upload validation, provider upload/download grants, object deletion and cleanup remain Resource API/storage-provider responsibilities. They are not equivalent to the protected database logo-binding mutation and should not be moved into the Gateway by assumption.

**Disposition:** the authenticated binding route is Gateway-backed; the legacy binding grant is an existing post-cutover revocation candidate; public projection EXECUTE and provider orchestration remain. Apply the manual cutover only after exact deployed Resource API/Gateway versions, other callers, effective production grants and backup/recovery preconditions are verified.

### Combined route/ACL matrix

| Capability | Active production authenticated path | Public path | Existing cutover |
|---|---|---|---|
| Trust Score | Signed Gateway read/calculate | Resource API SECURITY DEFINER projections | `20261111150000_revoke_legacy_trust_score_runtime.sql` |
| Business Logo binding | Signed Gateway bind/unbind; metadata checked via storage Gateway | Resource API SECURITY DEFINER logo projection + provider download grant | `20261111160000_revoke_legacy_business_logo_runtime.sql` |

### Remaining gates and no-action record

- Source tree contains both exact manual cutovers. Do not author duplicates.
- Public Trust Score projection functions and public Business Logo projection function are intentional runtime dependencies and must remain executable by `ghm_runtime`.
- Repository fallback methods and possible callers outside the inspected HTTP routes still require complete caller inventory; source presence alone is not proof of production use, and a missing indexed search result is not proof of absence.
- Manual cutovers are not migrations to add to `config/production-migration-batches.json`; manifest remains `[]`.
- No production SQL/query, migration execution, ACL/role change, Render inspection/change, service deployment, credential/backup operation, provider-object operation, or payment action was performed.


## 19 November 2026 — Campaign and Directory Review cutover/rollback reconciliation

### Pre-workflow checkpoint

Re-read both Actor Gateway handovers, fetched PR #298 metadata and changed-file inventory, and compared the branch with `main`. At review start PR #298 head was `b9a09d396f205db18d9296766ead6df27638aa17`, open/draft/non-mergeable, 188 commits ahead and 4 behind `main`. All source/SQL evidence below is from current `main`; no live production ledger, effective ACL, or deployed service state was inferred.

### Exact files inspected

- `database/cutovers/20261112160000_campaign_directory_review_actor_gateway.sql`
- `database/cutovers/20261112161000_campaign_directory_review_actor_gateway_rollback.sql`
- `database/migrations/20260918180000_create_campaign.sql`
- `database/migrations/20261105230000_create_founder_directory_review.sql`
- `src/http/campaign-router.ts`
- `src/http/directory-review-router.ts`
- `src/resources/campaign/repository.ts`
- `src/resources/directory-review/repository.ts`
- `src/actor-gateway/campaign-directory-review-reader.ts`
- `src/db/campaign-directory-review-actor-gateway-migration-contract.test.ts`
- `src/resources/campaign-directory-review-gateway-repository.test.ts`

### Campaign route split: mutations Gateway-backed, reads remain tenant-authorized Resource API queries

The manual cutover extends the signed actor assertion allow-list with `campaign.create`, `campaign.update`, and `directory_review.presentation.read`; it creates the matching signed SECURITY DEFINER wrappers, revokes their EXECUTE from PUBLIC/runtime/migrator, and grants EXECUTE only to `ghm_actor_gateway`. The wrappers bind request context and delegate to the existing business-management functions.

The Resource API repository uses the Gateway for:
- `POST /api/v1/campaigns` create;
- `PATCH /api/v1/campaigns/:campaignId` update.

The repository retains direct reads for:
- `GET /api/v1/campaigns?businessId=...` list;
- `GET /api/v1/campaigns/:campaignId` detail.

Those reads execute inside `withAuthorizedTransaction`, explicitly check active business membership/role, and then SELECT `ghm.campaign`. The original campaign migration grants `ghm_runtime` table SELECT and sequence USAGE but no direct INSERT/UPDATE/DELETE; writes are SECURITY DEFINER functions. Therefore **do not revoke table SELECT or sequence access as part of this cutover** without first moving and testing the list/detail read paths. The current design deliberately protects mutation authority while retaining tenant-scoped read access in the Resource API.

### Directory Review: owner presentation Gateway-backed; founder workflow remains disabled

- Owner/administrator presentation route `GET /api/v1/businesses/:businessId/directory-review-presentation` delegates to the signed Gateway client when configured. The cutover's `gateway_get_business_directory_review_presentation` validates the one-use signed `directory_review.presentation.read` assertion and delegates to `ghm.get_business_directory_review_presentation`.
- Founder authority endpoint currently returns `{ isFounderReviewer: false }`; it does not query the founder reviewer table.
- Founder submission, queue-list and decision routes remain deterministically disabled with HTTP 403. The router comment explicitly states they must never invoke the revoked legacy submit/list/review SECURITY DEFINER functions.
- The original founder migration creates reviewer/event tables with RLS and revokes all table privileges from PUBLIC/runtime. It grants runtime EXECUTE on legacy founder functions, but the routes above do not call those functions after founder workflow was disabled.
- The new Gateway cutover does **not** re-enable founder submission, list or decision functionality. It adds only owner presentation. Do not represent the Gateway work as a founder moderation workflow replacement or as authorization to enable those endpoints.

### Existing cutover and rollback semantics

The cutover file is explicitly MANUAL CUTOVER ONLY and guarded by `session_user = ghm_migrator` and `current_user = ghm_schema_owner`. It:
- adds the three signed operations to the assertion allow-list with a guard against partial extension;
- creates the three signed wrappers and grants them only to `ghm_actor_gateway`;
- revokes runtime/PUBLIC execution of the legacy `create_campaign`, `update_campaign`, and `get_business_directory_review_presentation` functions.

It does **not** revoke campaign table SELECT/sequence privileges, because campaign list/detail remain Resource API reads.

The paired rollback is also manual and role-guarded. It restores runtime EXECUTE on the three legacy functions and revokes Gateway execution on the three wrappers. It does not drop the wrapper functions, revert migration history, or remove the added assertion allow-list operation names. The rollback comments require Gateway routes out of traffic and a Resource API version restored to legacy function callers. Rehearse this exact sequence and confirm deployed-version compatibility before any production cutover; don't assume rollback is a complete schema rollback.

### Tests and remaining proof

The inspected contract test checks signed allow-list extension, request-context binding, Gateway-only wrapper grants, legacy runtime function revocation, rollback grants/revocations, and idempotent handling of the allow-list extension. The repository test verifies that Campaign create/update and owner presentation delegate to the Gateway with the verified bearer token. This is source/test contract evidence; it is not a production deployment or effective-ACL check.

### Current privilege disposition

| Resource | Runtime disposition after cutover |
|---|---|
| Campaign create/update legacy function EXECUTE | Revoke (existing manual cutover) |
| Campaign table SELECT | Preserve for tenant-authorized list/detail routes |
| Campaign identity sequence USAGE | Preserve pending sequence consumer review; not part of cutover |
| Directory-review legacy founder submit/list/review EXECUTE | Revoke; founder routes remain disabled |
| Legacy owner presentation function EXECUTE | Revoke; signed Gateway wrapper replaces it |
| Signed Campaign/review Gateway wrappers | Grant only to `ghm_actor_gateway` |
| Founder reviewer/event tables | Keep RLS and no runtime table grants |
| Founder workflow activation | Not authorized by this cutover |

### No-action and next-step record

- Both exact cutover and rollback files already exist. Do not duplicate them.
- The Campaign table SELECT is an intentional remaining Resource API dependency, not a bypass by itself; the reads are wrapped in authorized tenant transactions and explicit membership predicates.
- Founder moderation remains disabled. No Gateway endpoint in this cutover replaces founder submission, queue listing or moderation decisions.
- The manual cutover remains outside `config/production-migration-batches.json`; manifest stays `[]`.
- Before production execution, require exact deployed Resource API/Gateway versions, complete caller inventory, live effective role/ACL proof, verified recovery point, and rehearsed rollback.
- No production SQL/query, migration or cutover execution, ACL/role change, Render inspection/change, deployment, credential/backup operation, or payment action occurred in this review.


## 19 November 2026 — Business Capability, Saved Business and Registration Identity cutover reconciliation

### Pre-workflow checkpoint

Re-read the PR #298 migration and hosting handovers, PR metadata, changed-file inventory and branch comparison before inspecting source. At review start PR #298 head was `7061e6b9768d438dad719053e717b09d16e5245f`, open/draft/non-mergeable, 189 commits ahead and 4 behind `main`. Findings below are from current `main` source/migration definitions; they do not establish production deployment, ledger state or effective ACLs.

### 1. Business Capability and evidence

Inspected:
- `src/http/business-capability-router.ts`
- `src/http/business-capability-evidence-router.ts`
- `src/resources/business-capability/repository.ts`
- `src/resources/business-capability-evidence/repository.ts`
- `database/migrations/20261111070000_add_signed_business_capability_mutations.sql`
- `database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql`
- `src/db/actor-gateway-business-capability-mutation-migration-contract.test.ts`

**Gateway-backed mutations in production:** assertion replacement; capability verification transitions; evidence submission; evidence review. The HTTP routers return 503 rather than falling back to legacy repository mutation paths when Gateway is required but unavailable. The signed wrappers bind actor identity, operation, request context and nonce, and are granted only to `ghm_actor_gateway`.

**Direct Resource API reads remain:**
- Business Capability assertion reads and detail/list reads use authorized or tenant-scoped transactions and direct SELECT from `ghm.business_capability`.
- Capability evidence list/detail reads use authorized/tenant-scoped transactions and direct SELECT from `ghm.business_capability_evidence`.
- The capability catalogue remains a separate read-only Resource API surface; catalogue governance mutations use the Gateway.

**Existing manual cutover effects:** `20261111030000_revoke_legacy_business_capability_runtime_mutations.sql` revokes:
- runtime/PUBLIC INSERT privileges on `ghm.business_capability_evidence`, including the explicit evidence INSERT column grant;
- runtime/PUBLIC sequence USAGE/SELECT on `ghm.business_capability_evidence_id_seq`;
- runtime/PUBLIC EXECUTE on legacy `replace_business_capability_assertions`, `transition_business_capability_verification`, and `transition_business_capability_evidence`.

It does not revoke SELECT from either capability or evidence tables, which is consistent with the direct tenant-authorized read paths. It does not revoke capability-table INSERT; this is distinct from evidence submission and must not be assumed covered by this cutover. Do not revoke the remaining SELECT grants or add broad table revocations without a separate read-path migration. The cutover has no paired rollback file in the current `main` cutover inventory; do not invent rollback SQL. Recovery requires a separately reviewed restoration procedure and deployed-version plan.

**Disposition:** preserve current authorized direct reads and catalogue SELECT. Treat only the exact listed mutation grants as cutover scope. Verify all legacy function/table/sequence grants in live production and all non-HTTP callers before applying; no production ACL has been queried or changed here.

### 2. Saved Business

Inspected:
- `src/http/saved-business-router.ts`
- `src/resources/saved-business/repository.ts`
- `database/migrations/20260916230000_create_saved_business.sql`
- `database/migrations/20261111100000_add_signed_saved_business_gateway.sql`
- `database/cutovers/20261111110000_revoke_legacy_saved_business_runtime.sql`
- `src/db/actor-gateway-saved-business-migration-contract.test.ts`

**Production route behaviour:** list, item read, create and delete all delegate to the signed Saved Business Gateway when configured. With `savedBusinessGatewayRequired` enabled, the router returns 503 rather than using the legacy repository when Gateway is missing. `src/http/app.ts` sets this requirement in production.

**Legacy Resource API repository:** it reads `ghm.saved_business` directly and invokes `ghm.create_saved_business` / `ghm.delete_saved_business`; the original table migration grants runtime SELECT, while write operations use SECURITY DEFINER functions.

**Signed Gateway wrappers:** list and item read filter by the signed actor's `account_id`; create derives account owner from the signed actor; delete likewise binds the saved item to that actor. Wrapper EXECUTE is restricted to `ghm_actor_gateway`.

**Existing manual cutover:** `20261111110000_revoke_legacy_saved_business_runtime.sql` revokes all runtime/PUBLIC table SELECT/INSERT/UPDATE/DELETE, the explicit SELECT column grant, sequence privileges, and legacy create/delete function EXECUTE. This is a full direct-table and legacy-function cutover, unlike the capability-family cutover above. No paired rollback file was found in the current cutover inventory. Do not assume rollback is automatic or recreate the cutover. Any restoration needs a separately reviewed and rehearsed procedure.

**Disposition:** after Gateway and Resource API deployment/qualification, this cutover removes the direct repository's database access and leaves the signed Gateway as the only route path. Confirm there are no non-HTTP repository consumers, verify actual production ACLs and satisfy the documented fresh verified backup/role gates before execution. No production state was checked or changed in this review.

### 3. Business Registration Identity

Inspected:
- `src/http/business-registration-identity-router.ts`
- `src/resources/business-registration-identity/repository.ts`
- `database/migrations/20261110230000_add_gateway_business_registration_identity_read.sql`
- `database/migrations/20261110233000_add_gateway_business_registration_identity_write.sql`
- `database/migrations/20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql`
- `database/migrations/20261117010000_revoke_runtime_business_registration_identity_write.sql`
- `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql`
- `src/db/business-registration-identity-migration-contract.test.ts`

**Production route behaviour:** authenticated registration identity GET and PUT use the signed Gateway client. When production requires the Gateway but the client is missing, both routes return 503 rather than invoking the legacy repository. The legacy repository methods call `ghm.read_business_registration_identity` and `ghm.update_business_registration_identity` inside tenant transactions.

**Signed wrappers:** the later signed-assertion migration replaces first-generation actor-ID-only wrappers with one-use HMAC actor assertions for `business.registration.read` and `business.registration.update`. The wrappers are SECURITY DEFINER, owned by `ghm_schema_owner`, and executable by `ghm_actor_gateway` only.

**Important chronology correction:** `20261117010000_revoke_runtime_business_registration_identity_write.sql` is an automatic migration file, not a manual cutover. It checks the signed wrapper exists, is SECURITY DEFINER/owned by `ghm_schema_owner`, is executable by `ghm_actor_gateway`, and is not executable by `ghm_runtime`; then revokes the legacy update function from PUBLIC/runtime/gateway and asserts no unexpected direct EXECUTE grantee remains. Its header nevertheless contains explicit operational deployment, startup, end-to-end and stable-URL gates. Do not infer it has run merely because it exists in source or because the migration runner may have a candidate inventory.

The separate manual cutover `20261111020000_revoke_legacy_registration_identity_runtime.sql` revokes both legacy read and write function EXECUTE. The write revocation overlaps the later automatic migration. If both are applied, the repeated REVOKE is idempotent, but the automatic migration includes stronger signed-wrapper precondition and unexpected-grantee checks. Before finalizing production batch order, reconcile the exact pending migration prefix and decide whether the manual file remains the read-only residual cutover after the automatic write revocation; do not apply both blindly or duplicate SQL.

**Disposition:** authenticated routes are Gateway-backed; preserve private registration data confidentiality and do not grant direct table access. The legacy read-function EXECUTE remains in scope for the manual cutover unless another explicit migration revokes it. The legacy write-function grant is addressed by the later guarded migration and also appears in the manual cutover; flag this overlap for exact ledger/ACL reconciliation. No paired rollback file was found in the current cutover inventory. No production ledger or ACL query was repeated.

### Consolidated disposition matrix

| Capability | Production Gateway route | Direct Resource API reads retained | Existing cutover/migration |
|---|---|---|---|
| Business Capability | Mutations and evidence submission/review | Capability/evidence SELECT and catalogue reads | Manual mutation cutover `20261111030000` |
| Saved Business | List, item read, create, delete | Legacy repository methods only; production route requires Gateway | Manual full table/function cutover `20261111110000` |
| Registration Identity | Private read and write | Legacy repository fallback only; production route requires Gateway | Manual read/write cutover `20261111020000`; later guarded automatic write-revocation migration `20261117010000` |

### No-action record and next work

- All exact manual cutover files above already exist; do not create duplicates.
- No paired rollback file for these three cutovers was found in the current `main` cutover inventory. Do not invent a rollback; document this as a deployment/recovery prerequisite.
- Business Capability direct SELECT is an intentional tenant-authorized Resource API dependency. The existing manual cutover does not revoke it.
- Saved Business is a complete route-to-Gateway cutover in production wiring; its existing manual cutover removes table and legacy function access.
- Registration Identity has an overlap between manual read/write revocation and a later guarded automatic write-revocation migration. Resolve exact pending prefix and live ACL before production sequencing.
- The three manual cutovers are not to be added to `config/production-migration-batches.json`; manifest remains `[]`.
- No production SQL/query, migration/cutover execution, ACL/role change, Render inspection/change, deployment, credential/backup operation, or payment action occurred.


## 19 November 2026 — Capability Governance, Supplier Classification and Business Profile reconciliation

### Pre-workflow checkpoint

Re-read the PR #298 migration/hosting handovers, PR metadata, changed-file inventory and branch comparison. At review start PR #298 head was `6f07cd226b7508a74c4222e6194b282cedbe69bb`, open/draft/non-mergeable, 190 commits ahead and 4 behind `main`. Source and migration findings below are from current `main`, not evidence of production deployment or applied-ledger state.

### 1. Capability Governance

Inspected:
- `src/http/capability-catalogue-router.ts`
- `src/resources/capability/repository.ts`
- `src/http/capability-governance-gateway-client.ts`
- `src/actor-gateway/capability-governance-reader.ts`
- `database/migrations/20261110250000_add_gateway_capability_governance.sql`
- `database/migrations/20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql`
- `database/migrations/20261117020000_revoke_runtime_capability_governance.sql`
- `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql`

**Route split:** selectable/public capability catalogue reads remain in the Resource API repository. Administrative list, draft creation, draft update and lifecycle transition routes call the signed Gateway client; those routes return 503 if no Gateway client is configured. The catalogue's ordinary read route is not the admin Gateway list operation and must not be revoked with governance mutation privileges.

**Migration chronology:** the first Gateway governance migration created caller-account-ID wrappers and granted them to `ghm_actor_gateway`, while explicitly leaving legacy runtime grants until cutover. The signed-assertion migration replaces those wrappers with short-lived, one-use assertion-bound operations. The later automatic migration `20261117020000_revoke_runtime_capability_governance.sql` is materially stronger than the original manual cutover: it verifies required roles, signed verifier/wrapper existence, SECURITY DEFINER ownership/search_path, Gateway EXECUTE and absence of runtime EXECUTE, then revokes the three legacy draft/create/update/lifecycle functions and checks for unexpected direct grantees.

**Manual overlap:** `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql` also revokes the same three legacy governance functions. This overlaps the later guarded automatic migration. The automatic migration includes stronger preconditions and unexpected-grantee assertions. Resolve its exact position in the contiguous pending migration prefix and the live ACL state before deciding whether the manual cutover remains needed; do not blindly apply both or duplicate the SQL. Both are legacy governance function revocations; neither authorizes revoking catalogue SELECT.

**Disposition:** preserve Resource API catalogue reads; use signed Gateway for administrative governance; prefer the later guarded migration's precondition/ACL verification as the authoritative source of the legacy mutation revocation plan. No paired rollback file was found for the original manual cutover. No production ledger or ACL query was performed.

### 2. Supplier Classification

Inspected:
- `src/http/app.ts` business update route
- `src/http/supplier-classification-gateway-client.ts`
- `src/actor-gateway/supplier-classification-reader.ts`
- `database/migrations/20261110260000_gateway_supplier_classification_cutover.sql`
- `database/migrations/20261111040000_bind_business_profile_gateway_actor_to_signed_assertion.sql` (assertion operation allow-list evolution)

The Resource API accepts supplier classification as the isolated `isSupplier` update shape on `PATCH /api/v1/businesses/:businessId`. It calls the supplier Gateway client and returns 503 when the client is absent; it does not fall back to the legacy repository mutation. After the Gateway write it fetches the managed Business through the Resource API service for response presentation, so the follow-up tenant-scoped read remains an intentional Resource API dependency.

Migration `20261110260000_gateway_supplier_classification_cutover.sql` creates a Gateway wrapper, grants it to `ghm_actor_gateway`, and revokes PUBLIC/runtime EXECUTE on the legacy `ghm.update_business_supplier_classification` function in the same migration. It is not a manual cutover file and has no paired rollback in the current cutover inventory.

**Assertion caution:** the inspected supplier reader creates a signed HMAC actor assertion for `supplier.classification.update`, but the reviewed migration excerpt creates the earlier account-ID wrapper. The exact later migration that changes this supplier wrapper to the signed-assertion signature was not located in the inspected files. Do not assume the operation is fully migrated to the final signed contract solely from the reader source; reconcile the full migration sequence and wrapper signature before production activation. This is a source/migration contract gap requiring focused follow-up, not a claim that production is currently vulnerable.

### 3. Business Profile

Inspected:
- `src/http/app.ts` business update route
- `src/http/business-profile-gateway-client.ts`
- `src/actor-gateway/business-profile-reader.ts`
- `database/migrations/20261110270000_gateway_business_profile_update.sql`
- `database/migrations/20261111040000_bind_business_profile_gateway_actor_to_signed_assertion.sql`
- `database/migrations/20261110265000_reconcile_business_profile_legacy_contract.sql`
- `database/migrations/20261109100000_persist_business_profile_presentation_fields.sql`

The non-supplier Business profile PATCH path calls the Gateway client and returns 503 if it is unavailable; no legacy repository write fallback is used. Following the Gateway mutation, the Resource API loads the managed Business for response presentation. This is an intentional post-mutation Resource API read and should not be confused with direct legacy write authority.

The initial Gateway profile migration revokes PUBLIC/runtime EXECUTE on the legacy `ghm.update_business_profile` function and grants the initial wrapper to the Gateway role. The later signed-assertion migration replaces that wrapper with a short-lived, one-use `business.profile.update` assertion. The earlier business-profile contract reconciliation restores the legacy underlying function's EXECUTE to `ghm_runtime`; that is an internal function invoked by the SECURITY DEFINER Gateway wrapper. The direct legacy caller-facing function remains revoked by the Gateway cutover migration. Do not treat the internal underlying grant as a reason to re-grant the public legacy entry point.

No separate Business Profile manual cutover file or paired rollback was found in the current cutover inventory; the revocation is performed by the existing migration sequence. Verify exact deployed migration prefix and effective grants before relying on that state.

### Consolidated disposition

| Capability | Production mutation path | Remaining Resource API reads | Revocation mechanism |
|---|---|---|---|
| Capability Governance | Signed Gateway admin list/draft/update/transition | Selectable/public catalogue reads | Later guarded automatic migration `20261117020000`; overlaps manual `20261111010000` |
| Supplier Classification | Gateway-only supplier update | Managed Business response read | Existing migration `20261110260000`; signed-wrapper migration sequence needs focused signature reconciliation |
| Business Profile | Gateway-only profile update | Managed Business response read | Existing migrations `20261110270000` + signed assertion evolution `20261111040000` |

### No-action record and follow-up

- Existing migrations/manual cutover files were used; no duplicate cutover or rollback was authored.
- Do not revoke the catalogue read path or the Resource API's managed Business response reads.
- Capability Governance has a manual/automatic revocation overlap; reconcile exact pending prefix and live grants before production sequencing.
- Supplier Classification has an unresolved source/migration wrapper-signature chronology: Gateway reader emits HMAC assertion, while the inspected initial migration creates an account-ID wrapper. Locate and verify the later signed wrapper migration before production activation.
- Business Profile's internal legacy function grant is distinct from direct runtime execution of the legacy entry point; preserve only what the SECURITY DEFINER wrapper requires.
- These findings do not populate `config/production-migration-batches.json`; it remains `[]`.
- No production SQL/query, migration execution, ACL/role change, Render inspection/change, service deployment, credential/backup operation, or payment action occurred.


## 19 November 2026 — Supplier signed-wrapper chronology resolved; Storage Metadata and Connect provisioning reconciliation

### Pre-workflow checkpoint

Re-read the PR #298 migration/hosting handovers, PR metadata, changed-file inventory and branch comparison. At review start PR #298 head was `5a9260f1513721a23f253fef2d03585d77789809`, open/draft/non-mergeable, 191 commits ahead and 4 behind `main`. Source, migration and specialist handover evidence below is from current `main`; no production ledger or effective ACL was inferred.

### 1. Supplier Classification signature chronology — resolved

The previously missing migration was located:

`database/migrations/20261111030000_bind_supplier_gateway_actor_to_signed_assertion.sql`

It explicitly:
- extends the assertion allow-list with `supplier.classification.update`;
- replaces the account-ID-only `ghm.assert_actor_gateway_capability` signature with the signed HMAC verifier;
- drops the old three-argument Gateway supplier wrapper;
- recreates `ghm.gateway_update_business_supplier_classification` with issued-at, nonce and signature parameters;
- verifies the signed actor assertion before delegating to the legacy underlying supplier update function;
- restricts wrapper EXECUTE to `ghm_actor_gateway`, revoking PUBLIC/runtime/migrator;
- pins SECURITY DEFINER ownership and search_path.

`src/actor-gateway/supplier-classification-reader.ts` calls the matching seven-argument SQL wrapper and creates the same operation-bound assertion. The migration contract test checks the signature, assertion operation, old wrapper removal and Gateway-only grant.

**Conclusion:** the apparent account-ID/HMAC mismatch was migration chronology, not an unresolved implementation gap. The later signed-wrapper migration closes it. Production still requires exact pending-prefix/ledger and effective-grant proof; source existence does not establish application.

### 2. Storage Metadata — route, dual-proof lifecycle and production cutover boundary

Re-read specialist handover `docs/HANDOVER_2026-11-12_STORAGE_METADATA_GATEWAY.md`, storage architecture contract, exact signed metadata migration, Resource API storage router/client, Gateway reader and migration contract tests.

**Resource API routes:** `src/http/storage-router.ts` obtains the caller bearer token and uses the storage metadata Gateway store factory for metadata create/read/deletion-pending/availability/deletion transitions. In required mode, absent bearer token is rejected and missing Gateway factory returns unavailable; it does not fall back to direct PostgreSQL metadata calls. The production app wiring is documented in the specialist handover. Business Logo public retrieval remains a narrow approved-logo path; it is not a broad storage metadata read grant.

**Five replacement operations:**
- create pending metadata;
- read metadata;
- mark deletion pending;
- mark available;
- mark deleted.

The first three require a one-use v2 signed actor assertion. Provider-confirmed availability and deletion require a second, separate Resource API HMAC attestation, verified in PostgreSQL with operation/context/expiry/nonce checks. The Actor Gateway does not possess the provider signing key. The database public Business Logo read exception requires active Business, public Business Logo identity and `status='available'`; private reads require active membership; owner/administrator authority is required for management mutations.

The specialist handover records disposable PostgreSQL 18 dual-proof and lifecycle qualification, including invalid signature/expiry/context/operation/metadata, cross-business actor and nonce replay rejection. It also records a localhost/disposable five-function legacy grant revocation/rollback rehearsal: runtime/migrator/Actor Gateway direct calls denied during the rehearsal, replacement wrappers retained, and original grants restored. This is not production ACL evidence or a production cutover.

**Important production blockers remain:** no production five-function revocation has occurred; no fresh independently verified production backup; Render role-administration/provider authority issue remains; no verified deployed Resource API ↔ Actor Gateway ↔ PostgreSQL ↔ R2 full lifecycle against a dedicated non-production bucket. The only previously identified R2 bucket `zaid-ghm-production` is not established as non-production and must not be mutated for qualification. Keep Connect upload/removal controls disabled until the full non-production lifecycle passes. Do not invent a SQL cutover file: the existing revocation evidence is a disposable qualification script and handover, not a production-ready manual cutover/rollback pair.

### 3. Connect Business provisioning — signed atomic Gateway operation

Inspected:
- `database/migrations/20261112080000_signed_connect_business_provisioning_gateway.sql`
- `src/actor-gateway/connect-business-provisioning-reader.ts`
- `src/http/connect-business-provisioning-gateway-client.ts`
- `src/integrations/connect/business-adapter.ts`
- `src/db/actor-gateway-connect-business-provisioning-migration-contract.test.ts`
- `docs/architecture/GHM_CONNECT_BUSINESS_PROVISIONING_LINKING_CONTRACT.md`

The Connect Business adapter requires the verified caller bearer token and delegates to `POST /v1/connect/businesses/provision-or-resolve`. The Gateway reader constructs a one-use v2 assertion bound to `business.connect.provision` and calls `ghm.gateway_provision_connect_business`.

The SECURITY DEFINER SQL operation:
- verifies the signed actor assertion and operation context;
- uses a transaction advisory lock for the external Business identity;
- resolves an existing canonical mapping only when the actor is an active member (or system-admin path);
- otherwise creates the canonical Business, creates exactly one active owner membership for the signed actor, links the external mapping and returns `provisioned`;
- fails on mapping conflict rather than claiming success;
- grants wrapper EXECUTE only to `ghm_actor_gateway`;
- revokes the legacy `ghm.auth_link_business_external_mapping` helper from PUBLIC, runtime, migrator, Actor Gateway and the named service roles.

The provider value `supabase` in the mapping is explicitly historical external-identity provenance for Connect Business UUIDs, not Supabase authentication, persistence, or an approved active target-runtime dependency. The architecture contract expressly distinguishes this metadata from session authority and says no production routing/data cutover or provider cleanup is authorized by the construction contract.

**Disposition:** source/migration contract is present and its migration test asserts signed operation, owner-owned wrapper, Gateway-only EXECUTE, advisory lock, membership requirement and legacy helper revocation. Production deployment/ledger/ACL proof remains separate. Do not treat this one bounded mapping adapter as authorization to retain Supabase as a target dependency or as approval to run production provisioning.

### Consolidated status

| Area | Source state | Production state / action |
|---|---|---|
| Supplier Classification | Signed assertion chronology confirmed by `20261111030000` | Verify exact applied prefix and effective grants; no production action |
| Storage Metadata | Five signed Gateway operations; dual proof for provider-confirmed transitions; disposable qualification passed | Production legacy grants remain; full deployed non-prod provider journey, backup and role authority remain blockers |
| Connect provisioning | Signed atomic actor Gateway operation and mapping-helper revocation in migration source | No production rollout/provisioning authorized by this review |

### No-action record

- No duplicate supplier migration, storage cutover or Connect provisioning SQL was created.
- No production SQL/query, migration execution, ACL/role/secret change, provider bucket/object operation, Render inspection/change, deployment, backup operation or payment action occurred.
- Production migration manifest remains `[]`.
- Continue only with remaining route/privilege families and exact-head PR/branch reconciliation. Do not re-run already recorded PostgreSQL qualification or storage grant rehearsal absent a source change or specific failed exact-head evidence.


## 19 November 2026 — Business Hours, Trust Score and Business Logo privilege reconciliation

### Pre-workflow checkpoint

Re-read the PR #298 migration and hosting handovers, current PR metadata, changed-file inventory and branch comparison before continuing. At review start PR #298 head was `25f595bb23161adabd786568ff16332ece9f2255`, open/draft/non-mergeable, 192 commits ahead and 4 behind `main`. Source and SQL evidence below is from current `main`; no production ledger, deployed version or effective ACL was inferred.

### 1. Business Hours

Inspected:
- `src/http/app.ts` Business Hours route wiring
- `src/http/business-hours-gateway-client.ts`
- `src/actor-gateway/business-hours-reader.ts`
- `database/migrations/20261111130000_add_signed_business_hours_gateway.sql`
- `database/migrations/20261111140000_add_business_hours_read_projections.sql`
- `database/cutovers/20261111130000_revoke_legacy_business_hours_runtime.sql`

Authenticated member list and replacement are Gateway-backed. Production config sets `businessHoursGatewayRequired = true`; the Resource API returns unavailable rather than falling back to the legacy repository if the Gateway is absent. The signed reader binds read/replace operations to the actor and Business context.

The read-projection migration creates:
- `ghm.gateway_get_business_hours`, signed assertion + active membership, EXECUTE only for `ghm_actor_gateway`;
- `ghm.get_public_business_hours`, SECURITY DEFINER projection restricted to active, verified, approved Businesses, EXECUTE for `ghm_runtime`.

The manual cutover revokes runtime/PUBLIC EXECUTE on legacy `ghm.replace_business_hours`, direct SELECT on `ghm.business_hours`, and sequence privileges. It intentionally does not revoke the public projection function. This is a full authenticated table-read cutover while preserving the explicitly approved public projection.

**Disposition:** retain the public projection EXECUTE grant; revoke legacy member-table/function/sequence access only after Gateway and Resource API deployment qualification, exact role proof and verified backup. Existing manual cutover has no paired rollback file in the cutover inventory. No production ACL or ledger was checked.

### 2. Trust Score

Inspected:
- `src/http/app.ts` Trust Score route wiring
- `src/http/trust-score-gateway-client.ts`
- `src/actor-gateway/trust-score-reader.ts`
- `database/migrations/20261111150000_add_signed_trust_score_gateway.sql`
- `database/migrations/20261111170000_add_trust_score_read_projections.sql`
- `database/cutovers/20261111150000_revoke_legacy_trust_score_runtime.sql`

Private/member Trust Score read, filtered list and calculation are signed Gateway operations. The calculation wrapper binds the signed actor and Business context; member read wrappers check active membership. Production requires the Gateway for these private routes.

The read-projection migration separately exposes:
- `ghm.get_public_trust_score(bigint)`;
- `ghm.list_public_trust_scores(text)`.

Both are SECURITY DEFINER, limited to active/verified/approved Businesses and granted to `ghm_runtime`; these are deliberate public projections, not private-table access.

The manual cutover revokes runtime/PUBLIC EXECUTE on legacy `ghm.calculate_business_trust_score`, direct SELECT on `ghm.trust_score`, and sequence privileges. It does not revoke the two public projection functions.

**Disposition:** preserve the two narrowly scoped public projection grants. Do not re-grant direct table SELECT or legacy calculation execution. Manual cutover has no paired rollback file in the cutover inventory. Production application/ACL remains unverified.

### 3. Business Logo

Inspected:
- `src/http/app.ts` Business Logo and storage Gateway wiring
- `src/http/business-logo-gateway-client.ts`
- `src/actor-gateway/business-logo-reader.ts`
- `database/migrations/20261111160000_add_signed_business_logo_gateway.sql`
- `database/cutovers/20261111160000_revoke_legacy_business_logo_runtime.sql`
- `database/migrations/20261106090000_business_logo_storage_binding.sql`

Business Logo binding is a signed `business.logo.bind` Gateway operation. Production requires both the Business Logo Gateway and Storage Metadata Gateway; the Resource API also fails startup if production storage is enabled without an Actor Gateway URL. Logo object lifecycle remains governed by the Storage Metadata dual-proof boundary documented above.

The manual cutover revokes runtime/PUBLIC EXECUTE on legacy `ghm.set_business_logo_object`; it does not revoke public logo presentation or the separate narrowly scoped approved-logo retrieval path. Do not interpret this one-function cutover as a complete Storage Metadata cutover or as permission to enable uploads before the non-production R2 lifecycle qualification.

**Disposition:** preserve public approved-logo retrieval; revoke only the legacy binding entry point after Gateway qualification and recovery prerequisites. No paired rollback file was found in the cutover inventory. Storage Metadata production cutover blockers remain unchanged.

### Consolidated privilege disposition

| Resource | Legacy runtime access removed by existing cutover | Deliberately retained runtime surface |
|---|---|---|
| Business Hours | Replace function EXECUTE, table SELECT, sequence privileges | Approved public-hours projection function |
| Trust Score | Calculation function EXECUTE, table SELECT, sequence privileges | Approved public single/list projection functions |
| Business Logo | Legacy logo-object binding function EXECUTE | Public approved-logo presentation/retrieval path |
| Storage metadata | Not yet production-cut over | No broad direct metadata table grant is authorized |

### Rollback and production prerequisites

- No paired rollback SQL was found for the Business Hours, Trust Score or Business Logo manual cutovers. Do not invent rollback scripts or assume that re-granting a few privileges is a complete recovery procedure.
- Before any manual cutover, require the exact deployed Resource API/Gateway versions, complete non-HTTP caller inventory, production ledger and effective ACL evidence, fresh independently verified recovery point, and a rehearsed restoration plan.
- Keep the public projection grants narrowly scoped to their SECURITY DEFINER functions; do not replace them with direct runtime table SELECT.
- All three Gateway HTTP clients currently default to five-second abort timeouts. This remains an availability concern for a sleeping Free service; do not add blanket mutation retries. In particular, Business Hours PUT and Business Logo PUT are mutations; Trust Score POST calculation also requires explicit idempotency/recovery analysis before replay.
- Existing cutover files were inspected; no duplicate cutover or rollback file was created.
- Production migration manifest remains `[]`.
- No production SQL/query, migration execution, ACL/role/credential change, Render inspection/change, service deployment, storage-provider operation, backup operation or payment action occurred.


## 19 November 2026 — Auth Issuer, external identity and QuoteFlow provisioning reconciliation

### Mandatory pre-review state check

Before this pass, re-read the PR #298 migration-batch handover, hosting/credentials handover, production migration reconciliation, role/service dependency map, production runtime deployment blockers, and PR #298 metadata/changed-file inventory. PR #298 is still the draft production migration-batch PR; its changed files are a bounded migration-runner/config/docs/test set, not an implementation PR for Auth Issuer or QuoteFlow. Branch comparison against current `main` reports the migration-batches branch `feat/actor-gateway-production-migration-batches` at 193 commits ahead / 4 behind, diverged, with merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`. Do not describe it as current-main-equivalent or rebase it as an incidental part of this review.

The branch's committed production migration inventory still has 50 exact pending entries. `config/production-migration-batches.json` remains empty. The 50-entry inventory is based on the dated 105-row snapshot; it is not a live ledger or execution authorization.

### 1. Authentication Issuer — source and disposable qualification versus production state

Inspected current-main source:
- `src/auth-issuer/server.ts`, `app.ts`, `database-principal.ts`, `database-privileges.ts`;
- `src/http/auth-router.ts`, `src/http/app.ts`, `src/server.ts`;
- `src/auth/foundation/persistence.ts`, `src/auth/ghm-auth-service.ts`;
- the Auth Issuer manual cutover and rollback SQL;
- PR #276 and `docs/security/AUTH_ISSUER_ISOLATION_QUALIFICATION_HANDOVER_2026-11-13.md`.

**Source contract:** the issuer process requires `GHM_AUTH_ISSUER_DATABASE_URL`, loads ES256 signing keys, uses the isolated `ghm_auth_issuer` login, and checks its exact principal flags and ten-function EXECUTE allow-list before listening. It has auth lifecycle routes for registration, login, refresh, logout, password recovery/reset and the bounded QuoteFlow migration-reset recovery/completion exception. Its DB verifier denies direct relation/sequence privileges, schema CREATE, unsafe SECURITY DEFINER/default ACLs, unexpected function grants, and unexpected Resource API auth-function grants.

**Resource API source contract:** current `src/server.ts` calls `createApp({ authRoutesEnabled: false })`; the current Resource API app retains auth-route registration only for explicit embedded/test fixtures. The production Resource API source therefore does not mount auth lifecycle routes. However, the recorded live Render Resource API deployment is still old commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`, where `src/server.ts` calls `createApp()` without disabling auth routes, has no runtime principal assertion, and performs only `SELECT 1` before listening. This is a source/live-deployment mismatch, not proof of a completed issuer traffic cutover.

**Disposable qualification:** the 17 November exact qualification record reports the isolated issuer pre-cutover/cutover and lifecycle/runtime-denial tests passed against disposable PostgreSQL, including registration/login, password rehash, concurrent reset, refresh/logout, recovery replay/session revocation, QuoteFlow migration reset, rollback, startup ACL checks, default ACL and SECURITY DEFINER checks. This proves the tested disposable contracts only.

**Production state:** the 18 November read-only role/service inventory reports that production `ghm_auth_issuer` does not exist and no dedicated production Auth Issuer service exists. The role, issuer secret custody, host/network/TLS, production migration ledger, backup/restore, and live issuer end-to-end qualification are therefore not established. Do not create the role, set credentials, apply the manual cutover, or point clients at an unprovisioned endpoint as part of this source review.

Existing manual-only cutover:
- `database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql`
- rollback: `database/cutovers/20261112020000_authentication_issuer_privilege_rollback.sql`

The cutover requires `session_user=ghm_migrator`, `current_user=ghm_schema_owner`, an existing correctly constrained issuer login and coordinated issuer/client routing. It removes Resource API auth lifecycle RPC execution and grants the issuer its allow-list. Its paired rollback restores selected runtime auth RPCs and removes issuer function/schema access, but explicitly does not restore an old binary, signing keys, service configuration or client routing. Never apply either file without a rehearsed coordinated service/client/DB rollback.

### 2. Authentication and QuoteFlow pending migration families

Reviewed the exact pending SQL definitions:
- `20261111210000_revoke_runtime_account_external_identity_table_access`
- `20261111220000_revoke_unused_auth_runtime_entry_points`
- `20261111230000_add_token_bound_recovery_revocation_result`
- `20261111240000_revoke_runtime_quoteflow_migration_provisioning`
- `20261111250000_revoke_runtime_external_identity_link`
- `20261111260000_revoke_runtime_external_identity_bootstrap`
- `20261112020000_add_token_bound_password_recovery_reset`
- `20261112030000_add_conditional_password_rehash`
- `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration`.

Disposition:
- Account external-identity table and sequence direct access are revoked from `ghm_runtime`; narrow SECURITY DEFINER lookup/link/bootstrap/provision functions are separately granted in that migration, then subsequent migrations remove runtime migration provisioning, arbitrary link and bootstrap EXECUTE.
- The account-ID-only session revoke/password change/disable functions are identified by the migration as unused application entry points and revoked from runtime.
- Recovery is evolved to token-bound reset/revocation operations. Conditional password rehash is a separate guarded operation; preserve its caller semantics and race protection.
- QuoteFlow migration-account provisioning and reset-enrollment registration are migration/operator authority, not ordinary application sign-up. The Auth Issuer may read/complete an already approved enrollment through its bounded allow-list, but may not register or alter the approved enrollment provenance.
- These are ordered migration dependencies and privilege changes, not a license to run the 50-entry queue. Exact live applied-prefix/checksum and effective grants remain unknown until the authorized migration audit path succeeds.

### 3. External identity — distinguish lookup compatibility from active identity authority

Current GHM `ConnectIdentityAdapterImpl` is lookup-only. It resolves an existing UUID subject through `ghm.auth_lookup_external_identity`; it does not create mappings. The legacy `POST /api/v1/connect/service` route still validates a provider-specific external identity envelope and binds the mapped account to a current active GHM account and registered resource authorization. It is a separate server-to-server integration seam, not the current Connect browser login.

The current Connect browser journey uses GHM-native auth, GHM account IDs, GHM managed-Business/membership APIs and GHM Business creation. Do not redesign that active browser path around a legacy external identity mapping, infer identity from matching email/name, or create new crosswalks.

The signed Connect Business provisioning SQL/Actor Gateway operation is a separate legacy external-Business mapping adapter. The inspected Resource API does not construct/invoke its HTTP client, and the current Connect Business creation screen calls authenticated `POST /api/v1/businesses` instead. Keep the provisioning endpoint bounded and dormant unless an actual deployed consumer and historical mapping requirement are established. Do not repurpose it for native Business creation.

The historical provider label in a mapping is provenance only; it is not an authentication authority or target dependency. Do not expose retired provider terminology in product/UI/docs, rename/delete historical mapping rows, or change production identities as part of this audit.

### 4. QuoteFlow cross-repository reconciliation

Reviewed `zaidhqdev-sys/QuoteFlow`:
- PR #25 is still open/unmerged on `feature/quoteflow-ghm-native-cutover`;
- its branch compares 179 commits ahead / 0 behind `main`;
- its changed-file inventory includes the GHM auth client/adapter/context, clean storage-scope support, README and handover;
- current PR branch `src/lib/ghmAuthClient.ts` supports fresh GHM registration and uses GHM bearer-authenticated managed-Business, membership and Business-create routes;
- `src/state/AuthContext.tsx` activates a clean canonical GHM account/Business storage namespace without importing or attaching historical local namespaces;
- `src/lib/env.ts` currently uses one GHM base URL (defaulting to the Resource API) for both auth lifecycle and Resource API calls.

**New cutover dependency:** this single-origin client is incompatible with the isolated issuer topology. The Auth Issuer serves register/login/refresh/logout and recovery; the Resource API serves managed-Business, membership and Business operations. Before issuer cutover, QuoteFlow must split its configuration into separate Auth Issuer and Resource API origins, route each operation to the correct service, fail closed when the issuer origin is absent, and add contract tests proving the separation. Do not point all calls at the issuer or all auth lifecycle calls at the Resource API after cutover.

This requirement and the cross-repository review were appended to QuoteFlow's own `HANDOVER.md` in commit `5bccff51bec4359662f5a8a551b40263f09eeb59`. That is a documentation-only handover update on the existing QuoteFlow feature branch; no QuoteFlow runtime code or PR state changed.

Owner-approved migration policy remains fresh GHM registration rather than automatic legacy identity linking. The two known non-owner bot accounts remain excluded. Fresh registration does not authorize attaching/deleting legacy local records, inferring ownership, or bypassing GHM Business membership authorization.

### 5. Required next sequence

1. Preserve current GHM-native Connect/QuoteFlow browser authentication and Business creation; do not revive identity mapping as the default onboarding path.
2. Implement/test QuoteFlow's split Auth Issuer and Resource API origins on its existing PR #25 branch, then qualify exact-head CI and Android preview/device flow.
3. Reconcile the deployed GHM Resource API version and route cutover; the current production deployment at `c7cf1eb` predates the `authRoutesEnabled:false` source contract.
4. Establish an approved Auth Issuer hosting/compute path that satisfies the Argon2id CPU budget without weakening password hashing or silently adding paid infrastructure. This review does not choose or deploy a host.
5. Only after hosting, issuer role/credential, TLS/network, secrets, backup/restore, exact live ledger and service/client end-to-end proof are established should the manual issuer cutover and rollback be considered.
6. Check whether any specifically approved QuoteFlow migration-reset enrollment still needs the bounded legacy exception. No production enrollment rows were queried; do not run account migration provisioning or reset-enrollment registration without explicit need/authority.
7. Keep the production batch manifest empty; do not execute migrations or manual cutovers from this review.

### No-action record

Repository source, handover, PR, branch and pending SQL definitions only. No production SQL/catalog query, migration execution, role/membership/ACL change, credential/secret read or write, Render/Cloudflare setting, service, deployment, route/traffic change, QuoteFlow installed-app/local-storage operation, user record, legacy mapping row, payment state, or backup operation occurred.


## 19 November 2026 — QuoteFlow split-origin implementation progress

The QuoteFlow PR #25 follow-up dependency identified in the prior section has now been implemented on its existing branch `feature/quoteflow-ghm-native-cutover` (no new branch/PR):
- Auth lifecycle calls route to the separately configured `EXPO_PUBLIC_GHM_AUTH_ISSUER_BASE_URL`.
- Managed Business, membership and Business create/context calls route to `EXPO_PUBLIC_GHM_RESOURCE_API_BASE_URL`.
- The issuer origin deliberately has no fallback; missing issuer configuration disables GHM authentication.
- The Resource API origin retains the existing GHM Internal Runtime default.
- Client routing and missing-issuer fail-closed tests were added; QuoteFlow's own handover was updated.

Exact QuoteFlow source head: `3be84d19068d46b57ab6a0f0e012cf7144a21973`. At the time of this handover update, exact-head CI #244 (run `44422791748`) and Android preview #130 (run `44422791668`) were still in progress. Do not mark the client qualification complete until both conclusions and any required fixes are recorded.

No Auth Issuer URL has been invented or configured. Production issuer hosting/role/credentials/network/TLS/backup and coordinated database cutover remain outstanding. No Render, production database, secret, service, deployment, or user data was changed.


### QuoteFlow split-origin CI correction — 19 November

The first QuoteFlow CI #244 run (`44422791748`) failed during TypeScript typecheck before Jest. Its three errors were traced and corrected on the existing QuoteFlow PR #25 branch:
1. One selected-Business membership-list request lacked the new explicit Resource API origin.
2. The legacy qualification smoke-test still imported the removed single-origin resolver; it now resolves the Resource API origin for its historical sandbox-host check.
3. The QuoteFlow legal documents/acceptance API still imported the removed resolver; it now uses the Resource API origin, as a protected resource/legal API rather than an authentication lifecycle endpoint.

The origin normalizer was also corrected and the source re-fetched. Latest corrected QuoteFlow source commit is `8fc34181356c5684eb1f009abf8b27e69b00052f`; latest QuoteFlow branch handover commit at the time of recording is `8fbdf4b0c4148514f884f6bab94fa1b9c4c40d27`.

The failing run #244 was on the earlier merge head and is not a validation pass. The Android preview #130 was still assembling for an earlier source head at last poll. No successful exact-head typecheck/Jest/Android preview result has been observed after corrections. Keep this work in pending qualification status.


### QuoteFlow PR #25 validation checkpoint — 19 November 2026

QuoteFlow CI #251 (`44425183267`) has now passed both TypeScript typecheck and the full Jest suite after the split Authentication Issuer / Resource API routing corrections. This is the first complete CI pass for the corrected implementation.

The side-by-side Android preview run #137 (`44425183459`) has passed dependency installation, Android project generation and package-ID isolation; Gradle APK assembly remains in progress, with package verification and artifact upload pending at last poll. Keep Android qualification open until its final result and artifact are checked.

QuoteFlow's own `HANDOVER.md` records the detailed CI history and exact corrections. No issuer endpoint has been provisioned; no Render, production database, secret, user data or production deployment was changed.


### QuoteFlow Android preview result — build passed; artifact quota blocked delivery (19 November 2026)

QuoteFlow PR #25 Android preview workflow run ID `44425183459` (workflow run number 138) completed its Gradle build successfully and verified the APK package identity as `com.zaidtechnologies.quoteflow.preview`. The final GitHub Actions artifact upload failed because the repository's Actions artifact storage quota was reached; GitHub says quota usage is recalculated every 6–12 hours. No APK artifact was produced for download.

QuoteFlow CI run ID `44425183267` (workflow run number 252) passed TypeScript and the full Jest suite. Therefore code CI, Android compilation and preview package-ID verification are successful, while APK artifact distribution remains blocked. Do not report an APK as delivered. No existing artifacts were deleted and no billing/storage settings were changed.

At the latest comparison, QuoteFlow PR #25 branch was 201 ahead / 0 behind its `main`; the GHM migration branch was 197 ahead / 4 behind GHM `main`. PR #25 remains open/unmerged. This does not clear the separate GHM production migration, Auth Issuer hosting, database authority, backup/recovery or Render prerequisites.


### Branch-count refresh after QuoteFlow Android qualification — 19 November 2026

Re-fetched the existing PR/branch state before continuing:
- GHM PR #298 remains draft/open on `feat/actor-gateway-production-migration-batches`; current compare is 198 ahead / 4 behind `main`.
- QuoteFlow PR #25 remains open/unmerged on `feature/quoteflow-ghm-native-cutover`; current compare is 201 ahead / 0 behind `main`.
- QuoteFlow CI #252 passed TypeScript and Jest.
- QuoteFlow Android run #138 built the APK and verified `com.zaidtechnologies.quoteflow.preview`, but artifact upload was rejected by the Actions storage quota. No downloadable artifact was created. No artifact deletion or billing/storage change was performed.

The earlier branch-count note in this handover is historical; use these refreshed values for the next checkpoint.


### QuoteFlow Android delivery correction — use established local Windows release workflow (19 November 2026)

The GitHub Actions Android run #138 was a side-by-side **debug preview** with package ID `com.zaidtechnologies.quoteflow.preview`, not the production website APK. Its artifact storage quota failure is not a blocker to the established local release process.

The established Windows paths are:
- Source: `C:\QuoteFlow`.
- Release APK: `C:\QuoteFlow\android\app\build\outputs\apk\release\app-release.apk`.
- Website destination: `C:\zaid-technologies-website\public\downloads\quoteflow.apk`, served at `/downloads/quoteflow.apk`.

Build the exact current PR #25 branch locally, inspect local Git status before switching/updating, run typecheck/Jest and `android\gradlew.bat assembleRelease`, verify the APK package is production `com.zaidtechnologies.quoteflow`, then verify size/SHA-256 before copying. Never publish the preview/debug APK as the production release.

Important gate: the current split-origin client intentionally has no default Auth Issuer origin. `EXPO_PUBLIC_GHM_AUTH_ISSUER_BASE_URL` is blank in `.env.example`; missing issuer config disables GHM auth. Do not upload a website release that would silently disable intended GHM authentication. First confirm the real approved issuer URL and end-to-end auth readiness. No Render, production database, website files or local machine changes are performed by this handover update.


## 20 November 2026 — applied migration ledger-name integrity guard

A focused review of the current production migration runner found that its ledger query selected only `version, checksum`, while the read-only forensic reconciliation compares `version, name, checksum`. The runner therefore did not independently reject a same-version/same-checksum ledger row whose recorded migration name differed from the repository filename. This was a real consistency gap in the preflight contract.

Corrected on the existing PR #298 branch (no new branch or PR):
- `src/db/migration-order.ts` adds `assertAppliedMigrationNames`, comparing each applied ledger row to the repository migration name for the same version.
- `src/db/migrate.ts` now selects `version, name, checksum` and performs this name check before checksum, pending-inventory and execution-batch selection.
- `src/db/migration-checksum.test.ts` adds positive, mismatched-name rejection and retained-historical-row cases. Ledger rows whose versions are absent from the repository remain governed by the existing retained-history/provenance audit; this guard does not incorrectly reject legitimate retained history.

Source head after these sequential GitHub contents commits: `29e6b912327b4160b811ec882ded6abbc366611a`. Exact-head CI has not yet been observed for this change; do not call it validated until the new run completes. No migration SQL, production ledger, database, role/ACL, secret, Render service, deployment, payment state or local machine was changed. The production batch manifest remains empty.


## 20 November 2026 — exact-head local validation of migration ledger-name guard

The user checked out the fetched PR #298 branch head directly in the existing local validation checkout `C:\GHM-pr298-validation` (detached at the exact remote commit; no branch was created):

- Exact tested commit: `5d09028368438502a3fc2ef4b12e79350caaf699` (`docs: record migration ledger name integrity guard`).
- `npm run build`: passed (TypeScript compilation).
- `node --require ./scripts/test-env.cjs --test dist/db/migration-checksum.test.js`: **17/17 passed**.
- The two newly added assertions passed: matching applied-ledger names are accepted and mismatched names are rejected; absent historical ledger versions remain governed by the retained-history audit.
- The preceding 15 migration checksum/inventory/allowlist tests also passed.

This is local build/unit-test evidence for the exact PR head, not a GitHub Actions exact-head CI result and not a production database qualification. The checkout was detached intentionally at the remote PR head; a plain `git pull` from that state is not applicable until a branch/upstream is selected. The user was correctly directed to this existing PR #298 checkout, and the exact remote commit was then tested.

PR #298 remains draft/open/unmerged on `feat/actor-gateway-production-migration-batches`. The production batch manifest remains empty; do not execute migrations or change production database state. No source change, migration execution, production SQL, role/ACL, secret, Render setting, deployment, or new branch/PR was made for this validation checkpoint.

**Next validation:** inspect the latest exact-head GitHub Actions status for `5d09028368438502a3fc2ef4b12e79350caaf699`; do not repeat these successful local build and 17 unit tests unless the source head changes.



## 20 November 2026 — PR #298 exact-head CI and branch-state inspection

Resumed from the existing migration-batches handover and inspected PR #298, its current head branch, changed-file inventory, review state, workflow configuration and commit checks before taking further action.

- PR #298 remains **open, draft and unmerged**; head branch `feat/actor-gateway-production-migration-batches`; current PR head `aa23651df84b39cd8db196ef907ce0d5ef8ec05b`.
- The exact local build/unit-test commit remains `5d09028368438502a3fc2ef4b12e79350caaf699`. The ledger-name source change itself is at `29e6b912327b4160b811ec882ded6abbc366611a`; subsequent commits through the current PR head are handover/documentation updates.
- Read-only inspection confirms the current branch still contains the ledger-name guard: `src/db/migrate.ts` selects `version, name, checksum`, and `src/db/migration-checksum.test.ts` contains the new applied-ledger name assertions.
- No PR-triggered GitHub Actions workflow runs or commit status checks were returned for the source commit `29e6b912...`, the locally tested commit `5d090283...`, or current PR head `aa23651...`. Therefore **exact-head GitHub Actions CI is not evidenced**; the successful local build and 17/17 unit tests remain the only validation evidence for this change. Do not describe CI as passed.
- The existing `.github/workflows/ci.yml` targets pull requests into `main` and ignores documentation-only changes. The branch includes runtime source changes as well as docs, but the connector returned no matching PR workflow run/status for the inspected commits. No workflow was dispatched or re-run during this inspection.
- Current branch comparison: **205 commits ahead / 4 behind** `main` (diverged). PR metadata reports `mergeable: false`; no reviews and no inline review threads were returned. This is not a merge-readiness signal; preserve draft/unmerged state.
- The PR currently changes 31 files. The execution-batch manifest remains empty; production migration execution remains fail-closed.

No source, workflow, PR metadata, branch ref, production database, migration ledger, role/ACL, secret, Render setting, deployment or local checkout was changed during this inspection. No CI run was triggered. Next work should address why the existing PR CI is not surfacing for the non-document source changes, then qualify the current PR head without repeating the already-passed local build and 17 tests unless source changes.



## 20 November 2026 — CI trigger configuration narrowed; run-history evidence still required

Follow-up inspection compared the CI workflow on the PR head with the workflow on the PR base (`main`), rather than inferring trigger eligibility from the feature-branch copy alone.

- The base-branch `.github/workflows/ci.yml` already has a `pull_request` trigger targeting base branch `main`; the feature branch name itself does not need to appear in that list.
- Its `paths-ignore` excludes Markdown/docs-only changes, but PR #298's changed-file set includes runtime TypeScript, tests, configuration, SQL and workflow files. The PR is therefore not obviously excluded by the declared branch/path filters.
- The PR head advanced during this inspection: current head is now `563c54b217266100d20fd3c83bbf41973d9eab17` (the handover-only commit just recorded). Prior local test evidence remains tied to source commit `5d090283...`; the later PR commits are documentation-only.
- The available GitHub connector's commit-run lookup returned no PR-triggered workflow runs for the tested source commit, the local-test commit, or the then-current PR head. This lookup is not sufficient to conclude that GitHub Actions is disabled or that no run exists in the repository's full Actions history.

Conclusion: the workflow's declared PR trigger should cover this PR, so the earlier suggestion that the source branch is omitted from the workflow filter is not a valid explanation. Root cause of missing run evidence remains undetermined. Before changing workflow configuration or dispatching a new run, inspect the repository's actual Actions run history for PR #298 (workflow `CI`, event `pull_request`) and any skipped/cancelled run annotations. No workflow file or repository Actions setting was changed, and no run was dispatched.



## 20 November 2026 — repository-wide Actions history and PR #298 failure diagnosis

Inspected the repository-wide GitHub Actions run collection (rather than only commit-associated runs), PR #298's commit history, the exact workflow jobs and logs, current PR metadata, and the current base-to-head comparison.

### Confirmed CI history

- Repository Actions history contains **5,395 workflow runs**. PR #298 has multiple actual `pull_request` CI runs; the prior statement that no PR runs existed was too broad because the commit-run lookup did not surface the older PR run history.
- Latest PR #298 run returned in the repository's first Actions page: run **5396**, ID `44230605506`, event `pull_request`, head `6eb0ec8222336819984cb624e26dd840aa555251`, completed **failure**.
- That run's `quality` job **passed**. It completed build, disposable PostgreSQL migration/qualification steps and the repository test suite, among other isolated qualification steps.
- Its `web-quality` job failed only at `npm audit --audit-level=moderate`. The web build and all 26 web tests passed. Audit failed on five high-severity paths resolving to picomatch advisory `GHSA-fc5q-39xc-vjpf`; npm proposed `npm audit fix --force`, which would install Vitest 3.1.4 as a breaking change. Do not apply that force upgrade.
- An earlier PR run **5395**, ID `44229443518`, completed successfully for head `8e2e2799c84bb599aa53aee031513b851f5f9b6b`. Both `quality` and `web-quality` passed; its web audit used the then-present step named `Audit web dependency tree with verified picomatch mitigation`. This is historical CI evidence for that earlier tree, not for the later ledger-name guard.
- The exact source commits for the ledger-name guard (`90d0608...`, `cf8e3a6...`, `29e6b91...`) and the locally tested source head `5d090283...` have **no matching PR-triggered workflow runs** returned by commit-run lookup. The later commits are documentation-only. Thus the new ledger-name change has local build + 17/17 focused tests, but no CI validation yet.
- The PR workflow's declared trigger on base `main` and path filters are compatible with source changes in this PR. The specific reason later source commits have no associated workflow run is **not established** by available evidence. Do not guess or alter workflow configuration to mask it.

### Corrected branch / PR state

- Current PR #298 head: `7d502c4a97323b19c0b2700f84b32d05d68c7a5a`; branch `feat/actor-gateway-production-migration-batches`.
- Current base `main`: `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- Exact base-to-head comparison reports **207 commits ahead / 0 behind** (not the earlier approximate 205 ahead / 4 behind; that earlier count was incorrect).
- PR remains **open, draft, unmerged, mergeable=false**, 31 changed files, no approval/review threads returned in prior inspection.
- The PR body still states CI must verify TypeScript compilation and batch-selector tests. The local ledger-name tests add further validation not yet evidenced in CI.

No CI was dispatched or rerun, no workflow file or dependency was changed, and no production DB, migration, role/ACL, secret, Render service, deployment, or paid resource was touched. The production execution-batch manifest remains empty and production migration execution remains fail-closed.

### Next bounded action

Determine why the existing workflow is not producing a new PR run for the recent source commits, using the PR event/timeline and repository Actions metadata. Do not rerun the known failing historical run: its failure is the web dependency audit, not the migration code. Once trigger cause is known, obtain exact-head CI for the current PR source tree without weakening or bypassing the dependency audit.



## 20 November 2026 — PR workflow dispatch path identified

Further inspection corrected the earlier CI trigger diagnosis:

- The authoritative `.github/workflows/ci.yml` on both `main` and the PR branch explicitly defines `workflow_dispatch`, `pull_request` for base branch `main`, and ignores documentation-only changes. PR #298 targets `main` and includes TypeScript/config/test changes, so the PR's source/base/path filters are compatible with CI.
- The latest PR head before this handover update (`b42625eda9989ca9c07ec21f550fe5fb4702105b`) has no GitHub Actions check run; its only returned check run is the external Cloudflare Pages check, which succeeded. Its commit status endpoint contains zero status contexts.
- Repository Actions history still ends with PR run #5396 on 2026-11-18; there is no run after the 2026-11-19 source change. The ledger-name source commits were authored via the GitHub connector's file-update path. GitHub documents that events created using the repository's `GITHUB_TOKEN` do not trigger new workflow runs (to prevent recursive workflow execution). This is a plausible explanation for why Cloudflare Pages saw the commit while Actions did not, but the connector's token identity is not exposed here, so record it as a **likely, not proven, cause**.
- No workflow dispatch or rerun action is exposed by the connected GitHub tool set. The workflow itself does support manual `workflow_dispatch`, so the safe way to qualify the exact branch without a source change is to manually dispatch the existing `CI` workflow against `feat/actor-gateway-production-migration-batches`. This executes the existing quality and web-quality jobs; it does not deploy or run against production (the quality job's PostgreSQL is a disposable Actions service).
- The known historical #5396 web audit failure remains a real dependency gate. Manual dispatch must retain that gate; do not use force upgrades, audit exceptions, or a bypass. A successful core job with a failing web audit is not an overall green CI result.

No workflow file, dependency, branch, source, database, Render service, deployment, or secret was changed. PR #298 remains draft/unmerged; the reviewed production batch manifest remains empty. The focused local evidence for the ledger-name guard remains build passed and 17/17 tests passed on `5d090283...`; exact-head CI is still outstanding.

### Next operator action

Dispatch the existing workflow `CI` via GitHub Actions `workflow_dispatch` on branch `feat/actor-gateway-production-migration-batches`. Record both job outcomes and inspect any failure logs. Do not re-run historical #5396 or change its dependency gate as a substitute for current-head validation.



## 20 November 2026 — CI dispatch permissions and commit identity rechecked

Continued the CI-trigger investigation from the handover and inspected the latest PR metadata, repository Actions history, and GitHub commit API metadata for the three ledger-name source commits and subsequent handover commits.

- Current PR #298 head at this check: `a72f05d8a3eb8c415222bc7cb63a4076c8062bb7`; base `b73839b27ac90446650f921d3e8ce1b5de041f04`; PR remains open/draft.
- Repository Actions history has not advanced beyond run #5396 (2026-11-18 03:27:57Z). No newer PR workflow run exists for the current head.
- GitHub API reports the source commits and docs commits with author/committer account `zaidhqdev-sys` (User). This does **not** establish which credential/token caused the commits, and it does not prove the GITHUB_TOKEN suppression hypothesis. Keep the cause of missing workflow events **unknown**.
- The connected GitHub tool inventory contains read/inspection and rerun-existing-run actions, but no create/dispatch-workflow-run action. Re-running #5396 would only retest the old `6eb0ec8...` commit and its known dependency-audit failure; it would not qualify the current PR head. It was deliberately not rerun.
- The existing workflow supports manual `workflow_dispatch`. A manual dispatch against the current branch is therefore the remaining route to exact-current-branch CI, but it must be initiated by an account with Actions write permission in GitHub's Actions UI (Actions → CI → Run workflow → branch `feat/actor-gateway-production-migration-batches` → Run workflow). Preserve both existing jobs and all audit gates.

No source, workflow, branch, dependency, Actions setting, PR state, production DB, Render service, secret or deployment was changed. No historical run was rerun. The source-level local evidence remains build passed and 17/17 focused migration tests passed at `5d090283...`; it is not a substitute for current-head CI.



## 20 November 2026 — manually dispatched exact-branch CI run #5397 passed

The user manually dispatched the existing `CI` workflow from GitHub Actions using branch `feat/actor-gateway-production-migration-batches`. Inspected the repository-wide Actions run record, PR #298 metadata, and both workflow jobs.

- Run **#5397**, run ID `44647318812`, event `workflow_dispatch`, completed **success** at 2026-11-20 00:40:11 UTC.
- The run is associated with PR **#298** and its selected head is exactly `b25a176ee38ec0e9a1871854421646d9defc2f09`, matching the current PR branch head at inspection. Base is `main` at `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- Both workflow jobs passed:
  - `quality` — success. Build, Actor Gateway Worker bundle, all migrations on disposable PostgreSQL, isolated production migration plan-only fixture, database principal qualifications, commercial authority/payment-consent qualification, Worker smoke, storage and gateway cutover qualifications, main test suite, migration audit policy tests, and runtime boundary verification all completed successfully.
  - `web-quality` — success. Web build, web tests, `npm audit`, and resolved security-sensitive toolchain verification all completed successfully.
- This is the first fresh manual CI evidence for the ledger-name guard after the focused local build and 17/17 migration checksum tests. The exact current PR tree now has both GitHub Actions jobs green; do not confuse this with historical run #5396, which failed on the older tree.
- CI ran the workflow's disposable/isolated qualification environments only. No production migration, production DB change, Render deployment, service/secret change, or paid resource was involved.
- PR #298 remains **open, draft and unmerged**. The production batch manifest remains empty and production migration execution remains fail-closed. CI success does not authorize a production migration or deployment.




## 20 November 2026 — post-CI PR and mainline reconciliation checkpoint

After CI run #5397 passed, re-read this handover, PR #298 metadata/reviews, the current branch comparison, and the mainline Actor Gateway hosting/credentials handover before deciding the next integration step.

### Current PR and branch state

- PR #298 remains **open, draft, unmerged**; current PR head at this checkpoint is `eb30b79abc931e014d9856bd909460f6019d950b` (the CI-evidence handover commit).
- Current `main` is `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Branch comparison: **211 commits ahead / 4 behind**; merge base remains `b73839b27ac90446650f921d3e8ce1b5de041f04`. GitHub PR metadata still reports `mergeable=false`.
- No submitted PR reviews or review threads were returned.
- The four commits on main since the merge base are `dc4cbd0`, `f52ec0a`, `aa3842d`, and `ddb31ff`. The compare endpoint identifies their only changed path as `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md`; no runtime source, migration, workflow, test, or configuration file is among those four mainline-only changes.
- Compared the mainline and PR-branch copies of sections 37–40 in that hosting/credentials handover. The text of all four sections is present verbatim on the PR branch; the only trailing difference in the extracted range is the branch's separator line before its subsequent owner-specific updates. The branch therefore already contains the substance of these four mainline documentation commits, although it does not contain their commit ancestry. This is a content reconciliation, not a rebase/merge/cherry-pick.

### Integration decision

Do not merge or rebase solely to remove the four documentation-only behind commits. The branch includes subsequent owner-specific hosting decisions and a long-running PR-specific migration/security evidence trail. GitHub still reports the PR as non-mergeable, and this inspection did not establish whether that flag reflects an actual conflict or a stale/indeterminate mergeability calculation. No forced merge, base retarget, branch rewrite, or PR state change was attempted.

CI #5397 remains green for both `quality` and `web-quality` at the exact pre-handover source tree `b25a176ee38ec0e9a1871854421646d9defc2f09`; the current head `eb30b79...` adds only this documentation record after that run. The source tree has not changed since the CI-tested commit.

The production execution-batch manifest remains empty. Production ledger refresh, first-batch derivation, migrator authority/ACL remediation, recoverable backup proof, Actor Gateway production API/schema prerequisites, and hosting/credential readiness remain separate gates. No production migration, database/role/ACL change, Render service/configuration/deployment, secret access, or paid resource was performed.




## 20 November 2026 — cross-PR migration inventory coordination check

Re-read this PR handover, the Actor Gateway hosting/credentials handover, PR #298 metadata and changed-file list, then checked the related open migration/ACL PRs and their exact changed-file inventories before continuing production migration readiness work.

### PR #296 — separate Business Identity ACL migration remains outside this inventory

- PR #296 remains open, draft and non-mergeable at head `5fa018304970c0e84c56b22111a7255b80fd7c60`.
- Its additional migration is `database/migrations/20261116200000_narrow_business_identity_runtime_insert.sql`.
- That migration is not present in PR #298's current 50-entry `config/pending-migrations.production.json` inventory. It is also not in the current `main` migration tree because PR #296 is unmerged.
- Its version sorts **after** the existing 20261112170000 entry and **before** the PR #298 inventory's 20261116140000–20261117020000 tail. If PR #296 is merged, PR #298's inventory will no longer describe the complete repository pending queue; it must be regenerated/reconciled from the then-current repository and exact refreshed production ledger before any plan/batch is considered.
- Keep PR #296 separate. Do not cherry-pick its migration into this branch or silently append it to the inventory. Its earlier exact-head CI pass is only code validation, not production authorization.

### PR #297 — overlapping older migration-runner alternative

- PR #297 remains open, draft and non-mergeable at head `304da520c5cfe1e77b479a97dfdd9d951fa6e245`; its base is stale.
- Its changed-file set overlaps PR #298 in eight paths: `.github/workflows/ci.yml`, `config/production-migration-batches.json`, `database/migrations/20261117020000_revoke_runtime_capability_governance.sql`, the production reconciliation and hosting handovers, `package.json`, `scripts/migration-audit-checksum.test.mjs`, and `src/db/migrate.ts`.
- PR #297 uses a different pending-inventory path and an earlier batch-runner implementation. It is not an independent prerequisite to merge alongside PR #298. Merging both without a deliberate consolidation would create overlapping runner/configuration/workflow changes.
- Preserve PR #298 as the active reviewed branch for this task; do not merge PR #297 or copy its older implementation into PR #298. No PR was closed or modified.

### Current integration implication

PR #298 remains open/draft/non-mergeable at head `e40df8b6fa0c153b91ec81f05a3c13b0434992cd`; current `main` remains `ddb31ff59ab470973edf60a5078a75e5f962f803`. The branch comparison is 212 ahead / 4 behind. The four behind-main changes remain documentation-only and their substantive handover text is already present on this branch; this does not reconcile commit ancestry or resolve GitHub's `mergeable=false` state.

The 50-entry inventory remains a dated candidate list, not a live ledger. The batch manifest remains empty. If either PR #296 or any other migration-bearing PR is merged into `main`, stop and regenerate the inventory from exact current source plus a fresh authoritative ledger export; do not patch counts or infer a batch from timestamps.

No PR state, source, migration, inventory, manifest, production database, role/ACL, credential, backup, Render service/configuration/deployment, payment state or paid resource was changed in this review. No production migration was executed.



## 20 November 2026 — first contiguous migration-prefix dependency and identity-boundary trace

Re-read the current PR #298 handover, the production role/service dependency map, legacy runtime authority findings, migrator authority remediation plan, Actor Gateway hosting/credentials handover, and the current PR/branch state before inspecting the first six entries in the branch's production pending inventory. Also rechecked related PRs #296, #297 and #299 so this trace does not duplicate or combine their work.

### Current GitHub state correction

- Live PR #298 metadata reports head `14dc532a0bdd2063781ee426f7616633fe18791f`, not the older `e40df8b6...` value recorded in the preceding checkpoint. Use the live PR head/ref as authoritative.
- PR #298 remains open, draft and unmerged; GitHub reports `mergeable=false`.
- Current main is `ddb31ff59ab470973edf60a5078a75e5f962f803`; compare remains diverged, 213 commits ahead / 4 behind, merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- The previous claim that all four mainline-only commits changed only the hosting handover is not supported by the current compare response: the compare file list contains the PR branch's aggregate changes since the merge base, not a clean list of the four behind-only commits. Do not reuse that earlier file-list interpretation as proof of content/ancestry reconciliation. The four-behind count is current; the exact behind-only commit/file set must be isolated from the merge-base commit graph before any integration decision.
- PR #296 remains open/draft/non-mergeable and carries the additional Business Identity ACL migration `20261116200000_narrow_business_identity_runtime_insert.sql`, absent from PR #298's 50-entry candidate inventory. PR #297 remains an overlapping older runner alternative, not an independent merge prerequisite. PR #299's current metadata is internally inconsistent (`state=open` while a merge SHA is populated); verify its actual merged state from the PR timeline/base branch before relying on it for migration inventory decisions. Its Project HTTP scope does not itself alter the first six migration dependencies.

### Source-level trace of the first six contiguous inventory entries

The following is a source contract trace only. It does not establish whether any migration is applied in production; the current production ledger cannot be read through the available connector, and the dated inventory is not execution authority.

| Ordered migration | Source-level dependency / effect | Identity and runtime implication |
|---|---|---|
| `20261110010000_add_business_supplier_classification` | Alters `ghm.business`; creates a SECURITY DEFINER supplier-classification update function that checks a caller-supplied `p_account_id` against active owner/administrator membership. | Grants EXECUTE to `ghm_runtime`. The function itself does not cryptographically bind the supplied account ID to the authenticated request. It is later cut over and runtime EXECUTE is revoked by `20261110260000`; signed one-use assertion enforcement is added by `20261111030000`. |
| `20261110100000_create_account_onboarding_progress` | Creates account/journey/step progress table, unique identity key, lifecycle checks and account/journey index. | Grants runtime SELECT/INSERT/UPDATE and sequence USAGE/SELECT; no gateway dependency is introduced in this migration. |
| `20261110120000_create_business_relationship_outcome_read_models` | Creates relationship and outcome reference/read-model tables with foreign keys to existing Business, Opportunity and Account Identity records; seeds relationship/outcome types. | Grants runtime SELECT only and explicitly revokes runtime write privileges. |
| `20261110140000_allow_pending_storage_object_cleanup` | Changes the storage-object lifecycle check and creates SECURITY DEFINER `storage_mark_deletion_pending(bigint)`. | Grants EXECUTE to `ghm_runtime`; this is a storage-provider workflow contract and should not be treated as Actor Gateway readiness. |
| `20261110160000_add_admin_capability_catalogue_governance` | Creates/updates SECURITY DEFINER capability draft and lifecycle functions, each accepting `p_actor_account_id` and checking active administrator status. | Grants EXECUTE to `ghm_runtime`. These functions are later wrapped behind gateway operations in `20261110250000`, then cryptographically bound to signed one-use assertions in `20261111020000`. |
| `20261110210000_add_actor_gateway_principal_guard` | Requires the pre-provisioned `ghm_actor_gateway` LOGIN/NOINHERIT role and its bounded `ghm_db_user` ADMIN=true/INHERIT=false/SET=false membership; creates `assert_actor_gateway(bigint)`; grants gateway schema USAGE and function EXECUTE. | This is only a database-login/active-account guard. Its own comment relies on the caller deriving the account ID from a verified access token; the SQL function does not verify a signed actor assertion. It is not the completed identity boundary. |

### Cutover dependency discovered across later contiguous entries

- `20261110250000_add_gateway_capability_governance` adds gateway capability wrappers that call the login-only `assert_actor_gateway`; it leaves the legacy runtime grants in place at that stage.
- `20261110260000_gateway_supplier_classification_cutover` adds the supplier gateway wrapper and revokes direct `ghm_runtime` EXECUTE on the legacy supplier function. At this intermediate point the gateway wrapper still relies on the login-only assertion.
- `20261111020000_bind_capability_gateway_actor_to_signed_assertion` replaces the capability gateway signatures with short-lived HMAC assertions, one-use nonce/replay checks and operation binding; the gateway DB login cannot read the HMAC secret.
- `20261111030000_bind_supplier_gateway_actor_to_signed_assertion` extends the signed assertion verifier to supplier classification and replaces the supplier gateway wrapper with the assertion-bearing signature.
- Consequently, a production plan must not expose/operate the gateway after the principal-guard or login-only wrapper migrations but before the corresponding signed-assertion migrations. For the capability and supplier surfaces together, the minimum source-level assertion-complete boundary is at least through `20261111030000`. This is a dependency boundary, not a selected or approved production batch.
- Even after that source boundary, the dedicated always-on Frankfurt Actor Gateway service is not approved/hosted under the standing no-additional-paid-service constraint; the live database role has no schema USAGE or gateway function grants, and the assertion secret has not been provisioned. The production Auth Issuer role/service is also absent. These are independent blockers.
- The earliest five migrations are not a self-contained Actor Gateway batch: they span Business, onboarding, relationship/outcome, storage and capability functions with separate active runtime routes. A first production prefix cannot be inferred from timestamp order alone; it must include all contiguous entries through the required cutover and be reconciled against active route/service readiness and the exact live ledger.

### Decision and next gate

Do not populate `config/production-migration-batches.json`, run plan-only against production, execute any migration, provision secrets/grants, or create/deploy a service. The manifest remains `[]`. The exact live production ledger and recoverable backup proof remain unavailable, migrator authority preflight remains blocked by bootstrap memberships and direct ACLs, the Actor Gateway service/cost gate remains unresolved, and the Auth Issuer isolation gap remains separate.

Next useful evidence step is to isolate the exact four behind-main commits from the commit graph (not infer their file set from the aggregate compare), then continue the source trace through the rest of the 50-entry prefix and its active route consumers. A future production batch can only be derived after an authoritative ledger export, backup/recovery proof, approved hosting/credential path and reviewed contiguous-prefix dependency map are all available.

No production SQL, role/ACL, migration, secret, Render setting/service/deployment, payment state, PR state, branch ancestry, manifest, or paid resource was changed in this review.


## 20 November 2026 — owner correction: Actor Gateway deployment is sequenced after qualification, not a cost/approval blocker

The owner corrected the prior migration-prefix note, which incorrectly described the Actor Gateway production service as unapproved under a standing no-additional-paid-service constraint. Re-read the latest sections of `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md` before recording this correction.

The controlling owner decisions are:

- On 19 November, the owner selected **one** dedicated Node Render Web Service named `ghm-actor-gateway` on the **Free** plan for the initial free-directory/early-access stage.
- This is the same continuous service for early access and the later paid/upgrade instance. When revenue and operational needs justify paid compute, upgrade this same service in place; do not create a second service.
- The owner clarified the Render service form is already filled and deliberately remains **unsubmitted / undeployed while qualification is completed**. The owner controls when it is submitted/deployed.
- The reason the service is not yet deployed is the agreed sequencing: first qualify the database connection, exact service principal and ACL contract, signed-assertion secret/verifier, migration ordering, application routes, health/restart behaviour and safe early-access handling of Free cold starts. Deployment follows those qualification steps.
- Free-plan cold-start versus the Resource API's five-second timeout is a known operational behaviour to qualify and address with bounded secure retry/recovery or explicit user retry. It is not a reason to misstate the owner's selected hosting plan or imply a second paid service is required.
- Paid always-on hosting/provider requirements are a later paid-live review, not a current approval gate for the selected Free early-access service.

Therefore remove the inaccurate framing in the immediately preceding section that the gateway service is "not approved/hosted under the standing no-additional-paid-service constraint" or that the "service/cost gate remains unresolved." The accurate current status is **hosting choice made; one Free service form staged by owner; deployment intentionally deferred until qualification passes**.

This correction does not assert that production qualification has passed. The independently outstanding technical evidence remains: exact production migration ledger/checksum reconciliation, recoverable backup proof, provider-authorized migrator/role/ACL remediation, exact gateway schema/function grants, assertion-secret provisioning and verification, and end-to-end gateway startup/route qualification. These are qualification work items in the agreed pre-deployment sequence, not a reason to re-open the hosting decision.

### Work sequencing

Continue qualifying the implementation and its prerequisites from source, tests, existing handovers and controlled read-only evidence. Do not submit/deploy the already staged Render form as part of this review, and do not weaken fail-closed checks. Once the defined qualification evidence is complete, the owner can proceed with the already selected single-service deployment.

No Render form/service/configuration, deployment, database, migration, role/ACL, credential, secret, payment state, PR state or paid resource was changed by this correction.


## 20 November 2026 — continued contiguous migration-prefix trace: identity context and business-domain gateway surfaces

This task began by rereading the latest Actor Gateway hosting handover and the PR #298 migration handover. The owner corrected the previous checkpoint's description of deployment: the single Free Render service is deliberately staged and undeployed until qualification is complete. That correction is recorded immediately above; hosting selection is settled for early access and is not a current cost/approval blocker.

Continued source inspection from the seventh through twenty-sixth inventory entries (versions 20261110220000 through 20261111170000). This is a source-level contract trace only; it does not claim any of these migrations are applied in production.

### Additional migration dependencies and surfaces

| Migration range | Source-level addition / transition | Qualification implication |
|---|---|---|
| `20261110220000` | Adds gateway-only actor self-identity read, initially guarded by the gateway login and caller-supplied actor ID. | Later replaced by signed assertion operation `actor.identity.read`; the early overload must not be treated as final. |
| `20261110230000`–`20261110233000` | Adds private Business registration identity read and write wrappers. The write migration repairs the existing upsert's ambiguous `ON CONFLICT (business_id)` target by using the named primary-key constraint. | Early gateway wrappers use the login-only assertion. The registration read/write functions are replaced with signed, operation-specific assertions in `20261111050000`. |
| `20261110240000` | Adds a database trigger serializing Capability hierarchy changes and enforcing parent/cycle/replacement/lifecycle invariants at the database boundary. | This is a schema invariant prerequisite for safe capability mutations, not merely a gateway endpoint. It revokes direct execution of the trigger function from application roles. |
| `20261110265000` | Restores the Business profile compatibility contract, adds paired latitude/longitude columns and range/pair constraints, and replaces the profile update function with a validated patch implementation supporting historical aliases. | This is a Business data/API contract migration that precedes the profile gateway cutover; inspect all downstream Connect/Resource API field expectations before treating it as independently deployable. |
| `20261110270000` | Adds gateway Business profile update wrapper and revokes direct `ghm_runtime` execution of the legacy profile update function. | Intermediate wrapper uses login-only actor guard; signed assertion replacement is `20261111040000`. |
| `20261111040000` | Extends signed assertion operation set to `business.profile.update`, replaces the profile wrapper with assertion/context-bearing signature. | Profile mutation identity is cryptographically bound, but exact request-context binding is strengthened in the next migration. |
| `20261111050000` | Extends signed assertion operation set to registration read/write and actor self-identity read; replaces all three wrappers with signed assertion signatures. | The source boundary for these operations is no earlier than this migration. |
| `20261111060000` | Replaces the v1 assertion payload with v2, binding the signature to the exact operation context JSON and enforcing context equality in each wrapper. The signed payload includes actor, operation, issue time, nonce and hex-encoded context. | This is a material security boundary: actor+operation signatures alone are insufficient for request-argument integrity. Qualify canonical JSON/context construction between Node gateway and SQL for every operation; preserve one-use nonce and 60-second expiry semantics. |
| `20261111070000` | Adds signed gateway wrappers for Business Capability assertion replacement, verification transitions and evidence review/submission; extends the allowed operation catalogue. | Adds multiple sensitive mutation routes and role/business authorization paths. Must qualify owner/member/admin distinctions, evidence visibility and payload-context equality end to end. |
| `20261111100000` | Adds signed private Saved Business list/create/delete gateway operations, with actor-scoped list results. | Qualify actor ownership and exact operation context for each mutation; legacy runtime grants are explicitly retained pending a separate route cutover. |
| `20261111130000` | Adds signed Business Hours replace/read gateway operations and a public approved-business hours projection. | Distinguishes private member reads/mutations from public approved-business reads. Qualify role rules and public visibility. |
| `20261111140000` | Adds Business Hours read projections. | Read-model/API consumer dependency; keep distinct from private write authority. |
| `20261111150000` | Adds signed Trust Score calculation operation. | Calculation is a sensitive gateway write; qualify exact business context and caller authorization. |
| `20261111160000` | Adds signed Business Logo object binding operation. | Depends on the storage object/provider workflow and canonical object lifecycle; qualify object ownership, pending deletion/cleanup and replacement semantics before route cutover. |
| `20261111170000` | Adds signed Trust Score reads and public projections for approved businesses. | Distinguishes authenticated member access from public approved-directory projections; qualify filtering and read response contract. |

### Important sequencing conclusions

1. The initial gateway migrations from 20261110210000 through 20261110270000 contain transitional login-only wrappers. Their presence in a migration prefix does not mean the complete signed-assertion API is ready.
2. The identity hardening is layered: signed actor identity (20261111020000+), operation binding, exact request-context binding (20261111060000), then domain-specific signed wrappers. The gateway implementation and database migration versions must agree on the same v2 context format and canonical serialization.
3. The gateway surface is broader than the initial capability/supplier/profile functions. By 20261111170000 it includes identity, registration, Business Capability/evidence, Saved Business, Business Hours, Trust Score and Logo binding. Do not derive a first production prefix solely from the capability/supplier pair if active Resource API routes consume later operations.
4. Public read projections remain callable by `ghm_runtime` by design in several migrations; private reads and mutations are restricted to `ghm_actor_gateway`. The runtime route catalogue must be reconciled against these distinctions before any privilege cutover. A blanket revoke or blanket grant would be unsafe.
5. Several migrations explicitly retain legacy runtime grants until separately approved HTTP/resource route cutover. Conversely, other migrations revoke runtime execution immediately. Build a per-function route/privilege transition matrix; do not infer a global “all runtime access revoked” state from the presence of signed gateway wrappers.
6. Business Logo binding depends on the storage metadata/provider workflow migrations and object lifecycle rules; Business Hours and Trust Score include public projection contracts; Business Capability evidence has distinct submit/review authority. These are separate dependencies, not interchangeable generic gateway readiness.

### Next source-review segment

Continue through the next inventory segment (20261111210000 onward), focusing on the runtime revocation migrations and token-bound recovery/QuoteFlow-related entry points. Cross-reference each affected function with current Resource API/Auth routes and current handover decisions. Keep the manifest empty until the exact current production ledger, recoverable backup, provider-authorized migrator authority and complete route/API qualification are established.

No source, migration, manifest, PR, branch ancestry, production database, role/ACL, secret, Render form/service/configuration/deployment, payment state or paid resource was changed. The only change in this task is this handover record.


## 20 November 2026 — runtime revocation, Auth recovery and storage-provider qualification trace

Re-read the corrected hosting/qualification decision and the PR #298 migration handover before continuing. Hosting remains settled: one Free Render Actor Gateway service is staged and deployment is intentionally deferred until qualification completes. Do not re-label this sequencing as a cost or approval blocker.

Inspected migrations 20261111210000–20261111260000, 20261112020000–20261112090000, 20261112140000–20261112150000 and 20261112170000, then cross-checked the current Auth HTTP router/services, QuoteFlow reset enrollment contract tests, storage metadata gateway client/provider attestation implementation, and the storage provider migration contract tests.

### Runtime privilege revocation and Auth route implications

- `20261111210000` removes direct `ghm_runtime` table and sequence access to `account_external_identity`, retaining only narrow SECURITY DEFINER operations. Later migrations separately revoke runtime EXECUTE on external identity linking and bootstrap; the current policy is that runtime can resolve an existing mapping but cannot create/reassign provider-subject mappings or bootstrap an active account.
- `20261111220000` revokes three broad account/session-ID administration functions that the migration comments state have no active HTTP/service callers: direct session revocation, account-ID password change, and account disable.
- `20261111230000` exposes recovery redemption and session-revocation count through a token-hash-bound function. It revokes the broad caller-supplied account-ID session-revocation function from `ghm_runtime`.
- `20261112020000` implements token-bound password reset: locks and validates a live, unused, unrevoked recovery token; checks the normalized login email belongs to the same active account/credential; consumes the token; changes only the password hash; and revokes sessions atomically. It preserves the existing login email.
- `20261112030000` adds conditional Argon2 rehash: update succeeds only if the stored hash still equals the exact hash verified by login, preventing a stale login from overwriting a concurrent password reset.
- `20261111240000` and `20261112040000` revoke ordinary runtime execution of QuoteFlow migration account provisioning and reset-enrollment registration. Those are controlled migration/schema-owner operations; issuer cutover separately denies issuer registration authority.
- `20261112050000` removes PostgreSQL's global default PUBLIC EXECUTE for functions created by `ghm_schema_owner`; intended application functions must receive explicit per-role grants.
- `20261112070000` revokes the legacy unsigned `assert_actor_gateway(bigint)` from PUBLIC and all application logins. The typed signed gateway assertion path is the only intended application gateway boundary.
- `20261112170000` removes a redundant migrator grant on external Business mapping lookup; its comment says the commercial payment-preparation route uses the lookup as `ghm_runtime` and migrator schema-owner SET ROLE is the migration authority.

### Route and contract cross-checks

- The current Auth HTTP router exposes distinct normal password recovery request/reset routes and separate QuoteFlow migration-reset request/complete routes. QuoteFlow migration completion issues a normal GHM session only after the reset completion service returns successfully. Normal recovery and reset are injected services; exact persistence-to-SQL call mapping still needs a focused read of `src/auth/foundation/persistence.ts` before treating every route-to-function link as fully proven.
- The QuoteFlow reset-enrollment migration contract test explicitly checks that registration is denied to `ghm_runtime` and `ghm_auth_issuer`, while the controlled schema-owner SET ROLE remains the qualification path. This matches the migration/operator-only boundary; it is not a general runtime registration endpoint.
- The Auth recovery migrations deliberately retain narrowly scoped token-bound runtime functions. Do not interpret the revocations as removing password recovery/reset from the Resource API.
- The storage metadata gateway client calls the Actor Gateway for create/read/deletion-pending/available/deleted operations and separately creates a provider attestation for provider-confirmed availability/deletion. Its signer uses canonical base64 for exactly 32 secret bytes, JSON context bytes, a distinct `ghm-storage-provider:v1` domain, timestamp and nonce.
- Migration `20261112150000` requires BOTH a user Actor Gateway assertion and a distinct provider workflow attestation for `mark_available` and `mark_deleted`. The provider verifier secret and nonce table are inaccessible to PUBLIC, runtime, Actor Gateway and migrator roles; verifier execution is not granted to application roles. Provider-confirmed state transitions cannot be authorized by the Actor Gateway's user assertion alone.
- Existing storage contract tests assert the separate secret/domain, replay protection, metadata-context binding, owner/administrator authorization and status preconditions. This is useful static contract evidence, not proof of an end-to-end live provider callback or deployed secret.

### Qualification risks / follow-up evidence

1. The production migration prefix includes deliberate privilege removals. Before deriving a batch, enumerate every current Resource API call site and verify it uses the surviving narrow function or the appropriate gateway/issuer boundary. In particular, verify Auth persistence SQL against the token-bound recovery/reset/rehash functions and verify no active path still calls the revoked account-ID or identity-link/bootstrap operations.
2. For QuoteFlow migration flows, keep operator enrollment/provisioning distinct from user reset completion and normal GHM login. Qualify the signed QuoteFlow identity-link attestation separately from the Auth Issuer's enrollment lookup/completion privileges.
3. For storage, qualify the full order: provider upload/delete evidence -> separate provider attestation -> Actor Gateway actor assertion -> database transition. Verify secret custody and exact context construction at the Resource API and SQL boundary. The Actor Gateway must not be able to mint provider proof.
4. `20261112090000` pins all GHM SECURITY DEFINER search paths to `pg_catalog, ghm, pg_temp` after requiring every such function to be owned by `ghm_schema_owner`. Qualification must include the preflight against the actual existing function ownership inventory and temporary-schema shadowing tests.
5. These source and contract inspections do not prove current production ACLs, migration ledger state, secret provisioning, or deployed service behaviour. Those remain evidence to obtain during the agreed pre-deployment qualification sequence, not hosting approval blockers.

The production batch manifest remains empty. No plan was run against production and no production SQL, ACL, secret, migration, Render service/form/deployment, payment state, PR or branch ancestry was changed. Only this handover record was updated.


## 20 November 2026 — Auth persistence SQL-to-route reconciliation

Re-read the migration-prefix handover and current branch source before tracing the Auth persistence implementation against the current HTTP router and SQL migrations. This section records exact source call mappings; it does not assert production migration application or live ACL state.

### Confirmed route-to-persistence mappings

| Active route / operation | Application path | SQL function(s) | Privilege implication |
|---|---|---|---|
| `POST /api/v1/auth/password-recovery/request` | `createPasswordRecoveryService.request` -> lookup active password credential -> issue token -> delivery port | `auth_lookup_password_by_normalized_email`, `auth_issue_recovery` | Both lookup and issue must remain intentionally callable by `ghm_runtime`; recovery request deliberately avoids disclosing unknown/inactive accounts at HTTP. |
| `POST /api/v1/auth/password-recovery/reset` | `createPasswordResetService.reset` -> `PostgresAuthPersistence.resetPasswordWithRecovery` | `auth_reset_password_with_recovery(bytea,text,text,integer,integer,integer)` | Exact match for migration 20261112020000; runtime EXECUTE is explicitly granted. Token hash and normalized email are passed; account ID is not caller-supplied. |
| Login with stale Argon2 parameters | `createGhmAuthService.login` -> conditional persistence rehash | `auth_rehash_password_if_unchanged(bigint,text,text,integer,integer,integer)` | Exact match for migration 20261112030000; runtime EXECUTE is explicitly granted and update is conditional on the hash verified by login. |
| QuoteFlow migration reset request | `createQuoteFlowMigrationResetRecoveryService.request` -> approved enrollment lookup -> issue token -> delivery | `auth_lookup_quoteflow_migration_reset_enrollment`, `auth_issue_recovery` | Enrollment lookup is a narrow tokenless eligibility read; enrollment creation/provisioning remains operator-controlled. |
| QuoteFlow migration reset completion | `createQuoteFlowMigrationResetCompletionService.complete` -> atomic reset -> normal login | `auth_complete_quoteflow_migration_reset`, then normal login/session SQL | Reset completion is distinct from enrollment registration. HTTP issues a normal GHM session only after reset transaction succeeds. |
| External identity login/authorization resolution | `PostgresAuthPersistence.lookupExternalIdentity` | `auth_lookup_external_identity(text,text)` | Narrow lookup remains granted to runtime after direct table/sequence access is revoked. No active application caller to link or bootstrap an identity was found in the inspected Auth/Connect adapters. |
| Refresh/logout | Auth service -> persistence | `auth_rotate_refresh`, `auth_revoke_by_refresh_hash` | Token-hash-bound operations remain the supported runtime path; no caller-supplied account/session ID revocation required. |

### Confirmed safety properties

- Normal password recovery has anti-enumeration behavior at the application/HTTP layer: invalid email normalization returns without delivery; unknown, inactive or missing password credentials also return without delivery; the route responds 202 on a validly shaped request.
- Reset SQL locks a live unused recovery token, excludes QuoteFlow accounts still marked `reset_required`, checks the normalized email belongs to the same active account and active credential, consumes the token, updates the password hash without changing email, and revokes sessions in the same transaction.
- Conditional rehash only updates a still-active credential when its stored hash still exactly matches the hash verified by the login attempt.
- QuoteFlow migration reset request resolves a pre-existing approved enrollment and delivers to its approved email. Completion uses the distinct reset function and only then obtains a normal GHM session.
- The runtime direct-table revocation for `account_external_identity` is compatible with the current persistence implementation because it uses the retained `auth_lookup_external_identity` SECURITY DEFINER function. The link and bootstrap functions are not needed by the inspected current Auth/Connect identity adapters and are revoked by later migrations.
- The legacy account-ID session revoke, account-ID password change and account-disable functions have no active HTTP/service callers in the inspected current source and are explicitly revoked from runtime by 20261111220000.

### Qualification items still to prove

1. The persistence method `issueRecovery(accountId)` calls `auth_issue_recovery(accountId, tokenHash, expiresAt)`. Its SQL definition and grants predate the inspected 20261111230000–20261112030000 files. Before marking the Auth privilege map complete, locate and inspect the canonical function definition and prove that its runtime grant is deliberate and constrained as intended. The service first resolves an active credential/enrollment, but a compromised shared runtime principal can call a granted SECURITY DEFINER function directly; application-level lookup is not itself a database authorization boundary.
2. Likewise inspect exact SQL definitions/grants for `auth_lookup_password_by_normalized_email`, `auth_lookup_quoteflow_migration_reset_enrollment`, `auth_issue_recovery`, `auth_complete_quoteflow_migration_reset`, `auth_lookup_external_identity`, `auth_rotate_refresh` and `auth_revoke_by_refresh_hash`, including default PUBLIC EXECUTE revocation from 20261112050000. The current TypeScript call mapping is confirmed; the full effective production privilege map is not.
3. Database-backed Auth persistence tests are conditional and skip when runtime/migrator URLs or the migrated schema are unavailable. The repository test's presence is not proof that the current production database passed those integration tests. Record actual qualification output when run against the intended disposable qualification target.
4. The Auth router is dependency-injected. Confirm production application composition actually supplies the recovery and QuoteFlow reset services and delivery adapter, rather than inferring wiring from route registration alone.

### Decision

The inspected current Auth routes do not call the broad account-ID revoke/change/disable functions removed by the revocation migrations. Token-bound recovery/reset and conditional rehash map to the intended narrow SQL functions. External identity lookup remains supported through a narrow function after table access revocation. Do not weaken these revocations.

Keep the remaining function-definition/grant review and production composition verification as explicit qualification tasks. No production DB, role/ACL, SQL migration, secret, Render service/configuration/deployment, PR, branch ancestry or payment state was changed. Only this handover record was updated.


## 20 November 2026 — canonical Auth SQL grants and Authentication Issuer composition: critical direct-call findings

Re-read the latest Auth route/persistence reconciliation and inspected the canonical SQL definitions in `20260921130000_create_auth_runtime_functions.sql`, subsequent refresh/replay and logout migrations, the QuoteFlow reset migrations, `src/auth/foundation/persistence.ts`, `src/auth/password-recovery.ts`, `src/auth-issuer/server.ts`, `src/auth-issuer/app.ts`, and the Auth HTTP router. This is a source/privilege-contract review; no production ACL was queried or changed.

### Confirmed SQL definitions and effective grants in repository migrations

The original Auth foundation migration explicitly grants `ghm_runtime` EXECUTE on the following SECURITY DEFINER functions:

- `auth_lookup_password_by_normalized_email(text)`
- `auth_create_session_with_refresh(bigint,bytea)`
- `auth_set_password(bigint,text,text,text,integer,integer,integer)`
- `auth_issue_recovery(bigint,bytea,timestamptz)`
- `auth_rotate_refresh(bytea,bytea)`
- `auth_revoke_by_refresh_hash(bytea,text)`
- `auth_lookup_external_identity(text,text)`
- `auth_revoke_all_sessions_for_account(bigint,text)`
- `auth_lookup_quoteflow_migration_reset_enrollment(text)`
- `auth_complete_quoteflow_migration_reset(bytea,text,integer,integer,integer)`

Later migrations explicitly revoke runtime execution from the broad account-ID `auth_revoke_session`, `auth_change_password`, and `auth_disable_account` functions; remove runtime table/sequence access to `account_external_identity`; and revoke external identity link/bootstrap. They do **not** revoke the original direct grants on `auth_set_password`, `auth_create_session_with_refresh`, or `auth_issue_recovery` in the inspected branch history.

### Critical security finding: shared runtime can call account-ID Auth primitives directly

Three retained SECURITY DEFINER functions accept caller-controlled account IDs or caller-selected token hashes without independently proving the authentication event:

1. `auth_set_password(account_id,...,password_hash,...)` writes/activates a password credential for any existing account ID. It has no actor/session/token proof in its SQL body. A caller with EXECUTE can set a chosen password hash directly, bypassing the HTTP password-reset flow and its token/email checks.
2. `auth_create_session_with_refresh(account_id,refresh_hash)` creates a new session for any active account ID and accepts the caller's refresh-token hash. The SQL checks only that the account exists and is active; it does not prove the caller authenticated as that account. A caller can choose a token/hash pair it knows and create an authenticated session for another account.
3. `auth_issue_recovery(account_id,token_hash,expires_at)` inserts a recovery credential for any existing account ID. It does not check active account/credential state, normalized email, or an authorization proof, and the caller chooses the token hash. A caller can choose a token whose raw value it knows and then attempt the reset path.

These are direct database API authority gaps, not merely an application-level anti-enumeration concern. The application currently calls them only after its own login/registration/recovery checks, but a compromised or otherwise untrusted shared `ghm_runtime` database principal can invoke granted SECURITY DEFINER functions without going through those services. The earlier observation about recovery issuance was therefore understated: the issue is broader and includes password-setting and session creation.

### Required security design direction (not implemented here)

- Revoke direct `ghm_runtime` EXECUTE on these account-ID primitives; do not leave the shared Resource API database principal with direct credential/session authority.
- Provide the narrow Auth Issuer principal with only the exact operations it needs, after separately qualifying the issuer role's LOGIN/NOINHERIT/membership/SET/INHERIT constraints and DB function allowlist. Do not assume the intended `ghm_auth_issuer` principal currently has grants; its live production ACL remains unverified.
- Where internal SQL functions are called from higher-level SECURITY DEFINER functions (for example QuoteFlow reset completion calling `auth_set_password`), preserve owner-controlled internal composition while removing direct application-role EXECUTE. Verify ownership and PostgreSQL function EXECUTE semantics in disposable qualification tests before finalizing grant changes.
- Prefer high-level functions that bind account identity to a verified credential/session/recovery token inside SQL, rather than granting a collection of low-level account-ID primitives to the shared runtime.
- Add direct-call adversarial tests using the shared runtime principal: attempt password replacement, session creation and recovery issuance for a different account without a valid authentication/recovery ceremony; each must be denied. Also test intended Auth Issuer and QuoteFlow reset paths continue to work.
- Reconcile the exact function allowlists in `src/db/runtime-database-privileges.ts` and `src/auth-issuer/database-privileges.ts` with the revised grants. A source migration grant alone is not enough to establish effective production permissions.

### Authentication Issuer composition finding

- `src/auth-issuer/server.ts` constructs `PostgresAuthPersistence`, the GHM Auth service, password-reset service and QuoteFlow migration-reset completion service.
- It does **not** construct or inject `PasswordRecoveryService` or `QuoteFlowMigrationResetRecoveryService`; both are optional in `AuthIssuerAppDependencies`. The issuer app passes the optional dependencies through to `registerAuthRoutes`.
- `src/auth/password-recovery.ts` exists, but no delivery adapter/service composition was found in the inspected issuer server. Consequently the password recovery request route and QuoteFlow migration reset request route cannot be assumed operational from the current issuer composition. Verify whether this is intentionally disabled pending delivery/provider integration or an incomplete wiring task; do not invent or enable a mail provider as part of this review.
- The ordinary Resource API `src/server.ts` explicitly calls `createApp({ authRoutesEnabled: false })`, matching the decision that Auth lifecycle routes belong to the isolated Authentication Issuer. This is correct isolation direction, but it does not cure the underlying SQL EXECUTE grants.

### Qualification disposition

This is a **critical pre-deployment security qualification finding**. The original Auth SQL grants are too broad for a shared runtime principal. Do not mark the Auth database privilege map complete, do not proceed to production deployment, and do not weaken the direct-call tests. Next task: inspect both runtime and Auth Issuer function allowlist implementations and the exact current migrations/PR history for any intended later grant correction, then prepare a narrowly scoped migration + adversarial disposable-PostgreSQL tests on the existing PR branch. Do not alter production ACLs.

The Auth recovery/issuer composition gap should be recorded separately from SQL authority: even after grants are corrected, the two recovery-delivery services need an explicit, reviewed composition decision.

No source code, SQL migration, test, manifest, PR state, branch ancestry, production DB/ACL, credential, secret, Render service/form/deployment, or paid resource was changed. Only this handover record was updated.


## 20 November 2026 — correction: Auth runtime grants are an intentional pre-cutover state; existing issuer cutover already implements the boundary

Re-read this handover, PR #298 live metadata, PRs #296/#297/#299, the runtime and issuer database privilege verifiers, the manual Authentication Issuer cutover/rollback SQL, the issuer cutover runbook, and its disposable qualification script. This corrects the previous section's characterization of the three Auth functions as an unaddressed critical defect.

### PR/branch state

- PR #298 is still open, draft and unmerged; live head at this review is `683dd413d065fdf5f0570f429fce777f01a2d4e0`; GitHub reports `mergeable=false`.
- PR #296 remains open/draft and carries a separate Business Identity column-level INSERT ACL migration; it is not an Auth cutover correction.
- PR #297 remains open/draft and is the earlier overlapping migration-batch implementation; its handover records exact disposable qualification and a validated November 14 logical restore. Do not repeat those tests or reinterpret its historical 105-row ledger as current production state.
- PR #299 is reported open/draft by current PR metadata despite a populated merge SHA. Do not infer merged state from the SHA; verify its timeline/base branch if it becomes relevant to a migration dependency.

### Existing intended Auth privilege transition (already implemented)

The previously flagged functions are indeed broad when directly executable by `ghm_runtime`, but their grants are explicitly the **pre-Authentication-Issuer-cutover** contract. The repository already contains the reviewed transition:

- `src/db/runtime-database-privileges.ts` defines the pre-campaign baseline and an explicit `authenticationIssuer` manual-cutover group. The pre-cutover baseline intentionally includes account/session lifecycle functions, including `auth_set_password`, `auth_create_session_with_refresh`, and `auth_issue_recovery`.
- `src/auth-issuer/database-privileges.ts` defines the exact ten-function `ghm_auth_issuer` allow-list and independently requires the post-cutover Resource API runtime auth allow-list to contain exactly two functions: external person identity lookup and external Business mapping lookup.
- `database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql` is the existing manual-only transition. It validates the restricted `ghm_migrator` -> `ghm_schema_owner` operator identity and the `ghm_auth_issuer` role attributes/membership; removes issuer direct relation/function grants; revokes the complete Auth lifecycle function set from `PUBLIC, ghm_runtime`; grants the exact issuer allow-list; and leaves QuoteFlow enrollment registration operator-only.
- `database/cutovers/20261112020000_authentication_issuer_privilege_rollback.sql` restores the documented pre-issuer runtime allow-list and removes issuer access. It deliberately does not restore unrelated migration/operator privileges revoked by prior migrations.
- The runbook explicitly says keep Resource API auth privileges in place while first qualifying the isolated issuer and client routes; only after issuer smoke tests, client routing and separate approval is the manual cutover applied. Thus the broad functions are not an overlooked final-state design; they are an intentionally retained compatibility state until the isolated issuer is qualified and ready for cutover.
- The issuer cutover qualification script checks that runtime is denied every issuer lifecycle function after cutover, verifies exactly two runtime identity lookups remain, tests normal registration/login/password rehash/refresh/logout/recovery reset/QuoteFlow reset through the issuer, and qualifies database-only rollback. It uses only local `ghm_disposable_test` URLs and fails closed for any other target.

### Existing qualification evidence (do not repeat)

The runbook records exact-head disposable PostgreSQL CI for:
- Migration and principal matrix, issuer and Actor Gateway cutover/lifecycle/runtime denial, full suite and DB-only rollback at run `43161326835`.
- Manual operator identity guard and cutover/rollback qualification at run `43178029417`.
- Complete function grantee adversarial tests at run `43179755317`.
- Pre-cutover 16-function runtime grant snapshot and rollback baseline at run `43181545588`.

These are historical exact-head disposable results, not current production ACL evidence and not a substitute for the user's newly confirmed current PR #298 CI #5397 pass. Do not rerun them without a new code change or a concrete failing signal.

### Corrected disposition

- Withdraw the previous claim that these three direct runtime grants constitute an unaddressed missing migration/remediation. The intended Auth Issuer cutover and rollback artifacts, runtime/issuer allow-lists, and disposable adversarial qualification already exist.
- Retain the security observation as a **known pre-cutover exposure boundary**: while the existing Resource API runtime remains the active authentication path, it necessarily retains the documented 16-function pre-cutover auth allow-list. The final two-function runtime allow-list applies only after the isolated issuer is qualified, client routing is moved, and the separately controlled manual cutover is performed.
- Do not create another migration, duplicate the manual cutover, alter the existing allow-lists, or change production grants.
- The missing recovery-delivery adapters are also not an accidental wiring omission: the runbook explicitly documents that both recovery request routes return 503 intentionally until an approved delivery adapter is configured. QuoteFlow migration-reset completion is wired and separately tested. Keep recovery delivery as a known go-live product capability gap, not a code defect to solve by introducing a provider during this qualification task.
- Continue the PR #298 migration dependency/route qualification. Auth issuer deployment remains sequenced after qualification as the owner already decided; no hosting decision is reopened here.

No source, migration, manual cutover, rollback, privilege allow-list, tests, production database/ACL, Render form/service/deployment, credentials/secrets, PR state, branch ancestry or payment state was changed. Only this handover correction was committed.


## 20 November 2026 — commercial evidence/approval gateway and terminal post-deployment revocation dependency trace

Re-read the latest migration-batches handover and hosting/credentials handover, then refreshed PR #296/#297/#298/#299 metadata, current branch/main refs, current PR file list, and Actions run #5397 before continuing. Do not repeat the earlier Auth Issuer or initial identity/capability source reviews.

### Current PR, branch and CI reconciliation

- PR #298 current head is `febedb0d92dbaa7ec0e2178af6f67d4c2ce3d91f`, open/draft/unmerged; GitHub currently reports `mergeable=false`. Current `main` is `ddb31ff59ab470973edf60a5078a75e5f962f803`. The branch is 220 commits ahead / 4 behind, merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- The four behind-main commits were isolated from the merge-base graph: `dc4cbd011ab75a8630e4ab8b111dd2c99c9969ef`, `f52ec0a9fa199ca3855aa39e911b732e0f520ef0`, `aa3842ddb67ec44f1e6fcdeb328cb2e77ddaade2`, and `ddb31ff59ab470973edf60a5078a75e5f962f803`. All four modify only `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md). Their substantive sections 37–40 have already been copied into the branch's corresponding hosting handover, as recorded in the prior reconciliation. This is documentation-content reconciliation only; it does not remove the four-commit ancestry divergence or change GitHub's non-mergeable state.
- User-dispatched CI #5397 is run ID `44647318812`, workflow_dispatch on branch `feat/actor-gateway-production-migration-batches`, exact tested SHA `b25a176ee38ec0e9a1871854421646d9defc2f09`. Both `quality` and `web-quality` succeeded. The quality job included build, Actor Gateway Worker bundle/smoke, all migrations on disposable PostgreSQL, isolated production plan-only fixture, commercial schema and workflow qualification, storage/provider dual-proof, Connect provisioning, migration audit, runtime boundary, and Auth Issuer cutover/lifecycle/rollback checks. Web build, tests, audit and security-sensitive toolchain verification also passed.
- Compare from tested SHA `b25a176...` to current PR head `febedb0...` shows ten commits changing only this migration-batches handover document. No application source, migration SQL, manifest, runner, tests, workflow or dependency files changed after #5397. Therefore #5397 remains the current code-validation evidence; do not dispatch/re-run solely for these documentation-only additions.
- PR #296 remains open/draft/non-mergeable and its migration `20261116200000_narrow_business_identity_runtime_insert.sql` is absent from PR #298's pending inventory. PR #297 remains the overlapping older batch-runner alternative, not an additional prerequisite. PR #299 remains a separate Project detail/update API PR; its metadata still reports open/draft with a populated merge SHA, so do not infer merge state from that SHA. No related PR was modified.

### Commercial evidence and founder-only approval chain

Inspected migrations `20261116150000` through `20261116190000`, the Actor Gateway readers/app/server, the Actor Gateway function allow-list, and the disposable commercial qualification scripts.

| Migration | Source-level contract | Qualification implication |
|---|---|---|
| `20261116150000_create_commercial_consent_evidence` | Creates immutable commercial document-version, status-event and consent-event evidence. UPDATE/DELETE/TRUNCATE are rejected. No runtime, gateway or PUBLIC table access is granted; migration authority alone receives maintenance access. | These tables are not directly writable by the API or gateway login. All application writes must use the later SECURITY DEFINER boundaries. |
| `20261116160000_add_commercial_document_approval_authority` | Adds immutable authority principal/scope and append-only grant/revoke history. No authority is seeded and no application role receives table access. Approval status rows must cite a grant event. | Technical system-admin status alone does not confer legal-document approval authority. |
| `20261116170000_add_founder_only_commercial_document_authority_gateway` | Adds a signed, one-use v2 Actor Gateway operation for founder-only grant/revoke. SQL resolves the canonical founder from the immutable bootstrap singleton and validates active system-admin/credential state; caller cannot supply a different approver. | Exact operation/context binding, founder bootstrap and nonce replay protection are prerequisites. Authority scope transitions are serialized. |
| `20261116180000_add_founder_only_commercial_document_approval_transition` | Adds a distinct signed approval operation. It locks the exact document version and authority scope, requires the latest authority event to be granted and the latest document state to be draft, then appends an approved status event citing the grant event. | Approval is a separate operation from granting authority; neither can be replayed as the other. Revocation and approval serialize on the same scope lock. |
| `20261116190000_add_commercial_consent_payment_prepare_gateway` | Adds signed Actor Gateway operation that validates active owner/administrator membership, current subscription/price, exact currently approved subscription-terms version, explicit acceptance and idempotency; atomically records pending payment attempt, consent evidence and commercial event. | This is preparation/evidence only: no provider/network call, checkout redirect, settlement or subscription activation occurs in SQL. Payment-provider activation remains outside this migration review and PayFast remains paused per owner instruction. |

The Actor Gateway server composes the authority, approval and consent/payment-preparation readers. The database privilege verifier's expected allow-list contains the six corresponding assertion/operation functions; runtime EXECUTE and PUBLIC EXECUTE are rejected. The disposable scripts qualify schema ownership/search_path/grants, founder denial, forged/replayed/expired assertions, exact document approval, explicit consent, idempotent retry, and pending-checkout-only state. CI #5397 ran the relevant schema and workflow qualification steps successfully.

The payment-preparation route is doubly fail-closed: both `GHM_COMMERCIAL_PAYMENT_PREPARATION_ENABLED` and `GHM_COMMERCIAL_LAUNCH_AUTHORIZED` must be true and the reader must exist. The browser cannot choose the provider or actor. No provider API or subscription activation is invoked by the inspected SQL. Do not turn this source review into PayFast activation work.

### Exact terminal post-deployment revocations and active route consumers

The two final pending revocation migrations in the PR #298 inventory are explicitly post-deployment cutovers and remain excluded from any pre-deployment production batch:

1. `20261117010000_revoke_runtime_business_registration_identity_write.sql` requires the signed Actor Gateway registration-identity replacement to exist, the dedicated gateway role and EXECUTE grant to exist, the gateway function to be SECURITY DEFINER/owned by `ghm_schema_owner`, and runtime EXECUTE to be absent on the gateway function. It then revokes the legacy caller-supplied account-ID `update_business_registration_identity` function from PUBLIC, runtime and gateway and checks no unexpected direct grantee remains. Its migration header explicitly requires deployed gateway, passing authenticated read/write E2E smoke tests and stable HTTPS URL before execution.
2. `20261117020000_revoke_runtime_capability_governance.sql` requires the signed assertion verifier and signed list/create/update/transition gateway functions, correct schema-owner/SECURITY DEFINER/search_path metadata, gateway EXECUTE and runtime denial. It then revokes the legacy capability draft create/update/transition functions from PUBLIC, runtime and gateway and verifies no unexpected direct grantee remains. Its header explicitly identifies this as a post-deployment cutover.

Cross-checked the active Resource API consumers:

- Business registration identity: `src/http/business-registration-identity-router.ts` uses the bearer token to call `HttpBusinessRegistrationIdentityGatewayClient` when configured. In production, `businessRegistrationIdentityGatewayRequired` is true; if the gateway client/URL is missing, the route returns 503 rather than falling back to the direct repository. The current repository still contains the legacy direct SQL implementation for the pre-cutover compatibility stage.
- Capability governance: `src/http/capability-catalogue-router.ts` routes admin list/create/update/transition through `CapabilityGovernanceGatewayClient`; when absent these admin routes return 503 and do not fall back to direct SQL mutation. The ordinary capability catalogue read path remains distinct and is not revoked by 20261117020000.
- Both HTTP clients currently use a 5,000 ms request timeout. The already-recorded Free Render cold-start/timeout behaviour remains a reliability qualification item; do not weaken auth or database fail-closed behaviour to hide it.

### Contiguous-prefix disposition

- The commercial document authority/approval migrations and consent/payment-preparation migration are gateway-owned capabilities and have explicit CI qualification. They do not authorize provider activation or seed/approve any actual legal document or authority by migration alone.
- The two 2026-11-17 legacy revocation migrations are terminal cutovers, not prerequisites to starting the service. They must remain outside the pre-deployment batch and be applied only after the corresponding deployed HTTP routes have passed authenticated end-to-end tests.
- The current PR #298 inventory/manifest distinction remains unchanged: pending inventory is a dated candidate list; manifest remains empty; no production plan or execution is authorized.
- PR #296's unmerged Business Identity ACL migration would insert a new pending version between the existing 20261112170000 and 20261116140000 tail. If it merges, regenerate the inventory from the exact repository and fresh authoritative production ledger; do not patch this branch's count or add that migration manually.

No source, SQL migration, test, batch manifest, production ledger, production database/role/ACL, credential/secret, Render service/form/configuration/deployment, payment state, PR state, or branch ancestry was changed. Only this handover record was updated.


## 20 November 2026 — commercial provider-code migration contract reviewed

Re-read the migration-batch handover and production reconciliation, refreshed PR #298 and branch/main state, and traced the next not-yet-described migration immediately preceding the commercial consent/approval chain: `20261116140000_generalize_commercial_payment_provider_code.sql`.

### Migration purpose and dependency

- Earlier migration `20261104120000_bind_commercial_payment_attempt_provider.sql` added nullable `commercial_payment_attempt.provider_code` with a check that allowed only `payfast`.
- That same migration's provider-result function already validates provider codes using the general lower-case identifier pattern `^[a-z][a-z0-9_]{1,49}$`, and provider events use the same generalized identifier contract.
- The November 16 migration drops only the restrictive payment-attempt provider-code check and replaces it with the same normalized identifier pattern used by provider events and the existing payment-result function.
- `src/resources/commercial/contracts.ts` models `CommercialProviderCode` as `string`, and `PostgresCommercialProviderBoundary` passes the provider code to the database result boundary without hardcoding PayFast. The migration therefore aligns the attempt-table constraint with the already-generalized provider-event/result API.
- This is a schema-constraint compatibility migration. It does not create a provider, provision credentials, make an HTTP request, start checkout, accept a callback, settle a payment, or activate a subscription.
- The migration is transaction-wrapped and narrowly changes one check constraint. No direct runtime or provider grants are changed by this migration.

### Sequencing and disposition

- It is the first entry in the current commercial migration tail, immediately before immutable consent evidence, document approval authority, founder-only authority/approval gateway operations and consent-bound payment preparation.
- The generalized provider-code schema is a prerequisite for a provider-neutral payment preparation design; it is not authorization to activate any provider.
- PayFast remains paused by owner instruction. This review does not qualify or resume PayFast.
- No separate migration-contract test file names this exact migration in the tree. The existing commercial workflow/provider tests and CI migration application cover adjacent contracts, but do not claim a dedicated isolated assertion for this one-line constraint change without a test result demonstrating it.
- No dependency or source conflict was found that requires changing the migration. Keep it in the repository's existing ordered pending inventory; do not split, renumber, edit or execute it.
- The production ledger remains inaccessible through the approved read path, and the pending inventory is still a dated candidate rather than a live exact queue. This review cannot prove whether this version is already applied in production or its exact live predecessor/successor position. The PR #298 execution manifest remains empty.

### Branch/PR state checked

At the start of this task, PR #298 was open/draft/unmerged, current branch head was `42687624ed73c34266ffbcb518228109a0a7dc0a`, and `main` was `ddb31ff59ab470973edf60a5078a75e5f962f803`. The branch remained 221 commits ahead / 4 behind with merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`; GitHub continued to report it non-mergeable. No branch ancestry or related PR was changed.

No source, SQL, test, inventory, manifest, production ledger/database/role/ACL, credential/secret, Render service/configuration/deployment, payment state, PR or branch ancestry was changed. Only this handover record was updated.


## 20 November 2026 — Commercial payment settlement privilege chain and provider-neutrality boundary

Re-read the existing migration-batch and production migration reconciliation handovers, refreshed PR #298 state, then traced the full Commercial payment schema/ACL sequence from `20260915150000` through `20261116140000`, including the PayFast settlement identity migration, source callback implementation, architecture decision record and rollout runbook. This follows the previous provider-code constraint review; no PayFast work was resumed.

### Base Commercial schema and incremental runtime grants

- `20260915150000_create_commercial_schema.sql` creates provider-neutral plans, versions, entitlements, prices, trials, subscriptions, payment attempts, provider events, payment transactions, commercial events and founding allocations.
- Its initial runtime permissions are deliberately read-oriented: SELECT on catalogue/trial/subscription and payment-attempt tables. It grants no runtime table DML on provider events, payment transactions or founding allocations. Migrator receives table DML and sequence access.
- `20260915203000_reconcile_commercial_runtime_sequence_acl.sql` removes unintended runtime sequence usage/default sequence grants for commercial identity sequences.
- `20260915223000_reconcile_commercial_trial_runtime_dml_acl.sql` grants only column-scoped INSERT for governed trial/subscription/event creation; no UPDATE/DELETE is added.
- `20261003160000_grant_commercial_payment_runtime_write.sql` adds only column-scoped INSERT on payment attempts and commercial events for payment preparation, plus sequence USAGE. It does not grant payment transaction/provider event mutation.
- The 20260915 payment transaction status migrations reconcile allowed lifecycle values; `20260915220000` adds unique provider-event-to-transaction idempotency. These are schema/consistency corrections, not additional runtime authority.

### Generic payment-result function and PayFast-specific isolation

- `20261007120000_create_commercial_payment_result_boundary.sql` creates `ghm.commercial_apply_payment_result(...)` as SECURITY DEFINER owned by `ghm_schema_owner`, revokes PUBLIC and grants EXECUTE to `ghm_runtime` as the initial application-governed settlement boundary.
- `20261104120000_bind_commercial_payment_attempt_provider.sql` adds nullable `provider_code`, initially constrained to NULL or `payfast`. It replaces the generic result function with a version that verifies the attempt's stored provider matches the submitted provider and requires the attempt to be payable before settlement. It retains the then-current runtime EXECUTE grant pending the immediately following identity cutover.
- `20261104130000_isolate_payfast_settlement_identity.sql` is the actual security cutover: it requires the out-of-band `ghm_payment_provider` LOGIN role, revokes generic settlement EXECUTE from PUBLIC and `ghm_runtime`, creates a PayFast-only attempt-read SECURITY DEFINER function, creates a PayFast-only settlement SECURITY DEFINER wrapper that fixes provider identity to `payfast` and requires ZAR, and grants those two functions only to `ghm_payment_provider`. The provider role receives no direct commercial table DML. Both functions are owned by `ghm_schema_owner` and use pinned search_path.
- The wrapper calls the generic settlement implementation internally under its owner. The generic function is not granted to the provider login or ordinary runtime. This is the intended privilege chain; do not misreport the earlier generic runtime grant as the final post-cutover contract.
- The callback source verifies the PayFast ITN signature, merchant, server confirmation, attempt/provider binding, amount/currency and accepted terminal status before invoking the PayFast-specific settlement function. Its separate process checks both `session_user` and `current_user` are `ghm_payment_provider`.
- The ADR and rollout runbook explicitly sequence the migration with the separate callback service, dedicated DB credential, readiness/identity checks, ingress/network verification and supervised settlement qualification. This is a controlled qualification/deployment sequence, not a reason to create an alternative general-API settlement path. Do not use the generic provider boundary class as evidence of a live production settlement route without tracing the active imports and process wiring.

### Provider-neutral schema does not mean arbitrary provider enablement

- `20261116140000_generalize_commercial_payment_provider_code.sql` aligns the payment-attempt constraint with the existing normalized provider identifier format.
- This permits the schema to represent provider codes beyond `payfast`; it does **not** provision a provider role, credentials, callback process, provider-specific wrapper, network ingress or settlement authorization for another provider.
- The inspected production-safe settlement design remains PayFast-specific: fixed provider wrapper, dedicated `ghm_payment_provider` role and isolated callback process. A future provider requires its own explicitly qualified identity/function boundary and deployment path; do not grant generic settlement execution to `ghm_runtime` or a shared provider role as a shortcut.
- The `provider_code` column remains nullable for historical attempts. Existing handover/runbook evidence says not to infer historical provider identity from status or checkout metadata. Any backfill requires a separately approved read-only inventory and defensible evidence; unknown attempts must not be silently assigned a provider.
- The owner has explicitly clarified that hosting is sequenced after qualification; do not describe the not-yet-deployed isolated gateway/callback services as an independently rejected product blocker or reopen hosting-cost decisions during this migration review. The technical prerequisites remain ordered qualification gates, not a change to the owner's deployment sequencing.

### Migration-prefix and qualification disposition

- The Commercial ACL evolution is intentionally incremental: initial read-only grants; sequence correction; column-scoped trial/payment preparation inserts; SECURITY DEFINER result boundary; provider binding; then provider-specific settlement identity cutover. Keep this historical order intact.
- CI #5397's disposable PostgreSQL migration/qualification success is evidence for the tested source SHA only. It does not prove production role existence, production ledger state, historical provider classification, production callback readiness or authorization to execute the production migration.
- The PR #298 manifest remains empty. The dated pending inventory cannot establish the live production predecessor/successor position. No production ledger access, backup, migration execution or ACL mutation was performed.
- The previous review's next target is now the earlier Commercial schema/ACL group. No new migration or source defect was established by this pass; the main remaining operational dependency in this chain is the already-documented controlled identity/callback qualification and historical nullable-provider reconciliation, not a missing generic settlement grant.

No source, SQL, tests, migration inventory, batch manifest, production database/ledger/roles/ACLs, provider role/credential, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. Only this handover record was updated.


## 20 November 2026 — early Commercial schema/index/status/ACL migration reconciliation

Re-read the migration-batches handover, production reconciliation, PR #298 metadata and current branch/main state. Continued the Commercial review backwards through every remaining 2026-09-15/16 Commercial schema reconciliation migration. Inspected the original schema grants, all eight follow-up SQL files, Commercial repository/service tests, and the migration runner's transaction boundary.

### Ordered migration contracts

| Version | Actual effect | Final-state interpretation |
|---|---|---|
| `20260915193000` | Replaces the payment-transaction status check with `pending,succeeded`. | Temporary narrowing; immediately superseded by the next status correction. |
| `20260915194500` | Adds Business+created-time payment-attempt and Business+occurred-time transaction indexes. | Adds the intended chronological Business access paths; retains existing indexes. |
| `20260915200000` | Replaces the status check with `pending,succeeded,failed`. | Restores the authoritative lifecycle required by the provider-result boundary; this is the final status constraint from this pair. |
| `20260915210000` | Adds Business+lifecycle subscription index. | Supports the documented subscription lookup path. |
| `20260915220000` | Adds a partial unique index on non-NULL `provider_event_id` in payment transactions. | One provider event can create at most one transaction; NULL remains available for non-provider-origin transactions and multiple distinct financial events per attempt remain possible. |
| `20260915223000` | Grants runtime only column-scoped INSERT on trial, subscription and commercial-event rows, plus required sequence USAGE. | Does not grant UPDATE/DELETE or access to provider events, payment transactions or founding allocations. |
| `20260916003000` | Temporarily grants runtime column-scoped SELECT on selected commercial-event evidence columns. | Superseded by the immediately following revocation; do not describe as final runtime access. |
| `20260916004500` | Revokes the exact column-scoped commercial-event SELECT grant. | Final state is no direct runtime SELECT on commercial_event; governed evidence is read through the schema-owner qualification path. |

### Important transaction-boundary finding

- `src/db/migrate.ts` begins one database transaction before migration ledger validation and iterates the selected migration list by executing normalized migration SQL, then commits once after the complete list.
- Therefore the temporary intermediate states in `20260915193000` (narrower status check before `20260915200000`) and `20260916003000` (event SELECT before `20260916004500`) are not committed/visible between individual files when run through the supported migration runner. A failure rolls the enclosing migration transaction back.
- Do not manually execute these SQL files one at a time outside the runner. The documented migration runner transaction is part of the safety contract.
- PR #298's batch selector chooses an exact contiguous pending prefix, but the runner still wraps the selected prefix in the same enclosing transaction. Batch boundaries do not make intermediate migration states externally visible.

### Original schema and effective ACL evolution

- The original `20260915150000_create_commercial_schema.sql` grants runtime SELECT on plan/version/entitlement/price/trial/subscription/payment-attempt tables and reference tables needed by governed operations. It deliberately grants no runtime table DML on provider events, payment transactions, commercial events or founding allocations.
- The original schema grants broad table DML and all-sequence access to `ghm_migrator`; this is a migration-authority grant, not application runtime authority. The production reconciliation handover separately records the observed legacy migrator ACL inventory and its controlled remediation plan. Do not conflate the two principals or add speculative revocations here.
- The subsequent Commercial changes progressively add only the exact runtime capability needed: column-scoped trial/subscription/event inserts; later payment-attempt/event inserts; then provider settlement is removed from runtime and isolated behind the dedicated provider principal.
- The temporary commercial-event read grant is explicitly undone. The final intended runtime contract is not direct commercial-event evidence access.
- The composite indexes and partial unique index are additive; they do not alter row ownership, grants or payment-provider activation.

### Existing application test coverage and gap assessment

- `src/resources/commercial/repository.test.ts` covers Business membership gating, entitlement fail-closed reads, trial activation as an atomic three-write transaction, rollback on event failure, payment-preparation membership/idempotency/provider binding, and atomic pending payment-attempt/event writes.
- `src/resources/commercial/service.test.ts` covers the service delegation/authorization contract.
- `src/resources/commercial/payfast-callback.test.ts` covers isolated provider attempt lookup, PayFast-specific settlement function use, provider mismatch and invalid callback statuses.
- No dedicated source-contract test file was found for these early 2026-09-15/16 SQL migrations. This is a test-granularity observation only; CI #5397's disposable PostgreSQL migration/qualification passed for its tested SHA. Do not claim an untested dedicated migration contract test exists, and do not add a duplicate test without identifying an uncovered invariant and an appropriate current test task.

### Corrections to prior handover wording

- The preceding assistant response accidentally repeated `20260915223000` several times in its illustrative table. That table was malformed and is superseded by the exact ordered migration table above.
- The Commercial migration order is `15193000 → 15194500 → 15200000 → 15210000 → 15220000 → 15223000 → 16003000 → 16004500`. The two temporary grants/status states must be understood together with their immediate corrective migrations.
- The migration source and transaction runner establish repository intent and disposable execution semantics; neither proves which of these versions are applied in production. The latest authoritative production ledger remains the 15 November supplied audit; the later approved connector read was denied SELECT on the migration ledger. Exact live pending prefix remains unverified.
- PR #298 remains open/draft/unmerged; its execution manifest remains empty. No production execution or manifest population is authorized by this review.

No source, migration SQL, tests, manifest, inventory, production ledger/database/roles/ACLs, credentials, Render configuration/deployment, payment state, PR state or branch ancestry was changed. Only this handover record was updated.



## 20 November 2026 — branch/PR recheck and earliest-prefix source confirmation

Re-read this migration-batches handover and the production migration reconciliation, hosting/credentials handover, migrator-authority remediation plan, role/service dependency map, runtime deployment findings, and the relevant PRs/branches before continuing. Refreshed PR #298, #296, #297 and #299 metadata, searched the repository branch list, compared the PR #298 branch with current `main`, and re-opened the first five ordered migration SQL files in the 50-entry candidate inventory.

### Current PR and branch state

- PR #298 remains open, draft and unmerged. Its exact current head is `1f100948f3d14c7698a22067b36c94813b4a8318`; `main` is `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- The compare result is `diverged`, 224 commits ahead / 4 behind, with merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`. GitHub reports `mergeable=false`. Do not rebase, merge, cherry-pick, or rewrite ancestry as part of this qualification pass.
- PR #298 has no submitted reviews or inline review threads at this check.
- PR #296 remains open/draft/unmerged at `5fa018304970c0e84c56b22111a7255b80fd7c60`. Its new migration `20261116200000_narrow_business_identity_runtime_insert.sql` is absent from PR #298's 50-entry candidate inventory. It must not be silently inserted or guessed into the current inventory. If PR #296 is merged, rebuild the repository migration list and reconcile the complete pending version/name set against a fresh authoritative production ledger export before revising the candidate inventory.
- PR #297 remains open/draft/unmerged at `304da520c5cfe1e77b479a97dfdd9d951fa6e245`. It is an overlapping alternative migration-runner/inventory implementation, with different configuration paths and runner code. Do not merge it alongside PR #298 or combine its implementation piecemeal; use PR #298 as the active qualification line unless the owner explicitly changes that decision.
- PR #299 remains open/draft/unmerged according to its current PR metadata. Its populated `merge_commit_sha` field is not by itself proof of a merge; do not treat it as merged or use it to change the migration inventory without confirming the PR state/base history.
- Branch search confirms the active PR #298 branch and the related feature branches remain present. No branch was created, deleted, switched, rebased, or merged.

### Earliest five migration source confirmation

Re-opened the exact SQL for the first five ordered entries and compared them with the existing full-queue static review in this handover. The existing classification remains accurate; this is confirmation, not a new migration audit:

1. `20261110010000_add_business_supplier_classification`: adds the descriptive supplier flag and a SECURITY DEFINER mutation that accepts a caller-supplied account ID. Its legacy runtime EXECUTE path is later revoked by the supplier cutover and replaced by signed assertion enforcement. The flag is not a capability or Trust assertion.
2. `20261110100000_create_account_onboarding_progress`: creates account/journey/step progress with uniqueness and lifecycle/time checks; runtime receives SELECT/INSERT/UPDATE and required identity-sequence access.
3. `20261110120000_create_business_relationship_outcome_read_models`: creates relationship/outcome reference and read-model structures with Business, Opportunity and Account Identity foreign keys; intended runtime access is read-only.
4. `20261110140000_allow_pending_storage_object_cleanup`: changes the storage lifecycle constraint and exposes a SECURITY DEFINER deletion-pending function to runtime. Its user/object authorization and provider-confirmed cleanup remain distinct; this migration is not an Actor Gateway identity cutover.
5. `20261110160000_add_admin_capability_catalogue_governance`: installs SECURITY DEFINER capability draft/lifecycle functions that accept a caller-supplied administrator account ID. Later gateway wrappers and signed assertion migrations establish the intended boundary; the early runtime function grant must be interpreted with those later cutovers.

The prior handover's full 50-entry static review and later route/cutover analysis already cover these dependencies. No new test or source change is justified by re-reading these same contracts.

### Hosting/deployment decision — preserve the owner's correction

The owner's current decision remains one dedicated Render Free Actor Gateway Web Service for initial free-directory/early access, using the already-filled but unsubmitted service form; later compute is an in-place upgrade of that same service. Deployment is intentionally sequenced after qualification. Do not describe the service as an unapproved paid-cost blocker, do not create a second service, and do not submit/deploy the existing form on the owner's behalf. Free sleep/cold-start and the existing client timeout are reliability constraints to qualify without weakening authentication or fail-closed behavior.

### Disposition

- The 50-entry inventory remains a dated candidate, not proof of the live production pending queue.
- The production execution manifest remains empty.
- The first safe production prefix is not selected. The existing migration dependency, route readiness, migrator authority, live-ledger and recovery evidence gates remain in force.
- CI #5397 remains the latest exact-branch source/qualification evidence for its tested code SHA; the later handover-only commits do not require another CI run.
- No production SQL, database/ledger/role/ACL, credential/secret, Render service/configuration/deployment, payment state, migration, inventory, manifest, PR state or branch ancestry was changed. Only this handover record was extended.


## 20 November 2026 — Business Identity INSERT ACL PR #296 cross-qualification

Before this task, re-read the current PR #298 migration handover and refreshed PR #298, #296, #297, #299 plus the live compare against `main`. Then inspected PR #296's exact patch, its migration, migration-contract test, Business Identity repository/service code and architecture grant contract. No source or ACL changes were made.

### Refreshed branch/PR state

- PR #298: open, draft, unmerged; head `1c83ebcff5080a2baddb42da098ce3f4e6500735`; compare to `main` is diverged, 225 ahead / 4 behind, GitHub `mergeable=false`.
- PR #296: open, draft, unmerged; head `5fa018304970c0e84c56b22111a7255b80fd7c60`; migration remains on its separate branch and is absent from PR #298's repository tree/inventory.
- PR #297: open, draft, unmerged; head `304da520c5cfe1e77b479a97dfdd9d951fa6e245`; remains an overlapping alternative batch-runner implementation, not a companion merge.
- PR #299: open, draft, unmerged; head `94a9d58894d11f0f886203af37cbd096619d447b`. Its metadata includes a populated `merge_commit_sha`, but `state=open` and `merged=false`; do not infer that it has merged. It adds authenticated Project detail/update HTTP endpoints, not a migration change.
- No branch ancestry or PR state was changed.

### PR #296 exact ACL contract — confirmed

The migration `20261116200000_narrow_business_identity_runtime_insert.sql` does exactly four operations:
1. Revoke table-level INSERT on `ghm.business` from `ghm_runtime`.
2. Grant INSERT only on `name, slug, verification_status, is_active`.
3. Revoke table-level INSERT on `ghm.business_membership` from `ghm_runtime`.
4. Grant INSERT only on `business_id, account_id, membership_role, membership_status, created_by`.

The current repository SQL uses exactly those columns, with fixed initial values `unverified/true` and `owner/active`; generated identity IDs and timestamp/default columns are omitted. The migration leaves SELECT, sequence, UPDATE and DELETE privileges unchanged. This matches the stated intent of the ACL change and does not accidentally broaden other privileges.

### New qualification gap — contract test is static, not an effective-ACL integration test

The PR #296 added test reads the migration and repository source and uses regular-expression assertions. It proves the SQL text and repository INSERT column lists agree. It does **not** execute the migration on PostgreSQL and does not prove effective ACL behavior for `ghm_runtime` (e.g. allowed inserts into the exact columns, denied inserts into omitted columns, denied table-level INSERT, and preservation of SELECT/sequence privileges).

This is not a defect in the migration text and not grounds to reject the design. It is a test-evidence boundary. Before production-prefix qualification, either existing disposable-PostgreSQL ACL qualification must explicitly cover these effective grants or a focused PostgreSQL migration qualification should be added to PR #296. Avoid duplicating it if an existing qualification script already covers the same catalog and attempted-insert cases; inspect the existing database qualification suite first.

### Security boundary that must not be overstated

The migration header explicitly says caller authorization remains in the Business Identity repository until a separately qualified actor-bound database operation exists. The column grants narrow *which fields* the shared runtime can insert; they do not bind `account_id` or `created_by` to the authenticated actor at the database boundary. A compromised/shared `ghm_runtime` connection with direct SQL access could still attempt an INSERT using another account ID, subject to foreign keys and other constraints. Therefore:
- Treat this PR as column-level least-privilege hardening / defense in depth.
- Do not describe it as closing the shared-runtime actor-impersonation boundary.
- The separate Actor Gateway / signed-assertion work remains responsible for actor-bound privileged writes.
- Do not convert this narrow ACL PR into a broad redesign or block the migration for an actor-bound feature it explicitly does not claim to implement.

### Inventory and disposition

- The migration file exists only on PR #296's branch, not PR #298's branch. It is absent from the current 50-entry candidate inventory.
- If PR #296 is merged, regenerate the entire migration inventory and reconcile all exact version/name/checksum/provenance rows against a fresh authoritative production ledger export; do not insert one entry manually.
- The current 50-entry inventory is dated candidate evidence, not the live production queue. The execution manifest remains empty.
- PR #296's earlier exact-head CI pass recorded in its handover applies to an earlier code SHA, not automatically to current head `5fa0183...`; current exact-head CI must be checked before calling its latest code green.
- No production SQL/ACL/role/database/ledger, migration inventory/manifest, credentials/secrets, Render service/configuration/deployment, payment state, PR status, branch ancestry or application source was changed. Only this handover was extended.


## 20 November 2026 — existing PostgreSQL qualification coverage checked for PR #296 ACL

Re-read this handover and refreshed PR #298 plus related PRs #296–#299 and the live branch comparison before examining the qualification scripts and test registration. No source, migration or ACL changes were made.

### Refreshed branch state

- PR #298 remains open/draft/unmerged at `1e5a347e73b5da5608ccdf525876821b9b6f4d18`; live comparison against `main` (`ddb31ff59ab470973edf60a5078a75e5f962f803`) is diverged, 226 ahead / 4 behind, `mergeable=false`.
- PR #296 remains open/draft/unmerged at `5fa018304970c0e84c56b22111a7255b80fd7c60`; its migration and test are still isolated on `hardening/business-identity-insert-column-acl`.
- PR #297 remains open/draft/unmerged at `304da520c5cfe1e77b479a97dfdd9d951fa6e245`; PR #299 remains open/draft/unmerged at `94a9d58894d11f0f886203af37cbd096619d447b`. The populated `merge_commit_sha` metadata for #299 is not proof of merge; GitHub reports `merged=false`.
- The live compare still shows four mainline-only changes: CI workflow, pending inventory, two governance/revocation-related SQL changes and associated documented files (see full compare list); no ancestry changes were made.

### Existing PostgreSQL coverage — what it proves and what it does not

Inspected the PR #298 `package.json`, `scripts/qualify-business-identity-runtime.mjs`, `scripts/qualify-actor-gateway-principal.mjs`, `src/db/runtime-database-privileges.test.ts`, and the production migration plan-only qualification script.

1. `qualify:business-identity-runtime` connects with separately asserted `ghm_runtime` and `ghm_migrator` identities and exercises the normal service/repository flow: profile reads, business and owner-membership creation, managed reads/updates, role rejection, multi-business preservation, duplicate-slug rollback and concurrent creation. This proves the application path under the configured database grants, but it does not directly attempt the prohibited column/table INSERTs under the runtime principal.
2. `qualify-actor-gateway-principal.mjs` verifies exact SECURITY DEFINER function EXECUTE allowlists for runtime and gateway, gateway relation/function privileges, principal identities, and extensive signed-assertion flows. It does not inspect the new table-level/column-level INSERT ACLs on `ghm.business` and `ghm.business_membership`.
3. `runtime-database-privileges.test.ts` tests SECURITY DEFINER function EXECUTE stages only; it is not a table-column ACL integration test.
4. `qualify-production-migration-plan-only.mjs` builds a disposable migration fixture and proves the plan-only runner does not mutate its ledger/catalog. It intentionally does not execute pending migrations, so it cannot prove the effective ACL created by PR #296's migration.
5. The PR #298 `npm test` command does not include PR #296's `business-identity-runtime-insert-acl-migration-contract.test.ts`; that file is on PR #296's branch only. The PR #296 test is static source/SQL matching, not PostgreSQL effective-privilege execution.

### Conclusion — focused PostgreSQL test is genuinely missing

No inspected existing qualification script currently proves the four required runtime ACL behaviors for migration `20261116200000`. This is a precise evidence gap, not a defect in the proposed SQL or a reason to duplicate the existing Business Identity service qualification.

A focused disposable-PostgreSQL test on PR #296 should:
- create an isolated schema/table fixture with the same relevant identity/default constraints and role grants, or apply the actual migration to a disposable schema/database fixture with the prerequisite Business tables;
- assert `has_table_privilege('ghm_runtime', ..., 'INSERT') = false` for both tables;
- assert `has_column_privilege` is true for exactly the permitted column sets and false for omitted columns;
- as `SET ROLE ghm_runtime`, prove the intended Business and owner-membership inserts succeed;
- prove an insert that supplies a prohibited column (e.g. `id` or `created_at`) fails with insufficient privilege, and that the same result holds for each table;
- verify SELECT and the existing identity-sequence usage/select privileges are preserved;
- use transaction rollback and a dedicated disposable database; never connect to production or mutate the production inventory/manifest.

Keep the existing static migration contract test as a cheap source-shape check. Add the effective ACL test as a separate PostgreSQL qualification, and wire it into the dedicated qualification workflow only when its disposable database setup is explicit. Do not silently add a production migration or change PR #298's candidate inventory for this PR #296-only migration.

### Disposition

The question from the prior task is resolved: existing qualification does not already cover the effective Business Identity column INSERT ACL. A focused PostgreSQL test is warranted on PR #296, but this assistant task only records the gap and test contract; it does not edit PR #296 or #298 source. The PR #298 inventory remains unchanged and its execution manifest remains empty. No production SQL, database, role/ACL, ledger, migration, manifest, credentials, secrets, Render service/configuration/deployment, payment state, PR status or branch ancestry was changed. Only this handover was extended.


## 20 November 2026 — critical mainline-only capability revocation delta

Re-read the handover, refreshed PR #298 and related PRs #296–#299, enumerated repository branches, and inspected the exact current-main versus PR-branch copies of the two November 17 post-deployment revocation migrations, capability qualification script, CI workflow and production pending inventory. This task corrects an inaccurate earlier handover statement: the four commits behind PR #298 are NOT documentation-only.

### Exact branch state at this check

- PR #298 is open/draft/unmerged at `ce59ee2bf1ac2740292b923b5207a5dc5664ba93`.
- Current `main` is `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Compare: diverged, 227 commits ahead / 4 behind; merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`; GitHub reports `mergeable=false`.
- PR #296 remains open/draft/unmerged at `5fa018304970c0e84c56b22111a7255b80fd7c60`; PR #297 remains open/draft/unmerged at `304da520c5cfe1e77b479a97dfdd9d951fa6e245`; PR #299 remains open/draft/unmerged at `94a9d58894d11f0f886203af37cbd096619d447b`. For #299, `state=open` and `merged=false` are authoritative even though a populated `merge_commit_sha` field is present.
- The earlier note saying all four mainline-only commits were handover documentation was incorrect. The compare shows mainline-only changes include CI workflow, production pending inventory, and a materially hardened capability revocation migration, alongside documentation and other files. Do not rely on the earlier docs-only characterization.

### Critical exact SQL delta: `20261117020000_revoke_runtime_capability_governance.sql`

The PR #298 branch version checks each signed gateway SECURITY DEFINER function using:
`p.proconfig @> ARRAY['search_path=pg_catalog, ghm']`.

Current `main` has a materially stronger/corrected check:
- Reads actual function owner with `pg_get_userbyid(p.proowner)`.
- Reads `prosecdef`.
- Reads full `proconfig` and parses the configured search_path via `pg_options_to_table`.
- Requires owner exactly `ghm_schema_owner`.
- Requires `SECURITY DEFINER = true`.
- Normalizes whitespace and requires exact `pg_catalog,ghm,pg_temp` ordering, with `pg_temp` last.
- Continues to require gateway EXECUTE and deny runtime EXECUTE.

The PR branch's old exact-array check is incompatible with the hardened `pg_catalog, ghm, pg_temp` setting and does not emit the useful owner/SECURITY DEFINER/search_path diagnostic. It is therefore stale relative to main and must not be treated as already reconciled. This is a concrete security-sensitive mainline delta, not documentation drift.

**Required disposition:** before PR #298 can be considered merge-ready, port/reconcile the mainline hardened validation into the PR branch migration without weakening it, then run the exact disposable PostgreSQL migration/Actor Gateway qualification against the resulting source. Preserve `pg_temp` as the final search_path item; do not remove it to satisfy the old check. Keep this revocation migration classified as a post-deployment cutover: it must not enter the pre-deployment production batch.

### Other exact comparison observations

- `20261117010000_revoke_runtime_business_registration_identity_write.sql` is byte-identical on main and PR #298 branch at SHA `a1ea36628177a2a3ba560612087295412ac9bad7`; no port is needed for that file.
- `scripts/qualify-capability-catalogue-governance.mjs` differs: main no longer imports/constructs the gateway reader in the portion inspected, while PR branch still does. Do not cherry-pick this independently without tracing the remainder and its corresponding qualification changes; record it as a separate source-level delta for the later exact-mainline reconciliation.
- Main's `config/pending-migrations.production.json` is a seven-entry historical allowlist. PR #298's `config/pending-migrations.production.json` is a 50-entry candidate pending inventory with a separate empty batch manifest. These files have different semantics and must not be copied over each other or conflated. The 50-entry candidate is still not an authoritative live queue; the dated production ledger evidence remains stale.
- PR #296's new Business Identity ACL migration remains on its own unmerged branch and is absent from the PR #298 inventory. If #296 is merged, rebuild the repository pending list and reconcile against a fresh authoritative production ledger export.
- PR #297 remains an alternative batch-runner implementation, not a companion merge. PR #299 is unrelated Project HTTP API work and remains open/unmerged.

### Actions

1. Treat the mainline hardened `20261117020000` check as a required reconciliation item on PR #298.
2. Inspect the full main-vs-branch capability qualification script diff before deciding whether it belongs in the same reconciliation.
3. Re-run exact disposable PostgreSQL and Actor Gateway qualification after any source reconciliation; do not infer that prior CI #5397 covers a source change.
4. Keep the two November 17 revocations out of the pre-deployment batch; they require the post-deployment gateway smoke tests stated in their SQL comments.
5. Keep the production batch manifest empty pending full prefix and live-ledger evidence.

No source, migration, CI workflow, inventory, manifest, production DB/ledger/ACL, role, secret, credential, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. Only this handover was extended.


## 20 November 2026 — complete capability governance qualification diff and cutover-path review

Re-read the migration handover and refreshed PR #298–#299 plus the live main comparison and related branch list before tracing the complete `scripts/qualify-capability-catalogue-governance.mjs` diff and the current migration, capability repository/service and gateway reader. This resolves the previously open question about the qualification script delta.

### Exact current branch state

- PR #298 remains open/draft/unmerged at `6ef23968a8085b671f2fa1f4bc372d566a9a4f9c`; current `main` is `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Compare remains diverged, 228 ahead / 4 behind; merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`; GitHub reports `mergeable=false`.
- PR #296 is open/draft/unmerged at `5fa018304970c0e84c56b22111a7255b80fd7c60`; PR #297 is open/draft/unmerged at `304da520c5cfe1e77b479a97dfdd9d951fa6e245`; PR #299 is open/draft/unmerged at `94a9d58894d11f0f886203af37cbd096619d447b`. #299's non-null `merge_commit_sha` remains misleading metadata; `merged=false` and `state=open` govern.
- PR #297's own body documents its different 48-entry inventory/105-row snapshot and successful disposable PostgreSQL qualification on its exact implementation SHA. That is historical evidence for #297's implementation and ledger snapshot, not authorization or a substitute for PR #298's current 50-entry inventory/live ledger refresh.

### Complete capability qualification script delta

The complete line-level comparison of `scripts/qualify-capability-catalogue-governance.mjs` shows the PR #298 branch has the gateway-correct post-cutover qualification path, while current `main` has regressed to the legacy runtime service path in several operations:

- PR #298 imports and constructs `PostgresCapabilityGovernanceReader(gatewayPool, assertionSecret)`; current main removed that import/construction.
- The branch uses `gatewayReader.createDraft/updateDraft/transition` for the post-cutover lifecycle operations; current main uses `CapabilityServiceImpl`/the runtime repository, whose methods call legacy `ghm.create_capability_draft`, `ghm.update_capability_draft`, and `ghm.transition_capability_lifecycle`.
- Current main's hardened post-deployment migration explicitly revokes those legacy functions from PUBLIC, runtime and gateway. Therefore the mainline qualification script's legacy runtime calls are not compatible with the post-cutover state and would fail if reached after that migration.
- PR #298 branch adds explicit gateway principal privilege assertions (legacy functions denied to gateway, all four signed gateway functions allowed) and strengthens runtime assertions so runtime cannot execute the legacy capability functions either. Current main's corresponding qualification only checks the runtime privilege result and omits the explicit gateway privilege assertion.
- The branch continues to test assertion payload substitution, invalid signature, replay, operation binding, role denial, CRUD lifecycle and direct-SQL invariants using the signed gateway reader. Preserve this post-cutover path.

**Important correction to the previous task's proposed direction:** do NOT port the mainline qualification script wholesale into PR #298. The gateway-reader removal on main is not a security improvement in this post-cutover qualification; it reintroduces calls to functions that the migration revokes. The PR branch's gateway-reader path is the compatible test design. The correct reconciliation is to retain that gateway path while porting only the independently valuable hardening from main (e.g. additional privilege assertions), after verifying every assertion against the post-cutover grants.

### Migration hardening still required

The current main copy of `20261117020000_revoke_runtime_capability_governance.sql` has the stronger metadata validation missing from PR #298:
- actual owner must be `ghm_schema_owner`;
- `prosecdef` must be true;
- parsed `search_path` must equal `pg_catalog,ghm,pg_temp`, with `pg_temp` last;
- gateway EXECUTE must be present and runtime EXECUTE absent.

The PR branch currently requires the older exact `proconfig @> ARRAY['search_path=pg_catalog, ghm']` and therefore does not match the deployed gateway function configuration. Port the mainline metadata-validation block into the PR branch migration without changing its remaining revoke behavior, then qualify it against the disposable PostgreSQL migration chain and exact function definitions. Do not remove `pg_temp` or weaken owner/SECURITY DEFINER validation.

### Separate migration/qualification boundaries

- `20261117020000` is post-deployment only. Its migration header requires Actor Gateway startup identity/ACL and authenticated list/create/update/transition end-to-end tests before execution. Do not include it in a pre-deployment migration batch.
- The branch's `qualify-capability-catalogue-governance.mjs` is a pre/post cutover broad governance test using the signed gateway path, but it does not by itself replace the dedicated `qualify-capability-governance-cutover-postgres.mjs`, which verifies legacy RPC denial and signed gateway operations after applying its manual cutover SQL to an explicitly guarded disposable local database. Both have distinct purposes; preserve both.
- The mainline dedicated cutover script explicitly restricts itself to `ghm_disposable_test` on `localhost`; retain that safety check.
- No CI result on PR #298's latest head has yet been inspected in this task. Do not claim the corrected migration or test path has passed CI.

### Disposition

1. Keep the PR #298 gateway-reader qualification path; do not copy main's legacy runtime service calls into it.
2. Reconcile the stronger mainline migration metadata guard into PR #298.
3. Add only missing, valid privilege assertions from main after checking them against the actual post-cutover role model.
4. Run the disposable PostgreSQL migration chain, capability governance qualification, and dedicated post-cutover qualification on the exact resulting source SHA; inspect exact-head CI.
5. Keep the two November 17 revocations out of the pre-deployment manifest. The manifest remains empty.

No source, SQL migration, test, CI workflow, production inventory/manifest, database/ledger/role/ACL, credential/secret, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. Only this handover was extended.


## 20 November 2026 — correction: capability migration hardening is already present on PR #298

The previous section incorrectly described the migration metadata guard as still needing to be ported from `main`. Re-fetched both exact branch copies and compared their complete contents. The actual current state is the reverse: PR #298 already contains the stronger guard; current `main` retains the older exact-array check. This correction is important and supersedes the earlier proposed action to port main into the PR.

### Refreshed PR/branch state

- PR #298: open, draft, unmerged; head `61e9f27abb557bf021553d104949195f14fc29ec`; current `main` `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Compare: diverged, 229 ahead / 4 behind; merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`; GitHub reports `mergeable=false`.
- PR #296 remains open/draft/unmerged at `5fa018304970c0e84c56b22111a7255b80fd7c60`; #297 remains open/draft/unmerged at `304da520c5cfe1e77b479a97dfdd9d951fa6e245`; #299 remains open/draft/unmerged at `94a9d58894d11f0f886203af37cbd096619d447b` (its `merged=false` state is authoritative).
- No PR or branch state was changed.

### Exact migration comparison

- PR #298 branch file: `database/migrations/20261117020000_revoke_runtime_capability_governance.sql`, blob `9083f813c999f6054b8066d12ffafd4f9a8e1a5e`, 5,536 characters.
- Current main file: same path, blob `84c61e9c2c06f53a86b7a63b26e9329a609c5741`, 4,847 characters.
- Files are not identical. PR #298 has the additional metadata query and explicit diagnostics.

PR #298's current guard:
1. Reads the actual owner with `pg_get_userbyid(p.proowner)`.
2. Reads `prosecdef`.
3. Retains `proconfig` for diagnostic output.
4. Parses the actual `search_path` setting with `pg_options_to_table`.
5. Normalizes whitespace and requires exactly `pg_catalog,ghm,pg_temp` (therefore `pg_temp` is last).
6. Requires the owner to be `ghm_schema_owner` and `SECURITY DEFINER=true`.
7. Independently requires gateway EXECUTE and denies runtime EXECUTE.

Current main instead requires `p.proconfig @> ARRAY['search_path=pg_catalog, ghm']`, which is incompatible with the required `pg_catalog, ghm, pg_temp` setting. The stronger PR #298 implementation is already present and must be preserved; do not overwrite it with main's weaker guard.

### Qualification path reconfirmed

- PR #298 `scripts/qualify-capability-catalogue-governance.mjs` is blob `a264506760250250b37fd9b95654ac0eedffd057`, 393 lines, imports/uses `PostgresCapabilityGovernanceReader`, and retains the signed gateway lifecycle path.
- PR #298 `scripts/qualify-capability-governance-cutover-postgres.mjs` is blob `9bae34844b04a1098fe5d0e2c40ca06b0bf75d51`, 200 lines. It requires distinct runtime/gateway/migrator URLs and hard-restricts the target to `ghm_disposable_test` on `localhost`; retain these safety guards.
- Current PR #298 CI workflow runs the full migration chain, the capability governance qualification, and the dedicated cutover qualification against a disposable PostgreSQL 18 service. The workflow's `workflow_dispatch` event is available, but no workflow was dispatched in this task and no new CI result is claimed.
- The CI workflow contains GitHub-hosted jobs and dependency installs. Although no new paid service is created by this work, do not dispatch additional runs unnecessarily or add any paid infrastructure, hosted worker, database, subscription, or monitoring. Wait for the user's explicit request before triggering a run if it could consume metered Actions minutes beyond the included allowance.

### Disposition

- The migration metadata guard and gateway-reader test path are already corrected on PR #298; no source edit is required for this item.
- The previous recommendation to port the mainline guard into PR #298 is withdrawn.
- The remaining work is to verify exact-head qualification evidence and reconcile the four mainline-only commits carefully, preserving PR #298's stronger migration guard and gateway path.
- The PR's production execution manifest remains empty. The two November 17 revocations remain post-deployment cutovers, not pre-deployment batch candidates.
- No source, migration, test, CI workflow, production inventory/manifest, database/ledger/role/ACL, credential/secret, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. Only this handover was extended.


## 20 November 2026 — exact four-commit mainline delta reconciled without paid work or history rewrite

Re-read this migration handover, refreshed PR #298–#299 and related PRs #296/#297, re-enumerated Actor Gateway branches, compared both directions between PR #298 and `main`, and inspected the four exact mainline-only commit diffs plus the corresponding hosting/credentials handover on both refs.

### Exact branch comparison

- PR #298 head before this documentation update: `cf4ea6b9d240a7a93081a2fe89163ba3698155eb`.
- Current `main`: `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Merge base: `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- PR #298 is 230 commits ahead and 4 behind; status `diverged`; GitHub says `mergeable=false`.
- Reverse comparison (`PR #298 branch...main`) confirms the four mainline-only commits touch exactly one path: `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md`. There are no mainline-only source, SQL migration, runner, test, package, CI workflow, production inventory or execution-manifest changes in those four commits.
- The 31-file compare in the opposite direction is the PR branch's overall delta against main; it must not be misread as the four behind commits' file list.

### Four exact mainline-only commits and content verification

1. `dc4cbd011ab75a8630e4ab8b111dd2c99c9969ef` — production DB connection checkpoint.
2. `f52ec0a9fa199ca3855aa39e911b732e0f520ef0` — Amanda / Render Support authority handover.
3. `aa3842ddb67ec44f1e6fcdeb328cb2e77ddaade2` — latest gateway connection and migrator evidence.
4. `ddb31ff59ab470973edf60a5078a75e5f962f803` — corrected staged Actor Gateway database URL status.

Fetched each exact commit diff and checked every nonblank added line against the PR #298 branch's current hosting/credentials handover. All 143 added nonblank lines are already present (0 missing across all four commits). Sections 37–40 are therefore content-reconciled in the PR branch even though the branch has not incorporated those four commit objects into its ancestry. The PR branch also retains additional November 18/19 context and the owner's later Free/one-service hosting clarification.

### Decision

- No rebase, merge, cherry-pick, force-push or ancestry rewrite is needed merely to recover the four behind commits' documentation; their content is already present.
- Do not repeat/copy those sections or create duplicate handover entries.
- The branch remains four commits behind in Git history and GitHub still reports it non-mergeable. Content reconciliation does not make the branch ancestry current-main-equivalent and does not clear the mergeability status.
- The earlier claim that mainline-only commits changed CI, migration inventory or the capability revocation SQL is withdrawn. Those are part of the PR branch's ahead-side delta, not the four behind commits.
- The PR branch's stronger capability migration metadata guard and signed gateway qualification path remain intact; no source reconciliation is needed for the four behind commits.
- User reported CI run #5397 passed. The connector's commit-run lookup does not expose workflow_dispatch runs, so this task does not independently assert its exact tested SHA. No additional Actions run was triggered.
- Cost boundary: no paid infrastructure, database, Render resource, service, subscription, tunnel, worker, schedule, monitoring or other recurring-cost dependency was created or proposed. No GitHub Actions run was started by this task.

### Current related PR status

- #298 remains open/draft/unmerged at `cf4ea6b9d240a7a93081a2fe89163ba3698155eb` before this handover-only commit.
- #296 remains open/draft/unmerged at `5fa018304970c0e84c56b22111a7255b80fd7c60`.
- #297 remains open/draft/unmerged at `304da520c5cfe1e77b479a97dfdd9d951fa6e245`.
- #299 remains open/draft/unmerged at `94a9d58894d11f0f886203af37cbd096619d447b`; its populated merge_commit_sha is not proof of merge (`merged=false`).
- No branch was created/deleted, and no PR state or code was changed.

No production database, migration ledger, role, membership, ACL, secret, credential, Render form/configuration/deployment, payment state, CI workflow, inventory or execution manifest was changed. Only this handover was extended.


## 20 November 2026 — migration runner, inventory, batch selector and plan-only safeguards reviewed

Re-read this handover, refreshed PR #298–#299 and related #296/#297, enumerated the Actor Gateway branches, and re-fetched the live PR #298 compare before reviewing the exact migration runner, batch selector, production inventory validator, unit tests, plan-only disposable qualification and package scripts. No paid CI run was triggered.

### Refreshed state

- PR #298 remains open/draft/unmerged; latest head before this handover-only commit: `d75ae513e2bcf19aa19f5b36181f10c07d852f06`.
- Current main: `ddb31ff59ab470973edf60a5078a75e5f962f803`; merge base: `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- Compare: 231 ahead / 4 behind, diverged; GitHub reports `mergeable=false`.
- Related PRs: #296 and #297 remain open/draft/unmerged; #299 remains open/draft/unmerged (latest PR info reports `mergeable=true`, but `merged=false`). Their independent implementation/qualification histories must not be conflated with #298.
- User reports PR #298 CI run #5397 passed. This review does not claim an independent rerun or re-verify its exact tested SHA. No workflow dispatch or other GitHub Actions run was started.

### Runner and batch selector — verified source properties

Inspected `src/db/migrate.ts`, `src/db/migration-batches.ts`, `src/db/production-pending-migration-allowlist.ts`, and their test files.

1. The production target is explicitly bound to the configured database name and host by `assertPostgresTargetConfiguration`. The production database `ghm_db` requires `DATABASE_SSL=true` with certificate verification; the only SSL-off exception is the test-only plan qualification on localhost with `NODE_ENV=test` and explicit `GHM_MIGRATION_PLAN_QUALIFICATION=true`.
2. Before `SET ROLE ghm_schema_owner`, the runner verifies the connected database, the exact `ghm_migrator` session/current identity, its non-login/non-superuser/NOINHERIT/least-privilege shape, no direct relation privileges, and its one explicit non-inheritable SET path to the NOLOGIN schema owner. It then checks the effective current/session identity after `SET ROLE`.
3. The runner locks the migration transaction, checks applied version/name identity, checks the production inventory against the entire live pending queue, detects out-of-order gaps, and verifies checksums for every applied repository migration before planning or execution.
4. Production execution requires a nonblank explicit batch ID. The batch selector validates unique strictly ordered migration identities, valid SHA-256 strings, unique valid batch IDs, nonempty purposes and nonempty batches; the selected batch must be the exact contiguous pending prefix and every selected checksum must match repository SQL.
5. The committed execution manifest remains `[]`. Consequently there is no selectable production batch and production execution remains fail-closed.
6. Plan-only is a distinct branch: it enumerates all pending migrations with SHA-256 values, does not invoke migration SQL, does not require a batch ID, and explicitly rolls back before returning. Normal production execution remains SSL-verified and batch-gated.

### Test registration and disposable plan qualification

- `package.json` normal `npm test` includes compiled `migration-batches.test.ts`, `migration-runner-plan-mode.test.ts`, `migration-checksum.test.ts`, `postgres-target-guard.test.ts`, and `migrator-principal.test.ts`.
- The batch tests cover missing/unknown IDs, exact prefix, skipped prefix, start after applied versions, duplicate versions/IDs, malformed identities/checksums, ordering, empty/invalid batch metadata, checksum mismatch, and exact production inventory behavior.
- The runner plan-mode tests cover all-pending plan selection without batch, no-SQL output and rollback, non-production target rejection, and checksum checking before output.
- The separate `qualify: migration-plan-only` CI step (actual npm script `qualify:migration-plan-only`) creates a local-only disposable `ghm_db`, seeds 95 repository migrations plus 10 retained historical ledger rows (105 total), executes the compiled runner as the restricted migrator, requires all 50 pending inventory entries and checksums in the output, verifies ledger row count and GHM relation-object count remain unchanged, then drops the disposable database.
- The script refuses production NODE_ENV and requires `GHM_QUALIFICATION_DATABASE_NAME=ghm_disposable_test`; it hardcodes localhost-only disposable URLs and deletes only its own local `ghm_db` fixture. It is not a production plan invocation and does not use Render or external infrastructure.
- The fixture's before/after no-change assertion compares ledger row count and GHM relation-object count, not a complete byte-for-byte snapshot of every row/catalog attribute. However, the runner's explicit plan branch does not execute migration SQL; this is a test-observability limitation, not evidence that plan mode mutates the DB. Keep the source-level no-execution assertions and existing disposable qualification; do not expand this into a costly or unnecessary hosted test.

### Inventory and manifest disposition

- The 50-entry production pending inventory is checked at runtime for exact equality with the entire pending repository queue (version, name and order), but remains a dated candidate derived from the 105-row production snapshot through 2026-11-09, not a fresh live ledger export.
- The separate production batch manifest is empty. Do not populate it until live ledger, retained-history provenance, migration dependency/route readiness and exact prefix review are complete.
- The two 2026-11-17 capability/business identity revocations remain post-deployment cutovers and are not eligible for the pre-deployment batch.
- No current production ledger evidence was refreshed during this task. No plan-only run was directed at Render or any remote host.

### Decision / next action

No defect in the reviewed batch selector, pending inventory validator or migration runner was established from source inspection. Do not add code merely to create activity. The substantive remaining gate is operational evidence: fresh read-only production ledger reconciliation, complete dependency/active-route prefix qualification, and the already-recorded Actor Gateway credential/ACL and deployment readiness. These should be pursued using existing local evidence and existing resources only. The Actor Gateway hosting work is a planned deployment/qualification sequence; do not characterize its current absence as a permanent blocker or an unapproved product direction. No additional paid service is authorized or required by this task.

No source, migration, runner, tests, package scripts, CI workflow, inventory/manifest, database/ledger/role/ACL, credentials/secrets, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. No Actions run was triggered. Only this handover was extended.


## 20 November 2026 — migration dependency continuation: active route cutovers and hosting-state correction

Re-read this migration handover and the hosting/credentials, production role/service dependency, legacy runtime authority, migrator remediation, deployment blocker and storage specialist handovers. Refreshed PR #298–#299 and related #296/#297, branch list and current main comparison before continuing the existing route-to-migration trace. Inspected the ordered early supplier/capability/principal migrations, signed assertion replacements, the previously recorded route matrix, and exact production role/service dependency evidence. No CI run or production operation was initiated.

### Refreshed PR state

- PR #298 remains open/draft/unmerged at head `e380dad63097b34daa33df4eebfd9863a42473e8` before this handover update; current `main` is `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Compare: diverged, 233 ahead / 4 behind; merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`; GitHub reports `mergeable=false`.
- PR #296 remains open/draft/unmerged at `5fa018304970c0e84c56b22111a7255b80fd7c60`; #297 remains open/draft/unmerged at `304da520c5cfe1e77b479a97dfdd9d951fa6e245`; #299 remains open/draft/unmerged at `94a9d58894d11f0f886203af37cbd096619d447b` (`merged=false`).
- No branch ancestry or PR state changed.

### Source/route dependency findings reconfirmed

1. The first inventory entries are not an isolated Gateway-only slice. Supplier classification and capability governance initially install SECURITY DEFINER functions that accept caller-supplied actor/account IDs and grant the legacy operations to `ghm_runtime`. These are transitional contracts, not a completed identity boundary.
2. The early Gateway principal guard and initial wrappers are also transitional. The signed HMAC assertion chain evolves through `20261111020000` (capability), `20261111030000` (supplier), `20261111040000` (Business profile), `20261111050000` (registration/self identity), and `20261111060000` (exact request-context binding). Do not treat any earlier login-only wrapper as production-ready.
3. The already documented Resource API route matrix maps Gateway-backed active routes and their clients. The source shows fail-closed 503/unavailable behavior rather than direct SQL fallback for the Gateway-required supplier/profile, registration, capability, storage and other operations. Route readiness still means deployed version, real Gateway endpoint, matching SQL signature/context, authenticated positive/negative E2E and availability behavior—not merely a source route or migration file.
4. The route/migration trace through the 50-entry queue has already classified the separate surfaces: Business Identity/read models, storage lifecycle/provider dual proof, Connect provisioning, Auth recovery and QuoteFlow migration-reset, public Business Hours/Trust Score/logo projections, campaign/directory review, and commercial document/consent/payment preparation. Do not reconstruct those inventories or rerun specialist PostgreSQL qualifications without a source change or specific failed evidence.
5. The final two 17-Nov revocation migrations remain terminal post-deployment cutovers and stay out of any pre-deployment batch. Their headers require the corresponding deployed Gateway and authenticated route E2E, exact signed function metadata/grants and stable endpoint.

### Production principal / deployment facts that constrain the prefix

The latest recorded 18-Nov production catalogue evidence says:
- `ghm_actor_gateway` exists as LOGIN/NOINHERIT with CONNECT, but schema `ghm` USAGE is false and Gateway assertion/API functions were absent in that snapshot. This evidence is dated and does not claim a current live re-query.
- `ghm_migrator` can authenticate and has a historically demonstrated read-only SET OWNER ledger-read route, but the stricter current runner preflight fails on the bootstrap `ghm_db_user` ADMIN OPTION memberships and explicit direct ACLs on 16 relations and 24 sequences. Do not repeat basic connectivity testing; the unresolved item is provider-authorized least-privilege remediation plus fresh ledger access under the exact runner contract.
- The deployed Resource API remains on the older `main` commit recorded in the runtime handover and does not yet enforce the merged `GHM_RUNTIME_DATABASE_URL` / `ghm_runtime` startup principal contract. Preserve the existing application/recovery path until a separately qualified runtime cutover.
- The production ledger export remains the dated 105-row snapshot through 2026-11-09. No exact current applied/pending prefix has been established. The ordinary Render SQL connector cannot read the ledger; use the already documented dedicated migrator/owner read-only route after its authority preflight is safely resolved.
- The last recorded recovery evidence is a locally restored November 14 logical export, not a fresh verified recovery point or Render PITR proof.

### Hosting handover correction — owner decision is Free, qualification sequence is deliberate

The 18-Nov role/service dependency map contained stale wording that the Gateway host was cost-blocked and a paid always-on service was not approved. That wording has now been corrected in the same branch (hosting handover section 2 / role map). The owner's 19-Nov decision is one dedicated Render Free Node Web Service for initial free-directory/early access, using the already-filled but unsubmitted form; the same service is upgraded in place later if justified. No second service is intended. Deployment is deliberately sequenced after DB identity, ACL, signed assertion, migration, route and cold-start qualification. This is not a permanent architecture/cost blocker and does not authorize submitting or deploying the form now.

The Resource API's five-second Gateway client timeout versus Free sleep/cold-start remains a real reliability qualification item. Preserve authentication, request-context signatures, database authorization and fail-closed behavior. Do not add a paid retry worker, proxy, monitoring service, second Gateway or other recurring-cost component. Prefer bounded in-process recovery or a clear user-retry/availability contract only after idempotency of each operation is established; never blindly retry non-idempotent mutations.

### Prefix disposition

- No first safe production prefix is selected. The source-level minimum assertion-complete boundary for early capability/supplier is at least through `20261111030000`, but this is **not** a proposed batch: the full active route set, production deployed version, Gateway endpoint, DB credential/ACL, assertion secret, migration ledger, recovery and migrator preflight must all be reconciled.
- Several route families deliberately retain legacy runtime grants pending their own cutover; others revoke runtime execution in the initial migration. The prefix must be derived as one contiguous queue, not by cherry-picking only Gateway functions or manually reordering migrations.
- The commercial/payment-preparation SQL is not PayFast activation; PayFast remains paused and outside this task.
- The 50-entry inventory remains a dated candidate and the production batch manifest remains `[]`.

### Documentation correction record

Updated `docs/security/PRODUCTION_ROLE_SERVICE_DEPENDENCY_MAP_2026-11-18.md` in commit `e380dad63097b34daa33df4eebfd9863a42473e8` to remove stale paid-hosting/cost-blocked language and record the owner's Free/one-service/in-place-upgrade decision, staged-but-unsubmitted form, separate Gateway identity, and qualification-before-deployment sequence. The database role/function status remains explicitly labelled as the last recorded catalogue snapshot, not fresh live evidence.

No source, SQL, migration, test, batch manifest, production inventory, database/ledger/role/ACL, credential/secret, Render form/service/configuration/deployment, payment state, PR state or branch ancestry was changed. No Actions run was triggered and no paid resource or recurring cost was added. Only the two existing handover documents were updated.


## 20 November 2026 — merged gateway foundation, timeout policy and outstanding route boundary cross-check

Re-read this handover, refreshed PR #298–#299 and related PRs #296/#297, enumerated Actor Gateway branches, compared #298 with main, and cross-checked the historical unified Gateway integration and the current route/timeout matrix. Also checked PR #298 review submissions and inline threads. No source or production changes were needed.

### Integration lineage confirmed

- Unified Actor Gateway foundation PR #272 is **merged** (head `81b0a90f762772ca745fbca122f9848968d4f234`). The earlier feature PRs #269–#271 and integration PR #273 are closed unmerged/superseded; do not restart or independently merge those stacks.
- PR #275 (Resource API runtime DB principal), #276 (Auth Issuer foundation), #277 (Worker body limits), #278 (trusted Render administrator membership), and #283 (commercial launch state read) are merged. Their work is already part of the repository history; use the current main/PR #298 branch and the existing handovers, not the old closed branches, as the active integration baseline.
- PR #298 remains open/draft/unmerged at `d5dc6b73936abb09d1af14be10c2b204c20ee77a`; current main is `ddb31ff59ab470973edf60a5078a75e5f962f803`; comparison remains 234 ahead / 4 behind, diverged, mergeable=false.
- Related #296 and #297 remain open/draft/unmerged. #299 remains open/draft/unmerged; its PR info currently reports mergeable=true but merged=false.
- PR #298 has no submitted reviews and no inline review threads at this check. This is not approval.
- User-reported CI #5397 pass remains recorded. The commit-workflow lookup only returns pull_request-triggered runs and therefore cannot independently resolve a manually dispatched run's exact SHA; no extra Actions run was started.

### Free cold-start timeout policy — no blanket retry

The existing route matrix already confirms 5,000 ms AbortController timeouts across the Gateway-backed client set (supplier classification, Business profile, capability mutation/governance, Trust Score, Business Logo, Storage metadata, Campaign/Directory Review, Business Hours, registration identity and related identity operations). The five-second assumption is therefore not limited to one or two clients.

Existing handover classification remains the safe policy:
- Read-only GET may be eligible for one narrowly classified transport/cold-start retry, only within a total deadline and never for authorization, validation or application responses.
- PUT is not automatically retryable until its exact replacement semantics, authorization, assertion nonce/replay behavior and end-to-end behavior are proven.
- POST/PATCH/DELETE must not be automatically replayed after ambiguous timeout without durable idempotency/deduplication.
- Business Hours PUT, Business Logo PUT, Trust Score POST calculation, registration/profile/supplier writes, storage lifecycle operations and commercial preparation require operation-specific treatment. A blanket retry middleware or global timeout increase would be unsafe.
- No retry implementation is approved or needed for this migration qualification task. The existing fail-closed 503 behavior remains intact. The early-access contract can instead communicate temporary unavailability/retry to the caller until operation-specific safe recovery is proven. No paid worker, proxy, keepalive schedule, monitor or extra service is warranted.

### Route readiness cross-check: outstanding legacy paths remain explicit

The existing route matrix also retains important exceptions that must not be erased by a generic “Gateway integration complete” statement:
- Business Capability `POST /api/v1/business-capabilities` remains a direct Resource API repository INSERT; the Gateway-backed PUT/PATCH paths do not cover this POST. The old runtime column-level INSERT grant is still required by that path. A signed create operation plus production route/fail-closed tests and a later separately reviewed ACL cutover are required before revoking it.
- Business Capability Evidence list reads remain direct Resource API SELECT paths; the current Gateway operations cover submit/review, not the two list queries. Do not revoke SELECT until tenant-scoped and admin queue read semantics have an approved replacement.
- Campaign list/get reads remain direct Resource API SQL while create/update use Gateway. Preserve the intentional read-side grants and membership checks until a Gateway read contract is implemented or the existing direct read is explicitly retained under a reviewed narrow grant.
- These are previously discovered, still-open route/ACL boundaries, not newly introduced defects and not permission to make broad privilege revocations. They remain part of the complete migration-prefix and active-route reconciliation.

### Disposition

- Do not add generic retries, alter client timeouts, or change fail-closed behavior merely to mask Free cold-start.
- Do not revoke the remaining Business Capability INSERT, Evidence SELECT or Campaign read privileges as part of the current Gateway governance revocation candidate.
- Keep the production batch manifest empty; do not select a prefix until exact production ledger, dependency order, deployed route versions, Gateway credential/ACL, signed assertion, migrator preflight and recovery evidence are current.
- No source, test, SQL, migration manifest, inventory, CI workflow, credential, database/role/ACL, Render form/service/deployment, PR state or branch ancestry changed. No Actions run was triggered and no paid resource or recurring cost was introduced. Only this handover was extended.


## 20 November 2026 — exact Resource API route and repository confirmation for retained legacy ACLs

Re-read this migration handover and refreshed PR #298, related PRs #296/#297/#299, Actor Gateway branches, PR review submissions/threads and the live main-versus-PR #298 comparison. Then inspected the exact current Resource API routers, repository SQL and application composition for Business Capability, Business Capability Evidence and Campaign. No source, SQL, test, manifest, deployment or production permission changes were needed.

### Refreshed GitHub state

- PR #298 remains open/draft/unmerged at `2cabe3daee0c431e65c06cd66afc9a610832dd4f`; GitHub reports 235 commits ahead / 4 behind `main`, diverged, `mergeable=false`. The compare reports 31 changed files.
- PR #296 remains open/draft/unmerged at `5fa018304970c0e84c56b22111a7255b80fd7c60`; PR #297 remains open/draft/unmerged at `304da520c5cfe1e77b479a97dfdd9d951fa6e245`; PR #299 remains open/draft/unmerged at `94a9d58894d11f0f886203af37cbd096619d447b` (GitHub reports mergeable=true, which is not equivalent to merged).
- Actor Gateway branch search still shows the existing integration/security branches; no branch was created, deleted, rebased or rewritten.
- PR #298 still has no submitted reviews or inline review threads in the refreshed review query. User-reported CI #5397 remains the latest accepted CI evidence; no run was triggered.

### Exact route-to-database findings

1. **Business Capability creation remains a direct runtime INSERT.**
   - `src/http/business-capability-router.ts`: `POST /api/v1/business-capabilities` calls `service.createBusinessCapability`.
   - `src/resources/business-capability/repository.ts`: `createBusinessCapability` uses `withTenantTransaction`, verifies active/selectable capability and owner/administrator membership, then directly INSERTs into `ghm.business_capability`, setting `created_by=context.userId`.
   - The same router's `PUT /api/v1/business-capabilities` is a separate replacement operation; when the Gateway client is configured or required it calls the signed Gateway `replace` operation, and required-but-missing Gateway returns 503. The PATCH verification route similarly uses the Gateway in the required path.
   - Consequence: the existing runtime INSERT privilege remains necessary for the POST route until a dedicated signed Gateway create operation replaces it and route/negative tests qualify that transition. Do not revoke this INSERT grant as part of the capability-governance revocation.

2. **Business Capability Evidence has two distinct direct read paths.**
   - `src/http/business-capability-evidence-router.ts`: `GET /api/v1/business-capability-evidence` branches by authenticated role. Administrators use `listForVerification`; business users must provide `businessId` and use `listForBusiness`.
   - `src/resources/business-capability-evidence/repository.ts`: both methods execute direct SELECTs joining evidence, business capability, business and capability. Business list is tenant-scoped through `withTenantTransaction`; administrator queue is a separate authorized transaction with a bounded limit.
   - Evidence POST submission and PATCH review use the capability mutation Gateway when configured/required; the read endpoint does not. The production app composition marks the capability mutation Gateway as required, but does not inject a Gateway read client for these two list operations.
   - Consequence: preserve the direct read privileges until a Gateway read contract implements both tenant-scoped business history and administrator verification-queue semantics, or until a separately reviewed narrow direct-read policy is explicitly retained.

3. **Campaign reads remain direct, membership-scoped SQL while writes are Gateway-backed in production.**
   - `src/http/campaign-router.ts`: `GET /api/v1/campaigns` and `GET /api/v1/campaigns/:campaignId` call list/detail service methods; the route requires registered read access.
   - `src/resources/campaign/repository.ts`: list first checks active membership with roles owner/administrator/member, then selects only that Business's campaigns. Detail SELECT includes the `READ_MEMBERSHIP` predicate.
   - The same repository sends create/update through `CampaignDirectoryReviewGatewayClient` when configured and throws when Gateway is required but unavailable. `src/http/app.ts` constructs this repository with `campaignDirectoryReviewGatewayRequired = config.isProduction || ...`, so production writes fail closed without the Gateway while reads intentionally remain direct.
   - Consequence: preserve the read-side grants and tenant predicates. Do not interpret Gateway-backed campaign writes as proof that campaign list/detail have moved behind the Gateway.

### Migration / ACL disposition

- The previous route matrix's three retained boundaries are confirmed by current source, not merely historical documentation.
- No broad runtime revocation is safe for these surfaces. The exact replacement work, if chosen later, must be separately scoped: signed capability create; two evidence read operations; campaign list/detail read contract or explicitly retained narrow read ACL.
- These are not newly introduced defects and do not require reopening already-qualified migration work. They are explicit constraints on any future ACL cutover.
- The November 17 capability-governance revocation must remain limited to its own legacy governance functions; it must not be used to revoke the unrelated Business Capability INSERT or Evidence/Campaign read privileges.
- PR #296's separate Business Identity column-level INSERT migration remains unmerged and absent from PR #298's candidate inventory; if it merges, rebuild the complete inventory and reconcile against a fresh authoritative production ledger rather than patching one row.

### Safety and cost

The production batch manifest remains `[]`. No first production prefix is selected. The live production ledger remains unrefreshed and the dated production role/ACL catalogue remains historical evidence, not a fresh current-state claim. No production SQL, role, grant, ledger, data, credential, secret, Render service/configuration/deployment, payment state, CI run, PR state or branch ancestry was changed. No paid resource, recurring process or additional cost was introduced. Only this existing handover was extended.


## 20 November 2026 — complete runtime SECURITY DEFINER allowlist and manual-cutover stage reconciliation

Re-read this handover, refreshed PRs #298/#296/#297/#299, compared PR #298 with `main`, checked existing Actor Gateway branches and PR #298 review submissions/threads, then inspected the exact runtime privilege inventory and tests. Followed the previous route-specific review by reconciling all eight manual runtime cutover groups against the allowlist model. No source change was necessary.

### Current GitHub state (refreshed)

- PR #298: open, draft, unmerged; current head `d9d9eee4b87eee13c4cfc14f99abb783bd64b873`; GitHub reports 236 commits ahead / 4 behind `main`, diverged, `mergeable=false`; 31 changed files.
- PR #296: open/draft/unmerged, head `5fa018304970c0e84c56b22111a7255b80fd7c60`, 9 commits / 4 changed files, mergeable=false.
- PR #297: open/draft/unmerged, head `304da520c5cfe1e77b479a97dfdd9d951fa6e245`, 119 commits / 28 changed files, mergeable=false.
- PR #299: open/draft/unmerged, head `94a9d58894d11f0f886203af37cbd096619d447b`, 26 commits / 8 changed files, mergeable=true (not merged).
- PR #298 has no submitted reviews or inline review threads in the refreshed query. Existing Actor Gateway branch search returned the previously documented integration/security branches; none were modified.
- The PR #298 compare's 31 files include the migration runner, production inventories, allowlist model/tests, qualification scripts, CI workflow and handovers. Do not treat this as a documentation-only branch.
- User-reported CI #5397 remains accepted evidence. No new Actions run was triggered.

### Exact runtime privilege-stage model

`src/db/runtime-database-privileges.ts` defines a 39-function SECURITY DEFINER EXECUTE baseline for the post-migration / pre-manual-cutover state. It defines eight disjoint manual cutover groups; the stage generator therefore recognizes `2^8 = 256` exact combinations. The test file confirms 256 combinations and rejects any unexpected added or missing EXECUTE privilege.

The eight separately modelled groups are:

1. `campaignReview`: create/update campaign and legacy directory-review presentation.
2. `authenticationIssuer`: fourteen Auth lifecycle/credential/session/recovery/QuoteFlow reset functions.
3. `registrationIdentity`: remaining legacy registration-identity read (the write is already migration-revoked).
4. `businessCapabilityMutations`: assertion replacement, evidence transition and verification transition functions.
5. `savedBusiness`: saved-business create/delete.
6. `businessHours`: business-hours replacement.
7. `trustScore`: legacy trust-score calculation.
8. `businessLogo`: legacy business-logo object mutation.

The exact signatures are maintained in the source constants and should not be reconstructed from memory or handover prose. The tests assert group disjointness, exact expected stage membership and rejection of grants outside the reviewed combinations.

### Fully cut-over runtime state

The model expects 13 SECURITY DEFINER functions to remain after all eight manual groups are revoked. The exact retained signatures are:

- `ghm.auth_lookup_business_external_mapping(text, text)`
- `ghm.auth_lookup_external_identity(text, text)`
- `ghm.connect_service_assertion_consume(text, text, timestamp with time zone)`
- `ghm.get_public_business_hours(bigint)`
- `ghm.get_public_trust_score(bigint)`
- `ghm.is_business_capability_publicly_evidence_eligible(bigint)`
- `ghm.list_public_trust_scores(text)`
- `ghm.storage_create_pending(bigint, text, bigint, text, text, text, bigint, text, text)`
- `ghm.storage_get_object(bigint, bigint)`
- `ghm.storage_get_public_business_logo(bigint)`
- `ghm.storage_mark_available(bigint, text)`
- `ghm.storage_mark_deleted(bigint)`
- `ghm.storage_mark_deletion_pending(bigint)`

This is an allowlist of SECURITY DEFINER function EXECUTE privileges, not a claim that all remaining direct table privileges or all production role memberships are reconciled. The code's SQL deliberately scopes the inventory to schema `ghm`, SECURITY DEFINER routines and `session_user` EXECUTE privilege.

### Cross-check with route findings

- The eight manual groups are distinct from the three retained direct Resource API route/ACL cases documented in the immediately preceding handover addition: Business Capability POST INSERT; Business Capability Evidence business/admin SELECT; Campaign list/detail SELECT.
- Do not infer those direct table grants from this SECURITY DEFINER function inventory. They are different privilege classes and need their own effective ACL checks.
- Campaign create/update and directory-review presentation legacy functions are explicitly removed by the campaign-review manual cutover group; current campaign list/detail direct SELECT remains a separate read path. Preserve the read grants/predicates.
- Capability governance's three legacy administration functions are already excluded from the 39-function baseline by the migration revocation; they are not part of the business-capability assertion/evidence/verification manual group. Do not conflate these operations.
- Registration identity write is already migration-revoked; its remaining read is a manual cutover item.
- The model contains a comment saying `2^9` combinations, but the implementation uses eight groups and the tests correctly assert 256 (`2^8`) combinations. This is a harmless source-comment typo, not a behavioral defect; no source edit was warranted.

### Disposition and safety

The model's 39-function baseline and 13-function fully cut-over endpoint are source/test contracts. They do not prove that production currently has either exact state. The production legacy-authority report and role/service dependency map remain historical, point-in-time evidence with an explicit no-mutation disposition; current live identity, full role membership, ACL, ledger and recovery evidence must be freshly qualified before any production cutover.

Keep all eight manual cutovers independently staged and do not bulk-revoke them. Do not revoke the separately retained Business Capability INSERT or Evidence/Campaign SELECT paths based on this function-only inventory. Production batch manifest remains `[]`; no batch is authorized.

No source, test, SQL, migration, manifest, CI workflow, branch, PR, credential, secret, production database/role/ACL/data, Render service/configuration/deployment, payment state or schedule was changed. No CI run was triggered. No paid resource or recurring cost was introduced. Only this existing handover was extended.


## 20 November 2026 — direct table/sequence ACL evidence boundary

Re-read this handover, refreshed PRs #296–#299, compared PR #298 with `main`, checked the existing Actor Gateway branch set, and inspected the exact runtime privilege source and tests. This task deliberately separates SECURITY DEFINER function EXECUTE privileges from direct table/sequence ACLs.

### Confirmed from source

- `src/db/runtime-database-privileges.ts` measures only functions in schema `ghm` where `pg_proc.prosecdef` is true and `has_function_privilege(session_user, oid, 'EXECUTE')` is true.
- Its allowlist is 39 pre-manual-cutover SECURITY DEFINER function signatures, eight disjoint manual cutover groups, 256 accepted stage combinations, and 13 functions in the fully cut-over endpoint.
- `src/db/runtime-database-privileges.test.ts` verifies those exact combinations and rejects missing/unexpected SECURITY DEFINER EXECUTE grants. It explicitly asserts that the query is limited to `p.prosecdef`, `has_function_privilege` and schema `ghm`.
- Neither the query nor this test file measures table ACLs, column ACLs, sequence ACLs, default privileges, schema CREATE/USAGE privileges, role memberships or inherited privileges.
- A targeted repository code search for table/sequence ACL inventory helpers and `has_table_privilege`/`has_sequence_privilege` found no matching dedicated inventory implementation in the searchable default-branch source. This is not proof that no other test or SQL script checks individual grants; inspect the exact qualification scripts and migrations before concluding absence globally.

### Required direct ACL reconciliation matrix

Keep the earlier source-confirmed direct route consumers as explicit rows in a separate table/sequence ACL matrix:

1. `ghm.business_capability`: runtime INSERT columns used by `POST /api/v1/business-capabilities`; current repository uses `withTenantTransaction` and writes `created_by=context.userId`. Must distinguish column-level from table-level INSERT and test omitted columns.
2. Capability Evidence tables: direct SELECTs for business-scoped history and administrator verification queue. Preserve tenant/admin authorization semantics and determine the exact underlying table/view grants.
3. Campaign tables: direct SELECT for list/detail, with active membership and Business predicates. Campaign writes are separately Gateway-backed/required in production.
4. Business Identity tables: PR #296's column-level INSERT proposal is separate, unmerged work; do not assume its ACL is active on main or PR #298.
5. Sequences: inspect identity/serial columns and effective `USAGE`/`SELECT` grants for each permitted direct INSERT; do not infer sequence rights from table INSERT or column grants.
6. Defaults and role inheritance: inspect `pg_default_acl`, schema privileges, role memberships/inherit options and `PUBLIC` grants, not just explicit grants to `ghm_runtime`.

### Disposition

- The current 39/13 function model is useful but is not a whole-runtime database privilege audit.
- Do not broaden its query and silently change the tested contract. A direct ACL inventory should be a separate, explicitly scoped qualification, preferably reusing existing disposable PostgreSQL infrastructure and roles.
- Before adding tests, search the remaining existing qualification scripts/migrations for catalog checks and inspect the current table/sequence grant definitions. Avoid duplicate work.
- The three direct Resource API route families previously confirmed remain constraints on any future table ACL revocation.
- No direct ACL is approved for revocation based on the function-only model.

### Current PR / branch state

PR #298 remains open/draft/unmerged; latest observed head before this handover-only update was `139175a76b30d2b86ca89c9032d82a74d6ebeb4e`, compare 237 ahead / 4 behind `main`, diverged, `mergeable=false`, 31 changed files. PRs #296/#297/#299 remain open/draft/unmerged. Existing Actor Gateway branches were inspected; none changed. No review or CI action was initiated.

### Safety and cost

Production batch manifest remains `[]`. No production SQL, role membership, grant, ACL, table, sequence, ledger, data, credential, secret, Render service/configuration/deployment, payment state, branch ancestry, PR state or CI run was changed. No paid resource or recurring process was introduced. Only this existing handover was extended.


## 20 November 2026 — migration grant definitions and historical live direct-ACL evidence

Re-read the migration handover and refreshed PRs #296–#299, current branch comparison and Actor Gateway branch set before inspecting grant definitions. Compared the actual PR #298 capability-governance revocation migration with the production legacy-role/ACL evidence reports. This review did not mutate any ACL or run production SQL.

### Migration source confirmation

- The PR #298 migration `20261117020000_revoke_runtime_capability_governance.sql` is narrowly scoped to three legacy SECURITY DEFINER functions: `create_capability_draft`, `update_capability_draft`, and `transition_capability_lifecycle`.
- Before revocation it requires the signed verifier plus Gateway list/create/update/transition functions, verifies owner `ghm_schema_owner`, `SECURITY DEFINER`, exact parsed `search_path=pg_catalog,ghm,pg_temp`, Gateway EXECUTE and runtime EXECUTE denial.
- It revokes only EXECUTE on those three legacy functions from PUBLIC, `ghm_runtime`, and `ghm_actor_gateway`, then checks no remaining runtime/Gateway/PUBLIC non-owner EXECUTE grant.
- This migration does not revoke Business Capability table INSERT, Capability Evidence table SELECT, Campaign table SELECT, any sequence privilege, schema privilege, default ACL or role membership. Do not attribute table-level effects to this function-only migration.
- Attempted direct fetches for the Business Identity and Registration Identity migration filenames as previously written in handover returned 404 on this branch; therefore their exact SQL grant definitions were not reasserted in this task. The PR #296 handover still documents its separate column-level Business Identity INSERT proposal, but it remains an unmerged PR.

### Historical production direct-ACL evidence — precise scope

The existing read-only production reports dated 18 November record a different, legacy public-schema permission picture:

- `ghm_app_user` can SET/INHERIT `ghm_db_user`; effective checks showed SELECT/INSERT/UPDATE/DELETE on five legacy `public` tables and public-schema USAGE/CREATE.
- `ghm_runtime` had no direct SELECT/INSERT/UPDATE/DELETE on those five legacy `public` tables, and no public-schema CREATE; public-schema USAGE was true.
- `ghm_migrator` likewise had no direct DML on those five legacy tables and no public-schema CREATE.
- `ghm_db_user` owned the five legacy public tables and their five sequences, the public schema, and associated indexes. The reports found no default ACL rows owned by either legacy role at that point in time.
- These observations concern only the five legacy `public` tables and their related objects. They do not establish current `ghm` schema ACLs for Business Capability, Evidence or Campaign tables, nor do they constitute a fresh 20 November production snapshot.

The reports also establish that the deployed Resource API source at the last inspected live commit used generic `DATABASE_URL` and did not assert `ghm_runtime` identity. The merged dedicated-runtime source contract had not yet been deployed in that historical snapshot. Thus, a historical absence of direct `ghm_runtime` grants on legacy `public` tables does not prove the live application was using that role.

### Direct ACL audit disposition

- No authoritative current effective ACL inventory for the specific `ghm` Business Capability, Evidence, Campaign, Business Identity tables and their sequences was retrieved in this task.
- Existing runtime function allowlist tests are not a substitute for that inventory.
- Existing historical public-schema checks cannot be extrapolated to `ghm` objects.
- Next qualification should use the existing approved disposable PostgreSQL harness and catalog queries for `information_schema.table_privileges`, `column_privileges`, `pg_class.relacl`, `pg_sequences`/sequence ACLs, `pg_default_acl`, `pg_namespace.nspacl`, role memberships, and effective `has_table_privilege`/`has_column_privilege`/`has_sequence_privilege` checks. First inspect existing harness coverage to avoid duplicate tests. Do not connect to or mutate production as part of that local qualification.
- The three route-confirmed direct Resource API paths remain active source constraints; their exact live `ghm` ACL status is still unproven by the dated production reports.

### Refreshed PR state

- PR #298 remains open/draft/unmerged, head `b81246f5aaa190a686e764986da5fe8e6d5fb933`, 238 commits ahead / 4 behind `main`, diverged, `mergeable=false`, 31 changed files.
- PRs #296, #297 and #299 remain open/draft/unmerged. Their current heads are respectively `5fa018304970c0e84c56b22111a7255b80fd7c60`, `304da520c5cfe1e77b479a97dfdd9d951fa6e245`, and `94a9d58894d11f0f886203af37cbd096619d447b`.
- Existing Actor Gateway branches were inspected; none changed. No PR review or CI action was initiated.

### Safety and cost

Production batch manifest remains `[]`. No production SQL, role, membership, table/column/sequence ACL, ledger, data, credential, secret, Render service/configuration/deployment, payment state, PR state, branch ancestry or CI run was changed. No paid resource or recurring cost was introduced. Only this existing handover was extended.


## 20 November 2026 — existing disposable PostgreSQL ACL qualification coverage inspected

Re-read this handover and refreshed PR #298 plus its main comparison and existing Actor Gateway branch set. Inspected the actual CI PostgreSQL role bootstrap and the qualification scripts that exercise direct table/sequence grants. This resolves part of the previous task: several exact direct ACL checks already exist, so a generic duplicate test is not justified.

### Existing effective table/sequence ACL coverage found

1. **Capability catalogue governance** — `scripts/qualify-capability-catalogue-governance.mjs`
   - Uses distinct runtime and Gateway pools.
   - Explicitly verifies `ghm_runtime` has no direct INSERT, UPDATE or DELETE on `ghm.capability`.
   - Verifies runtime cannot execute the legacy capability governance RPCs or Gateway wrappers, while `ghm_actor_gateway` can execute the intended signed Gateway wrappers.
   - This is a focused table/function ACL contract for the capability catalogue, not a global ACL inventory.

2. **Business Capability signed cutover** — `scripts/qualify-business-capability-gateway-cutover-postgres.mjs`
   - Restricted to `ghm_disposable_test` on localhost and requires three distinct runtime, Gateway and migrator connection strings.
   - Applies the manual cutover to disposable PostgreSQL.
   - Verifies runtime direct INSERT into `ghm.business_capability_evidence` is denied and direct `nextval('ghm.business_capability_evidence_id_seq')` is denied.
   - Verifies runtime cannot execute signed mutation wrappers, Gateway can perform signed mutations, and the post-cutover role privilege matrix is exact.
   - This proves a concrete table INSERT and associated sequence denial for that evidence table; it does not establish all sequence grants across the schema.

3. **Campaign/directory-review cutover** — `scripts/qualify-campaign-directory-review-gateway-postgres.mjs`
   - Verifies `ghm_runtime` retains `SELECT` on `ghm.campaign` after legacy campaign create/update/review EXECUTE is revoked.
   - Verifies Gateway wrapper EXECUTE grants and legacy runtime denials.
   - This confirms the previously identified intentional direct Campaign read.

4. **Actor Gateway principal** — `scripts/qualify-actor-gateway-principal.mjs`
   - Checks role flags and membership boundaries through `pg_roles` and `pg_auth_members`.
   - Verifies the Gateway role has no direct SELECT/UPDATE on account identity, SELECT on authentication sessions, or SELECT on password credentials.
   - This is a narrow Gateway isolation check, not a full runtime membership/effective-ACL report.

5. **Storage metadata cutover** — `scripts/qualify-storage-metadata-runtime-grant-revocation-postgres.mjs`
   - Captures exact function ACLs, applies revocation in disposable PostgreSQL, verifies effective denials, then restores the exact original ACL snapshot.
   - It concerns SECURITY DEFINER function grants, not general table/sequence ACLs.

6. **PostgreSQL catalog capture** — `scripts/capture-postgres-catalog.mjs`
   - Captures schema/table/column metadata, sequences, RLS policies, RLS flags, and `information_schema.role_table_grants`.
   - It is a metadata evidence snapshot, not a behavioral least-privilege qualification. It does not currently capture explicit column grants, sequence ACLs, default ACLs, schema ACLs, or effective role inheritance as a unified role-by-object matrix.

### Existing CI disposable role setup

`.github/workflows/ci.yml` creates a PostgreSQL 18 service named `ghm_disposable_test` and distinct login roles for `ghm_runtime`, `ghm_actor_gateway`, `ghm_auth_issuer`, `ghm_payment_provider`, `ghm_migrator`, plus `ghm_schema_owner` and the simulated dashboard admin. The migrations and focused qualification scripts run against this disposable service. No new service or CI run is needed to use the existing harness.

### Remaining exact gap — bounded, not global

Existing qualification already proves several critical direct table and sequence decisions. The remaining gap is a single effective catalog matrix for the relevant roles and objects, especially:
- Business Capability INSERT: the direct `POST /api/v1/business-capabilities` route remains source-backed, but the inspected test set does not yet show an exact effective allowed-column / prohibited-column matrix for `ghm.business_capability`.
- Evidence and Campaign reads: business/admin Evidence SELECT paths and Campaign SELECT are source-confirmed; only Campaign's runtime `SELECT` is explicitly asserted in the inspected Gateway cutover script. The Evidence list's exact effective SELECT grants and tenant/admin access contract are not represented by a unified role/object matrix in the inspected tests.
- Sequence privileges: one Evidence sequence denial is explicitly tested; all relevant sequence USAGE/SELECT/UPDATE privileges are not catalogued together.
- Column-level ACLs, `PUBLIC` and inherited/default ACL effects: no unified check was found in the inspected qualification scripts. PR #296's proposed Business Identity column-level INSERT test remains a separate, unmerged change.

Do not add a schema-wide test yet. First decide the exact expected role/object matrix for the live route consumers, then extend the existing disposable qualification harness only for uncovered cases. Keep route-level authorization tests separate from database privilege tests: a table SELECT grant alone does not prove tenant scoping or administrator authorization.

### Disposition

- The previous broad statement that no direct ACL qualification existed is superseded: targeted table and sequence ACL checks do exist and are documented above.
- The existing function-only 39/13 privilege model remains a separate contract.
- No source or test code changed. No duplicate test was added.
- Production batch manifest remains `[]`; no production ledger, ACL or role changes were made.

### Refreshed branch state

PR #298 remains open/draft/unmerged at `4ef69b53756a693047ff306477e10438a73b2ff5`; compare is 239 commits ahead / 4 behind `main`, diverged, `mergeable=false`, 31 changed files. Existing Actor Gateway branches were inspected and left untouched. User-reported CI #5397 remains the recorded CI evidence; no run was triggered.

### Safety and cost

No production SQL, role, membership, grant, table/column/sequence ACL, ledger, data, credential, secret, Render service/configuration/deployment, payment state, PR state, branch ancestry or CI run was changed. No paid resource or recurring process was introduced. Only this existing handover was extended.


## 20 November 2026 — route/ACL matrix refinement and correction of earlier route description

Re-read the handover and refreshed PR #298 plus branch comparison and Actor Gateway branch inventory. Inspected current branch source at the exact Business Capability router/repository, Evidence router/repository, manual Business Capability cutover SQL and its disposable qualification script. This pass found a material precision correction to an earlier handover statement; the correction is recorded explicitly below.

### Correction: Business Capability HTTP route is PUT, not POST

- The current router registers `PUT /api/v1/business-capabilities`, not `POST`.
- In the production-required Gateway path, the PUT route validates the request, requires a bearer token, returns 503 if the required Gateway client is absent, and calls `gatewayClient.replace(...)`. It does not call the direct repository INSERT.
- Only when Gateway is neither configured nor required does the route call `service.replaceBusinessCapabilities`, which invokes the legacy `ghm.replace_business_capability_assertions` wrapper.
- The repository method `createBusinessCapability` does contain a direct `INSERT INTO ghm.business_capability`, with explicit columns `business_id, capability_id, proficiency_level, description, effective_from, effective_until, source_reference, created_by`; it checks active/selectable catalogue state and owner/administrator membership within `withTenantTransaction`. However, the inspected current router does not register a POST route that calls this method.
- Therefore the earlier handover's assertion that an active `POST /api/v1/business-capabilities` route currently requires direct runtime INSERT is **not supported by the current router** and is withdrawn. The direct repository method remains source code, but its current route reachability must not be assumed. Do not use it to justify a production runtime INSERT grant without locating an actual registered caller and verifying application composition.

### Confirmed Evidence routes and SQL

- `GET /api/v1/business-capability-evidence` routes administrators to `listForVerification` and requires `businessId` for the business-scoped `listForBusiness` path.
- Both repository methods issue direct SELECTs joining `ghm.business_capability_evidence`, `ghm.business_capability`, `ghm.business` and `ghm.capability`. The business path uses `withTenantTransaction`; the verification queue uses `withAuthorizedTransaction`.
- The inspected manual cutover SQL revokes direct INSERT and column INSERT plus sequence USAGE/SELECT on `ghm.business_capability_evidence` from PUBLIC, `ghm_runtime` and `ghm_migrator`. It does not revoke SELECT on Evidence tables.
- The paired disposable qualification proves runtime Evidence INSERT and `nextval` are denied, and asserts `has_table_privilege('ghm_runtime','ghm.business_capability_evidence','INSERT') = false`. It does not yet assert the exact SELECT grants needed by both read paths.

### Refined direct ACL disposition

| Object / operation | Current source evidence | Qualification disposition |
|---|---|---|
| `ghm.business_capability` direct INSERT | Repository method exists; current router path to it not found in inspected router | Do not claim active runtime route need; trace all call sites and actual composition before preserving or revoking |
| `ghm.business_capability_evidence` INSERT | Manual cutover explicitly revokes table/column INSERT | Existing disposable test asserts runtime denial |
| Evidence sequence | Manual cutover revokes USAGE/SELECT | Existing disposable test asserts `nextval` denial |
| Evidence business/admin SELECT | Both HTTP branches use direct SELECT repository methods | Add/confirm exact runtime SELECT matrix; separately test route-level tenant/admin authorization |
| Campaign SELECT | Existing campaign cutover asserts runtime SELECT remains | Retain until route contract changes |

### Next bounded action

Search all call sites of `createBusinessCapability` and all production composition wiring to establish whether any registered route or background consumer reaches that direct INSERT. If no caller exists, document it as unreachable legacy repository code rather than inventing an ACL requirement. For Evidence SELECT, inspect migrations and existing route tests before proposing an ACL test. Do not broaden to schema-wide changes.

### Refreshed state and safety

PR #298 remains open/draft/unmerged at `7b13ece5ac420aae99b8971ff719089e41b563a3`, 240 commits ahead / 4 behind `main`, diverged, `mergeable=false`, 31 changed files. Existing Actor Gateway branches were inspected and left unchanged. No CI run was triggered.

Production batch manifest remains `[]`. No source, test, SQL, migration, ACL, role, production data, credential, secret, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. No paid resource or recurring process was introduced. Only this existing handover was extended.


## 20 November 2026 — correction: Business Capability POST is registered and bypasses mutation Gateway

This task re-read the handover, refreshed PR #298 and its compare against `main`, inspected existing Actor Gateway branches, then traced the complete Business Capability route, application composition, service and repository, plus route tests. This explicitly corrects the immediately preceding handover addition, which mistakenly stated that the POST route was not registered.

### Verified route and production composition

- `src/http/business-capability-router.ts` registers **both**:
  - `PUT /api/v1/business-capabilities`: assertion replacement; it uses the Gateway client when configured/required and returns 503 when Gateway is required but unavailable.
  - `POST /api/v1/business-capabilities`: new assertion creation; it calls `service.createBusinessCapability(context, input)` directly. This POST handler does not inspect `gatewayClient` or `gatewayRequired`.
- `src/http/app.ts` constructs `PostgresBusinessCapabilityRepository` and registers the router with `capabilityMutationGatewayClient` and `capabilityMutationGatewayRequired`; the latter is `config.isProduction || dependencies.capabilityMutationGatewayRequired === true`.
- Therefore production configuration marks the mutation Gateway as required for this router, but the POST create route ignores that requirement and still invokes the direct Resource API service/repository.
- `src/resources/business-capability/service.ts` forwards POST to `repository.createBusinessCapability`.
- `src/resources/business-capability/repository.ts` directly INSERTs into `ghm.business_capability` with columns `business_id, capability_id, proficiency_level, description, effective_from, effective_until, source_reference, created_by`; it checks active/selectable capability and owner/administrator membership inside `withTenantTransaction`.
- `src/http/business-capability-router.test.ts` contains POST input/context tests, but the inspected tests do not exercise POST with `gatewayRequired=true` or assert fail-closed behavior when the Gateway is missing. The existing PUT tests do test Gateway forwarding and fail-closed behavior.

### Security / ACL implication

- The earlier correction claiming no registered POST route and withdrawing the direct INSERT concern was incorrect; this entry supersedes it.
- There is a real production-mode Gateway bypass on the POST route. It does not prove the database INSERT is unauthorized: the repository performs authenticated tenant and owner/administrator checks. However, it means the route's create operation is not mediated by the signed Actor Gateway despite the production-required configuration.
- Do not revoke runtime INSERT on `ghm.business_capability` until the POST route is migrated to a signed Gateway create operation (or intentionally removed) and positive/negative route plus disposable PostgreSQL privilege tests pass.
- This is distinct from the Evidence table INSERT cutover. Do not confuse the two table names or infer that Evidence INSERT denial proves Business Capability INSERT denial.
- The exact POST handler currently performs a legacy direct INSERT; the exact PUT handler is Gateway-backed. Future cutover must cover both create and replacement semantics without losing the existing business owner/admin authorization, selectable catalogue check, input validation, audit attribution and tenant boundary.

### Required next implementation/qualification scope

1. Add a signed Actor Gateway create operation for Business Capability assertions, or explicitly deprecate/remove POST if product/API contract confirms it is unused. Do not assume removal is acceptable without route/consumer review.
2. Make POST use the same fail-closed Gateway-required semantics as PUT in production.
3. Add route tests for Gateway forwarding, missing Gateway => 503, no direct service call in required mode, and legacy behavior only when Gateway is not required.
4. Add disposable PostgreSQL tests proving runtime direct INSERT/column INSERT and sequence use are denied only after the Gateway create operation is qualified, and Gateway can perform the intended create with signed actor binding.
5. Reconcile exact underlying table sequence/identity behavior before selecting grants; do not infer sequence requirements from another table.
6. Re-run focused route, build, PostgreSQL qualification and exact-head CI on the final PR source after implementation. Keep production manifest empty until all release gates are separately approved.

No source or test code was changed in this task. This is a confirmed gap to address, not a claim that a fix has already been implemented.

### Refreshed PR / branch state

PR #298 remains open/draft/unmerged at `3bcb4762ee01d899bbc81cf6a0364ce9f8c80b3d`, 241 commits ahead / 4 behind `main`, diverged, `mergeable=false`, 31 changed files. Existing Actor Gateway branches were inspected and left unchanged. No CI run was triggered.

### Safety and cost

Production batch manifest remains `[]`. No production SQL, role, membership, grant, ACL, table, sequence, ledger, data, credential, secret, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. No paid resource or recurring process was introduced. Only this existing handover was extended.


## 20 November 2026 — existing capability Gateway contract reviewed for POST-create reuse

Re-read the current handover, refreshed PR #298 and its main comparison, and inspected the existing Actor Gateway branches. Traced the Resource API mutation client, Gateway route, Gateway mutation reader, contracts and both HTTP route contracts to decide whether the existing signed replacement operation can safely serve POST-create.

### Existing signed operation

- The existing Resource API client `HttpCapabilityMutationGatewayClient.replace` sends the verified bearer token to `PUT /v1/businesses/:businessId/capabilities`.
- The Gateway route authenticates the actor upstream, validates `businessId` and an `assertions[]` payload, then calls `GatewayCapabilityMutationReader.replace(actor,businessId,assertions)`.
- `PostgresGatewayCapabilityMutationReader.replace` creates a signed actor assertion for operation `business.capability.replace` and calls `ghm.gateway_replace_business_capability_assertions(...)`.
- This is a complete signed Gateway path for the bulk replace operation, not a separately exposed single-create operation.
- The same mutation reader exposes signed operations for verification, evidence review and evidence submission. No separate `business.capability.create` operation is present in its operation union or reader interface.

### Why direct reuse is not yet proven safe

The legacy POST contract accepts a single `CreateBusinessCapabilityInput`:
`businessId, capabilityId, proficiencyLevel, description, effectiveFrom, effectiveUntil, sourceReference`.

The existing PUT replacement contract accepts a whole array of `ReplaceBusinessCapabilityAssertionInput`:
`capabilityId, proficiencyLevel, description, sourceReference, effectiveUntil`.
It does not accept `effectiveFrom`; its semantics are replace-all for a business, not append-one. Blindly adapting POST to PUT with a one-element array could remove other assertions and would not preserve the POST effectiveFrom behavior. Therefore do not route POST through `replace` by wrapping one item.

### Confirmed route contract gap

- The PUT route checks `gatewayClient || gatewayRequired`, validates the bearer token, fails with 503 when required Gateway client is absent, and maps Gateway failures fail-closed.
- The POST route still calls `service.createBusinessCapability(context,input)` directly and does not inspect the Gateway client or required flag.
- The POST route tests cover server-owned field rejection, canonical input and authenticated context, but the inspected tests do not cover Gateway-required mode, missing Gateway client, or signed Gateway forwarding.
- The application composition supplies `capabilityMutationGatewayRequired = config.isProduction || dependencies.capabilityMutationGatewayRequired === true`; the POST route currently ignores it.

### Decision

Do not reuse the existing bulk-replace endpoint for single-create. The safe options are:
1. Add a distinct signed `business.capability.create` operation end-to-end (client, Gateway route, mutation-reader interface, signed assertion operation, SQL function/migration, role grants, tests); or
2. Confirm the POST API is not a supported product contract and retire it deliberately with route/consumer compatibility evidence.

Option 1 preserves the current POST semantics and is the least disruptive route, but it is a new capability operation and needs a complete signed SQL path. Do not add a direct INSERT grant or revoke an existing one as a shortcut. No source implementation was made in this review.

### Next implementation scope

Inspect the existing `gateway_replace_business_capability_assertions` SQL and migration history to reuse its assertion verification, actor/business authorization, catalogue checks, audit and replay protections without duplicating or weakening them. Then design a narrowly scoped `gateway_create_business_capability_assertion` operation that preserves `effectiveFrom`, only appends one assertion, and cannot overwrite/remove sibling assertions. Add its explicit operation identity to the signed assertion contract and migration ACL checks. Afterward update POST to call it in Gateway-required mode and add fail-closed route plus disposable PostgreSQL tests. Do not proceed to production ACL revocation until those tests pass.

### Refreshed state and safety

PR #298 remains open/draft/unmerged at `679e8b10d462d2364e04114fedc0cc1dd08c8673`, 242 commits ahead / 4 behind `main`, diverged, `mergeable=false`, 31 changed files. Existing Actor Gateway branches were inspected and left unchanged. No CI run was triggered.

Production migration batch manifest remains `[]`. No source, test, SQL, migration, ACL, role, production data, credential, secret, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. No paid resource or recurring process was introduced. Only this existing handover was extended.


## 20 November 2026 — signed create SQL contract inspection; latent operation allowlist found

Re-read the migration handover, refreshed PR #298 and its main comparison, and checked the existing Actor Gateway branch set. Inspected the complete signed mutation migration, signed assertion verifier, replacement function, Business Capability table/grants, Resource API mutation client and Gateway mutation reader. This task narrows the next implementation design.

### Critical finding: verifier already allowlists `capability.create`

Migration `20261111070000_add_signed_business_capability_mutations.sql` updates `ghm.assert_actor_gateway_capability` and its operation allowlist already includes `'capability.create'`. However:
- the same migration defines signed `business.capability.replace`, `business.capability.verify`, `business.capability.evidence.review` and `business.capability.evidence.submit` SQL entry points;
- it does not define a `gateway_create_business_capability_assertion` SQL function;
- `GatewayCapabilityMutationReader`'s operation union contains only replace/verify/evidence review/evidence submit;
- its `PostgresGatewayCapabilityMutationReader` has no `create` method;
- the HTTP Gateway app exposes PUT bulk replacement, not a single-assertion create route;
- Resource API `HttpCapabilityMutationGatewayClient` exposes replace/verify/evidence methods, no create method.

Therefore `capability.create` is a latent allowlisted operation, not an implemented signed create flow. Do not treat its presence in the verifier as proof that creation is already Gateway-backed. It may be retained for compatibility/history; inspect commit/migration history before relying on intent.

### Existing signed assertion protections reusable

The current v2 verifier in migration `20261111070000...`:
- requires `session_user='ghm_actor_gateway'`;
- accepts only positive actor ID, operation, issued timestamp, UUID nonce, bounded context (max 32 KiB), and a lowercase 64-hex HMAC;
- limits assertion age to 60 seconds;
- reads the 32-byte verifier secret from a protected table;
- signs the canonical payload `ghm-actor-gateway:v2|actor|operation|issued|nonce|hex(UTF8(context))`;
- compares all 32 HMAC bytes before branching;
- requires an active `ghm.account_identity`;
- records nonce in the protected replay table and rejects duplicate nonce.

The replacement SQL wrapper validates that signed context exactly equals JSON `{businessId,assertions}`, verifies operation `business.capability.replace`, then delegates to `ghm.replace_business_capability_assertions`. The delegated replacement function serializes by locking the active business row, checks active owner/administrator membership, limits payload to 50, rejects unknown keys/duplicates, validates active/selectable catalogue entries, updates/removes the existing active assertion set, and inserts/upserts assertions. This is intentionally replace-all semantics and cannot safely implement POST create.

### Existing create data contract and direct grant

- Legacy POST accepts `businessId, capabilityId, proficiencyLevel, description, effectiveFrom, effectiveUntil, sourceReference`.
- `ghm.business_capability` has an identity-generated `id`; the existing runtime INSERT grant is column-limited and includes `business_id, capability_id, proficiency_level, description, assertion_status, assertion_basis, verification_status, effective_from, effective_until, source_reference, submitted_at, created_by`. It does not grant arbitrary table INSERT/UPDATE/DELETE.
- The signed mutation migration's assertion verifier already has the `capability.create` operation name available, but no corresponding Gateway SQL function is defined.
- The correct create function should be an append-only one-row operation: lock/check the active business tenant; require active owner/administrator membership for signed actor; validate active/selectable capability and input bounds; insert one row with server-owned status/basis/verification/audit fields; preserve caller-supplied `effectiveFrom` rather than replacing it with clock time; return inserted row; do not withdraw/upsert/delete any sibling assertions.
- Need verify whether unique constraint `(business_id, capability_id)` prevents multiple historical rows and how re-adding a withdrawn assertion is meant to behave before finalizing SQL. This affects append-only semantics and conflict handling.
- Keep sequence behavior explicit: the identity sequence is accessed inside the SECURITY DEFINER function under schema-owner ownership, so Resource API runtime should not need direct sequence privileges after cutover. Confirm in disposable PostgreSQL after implementing.

### Recommended implementation shape

Add a distinct `ghm.gateway_create_business_capability_assertion` SECURITY DEFINER SQL wrapper with exact signed context `{businessId,capabilityId,proficiencyLevel,description,effectiveFrom,effectiveUntil,sourceReference}`, call `assert_actor_gateway_capability(actor,'capability.create',...)`, then delegate to a narrowly scoped append/create SQL function that enforces owner/admin and selectable catalogue rules. Give EXECUTE only to `ghm_actor_gateway`, revoke from PUBLIC/runtime/migrator. Add the corresponding Gateway reader method, operation union entry, HTTP POST route and Resource API client method; change Resource API POST to use it whenever Gateway is required, fail closed if missing, and preserve legacy fallback only outside production-required mode. Keep API response shape and validation compatibility.

Before implementing, inspect table uniqueness/history constraints and the existing create function's full behavior, then add positive/negative disposable PostgreSQL qualification (valid actor, unauthorized member, inactive/non-selectable capability, duplicate/current-vs-withdrawn assertion, forged signature, replay, wrong context, runtime direct INSERT denial, and no sibling assertion deletion). Add HTTP route tests for Gateway forwarding and required-but-missing 503. Do not run production SQL or change grants until this full path passes.

### Disposition and branch state

No source implementation was made in this task. The verifier's existing `capability.create` allowlist is reusable, but the end-to-end create capability does not yet exist. PR #298 remains open/draft/unmerged at `f4957a56c1c533fc814cdf561bc004090c19b413`, 243 commits ahead / 4 behind `main`, diverged, `mergeable=false`, 31 changed files. Existing Actor Gateway branches were inspected and left unchanged. No CI run was triggered.

Production migration batch manifest remains `[]`. No production SQL, role, grant, ACL, table, sequence, ledger, data, credential, secret, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. No paid resource or recurring process was introduced. Only this existing handover was extended.


## 20 November 2026 — Business Capability uniqueness and historical-row semantics resolved

Re-read the handover, refreshed PR #298 and branch comparison, and inspected the existing migration history and current repository implementation. This resolves the outstanding question about uniqueness and withdrawn rows before designing the signed create function.

### Database uniqueness is unconditional

- `ghm.business_capability` has primary key identity `id` and an unconditional unique constraint `business_capability_unique UNIQUE (business_id, capability_id)`.
- The uniqueness constraint is not partial on `assertion_status`; withdrawn rows continue to occupy the business/capability pair.
- The table supports only `assertion_status IN ('active','withdrawn')`; there is no partial unique index or separate assertion-history relation.
- The legacy `createBusinessCapability` repository method performs a plain INSERT and has no ON CONFLICT handling. A second create for the same business/capability pair, including after withdrawal, fails with PostgreSQL unique violation. This is the existing behavior to preserve unless a separate product/data-model decision explicitly changes it.

### Replacement semantics are intentionally different

- `ghm.replace_business_capability_assertions` serializes on the business row, validates owner/administrator membership and selectable capabilities, withdraws active assertions omitted from the replacement set, then inserts/upserts each requested business/capability pair.
- The conflict handler reactivates an existing withdrawn row in place; it does not append a second historical row. It preserves verification state only when relevant assertion fields remain unchanged; otherwise resets verification to unverified.
- The November 9 correction also serializes concurrent replacements and considers `effective_until` when deciding whether verification remains valid.
- This bulk replacement contract must not be copied into single-create. Single-create must remain one INSERT and must not update/reactivate the unique existing row, since that would silently change legacy POST behavior.

### Signed create SQL design now bounded

Implement `ghm.gateway_create_business_capability_assertion` as a SECURITY DEFINER wrapper with:
- exact JSON signed context containing all create fields and canonical date serialization;
- verifier operation `business.capability.create`;
- active business row lock and active owner/administrator membership validation for the signed actor;
- active/selectable catalogue check;
- one plain INSERT using the existing legacy columns and server defaults for status/basis/verification/submitted timestamp;
- caller-provided `effectiveFrom` preserved, defaulting to `now()` exactly as the repository currently does;
- no ON CONFLICT clause, no UPDATE/DELETE, no withdrawal/reactivation, and no sibling assertion mutation;
- schema-owner ownership, exact `search_path=pg_catalog,ghm`, EXECUTE for `ghm_actor_gateway` only, and revocation from PUBLIC/runtime/migrator.

The existing identity sequence is consumed inside the SECURITY DEFINER function as schema owner. Once route cutover is complete, Resource API runtime no longer needs direct INSERT or sequence USAGE on `ghm.business_capability`; revoke these only in a separately reviewed migration after the full path is tested.

### Exact compatibility boundary

- First create for a pair succeeds.
- Duplicate create for the same pair fails (same unique-constraint behavior as today).
- Create after withdrawal also fails (same unconditional unique constraint and plain INSERT behavior).
- Re-add/reactivation remains the existing bulk PUT replacement operation's responsibility.
- No changes to schema uniqueness, history model or API semantics are included in this create cutover.

### Implementation order

1. Add SQL wrapper and disposable PostgreSQL positive/negative tests.
2. Add Gateway reader create operation and HTTP POST endpoint.
3. Add Resource API Gateway client create operation and route fail-closed behavior.
4. Test first create, duplicate and withdrawn-row conflict, wrong actor/business, non-selectable capability, forged assertion, replay, context mismatch, exact effectiveFrom preservation, no sibling mutation, and runtime direct INSERT/sequence denial after the dedicated revocation migration.
5. Only then propose a separate runtime ACL revocation migration. Do not put production execution into the batch manifest.

No source or test implementation was made in this task. This is a resolved compatibility design, not a completed feature.

### Refreshed state and safety

PR #298 remains open/draft/unmerged at `8cea0220b693302e28b1f9dba91ae4c137a7cd25`, 244 commits ahead / 4 behind `main`, diverged, `mergeable=false`, 31 changed files. Existing Actor Gateway branches were inspected and left untouched. No CI run was triggered.

Production migration batch manifest remains `[]`. No production SQL, role, membership, grant, ACL, table, sequence, ledger, data, credential, secret, Render service/configuration/deployment, payment state, PR state or branch ancestry was changed. No paid resource or recurring process was introduced. Only this existing handover was extended.


## 20 November 2026 — post-PR #300 continuation review; PR #298 remains separately gated

Before choosing the next task, re-read this migration-batches handover and the production migration reconciliation, refreshed PR #298 and PR #300 metadata/diffs, searched the current feature branches, and compared the migration-batches branch against `main`.

### Completed adjacent feature — PR #300

The separately scoped signed Business Capability create feature has now been completed on `feat/signed-business-capability-create`, PR #300. It is fully qualified on CI disposable PostgreSQL; CI #5449 and #5450 both passed `quality` and `web-quality`, including the new signed create wrapper, HTTP Gateway/Resource API integration, and the manual-only direct INSERT/sequence cutover qualification. PR #300 remains open/draft/unmerged. Its manual cutover is not in automatic migrations and has not been applied to production. This work remains outside PR #298's migration-batch scope and is not added to its pending inventory or execution manifest.

### Refreshed PR #298 / branch state

- PR #298 remains OPEN / DRAFT / UNMERGED, `mergeable=false`, head `f2f3cbb9588dad8ac0fdd8477e7434f6fc3d4b60`, base `main`; no review submissions or inline review threads were returned. Its only current comment is the automated Cloudflare Pages branch-preview bot message, not a code review or production deployment.
- The current head commit is documentation-only (`docs/HANDOVER_2026-11-17_ACTOR_GATEWAY_MIGRATION_BATCHES.md`). `fetch_commit_workflow_runs` returned no PR-triggered workflow runs for that head or the preceding documented code checkpoint `8cea0220b693302e28b1f9dba91ae4c137a7cd25`. The CI workflow ignores documentation-only changes. Therefore there is no exact-current-head CI pass established by this review; do not claim one.
- Branch comparison against current `main`: 254 commits ahead, 4 behind. The four commits on `main` since the branch point touch only `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md`. A line-content comparison confirms every current-main line is present in the branch copy, while the branch has 66 additional lines of branch-specific history. The PR remains reported non-mergeable; do not assume the shared handover is conflict-free or rewrite ancestry just to remove the four behind commits.
- `config/production-migration-batches.json` remains exactly `[]`.
- `config/pending-migrations.production.json` remains a 50-entry repository-side pending inventory based on the supplied 105-row production ledger snapshot. It is not live refreshed authority and does not authorize execution.

### Static runner / qualification review

Re-read `src/db/migrate.ts`, `src/db/migration-batches.ts`, `src/db/migration-batches.test.ts`, `src/db/migration-runner-plan-mode.test.ts`, `src/db/production-pending-migration-allowlist.ts`, `.github/workflows/ci.yml`, and `scripts/qualify-production-migration-plan-only.mjs`.

Confirmed from source:
- Production pending migrations are checked against an exact pending-queue allowlist before planning or execution.
- Normal production execution requires an explicit known batch ID; selected batches must match the exact contiguous pending prefix and exact checksums.
- The reviewed batch manifest is empty, so there is no selectable production execution batch.
- Plan-only mode does not execute migration SQL and rolls back its transaction. Its CI fixture uses a local PostgreSQL service, creates a temporary `ghm_db` fixture, checks that all pending migration filenames/checksums are printed, and compares ledger/catalog counts before and after.
- CI job environment sets `NODE_ENV=test` and uses localhost PostgreSQL; the plan-only qualification guard also checks the exact `ghm_disposable_test` qualification context. The fixture database name `ghm_db` is local-only and must never be confused with the Render production database of the same name.

This was a source-level review only. No local database was created, no script or workflow was executed, and no live production ledger was queried. It does not establish that the 50-entry pending inventory matches the current live production ledger, that a first batch can safely be derived, or that production migration authority is ready.

### Next safe work

1. Keep PR #298 draft/unmerged and keep its execution manifest empty.
2. Reconcile why GitHub reports `mergeable=false` without rebasing or merging; the branch is still 254 commits ahead and its shared hosting handover has branch-specific additions.
3. Establish exact-head CI for the code-bearing PR #298 state using the normal PR workflow only when a meaningful code/test change is justified. Do not dispatch workflows manually merely to obtain a green check, and do not claim CI passed based on a docs-only head.
4. Separately refresh the live production ledger only through the already approved dedicated read-only authority path; then re-derive the exact pending inventory and dependency/cutover order. The current 50-entry file is historical input, not execution authority.
5. Do not populate a production batch until exact ledger/checksum reconciliation, route readiness, migrator role/ACL authority remediation, provider-confirmed administration, and verified recovery are complete.

No production SQL, migration, role, membership, grant, ACL, ledger, data, credential, secret, Render service/configuration/deployment, payment state, branch ancestry, or paid resource was changed. PR #300 and PR #298 remain separate. PayFast remains paused.


## 20 November 2026 — hosting handover append-order conflict hypothesis tested

Re-read the migration-batches handover and refreshed PR #298, current `main`, the feature branch, and the shared hosting/credentials handover at the common merge base `b73839b27ac90446650f921d3e8ce1b5de041f04`.

### Finding

The shared hosting handover had a common 1,646-line prefix at the merge base. Both `main` and the migration-batches branch independently appended content after that prefix. The 218-line mainline addition (sections 37–40, latest production role/migrator evidence and the staged Gateway URL correction) was present on the feature branch but interleaved with 100 branch-specific lines/sections added by the migration-batches work. This creates a plausible same-file end-of-file merge conflict despite the mainline content having been copied into the branch.

### Documentation-only correction

Commit `132d813583a798a401a861576b350a5abe51c8fc` reorders only `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md` on `feat/actor-gateway-production-migration-batches` into this deterministic order:
1. the exact 1,646-line merge-base content;
2. the complete 218-line mainline addition, unchanged and in its original order;
3. all 100 branch-specific lines/sections, preserved after the shared mainline addition.

Post-write verification fetched both versions again and confirmed all 1,864 current-main lines occur in order in the branch file; the branch file remains 1,964 lines. No source, SQL, migration inventory, manifest, CI workflow, PR base, or branch ancestry was changed.

### Mergeability result — hypothesis not yet confirmed

After the ordering correction, GitHub still reports PR #298 as open/draft/unmerged and `mergeable=false`. The branch is 256 commits ahead and 4 behind `main`, with the same merge base. Therefore this documentation ordering issue was a plausible conflict source, but it is **not yet proven to be the sole cause** of GitHub's non-mergeable result. Do not claim the PR is now mergeable. No merge, rebase, cherry-pick, force-push, or ancestry rewrite was performed.

The connector does not expose GitHub's detailed conflict-file list or a test-merge result. Continue by inspecting the four behind-main commits and the PR's current mergeability/check state through a supported GitHub interface. If the hosting handover reorder is not sufficient, identify the exact conflicting paths before making any further changes. Preserve the current branch and keep PR #298 draft.

### Change boundary

This task changed one documentation file only. The migration execution manifest remains empty. No production database, SQL, role, grant, credential, secret, Render service, environment, deployment, CI dispatch, payment state, paid resource, or branch ancestry was changed. PR #300 remains separate and untouched; PayFast remains paused.



## 20 November 2026 — PR #298 mainline ancestry reconciliation

Re-read this handover, PRs #298 and #300, the current `main` ref, and the migration-batches branch before this task.

### Exact comparison

- PR #298 head before reconciliation: `420f4bd32c8735db5232d96b7bf1f27cd5ef0c33`.
- Current `main` head: `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Merge base: `b73839b27ac90446650f921d3e8ce1b5de041f04`.
- GitHub compare reported 257 commits ahead / 4 behind.
- The four mainline commits were all documentation-only changes to `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md`.
- A line-by-line comparison established that the branch's hosting handover already contained every current-main line in exact order; it additionally contained 100 branch-specific lines/sections after the mainline content. The branch was therefore content-reconciled but its ancestry did not include the four mainline commits.

### Ancestry reconciliation

Created merge commit `85e84849b3fd0c7e0040af0c47386b904be42835` with both the previous PR #298 head and current `main` as parents. Its tree preserves the existing feature-branch contents, including the 100 branch-specific hosting-handover lines, while recording the current mainline ancestry. The branch ref was advanced with a non-force update and an expected-head lease from `420f4bd32c8735db5232d96b7bf1f27cd5ef0c33`.

This is an ancestry merge, not a rebase or squash. No migration SQL, runner, pending inventory, execution manifest, tests, application source, or PR base was changed. No force-push was used.

### Remaining verification

- Re-fetch PR #298 metadata and compare `main` against the updated feature branch to confirm the new ahead/behind counts and GitHub mergeability state.
- Check whether the workflow has any applicable checks for the new merge commit. Do not manually dispatch CI or claim exact-head qualification if the workflow skips documentation-only changes.
- Keep PR #298 draft/unmerged. Keep `config/production-migration-batches.json` empty. Do not execute production migrations.
- PR #300 remains separate and untouched.

### Change boundary

Only branch ancestry was reconciled and this handover is being updated. No production database, SQL, role, membership, grant, ACL, ledger, credential, secret, Render service/configuration/deployment, paid resource, or PayFast state was changed.


## 20 November 2026 — PR #298 migration safety and exact-head review

Re-read the migration-batches handover, PR #298, PR #300, the branch and current `main` before this task.

### GitHub state after ancestry reconciliation

- PR #298 head at review start: `e29525ae43ee6c1386fcfb3f52c0ab12d36df468`.
- Current `main`: `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Comparison: 259 ahead / 0 behind.
- GitHub PR metadata now reports `mergeable=true`, open, draft and unmerged. The prior `mergeable=false` state is resolved; this is not merge approval.
- PR #300 remains separate, open, draft, unmerged, and unchanged at `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`.
- Exact-head CI run `#5453` / run ID `44782911923` was found in progress for PR #298 head `e29525a...`. Do not call it passed until its completed result and jobs are inspected.
- The workflow uses `paths-ignore: '**/*.md'` and `docs/**`; documentation-only updates do not independently trigger CI. The run above is associated with the current PR head and must be inspected rather than assumed from the latest handover commit.

### Migration safety review

Reviewed the exact PR-head source for:
- `src/db/migrate.ts`
- `src/db/migration-batches.ts` and tests
- `src/db/production-pending-migration-allowlist.ts`
- `src/db/migration-order.ts`
- `config/pending-migrations.production.json`
- `config/production-migration-batches.json`
- `scripts/qualify-production-migration-plan-only.mjs`
- `database/migrations/20261117020000_revoke_runtime_capability_governance.sql`
- CI workflow and production deployment/migrator blocker handovers.

Findings:
1. The execution manifest is exactly an empty JSON array (`[]`). The batch selector rejects a missing/unknown batch ID and only accepts an exact contiguous pending prefix with exact version/name/checksum. No production migration batch is currently selectable.
2. The production pending inventory contains 50 ordered entries and is explicitly an inventory guard, not execution authority. It is based on the dated 105-row production snapshot and is not a fresh live ledger reconciliation or authorization.
3. For the `ghm_db` target, the runner checks the inventory against the live ledger's pending queue, checks all already-applied repository migration checksums/provenance, rejects out-of-order pending migrations, and runs selected migration SQL inside a transaction after migrator identity and SET ROLE checks.
4. Plan-only mode is separately guarded to NODE_ENV=test, the explicit plan-qualification flag, and localhost; its qualification provisions and drops only a disposable local database, asserts ledger/catalogue invariance, and checks the printed pending versions/checksums. It is not production evidence.
5. The 17 November capability-governance migration is documented as a post-deployment cutover and the PR body explicitly excludes it from any pre-deployment batch. Its SQL asserts required signed Gateway functions, ownership, SECURITY DEFINER, pinned search_path, Gateway EXECUTE and runtime denial before revoking legacy runtime functions. Do not include it in a production batch before Gateway deployment/readiness.
6. The production security handovers still identify unresolved live authority issues: no exact current production ledger read, no fresh verified recovery point, bootstrap-granted role memberships/authority edges, and incomplete dedicated Gateway production identity/ACL readiness. These are hard blockers, not items CI can resolve.
7. CI workflow ignores documentation-only paths. The current PR-head run #5453 is in progress; no exact-head pass is claimed yet.

### Disposition / next gates

- PR #298 remains draft and unmerged despite GitHub mergeable=true.
- Do not populate the batch manifest, select a batch, execute production SQL, or merge this deployment prerequisite solely on CI success.
- Next inspect run #5453 jobs and final conclusion, then continue a file-by-file review of the remaining application/privilege qualification changes and reconcile the live ledger/authority/recovery gates only when an authorized safe evidence path exists.
- PR #300 remains untouched. PayFast remains paused.

### Change boundary

This task was a source/PR/handovers/CI metadata review and this handover update only. No migration SQL, manifest, production database, ledger, role, membership, ACL, credential, secret, Render configuration/service/deployment, paid resource, or PayFast state was changed.


## 20 November 2026 — commercial PostgreSQL qualification review

Re-read the current migration-batches handover and PR #298/#300, re-fetched the PR #298 changed-file list, and reviewed the commercial document-consent and commercial-workflow qualification scripts plus plan-only qualification and the migration cutover.

### PR and CI state at review

- PR #298: open, draft, unmerged; GitHub reports mergeable=true; 260 ahead / 0 behind; 31 changed files.
- PR #298 head: `be173dbe72b481fda53d403d490e2b96cb57af16`.
- PR #300 remains separate and untouched.
- Exact-head CI run #5454 (run ID `44783349878`) is in progress. No pass is claimed yet.
- The CI workflow ignores documentation-only changes; inspect the existing run and its actual jobs rather than assuming this handover update triggers another run.

### Commercial document consent qualification review

The PostgreSQL qualification uses the migrator connection only to provision rollback-only disposable fixtures and inspect catalogues, and uses the isolated `ghm_actor_gateway` login for authority grant, approval and payment-preparation calls. It checks six exact SECURITY DEFINER functions for schema-owner ownership, pinned `pg_catalog, ghm, pg_temp` search_path, no runtime/migrator/PUBLIC EXECUTE, and Gateway EXECUTE. It checks five evidence tables for no direct runtime or Gateway table privileges, verifies enabled UPDATE/DELETE/TRUNCATE immutability triggers, and exercises append-only rejection in a rolled-back transaction. Payment preparation is statically checked to require explicit acceptance and approved document status, create pending checkout evidence, make no provider/network calls, and not activate subscriptions.

### Commercial workflow qualification review

The end-to-end disposable PostgreSQL script creates a synthetic founder/business/plan/subscription/document fixture through the migrator connection and uses the separate Gateway login for signed authority grant, exact-version approval and consent-backed payment preparation. It exercises replay, forged HMAC, non-founder, expired assertion, false consent, unapproved version and revoked authority denial, and idempotent payment retry. Final assertions require one consent and payment attempt, an approved exact document version, subscription still `trialing`, and payment still `pending_checkout`. It explicitly reports no production database touched and no provider API call.

Review boundary: this is CI test code evidence; the qualification has not been run against production and does not activate payment processing.

### Plan-only and production cutover review

- Plan-only fixture is created as local disposable `ghm_db`, seeds the 95-repository-migration applied prefix plus 10 documented retained historical ledger rows, and verifies all 50 pending inventory entries and SHA-256 checksums are printed.
- It compares ledger and GHM catalogue counts before/after and drops the disposable database in `finally`. The runner requires NODE_ENV=test, explicit qualification flag, and localhost for the plan-only exception. The run is not production ledger evidence.
- The production execution manifest remains `[]`; the exact batch selector is not authorized to execute a batch.
- The 17 November capability-governance revocation migration is explicitly a post-deployment cutover. It checks the signed Gateway verifier and operations' ownership, SECURITY DEFINER, pinned search_path and role privileges before revoking legacy RPC execution. It must not be moved into a pre-deployment batch.

### Findings and remaining gates

No immediate source change is justified by this static review. The scripts deliberately distinguish migrator fixture setup from Gateway operations, and the payment tests preserve non-activation. Remaining review must inspect the exact-head CI result and other qualification coverage, plus resolve the already-documented live production blockers: refreshed live ledger/checksum reconciliation, verified recoverable backup, Render role membership/grantor authority edges, and dedicated Gateway production identity/ACL/readiness. Do not fill the execution manifest or execute migrations while these remain unresolved.

### Change boundary

This task was a read-only source/PR/CI review and handover documentation update. No SQL, application code, migration inventory, execution manifest, database, ledger, role, membership, ACL, credential, secret, Render service/configuration/deployment, paid resource, or PayFast state was changed.


## 20 November 2026 — PostgreSQL 18 delegated CREATEROLE authority reproduction

Re-read the migration-batches handover, PR #298, PR #300, branch comparison, role/service dependency map, migrator authority remediation plan, legacy runtime authority findings, and exact CI workflow before this task.

### Current PR/CI state

- PR #298 remains open, draft, unmerged, and GitHub reports mergeable=true.
- Branch is 261 commits ahead / 0 behind current main.
- PR #300 remains separate, open, draft, unmerged and untouched.
- CI run #5455 (run ID `44783704515`) is associated with PR #298's pre-handover head `5926253f9acc8031cc867e3eebf6af2878b5a1f0`; its `web-quality` job passed. Its `quality` job is in progress. Migration plan-only, commercial document consent, commercial workflow, isolated Auth Issuer principal, isolated Actor Gateway principal, Worker smoke, storage, Connect Business, registration, storage lifecycle and full Node test suite steps completed successfully. The job has advanced to Campaign/directory-review signed Gateway qualification; Business Capability lifecycle is next. Do not call the whole run green until the final job conclusion is available.
- Documentation-only commits are ignored by CI path filters, so this handover update does not itself start a new run.

### PostgreSQL 18 delegated CREATEROLE finding reproduced in CI

Inspected the exact `.github/workflows/ci.yml` step named `Reproduce PostgreSQL 18 delegated CREATEROLE membership behavior`. The step runs on the disposable PostgreSQL 18 CI service as bootstrap `postgres` and:
1. Creates a non-login `ghm_role_creator` with CREATEROLE.
2. Executes `CREATE ROLE ghm_role_created LOGIN NOINHERIT` while `SET ROLE ghm_role_creator` is active.
3. Asserts PostgreSQL records the new role's membership edge with grantor `postgres`, ADMIN OPTION=true, SET=false and INHERIT=false.
4. Attempts `REVOKE ghm_role_created FROM ghm_role_creator` while still acting as `ghm_role_creator`.
5. Asserts the postgres-granted membership edge still exists after that revoke attempt.
6. Drops the isolated test roles.

GitHub reports this step completed successfully in run #5455. This is direct reproducible PostgreSQL 18 CI evidence for why a CREATEROLE delegate cannot remove a bootstrap-granted membership edge merely by issuing REVOKE as itself. It supports the existing remediation plan's stop rule: obtain provider/bootstrap authority for the narrowly scoped edge correction; do not improvise revokes through `ghm_db_user` or application roles.

### Role authority disposition

The six production bootstrap ADMIN OPTION memberships held by `ghm_db_user` remain individually dependency-mapped; they are not a bulk revoke list. The live migrator contract still requires exactly one direct SET-capable membership to `ghm_schema_owner`, no incoming `ghm_migrator` membership, no direct relation/sequence ACLs, and no database/schema CREATE for the login. The current live state documented in the role remediation plan fails those requirements: the bootstrap incoming `ghm_db_user -> ghm_migrator` ADMIN OPTION edge and explicit migrator ACLs remain. No production connection as the dedicated migrator identity or exact live ledger export has been established.

No source change or production action is justified by this reproduction. It validates the reason for the existing provider-authority gate; it does not authorize any role/ACL mutation.

### Next checkpoints

- Inspect completion of CI #5455, particularly Campaign/directory-review, Business Capability lifecycle, catalogue governance, legacy RPC cutover, Business Capability signed cutover, the remaining Gateway cutovers, runtime boundary, migration audit policy and Auth Issuer cutover/inventory comparisons.
- Continue source review of the remaining qualification scripts against their role/route contracts.
- Keep PR #298 draft/unmerged, execution manifest exactly `[]`, and do not run production SQL, migrations, role changes or ACL changes.
- Keep PR #300 separate and untouched. PayFast remains paused.

### Change boundary

This was a read-only source, PR, workflow, and CI status review plus this handover update. No production database, ledger, role, membership, ACL, credential, secret, Render service/configuration/deployment, migration inventory, execution manifest, paid resource, or PayFast state was changed.


## 20 November 2026 — exact-head CI #5456 completed successfully

Re-read this handover, PR #298 and PR #300, and rechecked the branch comparison and current GitHub PR metadata before closing this qualification pass.

### Corrected CI run chronology

- CI #5455 (run ID `44783704515`) did not finish successfully; its `quality` job was cancelled after a newer run superseded it. Its earlier completed steps remain useful evidence, but it must not be described as a passing full run.
- CI #5456 (run ID `44784144950`) ran against PR #298 head `d1593ebd2cfde65e1fa087118c0968eaa5235d81`.
- Both required jobs completed successfully: `quality=success`, `web-quality=success`.
- The completed quality job includes successful disposable PostgreSQL 18 delegated CREATEROLE reproduction; all migration syntax/build and migration plan-only checks; commercial consent/workflow; isolated Auth Issuer and Actor Gateway principals; all listed Gateway qualifications and cutovers (Campaign/directory review, Business Capability lifecycle and signed cutover, Saved Business, Business Hours, Trust Score, Business Logo, supplier classification/membership, Business profile); commercial settlement identity qualification; migration audit policy tests; runtime boundary verification; and pre/post disposable Auth Issuer cutover SECURITY DEFINER inventory comparison.
- The web-quality job completed the web build, web tests, dependency audit and security-sensitive toolchain verification.
- This is disposable CI PostgreSQL evidence only. It does not validate the live production ledger, Render role authority, production backup/recovery point, or production Gateway identity/ACL readiness.

### Current branch and PR metadata

- PR #298 head remains `d1593ebd2cfde65e1fa087118c0968eaa5235d81`, open, draft, unmerged, and GitHub reports `mergeable=true`.
- Current comparison: 262 commits ahead / 0 behind `main`.
- 31 files changed; the scope includes migration runner/inventory/manifest, privilege checks, CI qualification, and supporting handovers.
- PR #300 remains separate, open, draft, unmerged, and untouched at `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`.
- Production migration execution manifest remains exactly `[]`.

### Disposition / next safe task

The complete disposable CI qualification for PR #298 is green. Do not equate this with production readiness or merge approval. PR #298 stays draft/unmerged until the live production pending ledger/checksum reconciliation, verified recoverable backup, provider/bootstrap correction of the specific PostgreSQL role membership authority edge, exact migrator identity/ACL verification, and Gateway production identity/route readiness are independently established.

Next, continue the source-level review of the migration runner and production migration inventory against the actual migration dependency graph and cutover order. Do not populate the execution manifest or run production SQL. Keep PR #300 separate. No production deployment, database/role/ACL changes, paid resource, or PayFast work.

### Change boundary

This update records completed CI evidence and current PR metadata only. No application source, SQL, migration inventory, execution manifest, production database, ledger, role, membership, ACL, credential, secret, Render service/configuration/deployment, paid resource, or PayFast state was changed.


## 20 November 2026 — migration ordering and cutover dependency review

Re-read this handover, PR #298/#300, current branch metadata, migration runner, strict pending-inventory validator, exact batch selector, execution manifest, production inventory, migration tree, and selected cutover/authority migration names before this task.

### Current PR state

- PR #298 remains open, draft, unmerged, GitHub mergeable=true.
- Head before this handover update: `277c043f0a6a9b39171f28d6a9777a9ba40da45f`.
- Comparison before update: 263 ahead / 0 behind; 31 changed files.
- PR #300 remains separate and untouched.
- Production batch execution manifest remains exactly `[]`.

### Ordering controls verified

- Repository migrations are loaded and sorted lexically by their 14-digit version; duplicate versions are rejected.
- Applied ledger names are checked against repository names for matching versions.
- Any pending migration followed by a later applied repository migration is rejected as a history gap.
- Production inventory must equal the entire live pending queue by exact length, order, version and name.
- A selected batch must be a non-empty, strictly ordered, unique list with valid SHA-256 checksums and must match an exact contiguous prefix of the current pending queue; checksums are compared against repository SQL.
- Existing applied migration checksums are validated before execution, including documented historical provenance exceptions.
- Selected SQL runs under an explicit transaction/advisory lock after database identity and migrator-role checks. The manifest is empty, so no batch can currently be selected.

### Dependency/cutover conclusion

The production inventory contains 50 pending migrations spanning supplier classification, onboarding/read models/storage cleanup, capability catalogue governance, Actor Gateway principal/self-identity/registration identity, signed assertion binding, Business Capability/Saved Business/Business Hours/Trust Score/Business Logo gateways, auth/runtime revocations, signed Connect provisioning, storage attestation, commercial document/consent authority and payment preparation, and the final two runtime revocation cutovers.

Version order alone is not proof of safe operational cutover. In particular:
- `20261110260000_gateway_supplier_classification_cutover` and `20261110270000_gateway_business_profile_update` appear before the subsequent signed-assertion binding migrations (`20261111030000`, `20261111040000`) in the pending sequence. Their names indicate a need to verify the deployed Gateway's expected assertion contract before applying them; do not infer safe deployment order from timestamps.
- Multiple auth/runtime revocation migrations occur before later token-bound recovery additions and public/unsigned Gateway cleanup. Their route/function dependency and rollback implications must be checked against the deployed Resource API/Auth Issuer versions, not just SQL order.
- `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads`, `20261112080000_signed_connect_business_provisioning_gateway`, storage Gateway/attestation changes, commercial consent/payment preparation, and `20261117010000`/`20261117020000` runtime revocations require explicit service/route readiness and principal/ACL evidence. The last two remain post-deployment cutovers and are excluded from any pre-deployment batch by the PR scope.
- The PR body correctly says the first safe batch is not yet known. No batch manifest should be populated until a migration-by-migration dependency matrix is tied to exact deployed service commits, routes and live production ledger.

### Safety disposition

This review establishes runner ordering guarantees and identifies operational dependency gates; it does not establish a safe first production batch. Do not derive batch boundaries from timestamps or names alone. Keep manifest `[]`, PR #298 draft/unmerged, PR #300 separate, and no production SQL, migration, role/ACL, or deployment action.

### Change boundary

This task was a source and migration-tree review plus handover documentation. No SQL, application source, inventory, execution manifest, database, ledger, role, membership, ACL, credentials, secrets, Render configuration/services/deployment, paid resource, or PayFast state was changed.


## 20 November 2026 — migration-by-migration service dependency matrix

Re-read the migration-batches handover, PR #298/#300, branch comparison, 50-entry production pending inventory, batch selector, production role/service dependency map, deployment blockers, Actor Gateway source/routes and the migration SQL before this task.

### Current PR state at review start

- PR #298 was open, draft, unmerged, mergeable=true; head `20143d892cc61dd16988bc70d61bd868be1440d8`.
- Comparison was 264 ahead / 0 behind `main`, with 31 changed files.
- PR #300 remains separate and untouched.
- Execution manifest was and remains `[]`.

### New dependency matrix

Added `docs/security/PRODUCTION_MIGRATION_DEPENDENCY_MATRIX_2026-11-20.md` (commit `2e307f18b70a7bc12c26edf8ab256fe81fb66ac7`). It maps all 50 pending inventory entries to their required service/principal and pre-execution gate, and records the Actor Gateway / Resource API route families, Auth Issuer absence, storage's distinct provider attestation, and commercial payment's non-activation boundary.

The matrix distinguishes schema/function preparation from traffic cutovers and records these specific ordering hazards:

1. `20261110260000_gateway_supplier_classification_cutover` and `20261110270000_gateway_business_profile_update` revoke legacy runtime functions before the signed-binding migrations `20261111030000` and `20261111040000`. They must not be executed as independent batches or expose an intermediate service state. Treat them only as one reviewed, non-interruptible migration/deployment window or redesign/requalify the sequence.
2. Initial ID-based Gateway wrappers are not production-ready until signed HMAC assertion, nonce, operation and request-context binding migrations are installed and the service's exact function allowlist is qualified.
3. Auth runtime revocations require exact deployed Resource API caller/route proof; Auth Issuer is absent from the last recorded live production snapshot.
4. Global PUBLIC EXECUTE revocation requires a complete live function/grant inventory and explicit allowlist for every production principal.
5. Catalogue-wide SECURITY DEFINER search_path normalization requires live owner preflight and exact postflight.
6. Storage provider completion requires a separate provider workflow attestation in addition to the Actor Gateway actor assertion.
7. Commercial consent/payment preparation does not activate PayFast; payment remains pending checkout and subscription trialing.
8. `20261117010000` and `20261117020000` remain final post-deployment runtime revocations.

### Batch decision

No safe first production batch can be approved. Exact deployed service commits/route flags, fresh live ledger/checksum reconciliation, a verified recovery point, provider-authorized PostgreSQL bootstrap/migrator authority remediation, and production Gateway identity/ACL readiness are still absent or unresolved. The dependency matrix is a source-contract review, not live deployment or database evidence.

Keep PR #298 draft/unmerged, PR #300 separate, and the execution manifest exactly `[]`. Do not execute production SQL, change roles/ACLs, submit/deploy the staged Gateway form, alter existing Render services, add paid resources, or activate PayFast.

### Change boundary

This task added two documentation records only (the dependency matrix and this handover entry). No migration SQL, application source, production inventory, execution manifest, database, ledger, role, membership, ACL, credential, secret, Render service/configuration/deployment, paid resource, or PayFast state was changed.


## 20 November 2026 — Resource API deployment and route-readiness evidence review

Re-read the migration-batches handover, PR #298 and #300, open PRs #296/#297/#299, relevant runtime/security branches, production role/service map, deployment blockers, and the 50-migration dependency matrix before this task.

### PR and branch state at review

- PR #298: open, draft, unmerged, mergeable=true; head `db88242d556f278c79095630b68e65340ae008ba`; 266 commits ahead / 0 behind main.
- PR #300: open, draft, unmerged, mergeable=true; isolated branch `feat/signed-business-capability-create`, head `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`; CI #5449 is recorded as passed in its PR body.
- PR #299: open, draft, mergeable=true; Project detail/update API work, not a Gateway deployment.
- PR #297 and #296 remain separate open drafts and are not folded into #298.
- Resource API related branches found: `feat/resource-api-gateway-registration-read-20261110` and `security/resource-api-runtime-principal-20261112`; runtime-related branch search also returned historical/construction branches. No branch was switched, rebased, or merged.
- PR #300 remains untouched and separate.

### Exact live-vs-source comparison

The production runtime deployment blocker handover identifies the last known live Render Resource API commit as `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`, with auto-deploy OFF. Its exact GitHub source was inspected read-only.

At that live commit:
- `package.json` exposes `start:payfast-callback` but no `start:actor-gateway` script.
- `src/config.ts` uses generic `DATABASE_URL`; it has no `GHM_RUNTIME_DATABASE_URL` binding and no `GHM_ACTOR_GATEWAY_URL` configuration.
- `src/server.ts` exposes `/readyz` and does not call the later runtime database identity / function-privilege startup guards.
- `src/http/app.ts` registers Business Capability, capability catalogue, registration identity and storage routes without Gateway client wiring. Business Capability POST is a direct Resource API service operation at this commit.
- Therefore the last known live Resource API is materially behind the current repository's Gateway-aware route contract. It must not be described as having the new principal guard or signed Gateway routing deployed.

Current `main` source was separately inspected:
- Production DB configuration requires `GHM_RUNTIME_DATABASE_URL`; non-production may fall back to `DATABASE_URL`.
- Startup calls `assertRuntimeDatabaseIdentity` and reads/asserts the runtime function privilege allowlist when non-production or when `GHM_RUNTIME_FUNCTION_ALLOWLIST_ENFORCED=true`. Production otherwise logs that the function allowlist is not enforced because the production ACL baseline has not yet been independently qualified.
- `GHM_ACTOR_GATEWAY_URL` is parsed as an optional credential-free HTTPS origin. It is not globally required at config load. When the Resource API is production and storage is configured, the app explicitly requires both the Gateway URL and storage-provider workflow attestation secret.
- For multiple Gateway-backed write/read operations, production marks Gateway use as required and returns 503 rather than falling back when the client is absent (including Business Hours, Business Logo, Saved Business, Trust Score and Business Capability mutation paths). Supplier classification and Business Profile updates also return 503 when no Gateway client is configured. Registration identity receives a production required flag and returns 503 when no Gateway client exists. Capability catalogue admin routes require a Gateway client and return 503 if absent.
- Business Capability read routes remain Resource API reads; create/replace and verification operations are Gateway-bound when production requires the Gateway client.
- The five-second Gateway client timeout remains a known operational risk for the selected single Free Render service due to sleep/cold-start behaviour. It must be qualified without weakening auth or fail-closed behavior.

This is source-contract evidence only. The current main source does not prove that the live Render service has been deployed to that commit, that the Gateway URL/secret are set, or that any production route currently reaches a live Gateway.

### Render evidence limitation

A Render workspace listing returned one available workspace, `ZAID Technologies` (workspace ID held only for this review). The Render service inventory was not retrieved because the connector requires the user to explicitly select/confirm the workspace before resource access. No workspace was selected and no Render service, environment variable, deployment, log, or metric was read or changed in this task.

The next live verification requires the owner's explicit confirmation to inspect the ZAID Technologies Render workspace. Until then, use the last recorded deployment blocker evidence only: live commit `c7cf1eb`, auto-deploy OFF, and no production Actor Gateway service deployed.

### Route readiness disposition

- **Not deployed / not proven live:** Resource API runtime-principal guard and Gateway route wiring on current main; dedicated Actor Gateway service and HTTPS endpoint; Gateway database schema USAGE/functions/ACL; signed assertion secret and provider attestation; exact production route configuration.
- **Known code-level fail-closed behavior on current main:** Gateway-required routes return 503 if the URL/client is absent, rather than silently falling back. This does not create a usable Gateway or establish service readiness.
- **Not ready for migration cutover:** No production migration batch may be selected from this source comparison. The early supplier/profile revocation-order hazards, fresh ledger/checksum reconciliation, backup/recovery, and bootstrap/migrator authority blockers remain unresolved.

### Change boundary

This task was a read-only GitHub source/PR/branch inspection and handover documentation update. No Render workspace was selected; no Render service/environment/deployment/log/metric was accessed or changed. No database, migration, ledger, role, membership, ACL, secret, production route, PR state, paid resource, or PayFast state was changed.


## 20 November 2026 — confirmed Render workspace, read-only live inventory and deployment failure diagnosis

Owner explicitly authorized read-only inspection of the ZAID Technologies Render workspace. The workspace was passed by ID to read-only list/get/deploy/log/event tools. No workspace selection mutation was used.

### Workspace inventory

Workspace: ZAID Technologies (`tea-d9svua6417fc73bhcutg`).

The Render service inventory returned five web services:
- `GHM-Internal-Runtime` — existing production Resource API; branch `main`; Frankfurt; auto-deploy OFF; one instance; health path `/healthz`; free web-service plan; service ID `srv-damupsek1f9s73eq8kkg`.
- `ghm-identity-qualification` — separate qualification service; branch `integration/ghm-identity-merge-candidate-20261018`; auto-deploy OFF; free plan; no production Actor Gateway role implied.
- `ghm-payfast-sandbox-runtime` and `ghm-payfast-callback-sandbox` — legacy sandbox services; auto-deploy OFF; kept out of this production review.
- `zaid-ai-workforce` — unrelated service.

No `ghm-actor-gateway` service exists in the returned service inventory. No new service was created.

The Postgres inventory returned:
- `ghm-db` / database `ghm_db`: PostgreSQL 18, Frankfurt, available, primary, 1 GB disk, plan `0.1c-256mb`, database user shown as `ghm_app_user`, service ID `dpg-dag0sdtbedkc7389vi2g-a`.
- `ghm-payfast-sandbox-db`: suspended, billing suspender, expired 2026-11-08; excluded from target production.
- No Key Value instances.

**Cost clarification:** Render currently reports the Resource API web service plan as `free` and the existing `ghm-db` Postgres plan as `0.1c-256mb`. This read does not change either plan. No paid resource was added or proposed.

### Actual deployed Resource API commit and failed candidate deploy

The latest successful/live Resource API deployment remains commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf` (deploy `dep-dbpmv8jrjlhs73abkli0`, status `live`). The service branch is `main`, but auto-deploy is OFF, so branch head does not imply deployment head.

A later deployment attempt at `fe5a82d856f8733d0094e7d4599733da93537719` (2026-11-15, deploy `dep-dbsva6c9v7es73bordlg`) built successfully but failed at process startup with exit status 1. Render app logs show the exact error:
`GHM_ACTOR_GATEWAY_URL is required when production storage is enabled`
from `dist/http/app.js:323`. It retried and failed again. The failed candidate did not replace the previous live deployment; the last successful deploy remains `c7cf1eb`.

A prior 2026-11-15 deployment attempt at `8f3ee5748679c736aaefc7bcf9f6716b5453314a` failed during build with exit status 2. It is not the current live commit.

Recent 2026-11-20 app logs show the existing service starting `npm start` / `node dist/server.js` and listening on port 10000. These logs do not prove that current main's Gateway-aware code is deployed.

### Environment-variable visibility boundary

The Render connector's available read-only service and deploy responses expose service configuration metadata, but no read-environment-variable action was available in the discovered tool set. No environment-variable values or secret values were retrieved. Therefore the exact current presence/absence of `GHM_ACTOR_GATEWAY_URL`, storage-provider attestation secret, `GHM_RUNTIME_DATABASE_URL`, or database credentials remains unverified from Render metadata. The failed deployment log proves that the candidate's startup process did not receive a usable Gateway URL at that time; it does not by itself establish the current value state.

### Identity qualification service

The separate `ghm-identity-qualification` service's last live deploy is `ee91f42503e064571d57e87ed0d5cd1e9d5badd5` (2026-11-04). It remains on the integration qualification branch with auto-deploy OFF. It is not the production Resource API or Actor Gateway.

### Updated production readiness decision

1. Resource API remains on the older live commit `c7cf1eb`; the Gateway-aware candidate `fe5a82d` failed at startup because the Gateway URL was required while production storage was enabled.
2. No Actor Gateway web service is currently present in the ZAID Technologies workspace inventory.
3. Existing production DB `ghm-db` is available and PostgreSQL 18, but its live schema/ledger/role/ACL/recovery readiness was not inspected in this Render-only task.
4. Current exact environment variable/secret values are not exposed by the read-only connector methods discovered; do not infer them.
5. Consequently no migration batch is safe to approve and the manifest remains `[]`. The next engineering action should be source/CI investigation of the failed startup's required Gateway configuration and service contract, without creating/deploying a service or changing Render settings. Production remains fail-closed; no attempt was made to bypass the Gateway requirement.

### PR/branch state at handover update

PR #298 remains open, draft and unmerged. The live PR read reported head `a2a25da6e91177144b7f60dd22c88daa9c72f5be`, 267 commits, 32 changed files, mergeable=true. PR #300 remains a separate draft and was not changed. The manifest remains `[]`.

### Change boundary

Read-only Render workspace/service/Postgres/Key Value inventory, service detail, deployment history, events and logs only; followed by this GitHub handover documentation update. No Render configuration, service, environment variable, deployment, database, backup, role, ACL, migration, branch/PR state, paid plan, or PayFast state was changed. No new paid resource was added.


## 20 November 2026 — Actor Gateway environment contract and Free-plan deployment readiness

Before this task I re-read the current migration-batches handover, hosting/credentials handover, production runtime deployment blockers, production role/service map, 50-migration dependency matrix, PR #298/#300/#299 and the open PR list, plus Actor Gateway and Resource API branches/source. No branch switch, merge, rebase, PR edit, Render mutation or database operation occurred.

### PR and branch state at review start

- PR #298: open/draft/unmerged, head `830fd1b9c4b484368b2bb4b05eba527a09dd7a8b`, 268 commits, 32 files, mergeable=true.
- PR #300: open/draft/unmerged, head `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`, isolated `feat/signed-business-capability-create`; PR body records CI #5449 passed.
- PR #299, #297, #296, #286 and #285 remain separate open drafts; no PR was changed.
- The intended single-service Free Render lifecycle is recorded in the hosting handover: one `ghm-actor-gateway` Web Service, owner-filled form remains unsubmitted, later upgrade that same service in place. This supersedes older hosting text that says Free is not acceptable or insists on paid compute initially.
- Production batch manifest remains `[]`.

### Source contract document added

Added `docs/security/ACTOR_GATEWAY_RENDER_ENVIRONMENT_CONTRACT_2026-11-20.md` (commit `f33112a6d0e5e29f984f66dd010c243588368b38`).

It records the exact Node Web Service build/start/health/port contract; required Actor Gateway environment variable names; optional paired previous ES256 key rotation values; the public-key-only boundary (no JWT private key in Gateway); separate Resource API runtime URL and storage provider attestation secret; what is confirmed versus still unverified; Free cold-start limits; safe deployment sequencing; and the PR #300 branch boundary.

### Confirmed source-level findings

Actor Gateway `main` source:
- Start command is `npm run start:actor-gateway`, invoking `node dist/actor-gateway/server.js`.
- Build requires dev type packages: `npm ci --include=dev && npm run build`.
- Health endpoint is `/healthz`; Render supplies `PORT` (source fallback 10000).
- Required environment values are `GHM_ACTOR_GATEWAY_DATABASE_URL`, `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`, `GHM_JWT_ES256_PUBLIC_KEY_PEM`, `GHM_JWT_ES256_KID`, and production `DATABASE_SSL_MODE=internal` for the same-region Render private DB URL. `NODE_ENV=production` is the expected production setting.
- Optional previous ES256 public key and KID must be supplied together; Gateway uses public verification keys only and must not receive `GHM_JWT_ES256_PRIVATE_KEY_PEM`.
- Optional commercial switches are not required for free directory operation and remain disabled.
- Gateway startup asserts `session_user=current_user=ghm_actor_gateway`, restricted role attributes/membership shape, and exact schema/function/table/sequence privileges before listening.
- Gateway PostgreSQL connection timeout is 5 seconds.

Resource API `main` source has a separate contract:
- Production requires `GHM_RUNTIME_DATABASE_URL` and `DATABASE_SSL=true`.
- `GHM_ACTOR_GATEWAY_URL` must be a credential-free HTTPS origin, configured only after a real Gateway endpoint exists and is qualified.
- Production storage also requires the separate `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET`; do not reuse the Gateway capability assertion secret.
- The 15 Nov Render failed-start log is consistent with the intentional fail-closed check: storage was configured but the candidate process did not receive a usable Gateway URL.

### Important unresolved provisioning boundary

The owner confirmed on 18 Nov that the internal Render `ghm-db` URL with username changed to `ghm_actor_gateway` was staged in the unsubmitted service form. The form masks values. Neither the password nor the exact connection string, SSL mode, JWT public key/KID or assertion secret has been inspected or validated. Do not infer validity from the fact the form field was filled.

The last recorded live production catalogue evidence says `ghm_actor_gateway` lacks `ghm` schema USAGE and no Gateway functions were installed. Therefore the service would fail its intentional startup ACL assertion even if the staged environment fields were valid. The exact live ledger, fresh recoverable backup and provider-authorized role/migrator authority resolution remain blockers.

### Free-plan cold-start and retry safety

The owner selected Free for the one service, with later in-place upgrade; this is the accepted hosting/cost lifecycle. Source review confirms Resource API Gateway clients use a 5,000 ms AbortController timeout and the Gateway DB pool also uses 5,000 ms connection timeout. Render Free may sleep/wake beyond that. The inspected clients do not implement automatic retries.

Do not add blanket retries for mutations. A timed-out response may follow a committed DB transaction; a new attempt gets a new signed nonce and is not necessarily idempotent. The inspected Business Capability create API has no general idempotency key. Qualify measured cold-start latency, operation-specific idempotency and caller recovery before early-access traffic. Until then retain fail-closed timeout/503 behaviour; do not bypass Gateway or route back to direct runtime SQL. No timeout/retry code was changed.

### PR #300 integration boundary

The signed Business Capability create endpoint, its Resource API client wiring and manual-only privilege cutover are in separate draft PR #300, not current `main`. CI #5449 is recorded as passed against disposable PostgreSQL 18 in the PR body. Do not claim the current production/main Actor Gateway contains this route, and do not deploy PR #300 branch as a shortcut. It needs deliberate integration, exact-head CI and the full production migration/backup/ACL gates. PR #300 remains untouched and separate from #298.

### Disposition and change boundary

No deployment-ready configuration can be certified. Keep owner form unsubmitted, Render auto-deploy OFF, production migration manifest `[]`, PR #298/#300 draft/unmerged, and PayFast paused. No production database, migration, ledger, role, membership, ACL, credential, secret, Render service, environment variable, deployment, plan, paid resource, route, retry or timeout setting changed. Only GitHub source/PR/branch/handover reads and this documentation update were performed.


## 20 November 2026 — correction: Render secret fields are populated, intentionally masked

The owner corrected the previous assistant interpretation of the shared `ghm-actor-gateway` Render creation form. The masked values are populated; they are not empty:

- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`: populated, deliberately kept secret.
- `GHM_JWT_ES256_PUBLIC_KEY_PEM`: populated; owner copied it from the existing GHM-Internal-Runtime environment.
- `GHM_JWT_ES256_KID`: populated; owner copied it from the existing GHM-Internal-Runtime environment.
- `GHM_ACTOR_GATEWAY_DATABASE_URL`: already entered using the existing internal `ghm-db` connection URL and the dedicated `ghm_actor_gateway` username, as previously recorded.
- The service is still not created or deployed. The form has not been submitted; auto-deploy is OFF; selected compute remains Free ($0/month).

This correction supersedes any wording in this handover/environment contract implying that the three masked secret/key fields are empty or not entered. Presence and owner-reported provenance are known. The assistant has not inspected secret values. Cryptographic validity, exact PEM encoding, key/KID correspondence, assertion-secret encoding/length and successful DB authentication/ACL startup remain untested; do not overstate them as verified.

**Workflow correction:** the environment-entry task is complete. Do not send the owner back through the same variable-entry checklist. Resume from the next genuinely unfinished code/qualification item, first reusing the current handover, open PRs, branch comparison and existing CI evidence. Do not repeat completed checks absent new evidence or a specific failing result.

### Repository state at this correction

- PR #298: open, draft, unmerged; its branch is `feat/actor-gateway-production-migration-batches`.
- PR #300: separate, open, draft, unmerged; do not mix its Business Capability create branch into PR #298 without deliberate integration.
- Branch comparison performed against current `main` (`ddb31ff59ab470973edf60a5078a75e5f962f803)): PR #298 branch is 270 commits ahead and 0 behind; comparison reports 32 changed files. This is ancestry/diff metadata, not merge approval.
- Production migration batch manifest remains `[]`.
- PayFast remains paused.
- No Render submission/deployment, production DB change, secret access/change, paid resource, merge, rebase, or force-push occurred in this correction.


## 20 November 2026 — implementation: reject incomplete signed Gateway cutover batches

### Pre-task repository review

Before this task, the current migration handover and environment contract were read; PR #298, PR #300 and adjacent migration PR #297 were inspected. PR #298 remained open/draft/unmerged, PR #300 remained separate/open/draft/unmerged, and the migration-batches branch was 270 commits ahead / 0 behind main before this implementation. PR #298 had no submitted review records or unresolved inline review threads. The exact current handover recorded the two ordering hazards below.

### Defect addressed

The dependency matrix already identified that:
- `20261110260000_gateway_supplier_classification_cutover` revokes the legacy runtime path before signed replacement `20261111030000_bind_supplier_gateway_actor_to_signed_assertion`.
- `20261110270000_gateway_business_profile_update` revokes the legacy runtime path before signed replacement `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion`.

The production batch selector enforced exact contiguous prefixes, but did not itself reject a selected prefix that ended after one of these revocations and before its signed replacement. That left an avoidable gap between the documented hazard and the executable batch guard.

### Implementation committed

- `8e8c68fecd96d5b9d62c085c22303ba49f845408` — added explicit signed-cutover dependency guard in `src/db/migration-batches.ts`; batch selection now rejects either runtime revocation unless its corresponding signed replacement is already applied or included in the same selected batch.
- `980df6af660ce8a771ef947253ee1bbcb24e6ea2` — added tests for supplier and Business Profile incomplete cutovers and completed cutover behavior.
- `296df2b3f0efceeee6915a1e7f194e79dde5cee8` — corrected the applied-cutover negative test to exercise the dependency assertion directly.

The rule does not authorize a production batch or change the pending inventory. The production manifest remains exactly `[]`. It does not redesign migration ordering; it makes the current unsafe intermediate state unselectable through the reviewed batch selector.

### Qualification and safety status

- CI run #5465 was observed in progress for the preceding handover-only head `a145f27a...`; it is not evidence for these implementation commits.
- The new source/tests have been pushed to PR #298 branch. Exact-head CI for `296df2b3...` has not yet been observed; do not claim tests passed until that run completes.
- No production SQL, role/ACL, migration ledger, Render service/form, environment variable, secret, deployment, payment state, schedule, or paid resource was changed.
- PR #298 remains draft/unmerged. PR #300 remains separate and untouched.

### Next task

Check exact-head CI for `296df2b3...`. If it fails, inspect the failing job and fix only the demonstrated defect. If it passes, continue to the next source-level production migration safety gap identified by the dependency review; do not return to repeated environment-variable or database-readiness checklists absent new evidence.


## 20 November 2026 — first Actor Gateway Render deployment: startup rejected PORT

The owner created and manually deployed the Free `ghm-actor-gateway` Render Web Service from `main` at commit `ddb31ff59ab470973edf60a5078a75e5f962f803`. Render completed dependency installation and `npm run build` successfully, then ran `npm run start:actor-gateway`. The process exited with status 1 before listening; Render restarted the instance and reported:

`Error: PORT must be a valid TCP port`

at `dist/actor-gateway/server.js:41`. The build itself passed and the failure is specifically in startup port parsing.

### Source-level diagnosis

At the deployed commit, `src/actor-gateway/server.ts` computes:

```ts
const port = Number.parseInt(process.env.PORT ?? '10000', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}
```

Therefore an absent `PORT` would use the valid fallback `10000`; the observed exception means the process received a non-empty/unusable value (or a value outside the valid TCP port range), rather than simply having no PORT variable. The Render service form described PORT as Render-managed. The immediate low-risk corrective action is to remove any manually-created `PORT` environment-variable override, if one exists, and allow Render to inject its runtime port. Do not enter the literal text `Render-managed` as a PORT value. If there is no custom override, obtain the actual non-secret PORT value from the service environment/runtime and diagnose that value; do not change database credentials or other secrets.

### Deployment and safety boundary

- Build: successful.
- Startup: failed on PORT validation; no healthy Gateway listener was established.
- No evidence from this failure establishes whether database authentication or the subsequent Gateway database identity/ACL assertions pass; execution stopped before those checks.
- No production migration, SQL, role/ACL, secret, existing Resource API configuration, payment state or paid resource was changed by this diagnosis.
- Auto-deploy remains OFF. The owner initiated the deployment manually.
- PR #298 remains open/draft/unmerged; PR #300 remains a separate open/draft/unmerged branch; PR #297 remains separate/open/draft. No PR was merged or rebased.
- This incident review was based on the Render logs supplied by the owner and the exact deployed `main` source. The next action is to correct only the PORT override (if present) and manually redeploy the same service, then diagnose the next actual startup result. Do not restart the pre-deployment qualification checklist or repeat environment-secret entry.

## 20 November 2026 — repeated Render PORT failure log review

The owner supplied the subsequent Render application-log excerpt (09:27–09:28 PM). It repeats the same startup exception at `dist/actor-gateway/server.js:41`: `PORT must be a valid TCP port`. The build again completed successfully. The excerpt contains no environment dump or numeric PORT value; the “Build not found” panel message is a missing/deleted build-details page and provides no runtime environment evidence.

Re-read the exact `main` source and the Render environment contract. The source uses `Number.parseInt(process.env.PORT ?? '10000', 10)`, so the local machine's PORT value cannot establish the value injected into the separate Render process. Local inspection can confirm only the local shell/user/machine setting. The deployed failure remains consistent with a non-empty malformed/empty or out-of-range Render PORT override, but the actual Render value is not yet known.

No source change or redeploy was made in this review. Do not change database credentials, JWT material, assertion secret, or other service variables based on this log. The next useful evidence is the local PORT-only read (to distinguish local configuration from Render) and, separately, inspection of whether the Render service has a manually-created PORT row. If present, remove that entire override so Render can inject its own value; if absent, do not invent a setting and obtain the runtime value through a temporary secret-safe diagnostic. Auto-deploy remains OFF; any retry is manual only.

PR #298 remains open/draft/unmerged at the reviewed head; PR #300 and #297 remain separate open/draft/unmerged PRs. No production database, migration, SQL, role/ACL, secrets, paid resources, or other Render configuration changed.

## 20 November 2026 — second Actor Gateway Render startup failure after PORT override removal

The owner confirmed that a manually-created PORT environment variable had been added because an earlier assistant example listed it. The assistant accepted responsibility for that misleading instruction. The owner deleted the manually-created PORT row and manually redeployed the same Free Frankfurt service; no other environment variable was intentionally changed.

### Observed deployment

- Render service: ghm-actor-gateway, service ID srv-dc09scl9el5s73fdgj1g.
- Deployment: dep-dc0a1t6tlv9c739kgmbg, 20 November 2026, source commit ddb31ff59ab470973edf60a5078a75e5f962f803 (main).
- Environment update triggered the deploy; build completed successfully with npm ci --include=dev && npm run build.
- The process started with npm run start:actor-gateway, then exited status 1.
- The prior explicit PORT must be a valid TCP port error is no longer present.
- Current application log only reports {"event":"actor_gateway_startup_failed","error":{"name":"Error"}}; it does not include the safe error message or failure stage.
- Render's Build not found panel is not a runtime diagnostic and does not explain the startup exit.
- Owner's local PowerShell check returned PORT=[]; this is only the local Windows environment and is independent of Render's injected runtime port.

### Source and prerequisite review

Re-read exact deployed main source src/actor-gateway/server.ts (blob 2ed8e9ffa36ead9eeb9a091f4b7061ae78ee6ceb) and its database guards:

1. The process reads required configuration and constructs the PostgreSQL pool.
2. start() first queries the connected database identity and calls assertActorGatewayDatabaseIdentity.
3. It next reads the live privilege matrix and calls assertActorGatewayDatabasePrivileges.
4. Only after both database assertions pass does it call server.listen(port).

The startup catch deliberately logs only the JavaScript error name, so the supplied logs cannot distinguish a connection error, identity-assertion failure, or privilege-assertion failure. Do not claim a specific runtime failure without a safe diagnostic.

The latest recorded production catalogue evidence in the existing Render environment contract says ghm_actor_gateway had no ghm schema USAGE and no Gateway functions installed. The privilege assertion explicitly requires schema USAGE and an exact Gateway function allowlist, among other restrictions. In the absence of any subsequently authorized production migration/ACL change, this is a known unresolved prerequisite and a likely reason the service cannot yet become healthy after the PORT issue is removed. This remains a hypothesis about the current failed process until the live assertion output is safely identified.

### Safety and next action

- Do not add PORT again; Render supplies it.
- Do not change any other Render variable, reveal/re-enter masked secrets, alter DB credentials, run production SQL, manually grant schema/function privileges, or change production roles/ACLs.
- PR #298 remains open/draft/unmerged at fdb2d6b58ac83f37f48e483869134e6882182571; its production migration manifest remains empty. PR #300 remains separate/open/draft at 6ea0df0610441a54e0f5f55b51a9ca5f13dc4700; PR #297 remains separate/open/draft at 304da520c5cfe1e77b479a97dfdd9d951fa6e245. No PR was merged or rebased.
- Render service details confirm auto-deploy remains OFF, plan Free, Frankfurt, one instance, branch main.
- No production DB, migration ledger, SQL, role/ACL, secret, payment state, or paid resource was changed during this diagnosis.
- Next diagnostic should be a narrowly-scoped source change on the appropriate review branch that reports a safe startup stage and stable error classification (and only non-secret assertion failure identifiers), rather than logging raw connection details or environment values. Qualify exact-head CI, then deploy only through the existing manual-deploy process once the source change is deliberately integrated. Alternatively, resolve the already-known DB prerequisites through the reviewed migration path; do not bypass the production migration/backup gates.
## 20 November 2026 — safe Actor Gateway startup-stage diagnostics proposed in separate PR #301

After the owner removed the manually-created Render PORT override, the Actor Gateway build succeeded but the process still exited with a generic startup error containing only the JavaScript error name. Re-inspected PRs #298, #300 and #297, the actor-gateway branches, exact main server source, and this handover before making the diagnostic change.

Created isolated branch fix/actor-gateway-startup-diagnostics-20261120 from main and draft PR #301: https://github.com/zaidhqdev-sys/GHM/pull/301

Exact source change at fdde8587160c388ce27b1a00133eb3b5acc6d3df modifies only src/actor-gateway/server.ts. It tracks startup stage and logs a stable category for database identity query/connection, identity assertion, privilege query, privilege assertion, or HTTP listener failure. It retains error-name-only reporting and does not log raw error messages, SQL, connection strings, environment values, or secrets.

PR #301 is draft and unmerged. No source change has been deployed to Render. Exact-head workflow-run lookup and combined commit-status lookup returned no runs/statuses at the time of this handover update; validation is therefore pending, not passed. Do not manually deploy until exact-head CI is observed and passes.

PR #298 remains draft/unmerged at 85f9fd3716cfac9ee643901bc5181c69cf7aeb8e. PR #300 remains separate/draft at 6ea0df0610441a54e0f5f55b51a9ca5f13dc4700. PR #297 remains separate/draft at 304da520c5cfe1e77b479a97dfdd9d951fa6e245. PR #301 does not merge or modify any of them.

No production database, migration, SQL, role, ACL, credential, secret, Render environment variable, service configuration, payment state, or paid resource was changed. The manually-created PORT override remains removed; Render auto-deploy remains OFF.
## 20 November 2026 — PR #301 exact-head validation started; uncaught-handler typing corrected

Continued the startup diagnostics task after re-reading PRs #301, #298, #300 and #297, the actor-gateway branch list, and the current PR #301 source. PR #301 remains isolated from all migration and feature branches.

Review of the first diagnostic commit found that safeErrorDetails had gained a required stage argument while the uncaughtException and unhandledRejection handlers still called it with one argument. Corrected this by defaulting the helper stage to the current startupStage, preserving safe error output and ensuring those handlers type-check. The correction is included in exact head bb05a23524689070ded3b633d6d46da310bda001 (second commit bb05a23524689070ded3b633d6d46da310bda001; initial commit fdde8587160c388ce27b1a00133eb3b5acc6d3df). Only src/actor-gateway/server.ts is changed in PR #301.

Queried GitHub's exact-head check-runs endpoint for bb05a23524689070ded3b633d6d46da310bda001. At the latest observation: quality queued; web-quality in progress; Cloudflare Pages in progress. No conclusions have completed; validation remains pending. Run/check URL: https://github.com/zaidhqdev-sys/GHM/actions/runs/44804463550

PR #301 remains draft/open/unmerged and must not be deployed until quality and web-quality pass; Cloudflare Pages is also still running. No merge, Render deploy, production SQL, database/role/ACL change, migration, secret/environment change, or payment-state change was made. PR #298, #300 and #297 remain separate.
### PR #301 validation status refresh — 20 November 2026

At the latest exact-head check-runs refresh for bb05a23524689070ded3b633d6d46da310bda001:
- web-quality: completed successfully.
- Cloudflare Pages: completed successfully.
- quality: still in progress. Its job had completed setup, dependency installation, and the initial PostgreSQL role qualification; it was working through the full quality pipeline. No conclusion was available yet.
- Exact-head workflow run: https://github.com/zaidhqdev-sys/GHM/actions/runs/44804463550

Do not treat PR #301 as fully validated until quality completes successfully. No Render deploy or merge has been initiated.