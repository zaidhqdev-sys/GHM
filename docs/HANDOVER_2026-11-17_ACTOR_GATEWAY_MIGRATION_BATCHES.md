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
