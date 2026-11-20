
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
