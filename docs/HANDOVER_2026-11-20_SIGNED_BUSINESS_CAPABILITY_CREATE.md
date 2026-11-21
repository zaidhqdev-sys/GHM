
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


## Signed create application integration added after green SQL qualification — CI pending — 2026-11-20

Before this task, re-read this handover, checked PR #300, PR #298 and PR #272, verified `feat/signed-business-capability-create`, compared the feature branch against `main`, and inspected full CI run #5431 and the exact SQL/API/service files.

CI #5431 (run ID `44776342145`) completed successfully: both `web-quality` and `quality` passed. The dedicated signed Business Capability PostgreSQL qualification (step 53) passed, as did the following Saved Business, Business Hours, Trust Score, Business Logo, supplier classification, Business profile, commercial settlement identity, migration audit, runtime boundary, and isolated auth issuer cutover/inventory/evidence steps through step 69. This is CI disposable PostgreSQL evidence only.

The review identified an application integration gap: the SQL function was qualified but `POST /api/v1/business-capabilities` still called the Resource API repository's direct runtime INSERT; the Actor Gateway had no create method/route, and the signed-create migration deliberately did not revoke legacy runtime table/sequence grants. The route therefore was not yet using the new signed operation. PR #300's original body still says “adds signed Actor Gateway create” and “Gateway-only execute authority”, but the actual scope before this task did not wire that operation to the HTTP path.

Added the first application integration slice:
- `src/actor-gateway/business-capability-mutation-reader.ts`: added `create` to the reader contract and Postgres implementation, signs the `business.capability.create` context using the existing assertion secret, calls `ghm.gateway_create_business_capability`, and maps the returned row.
- `src/actor-gateway/app.ts`: added authenticated `POST /v1/business-capabilities`, strict payload allowlist/shape checks, verified actor ID from JWT locals, and fail-closed reader behavior.
- `src/http/capability-mutation-gateway-client.ts`: added the HTTP client create operation.
- `src/http/business-capability-router.ts`: when the Actor Gateway is configured or required, create now forwards the verified bearer token to Gateway and does not fall back to Resource API if Gateway is unavailable; non-production legacy behavior remains available only when Gateway is not configured/required.
- `src/actor-gateway/app.test.ts`: added Gateway endpoint tests for verified actor binding and invalid payload rejection.
- `src/http/business-capability-router.test.ts`: added route tests for forwarding bearer/input and fail-closed behavior when Gateway is required but unavailable.

Commits: `21bcfc108c403cc883ec7258b9e27c5b44fdcec1` (reader create), `d746ac74cc138cad4adc43280ca289a7b23971fd` (Gateway HTTP endpoint), `5ba95fb20e2eb72e2462dafa56d4264dcafe1544` (Resource API HTTP client), `6e35ca2f2990fe672f01b1d920e62ca019c2cb47` (Resource API create routing), `959fc83792df58860611f2fbd19cb7011330443a` (Resource API route tests), `b135bfa2792ca979fec907c3f06274e1580d8d13` (Gateway route tests).

CI runs #5432 and #5433 were cancelled due to newer commits arriving; they are not test failures and provide no validation. Normal CI run #5437 (ID `44777635823`) is currently in progress. No manual dispatch, production migration, production database change, ACL revocation, deployment, new paid service, or PR #298 modification.

Important remaining work: inspect CI #5437 through full completion. Review/extend the Gateway reader tests and SQL qualification for withdrawn duplicate, owner/admin positive authorization, explicit administrator membership positive path, and direct runtime INSERT/sequence denial for `ghm.business_capability` (the current dedicated script tests active/withdrawn duplicate and runtime denial for evidence, but does not assert the Business Capability table's legacy direct INSERT/sequence grants are revoked). The new migration currently leaves those runtime grants intact, and the separate evidence/replacement cutover does not revoke them. Do not claim Gateway-only create enforcement until a safe forward-only manual cutover migration revokes legacy runtime INSERT/sequence privileges and a separate qualification verifies runtime denial and Gateway create success. Keep any such cutover isolated and clearly guarded; do not apply to production. Preserve an intentional compatibility path only if the product owner explicitly decides not to cut over.

PR #300 remains draft/open/unmerged; PR #298 remains separate and untouched. Do not deploy or merge. No paid resources or production changes.


## Signed create Gateway wiring, direct-write cutover and build-fix follow-up — 2026-11-20

Re-read this handover, PR #300, PR #298, PR #272, feature branch and latest CI/job logs before continuing. PR #300 remains draft/open/unmerged; PR #298 remains separate/untouched.

### Application integration added
- Added `create(actor,input)` to `GatewayCapabilityMutationReader` and `PostgresGatewayCapabilityMutationReader`. It signs the exact canonical seven-field context with operation `business.capability.create`, calls `ghm.gateway_create_business_capability`, and maps the returned database row.
- Added authenticated Actor Gateway `POST /v1/business-capabilities`; actor identity comes only from the verified JWT local. Request fields are allowlisted and validated; no caller-supplied actor/created_by/lifecycle/verification fields accepted.
- Added `HttpCapabilityMutationGatewayClient.create` and routed Resource API `POST /api/v1/business-capabilities` through the Gateway whenever Gateway is configured or required. When required but missing/unavailable, it fails closed and does not fall back to the runtime repository. Legacy service route remains only for non-production mode where Gateway is not configured/required.
- Added Resource API route tests for bearer forwarding and fail-closed behavior; added Actor Gateway route tests for verified actor binding and invalid input; added reader HMAC/context/SQL invocation tests and included them in `npm test`.
- Corrected Gateway HTTP conflict mapping so duplicate create maps to HTTP 409.

### Direct runtime write bypass identified and closed in a guarded cutover artifact
The initial signed-create migration explicitly retained legacy runtime INSERT/sequence grants, so a working Gateway route alone did not establish Gateway-only create authority. Added `database/cutovers/20261120012000_revoke_legacy_business_capability_runtime_create.sql`, explicitly marked MANUAL CUTOVER ONLY and excluded from automatic migrations. It revokes direct INSERT on `ghm.business_capability` and USAGE/SELECT on its identity sequence from PUBLIC, `ghm_runtime`, `ghm_migrator`, and `ghm_actor_gateway`. The SECURITY DEFINER function owned by `ghm_schema_owner` remains the controlled create path.

Extended `scripts/qualify-business-capability-gateway-cutover-postgres.mjs` to apply this new cutover only in the guarded disposable PostgreSQL target and assert direct runtime INSERT denial, runtime sequence denial, Gateway direct INSERT denial, and a false table/sequence privilege matrix. The existing signed create wrapper path must still pass after these revocations. Extended the migration contract test to require this manual cutover contract.

No production cutover was run. The new manual cutover artifact must not be applied to Render production as part of this work. Its header lists required preconditions (deployed/qualified route, provisioned Gateway principal, resolved Render role model, fresh verified backup).

### CI diagnosis and correction
- Run #5431 (`44776342145`) passed both jobs and all steps through 69, including signed Business Capability create PostgreSQL qualification (step 53), other gateway cutovers and isolated Auth Issuer cutover/evidence.
- First application wiring CI run #5437 (`44777635823`) failed build due to two precise issues: duplicate `positiveId` declaration in `src/actor-gateway/app.ts`, and two existing typed mutation-reader test doubles missing the new `create` method. These were corrected in commits `f0663df6e42836abd942e9c99732b5f5f9cac2d9` and `b5381417b8b5b2a95c7312be4801870ef76ce0ff`.
- Added manual cutover and qualification in commits `7ac5813fd55357e5f0e722de4cc1da7a741d7442`, `33c78ea50e8c0e6181cb554a828d1b03c522d624`, and static contract test in `40eecefd1c1e7a64af05a74e2bda5696ba20ab68`.
- Added Gateway reader, endpoint, Resource API client/router and test commits: `21bcfc108c403cc883ec7258b9e27c5b44fdcec1`, `d746ac74cc138cad4adc43280ca289a7b23971fd`, `5ba95fb20e2eb72e2462dafa56d4264dcafe1544`, `6e35ca2f2990fe672f01b1d920e62ca019c2cb47`, `959fc83792df58860611f2fbd19cb7011330443a`, `b135bfa2792ca979fec907c3f06274e1580d8d13`, `b1012cfda68b0117ff6ce20e4b75280901c3e5e8`, `a131e2a645724b7ac12a437785ebc49a53bf31da`, and `2b5167a8d6cb1c04b750d12d15dadba1b0258d25`.
- CI run #5445 (ID `44778117399`) triggered for the corrected head and is in progress. It must validate build, tests, worker bundle, migrations and the full PostgreSQL qualification including the newly added direct-write cutover. No pass is claimed yet for the new application wiring or new direct-write cutover.

### Next tasks
1. Inspect CI #5445; diagnose any exact failure from logs.
2. Confirm the new `business-capability-mutation-reader.test.ts` is in the test command and passes.
3. Confirm full disposable PostgreSQL qualification passes after direct runtime INSERT and sequence revocation, including signed create HMAC/replay/expiry/tamper/membership/active+withdrawn duplicate and final privilege matrix.
4. Inspect route behavior and DTO mapping for HTTP 201/400/403/404/409/503; ensure no production fallback to Resource API.
5. Update PR #300 summary to accurately describe Gateway HTTP wiring and manual cutover boundary only after the code and CI are verified. Keep PR #300 draft/unmerged pending review and owner-directed next steps.

No production database changes, manual production cutover, deployment, new paid service, new database, secret rotation, workflow dispatch, PayFast work, or PR #298 changes.


## Follow-up: CI #5445 build diagnostics fixed; nullable date handling corrected — 2026-11-20

Re-read this handover, PR #300/PR #298/PR #272 context, current branch and exact latest CI logs before proceeding.

CI #5445 (run ID `44778117399`) confirmed `web-quality` passed and reached build. Its build failed with four TypeScript diagnostics:
1. Two existing typed `GatewayCapabilityMutationReader` test doubles in `src/actor-gateway/app.test.ts` lacked the newly required `create` method.
2. `src/actor-gateway/app.ts` declared `positiveId` twice after the new create route was inserted.

Both defects were corrected in `f0663df6e42836abd942e9c99732b5f5f9cac2d9` and `b5381417b8b5b2a95c7312be4801870ef76ce0ff`. The next observation of #5445 showed Build PASS and Actor Gateway Worker bundle PASS, but the run was cancelled by subsequent branch commits before migrations/tests/qualification. Thus it does not validate the new app integration end-to-end.

A further request/adapter review found the HTTP client intentionally serializes absent effective dates as JSON null, while the Gateway route initially treated null as invalid. Corrected the validator to accept explicit null (which the SQL function treats as default/no bound) and added a regression case to `src/actor-gateway/app.test.ts`: commits `843468685db8808526d9831585ede4a65ce88c2d` and `8587c308c316a34659e23a1e7eaee890817738fa`.

The new reader test file `src/actor-gateway/business-capability-mutation-reader.test.ts` is included in the package test command. It verifies exact HMAC v2 signing over the canonical context, SQL wrapper invocation, returned row mapping, transaction lifecycle and key format validation. The Resource API Gateway create route tests cover bearer forwarding and fail-closed behavior; the Gateway app test now covers nullable date values.

The manual create cutover file and PostgreSQL qualification additions are in place:
- `database/cutovers/20261120012000_revoke_legacy_business_capability_runtime_create.sql` revokes direct `business_capability` INSERT and identity sequence usage from PUBLIC, runtime, migrator and Gateway roles. It is manual-only and not part of automatic migrations.
- The disposable qualification applies that cutover, verifies runtime direct INSERT and sequence denial, Gateway direct INSERT denial, and checks the privilege matrix while the SECURITY DEFINER signed create operation still succeeds.
- Static contract test checks the cutover's manual-only contract.

The last full green run remains #5431 (`44776342145`) for the SQL-only qualification and existing full suite, before application wiring. Run #5437 (`44777635823`) was cancelled after a build failure. Run #5445 (`44778117399`) passed build and Worker bundle after the first corrections, then was cancelled by newer commits before PostgreSQL/tests. The current tip changes after that cancellation have not yet received a complete CI result; no application wiring or direct-write cutover pass is claimed.

Next: obtain/inspect normal PR CI for the current branch tip. Confirm TypeScript build, Worker bundle, full test suite (including new reader/app/router tests), and the entire disposable PostgreSQL workflow through step 53 and subsequent steps. Fix only failures supported by logs. Then review route error mapping and the PR summary. PR #300 stays draft/unmerged; PR #298 remains untouched.

No production migration/cutover, deployment, production DB changes, paid resources, secrets, manual workflow dispatch or PayFast work.


## CI #5449 — end-to-end signed Business Capability create and direct-write cutover qualification GREEN — 2026-11-20

Before recording this result, re-read this handover, fetched PR #300 and PR #298, verified the feature branch, checked the latest compare against `main`, and inspected the full CI job/step results and the exact dedicated PostgreSQL qualification logs.

### CI result
CI run #5449 (ID `44778438338`) completed with both jobs successful:
- `quality`: SUCCESS.
- `web-quality`: SUCCESS.
- Build: PASS.
- Actor Gateway Cloudflare Worker bundle (build-only; no deployment): PASS.
- All automatic migrations on disposable PostgreSQL 18: PASS.
- Auth Issuer and Actor Gateway isolated principal qualification: PASS.
- Actor Gateway local Workers runtime smoke: PASS.
- Full repository test suite, including the newly added signed capability reader, Actor Gateway endpoint and Resource API routing tests: PASS.
- Existing PostgreSQL gateway qualifications and all subsequent steps 49–69, including the full signed Business Capability cutover, other Gateway cutovers, runtime boundary, isolated Auth Issuer cutover, and pre/post SECURITY DEFINER authority inventory comparison: PASS.

### Exact signed Business Capability PostgreSQL qualification evidence (step 53)
The full job log contains the final marker `GHM BUSINESS CAPABILITY SIGNED GATEWAY CUTOVER QUALIFICATION: PASS` and these specific passes:
- Manual Business Capability mutation and create cutovers applied to disposable PostgreSQL only.
- Signed append-only create and actor provenance.
- Inactive Business denial; inactive and non-selectable catalogue denial.
- Active duplicate and withdrawn duplicate rejection.
- Expired assertion, nonce replay, invalid effective period, payload tampering and forged HMAC rejection.
- Non-admin member create denial.
- Runtime cannot execute the signed create wrapper.
- Runtime direct `ghm.business_capability` INSERT denied; runtime identity-sequence access denied; Gateway direct INSERT denied.
- Existing runtime legacy replacement/verification/evidence mutation and direct evidence INSERT/sequence denials.
- Final post-cutover privilege matrix passed.

This verifies the new manual-only create cutover and signed wrapper together in CI's isolated `ghm_disposable_test`; it does not apply the cutover to production.

### Application integration status
The signed create path is now wired end-to-end in source:
- Actor Gateway reader signs the exact canonical context and calls `ghm.gateway_create_business_capability`.
- Authenticated Actor Gateway `POST /v1/business-capabilities` derives actor from the verified JWT.
- Resource API `POST /api/v1/business-capabilities` uses the Gateway whenever configured/required and fails closed rather than falling back to runtime direct INSERT.
- HTTP 409 duplicate conflicts are preserved; null effective dates from the client are accepted and passed as defaults/no bound.
- New reader/app/router tests are included in the full suite.

### PR / branch state
- Updated PR #300 description to accurately document the end-to-end route, manual-only cutover, disposable PostgreSQL evidence and production boundary.
- PR #300 remains open, draft, unmerged, and mergeable. Do not merge or mark ready without explicit owner direction.
- PR #298 remains open/draft/unmerged and untouched.
- Feature branch `feat/signed-business-capability-create` is 90 commits ahead of `main` and 0 commits behind at inspection; compare reports the intended 20 changed files.

### Production boundary
No production migration, manual cutover, Render database mutation, Gateway deployment, or paid service creation occurred. The separate manual cutover remains gated on deployed/qualified Gateway route, provisioned production Gateway principal, resolved Render role model, and a fresh verified production backup. The GitHub PR preview bot generated a Cloudflare Pages branch preview automatically; this was not a production deployment and no manual deployment was invoked.

Next: keep PR #300 draft/unmerged. Do not deploy or apply the manual cutover. The feature is now CI-qualified end-to-end on disposable PostgreSQL; any production adoption remains a separately gated owner-directed operation. PR #298 stays separate and untouched.


## CI #5450 — current PR head documentation handover commit also fully green — 2026-11-20

Re-read this handover and rechecked PR #300, PR #298, feature branch and workflow run after recording #5449.

The handover-only commit `15ad9ae0f421d6c169b7e1264e34a93da6f63e99` became PR #300's current head and triggered normal CI run #5450 (ID `44779269344`). Both jobs completed successfully:
- `quality`: SUCCESS.
- `web-quality`: SUCCESS.
- Build, Worker bundle, all migrations, isolated principals, Worker smoke, Argon2 interoperability, storage/Connect/Business registration/Opportunity qualifications, full test suite, all Actor Gateway cutovers including dedicated signed Business Capability step 53, migration audit, runtime boundary, isolated Auth Issuer cutover and final SECURITY DEFINER inventory comparison: PASS.

This confirms the current PR head (including the latest handover documentation) has a fully green check run. The prior #5449 run was also fully green and its dedicated step 53 log was inspected directly; the log confirms the manual create cutover ran only on `ghm_disposable_test`, signed owner create/provenance passed, all create denials and replay/expiry/tamper/forgery cases passed, direct runtime INSERT and sequence use were denied, Gateway direct INSERT was denied, and the final privilege matrix passed.

PR #300 remains open, draft, unmerged and mergeable. Its description now accurately documents the end-to-end Gateway route, manual-only cutover, full disposable PostgreSQL evidence and production boundary. PR #298 remains open/draft/unmerged and untouched. The feature branch is 91 commits ahead and 0 behind `main` at inspection; changed file set remains 20 intended files.

No production migration, manual cutover, Render database mutation, Gateway production deployment or paid resource creation occurred. The Cloudflare Pages branch preview is an automatic PR preview only, not production. Keep PR #300 draft/unmerged and do not deploy or apply the manual cutover without separate owner-directed authorization and its documented preconditions.


## 21 November 2026 — post-merge column-level Business Capability privilege correction

PR #300 was rechecked and is now merged into `main`; PR #298 and PR #297 remain separate open draft PRs. The signed Business Capability create implementation is therefore maintained on the default branch, not added to the production migration batching PR.

A source review found that the manual create cutover revoked table-level INSERT but did not revoke the historical column-level INSERT grant from migration `20260916213000_narrow_business_capability_runtime_insert.sql`. Table-level REVOKE does not remove a separately granted column privilege. The cutover now explicitly revokes INSERT on all eight historically granted columns from PUBLIC, `ghm_runtime`, `ghm_migrator`, and `ghm_actor_gateway`, in addition to its existing table and sequence revocations. Its comment now describes signed Gateway operations as the only intended mutation paths, covering both signed create and signed replacement.

The Actor Gateway database privilege audit now checks column-level INSERT across `ghm` relations for both `session_user` and `ghm_runtime`, so a column-only grant cannot evade the direct-relation boundary. Static tests assert these checks. The disposable PostgreSQL cutover qualification now probes direct INSERT as runtime, Gateway, and migrator and asserts `has_any_column_privilege` is false for all three principals in its final matrix.

This is a source-only correction on branch `fix/business-capability-column-privilege-audit`. It has not yet been committed, CI-qualified, or applied to any database. The manual cutover remains excluded from automatic migrations and must not be applied to production as part of this task. No production DB, Render service, deployment, credentials, roles, ACLs, secrets, or settings were changed. PR #298/#297 remain untouched.

Next: sync the follow-up branch locally, run focused TypeScript build/tests and the guarded disposable-local PostgreSQL qualification only when three distinct localhost disposable principal URLs are available. Inspect CI after pushing; update this handover with exact commit and qualification results. Keep the manual production cutover gated on its documented deployment, principal, role-model and verified-backup prerequisites.
