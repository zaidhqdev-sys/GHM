
Downloaded and inspected the `ghm-test-suite-diagnostics` artifact. The sole failure was `includes the signed Business Capability create wrapper in the exact Gateway executable allow-list`. Its regex was over-escaped and searched for literal backslashes, while the SQL correctly contained ordinary dots and parentheses. This is a test matcher defect, not a SQL permission or migration failure.

Corrected the regex to match the exact SQL signature. No SQL, ACL, migration, production DB, secret, deployment, paid resource or PR #298 change. PR #300 remains draft/unmerged.

Next CI must pass the complete test suite and then run the dedicated signed Business Capability PostgreSQL qualification. The matcher correction is not yet CI-validated.


## CI #5419 — all 1,081 unit tests pass; Business Capability lifecycle qualification passes; unrelated catalogue qualification blocks signed-create cutover test — 2026-11-20

Re-read this handover, PR #300, PR #298 and the feature branch before inspecting run #5419 (ID `44679651001`, commit `9d7985944aba0f811accb616769211c131db8dd2`).

Confirmed:
- `web-quality`: PASS.
- Build, all migrations on disposable PostgreSQL 18, isolated Auth Issuer and Actor Gateway principals, Actor Gateway worker smoke, Argon2 compatibility and storage provider qualification: PASS.
- Node test suite: `1,081 passed, 0 failed`. This includes the corrected signed Business Capability allowlist matcher and the complete 28-operation assertion allowlist static contract.
- Campaign/directory-review signed Actor Gateway PostgreSQL qualification: PASS.
- Business Capability lifecycle and two-session assertion replacement qualification: PASS. The log explicitly reports `GHM BUSINESS CAPABILITY LIFECYCLE RUNTIME QUALIFICATION: PASS`, including runtime INSERT/UPDATE/DELETE denial checks and assertion replacement serialization.
- The next existing step, `qualify:capability-catalogue-governance`, failed and caused later cutover steps to be skipped, including `Qualify Business Capability signed gateway cutover on disposable PostgreSQL`.

Exact unrelated failure: the existing capability catalogue governance script successfully passed Gateway admin list, signed assertion anti-forgery/replay/context binding, admin draft creation and role separation. It then attempted `CapabilityServiceImpl.createDraft(admin, ...)` using the runtime repository pool; PostgreSQL rejected `ghm.create_capability_draft` with SQLSTATE 42501 (`permission denied for function create_capability_draft`) at script line 148. This is the pre-existing system-admin Capability catalogue governance qualification, not the new Business Capability signed-create function. Do not weaken runtime ACLs or change the new Business Capability grants to work around it.

Current scope status:
- The new migration and wrapper have been applied successfully in CI's disposable PostgreSQL database (all migrations step passed).
- Static contract and all 1,081 tests pass.
- Business Capability lifecycle and two-session assertion replacement tests pass.
- The dedicated signed Business Capability Gateway cutover qualification has NOT run; its workflow step was skipped due to the preceding unrelated catalogue-governance failure.
- No full signed-create SQL/HMAC/ACL qualification pass is claimed.

No production or local DB changes, no deployment, no paid resources, no secret changes and no PR #298 modifications. PR #300 remains draft/unmerged.

Next task: inspect the provenance and intended DB principal for the capability catalogue governance script and its migrations/PRs. Determine whether the script's use of the runtime pool is stale relative to the current Gateway-only draft-create contract. Correct only that qualification setup if supported by the repository history and migration ACLs; never grant runtime EXECUTE or weaken least privilege merely to make CI green. Then rerun CI and reach the dedicated Business Capability signed Gateway cutover test.

## Capability catalogue governance qualification provenance — stale runtime calls confirmed — 2026-11-20

Before this investigation, re-read the current signed Business Capability handover, fetched PR #300 and PR #298 metadata, checked the feature branch, inspected PR #272's original unified Gateway qualification description, and reviewed the current CI workflow and package scripts.

Current repository state:
- PR #300 is open, draft, unmerged, based on `main`; its head at inspection is `fade8eef23461a4b0aab8d15171039ce2df8e352`.
- PR #298 is a separate open draft for production migration batching; its execution manifest remains empty. It was not modified.
- Feature branch `feat/signed-business-capability-create` exists.
- CI run #5420 (ID `44680044289`) has completed with `web-quality` passing and `quality` failing at step 51, “Qualify system-admin Capability catalogue governance on disposable PostgreSQL”. Steps 52–53 were skipped, including the dedicated Business Capability signed Gateway cutover qualification.

Inspected exact files at PR #300 head:
- `scripts/qualify-capability-catalogue-governance.mjs`
- `src/resources/capability/repository.ts`
- `database/migrations/20261117020000_revoke_runtime_capability_governance.sql`
- `.github/workflows/ci.yml`
- `package.json`

Proven cause:
1. Migration `20261117020000_revoke_runtime_capability_governance.sql` requires the signed Gateway verifier and all four signed capability operations to exist, then revokes EXECUTE on the legacy caller-supplied account-ID functions `ghm.create_capability_draft`, `ghm.update_capability_draft`, and `ghm.transition_capability_lifecycle` from PUBLIC, `ghm_runtime`, and `ghm_actor_gateway`. It explicitly verifies no direct EXECUTE remains for runtime/Gateway or other non-owner grantees.
2. The CI workflow applies all repository migrations at step 29, before running the isolated principal checks and before the catalogue governance qualification at step 51.
3. The existing `scripts/qualify-capability-catalogue-governance.mjs` correctly uses signed Gateway calls for initial draft create, update and transition, but then repeatedly invokes `CapabilityServiceImpl.createDraft/updateDraft/transition` through a `PgCapabilityRepository(runtimePool)` for positive catalogue governance operations. The repository methods call the now-revoked legacy functions directly. The first stale positive call is `service.createDraft(admin, ...)` after the Gateway draft-create check; it fails with SQLSTATE 42501, “permission denied for function create_capability_draft”.
4. The script's final privilege assertion is also stale: it currently requires runtime EXECUTE on the three legacy governance functions (`p.can_create`, `p.can_update_draft`, `p.can_transition`) to be true, directly contradicting the migration's intended post-cutover state. Its surrounding assertion already expects no direct table INSERT/UPDATE/DELETE and no Gateway wrapper execution for runtime.
5. The migration's comments explicitly describe this as a post-deployment cutover after signed Gateway end-to-end verification. CI's automatic application of all migrations means the disposable CI catalogue qualification must test the post-migration Gateway-only state, not the pre-cutover Resource API runtime path.

This is an existing qualification-script/workflow-state mismatch, not a reason to restore runtime EXECUTE, alter the migration's revocations, or weaken least privilege. No code/migration/ACL change was made during this investigation.

Next task: refactor the catalogue qualification harness so all positive system-admin create/update/transition paths use the existing signed Gateway wrappers and test-only HMAC assertions. Preserve non-admin service-role denial as an application-level test only where it does not invoke revoked SQL; change direct runtime legacy-function probes to expect permission denied; and change final privilege assertions to require all three legacy EXECUTE checks false while signed Gateway wrapper EXECUTE remains available only to `ghm_actor_gateway`. Add focused regression assertions for this post-migration contract. Do not change the production migration, grant runtime privileges, deploy, provision services, or modify PR #298. Then run normal PR CI and verify the catalogue step passes before interpreting the dedicated Business Capability signed-create qualification result.


## Capability catalogue qualification refactored to signed Gateway — pending CI — 2026-11-20

Before changing files, re-read the current feature handover, PR #300, PR #298 and PR #272 context; verified the feature branch; fetched the exact current catalogue qualification script, Capability repository/service, and migration 20261117020000_revoke_runtime_capability_governance.sql.

Implemented in commit a849566bf31bf36c4af6d414e9988088d36fa973:
- Added qualification-only row mapping for Gateway-returned catalogue records and helpers that sign the exact capability create/update/transition context using the existing test-only HMAC key.
- Replaced positive admin catalogue draft creation, update and lifecycle transitions in the PostgreSQL qualification script with signed Gateway wrapper calls. This covers substitution-target and replacement drafts, hierarchy parent/child setup, activation, deprecation, reactivation and retirement.
- Preserved the service-level non-admin read denial check (which rejects before reaching the database).
- Changed direct runtime legacy create-function probes to expect PostgreSQL permission denial, consistent with the migration's revoked EXECUTE contract.
- Changed runtime privilege expectations so legacy create/update/transition and signed Gateway wrappers are all non-executable by the runtime principal, while the separate Gateway connection must have EXECUTE on the four signed Gateway operations and must not have EXECUTE on the three legacy functions.
- No production migration, application service/repository implementation, database ACL, secret, deployment, paid service, or PR #298 change was made.

Important validation boundary:
- The refactor has been committed but has NOT yet been executed by CI or against PostgreSQL.
- No claim is made that the revised catalogue qualification passes, nor that the dedicated Business Capability signed-create qualification has run.
- Next: inspect CI triggered by commit a849566bf31bf36c4af6d414e9988088d36fa973; if the catalogue step passes, inspect the subsequent legacy capability cutover and dedicated Business Capability signed Gateway cutover steps. Fix only failures supported by logs. Confirm the signed-create test's full PostgreSQL/HMAC/ACL result before marking qualification complete.

PR #300 remains draft/unmerged. PR #298 remains separate and untouched. No production/local DB changes, deployments, paid resources, or secret changes.


## CI rerun state after catalogue qualification refactor — 2026-11-20

Re-read this handover, fetched PR #300 and PR #298, verified the feature branch, and inspected the latest CI job details and workflow trigger configuration.

- PR #300 remains open, draft, unmerged. Its current head at inspection is `45007ea9aa131b88f2cd072f72804823e4cac71` (the catalogue harness code commit is `a849566bf31bf36c4af6d414e9988088d36fa973`; the later head commit only appends this handover).
- PR #298 remains a separate draft and was not changed.
- CI run #5422 (ID `44680567186`) was cancelled in the `quality` job during step 26 `Build`. Steps 29 onward, including migrations and every PostgreSQL qualification, were skipped. `web-quality` passed. Therefore run #5422 provides no result for the revised catalogue harness.
- The workflow uses `concurrency.cancel-in-progress: true`; its `pull_request` trigger targets PRs into `main` and ignores Markdown/docs-only changes. The handover-only commit does not itself provide a new qualification result. No manual workflow dispatch or rerun was initiated.
- Confirmed the code change is present at the current PR head. Static review of the helper's parameter shifting shows it inserts the assertion context/signature parameters into the five-argument Gateway prefix and expands the create/update/transition calls to their expected full arity; nevertheless, only CI/PostgreSQL execution can establish runtime correctness.
- The catalogue refactor has not yet passed a PostgreSQL run. The dedicated Business Capability signed Gateway qualification remains unexecuted.

Next: wait for or inspect a normal PR-triggered CI run on the current feature head. Do not treat cancelled run #5422 as a test failure or pass. If no run appears, inspect the PR check state and use only an ordinary source change that is genuinely needed; do not dispatch a workflow manually. Continue through the catalogue qualification, legacy capability cutover and dedicated Business Capability signed Gateway cutover in workflow order.

No production/local DB changes, deployment, paid resources, database grants, secrets, or PR #298 modifications.


## CI #5424 diagnosis and qualification harness helper-shadowing fix — 2026-11-20

Before this task, re-read the feature handover and re-fetched PR #300, PR #298, PR #272, the feature branch and CI run associated with the current PR head. PR #300 is still open/draft/unmerged; PR #298 remains separate/untouched; the feature branch is `feat/signed-business-capability-create`.

Inspected CI run #5424 (ID `44680844246`) and its `quality` job logs/artifacts. `web-quality` passed. Build, migrations on ephemeral PostgreSQL 18, principal qualification, all 1,081 tests, Campaign/directory-review signed Gateway qualification, and Business Capability lifecycle/two-session assertion replacement qualification passed. The catalogue qualification reached the signed Gateway create/update/transition success checks and the legacy runtime permission-denial probes. It then failed at `scripts/qualify-capability-catalogue-governance.mjs:298` with `TypeError: gatewayTransition is not a function`.

Exact cause: the helper function `gatewayTransition` declared near line 77 was shadowed later in the same outer scope by `const gatewayTransition = await gatewayCall(...)` in the earlier single-transition positive test. Subsequent lifecycle cases then attempted to call the query result object as a function. This is a JavaScript qualification-script naming defect, not an SQL/ACL failure. The script had already logged `GATEWAY ADMIN DRAFT UPDATE POSITIVE PASS`, `GATEWAY ADMIN LIFECYCLE TRANSITION POSITIVE PASS`, `ADMIN DRAFT CREATE + SERVER AUTHORITY PASS`, `SERVICE NON-ADMIN DRAFT DENIAL PASS`, and both legacy runtime create denial probes as passing before the exception.

Fix committed: `263dc10d6f28fbaf760df2aef7605b08148ea17b` renames the local query result to `gatewayTransitionResult`, preserving the reusable helper name and behavior. No migration, SQL function, production ACL, service implementation, secret, database, deployment or paid resource changed.

This commit is code-only; the handover update is being recorded separately. No CI result exists yet for this fix. Next inspect the normal PR-triggered run for commit `263dc10d6f28fbaf760df2aef7605b08148ea17b`. If the catalogue qualification now passes, continue to steps 52–53, specifically the legacy capability RPC cutover and dedicated Business Capability signed Gateway cutover. Do not treat #5424 as a signed-create pass: steps 52 and 53 were skipped.

No production or local database changes, no deployment, no paid resources, no new secrets, and no PR #298 modifications.


## CI #5426 reaches signed Business Capability qualification; fixture lifecycle corrected — 2026-11-20

Before this task, re-read the signed Business Capability handover, fetched PR #300, PR #298 and PR #272, verified `feat/signed-business-capability-create`, and inspected CI #5426 (run ID `44773030571`) and its full quality job logs.

CI #5426 results:
- `web-quality`: PASS.
- Build, PostgreSQL 18 migration application, isolated principals, full 1,081-test suite: PASS.
- Campaign/directory-review signed Gateway qualification: PASS.
- Business Capability lifecycle/two-session assertion replacement: PASS.
- Capability catalogue governance: PASS after signed Gateway refactor and helper-shadowing correction.
- Capability legacy RPC cutover/Gateway-only access: PASS.
- Dedicated Business Capability signed Gateway cutover was reached but failed during fixture setup, before any signed-create assertion ran.

Exact failure: `scripts/qualify-business-capability-gateway-cutover-postgres.mjs` inserted a catalogue fixture with `lifecycle_status='inactive'` and `is_selectable=true`. PostgreSQL rejected it with SQLSTATE 23514, constraint `capability_lifecycle_valid`. This is invalid fixture data; it is not a failure of the new signed create function. The qualification has not yet executed its HMAC, replay, expiry, business membership, selectable catalogue, duplicate, payload, or wrapper ACL assertions.

Corrective code commit: `123d90752d5fde9171f34e03a21eace6afb2db0a` changes only that fixture to a valid `deprecated` and `is_selectable=false` capability row. The fixture is intended to exercise the unavailable/non-selectable catalogue path; the function rejects both because it requires `lifecycle_status='active' AND is_selectable=true`. No production migration, ACL, business function, runtime role, production database, or paid resource changed.

Validation pending: the fix has not yet run in CI/PostgreSQL. Next inspect the normal PR-triggered CI run for this commit. If fixture setup proceeds, inspect every signed-create assertion and final privilege matrix, including cleanup. Do not claim signed-create qualification passed until the script prints `GHM BUSINESS CAPABILITY SIGNED GATEWAY CUTOVER QUALIFICATION: PASS` and the CI step itself succeeds.

PR #300 remains open/draft/unmerged. PR #298 remains separate and untouched. No production/local database changes, deployments, paid services, or new secrets.


## CI #5428 signed Business Capability cutover qualification diagnosis and harness correction — 2026-11-20

Before this task, re-read the feature handover and checked PR #300, PR #298, PR #272, the feature branch, and the latest PR CI run #5428 (ID `44775200388`). PR #300 remains draft/open/unmerged; PR #298 remains separate and untouched.

CI #5428:
- `web-quality`: PASS.
- Build, migrations, full test suite, other Actor Gateway qualifications, Business Capability lifecycle/two-session qualification, signed catalogue governance, and capability legacy RPC cutover: PASS.
- Dedicated `Qualify Business Capability signed gateway cutover on disposable PostgreSQL`: FAIL.

Inspected the exact qualification script and PostgreSQL logs. The script itself applies the two new append-only migrations (`20261120011000_allow_signed_business_capability_create_assertion.sql` and `20261120010000_add_signed_business_capability_create.sql`) even though the CI workflow has already applied every migration in the repository before any qualification steps. PostgreSQL log proves the failure: `function "gateway_create_business_capability" already exists with same argument types` during the second application. This is a qualification harness defect, not a failure of the signed-create SQL or authorization logic. The CI run did not reach the dedicated harness assertions because migration reapplication aborted the script.

Corrective commit `a08187c4eb46b98998dca3c6aa495b6bddf1af10` removes the duplicate migration application from the qualification script and replaces it with an explicit assertion log stating that the CI migration phase supplied the migrations. The script still applies the separate forward-only `database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql` because CI does not apply the cutovers directory as part of its migration loop; this is the intended isolated qualification of the cutover.

No SQL migration, function body, ACL, runtime grant, production DB, secret, deployment, paid resource or PR #298 change. The signed-create HMAC, replay, expiry, business membership, selectable catalogue, duplicate/withdrawn, actor provenance and direct-write-denial assertions remain unqualified pending CI run after this fix.

Next inspect the normal PR-triggered CI run for commit `a08187c4eb46b98998dca3c6aa495b6bddf1af10`. Verify it passes the existing migration phase and then executes the dedicated Business Capability qualification through its final `GHM BUSINESS CAPABILITY SIGNED GATEWAY CUTOVER QUALIFICATION: PASS` marker. If it fails again, diagnose exact logs before changing code. Do not manually dispatch CI or modify PR #298.


## CI #5430 — signed Business Capability PostgreSQL cutover qualification passed — 2026-11-20

Before this task, re-read this feature handover and checked PR #300, PR #298, PR #272, the feature branch and workflow runs associated with the current PR head. PR #300 remains open/draft/unmerged; PR #298 remains separate and untouched; branch `feat/signed-business-capability-create` remains the working branch.

CI run #5430 (ID `44775863369`, commit `18e1e137362352ea1164ecfb4a6f38c6661435b1`) progressed as follows:
- `web-quality`: PASS.
- `quality` step 51, system-admin Capability catalogue governance: PASS (workflow advanced beyond it).
- Step 52, Capability legacy RPC cutover and Gateway-only access: PASS (workflow advanced beyond it).
- Step 53, `Qualify Business Capability signed gateway cutover on disposable PostgreSQL`: PASS (workflow advanced to step 54, Saved Business signed Gateway cutover).
- The subsequent existing signed Gateway qualification steps continued through Saved Business, Business Hours, Trust Score, Business Logo, Business profile compatibility, and commercial settlement identity qualification; at the latest inspection step 60 was in progress. Overall `quality` job/run had not yet completed, so do not mark the entire CI run green until final status is checked.

This is the first successful execution of the dedicated Business Capability signed Gateway PostgreSQL qualification after the fixture and duplicate-migration harness corrections. The successful step progression establishes that the script completed and exited successfully; the previous skipped/failing state is resolved. Do not overstate this as a production deployment or production database qualification: it ran against CI's disposable PostgreSQL instance only.

The prior corrective commits in this sequence were `123d90752d5fde9171f34e03a21eace6afb2db0a` (valid deprecated/non-selectable catalogue fixture) and `a08187c4eb46b98998dca3c6aa495b6bddf1af10` (stop reapplying migrations already applied by CI). No production SQL, runtime ACL, production database, secrets, deployment, paid service or PR #298 changes were made in this task.

Next: inspect the final conclusion of CI #5430. If all jobs pass, record the full CI pass and proceed to review the PR diff/checks for merge readiness, but keep PR #300 draft/unmerged until all required evidence and owner-directed steps are complete. If any later CI step fails, isolate it from the already-passed Business Capability qualification and diagnose only that failure.
