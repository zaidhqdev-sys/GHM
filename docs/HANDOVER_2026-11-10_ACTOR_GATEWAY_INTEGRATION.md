# GHM Actor Gateway integration handover — 2026-11-10

## Purpose

This branch coordinates three independently developed security boundaries without merging their source PRs:

- Capability governance: #250 -> #268 -> #269.
- Supplier classification: #243 -> #270.
- Business profile: #237 -> #271.

Integration/qualification PR: #272 (draft, targets main). PR #273 was a temporary branch-comparison probe and is closed after its supplier changes were manually integrated into the qualification branch.

## Shared foundation

The same shared foundation migration files were byte-identical across capability and supplier branches and are retained once:

- 20261110210000 actor-gateway principal guard and assert_actor_gateway.
- 20261110220000 actor self-identity reader.
- 20261110230000 business registration identity reader.
- 20261110233000 business registration identity writer and compatibility fix.

The combined gateway app/process now wires:
- actor identity;
- Business registration identity;
- capability governance;
- supplier classification;
- Business profile.

The access-token verifier requires ES256, issuer/audience, a valid account subject, expiry and issued-at lifetime. The gateway database login is separate from runtime and migrator.

## Feature migrations

- Capability: catalogue governance and invariant migrations from #250/#268, then 20261110250000 capability gateway wrappers.
- Supplier classification: 20261110010000 supplier classification schema, then 20261110260000 supplier gateway cutover.
- Business profile: 20261110270000 business profile gateway wrapper and revocation of direct runtime access to the legacy update RPC.

Migration ordering is chronological and the shared foundation is deduplicated.

## API routing

- Capability admin routes use the gateway when GHM_ACTOR_GATEWAY_URL is configured. This remains a staged optional configuration, so the original three capability SECURITY DEFINER RPCs still have ghm_runtime EXECUTE grants. This is an open blocker; do not revoke those grants until the gateway is deployed/configured and route verification has passed.
- Supplier classification updates are routed through the supplier gateway client and fail closed when unavailable.
- Business profile updates are routed through the profile gateway client and fail closed when unavailable; the legacy repository method now throws rather than executing the old direct RPC.
- Supplier/profile gateway cutover migrations exist in this integration branch but have not been applied to production.

## Qualification

The combined CI workflow provisions a dedicated ghm_actor_gateway LOGIN NOINHERIT principal and a distinct database URL. It runs:
- capability gateway PostgreSQL qualification: runtime/gateway role-assumption denial, runtime denial of gateway wrappers, admin gateway list/create/update/transition success, non-admin denial;
- supplier classification PostgreSQL qualification;
- Business profile gateway and compatibility qualification;
- full test suite, migration audit, runtime boundary and web quality.

Individual feature evidence:
- PR #270 exact head 60311ab9e2c8139157be91b6006b8cc595b6b7a7 passed CI run #42911426091 (quality and web-quality).
- PR #271 exact head 879b22a5a6a03033ff20cd44d258a58101dddec8 passed CI run #42909483456 (quality).
- The combined integration head has not yet passed exact-head CI. Do not infer combined correctness from individual branch results.

## Remaining gates

1. Run and pass full CI on #272's exact latest head.
2. Resolve any combined build/test/migration failures.
3. Complete restored active-database compatibility review for Business profile and supplier schema.
4. Deploy/configure Actor Gateway and verify routing before capability legacy RPC revocation.
5. Add a separate capability cutover migration revoking ghm_runtime EXECUTE on the original three capability functions, with direct runtime invocation-denial tests and positive gateway qualification.
6. Review all production role membership, credential custody and service isolation before any production rollout.

## Release controls

Keep #250, #268, #269, #270, #271 and #272 draft/unmerged until their own gates are satisfied. No production migration, grant change, role provisioning, Render service/environment change, deployment, data mutation or catalogue activation occurred in this integration work. PayFast remains paused; legal-document work remains parked.

## Latest combined branch checkpoint
The supplier and Business profile route wiring has been manually consolidated into the capability integration branch. The combined gateway app and server register all three feature readers; resource API writes route supplier classification and Business profile updates through their gateway clients; legacy profile repository writes fail closed. The exact combined-head CI run is still the authoritative validation gate.

## CI trigger investigation — 2026-11-11

PR #272 has been marked ready for review (not draft). GitHub Actions REST currently reports zero workflow runs for the exact PR head, while the Cloudflare Pages check is green. The CI workflow contains a pull_request trigger targeting main, so the absence of a run is not evidence of a pass or a failure. A new PR synchronize event is being requested with this handover update. Recheck the exact resulting head and its workflow runs before making any validation claim.

The integration branch is currently 114 commits ahead and 15 commits behind main. This divergence must be reconciled and reviewed before merge; do not merge based only on the individual feature PR results.

## Main-branch reconciliation — 2026-11-11

The integration now retains the latest main-branch Actor Gateway foundation:
- Registration identity read and write endpoints remain in the gateway process.
- Resource API registration identity writes are routed through HttpBusinessRegistrationIdentityGatewayClient when GHM_ACTOR_GATEWAY_URL is configured.
- The current main token verifier and ES256 key loader are retained; the verifier accepts tokens with absent iat only when the expiry remains bounded by the 15-minute token horizon and clock skew.
- The gateway process wires registration identity, capability governance, supplier classification and Business profile readers.

CI has been extended to run on pushes to this integration branch and now includes the main actor-gateway-principal qualification as well as capability, supplier and profile qualification. The package test command is the union of main's registration gateway tests and the three feature test groups.

## Business profile compatibility correction

The 20261109100000 presentation migration replaced the profile update function and dropped compatibility for legacy category/isSupplier fields and snake_case/camelCase aliases. The profile qualification script exposed this. A later forward-only migration, 20261110265000_reconcile_business_profile_legacy_contract.sql, restores the live profile contract after the presentation migration and before 20261110270000 gateway cutover. Disposable PostgreSQL qualification now verifies legacy fields, alias normalization/conflict rejection, direct runtime denial and gateway-only update success.

## Validation checkpoint

Exact integration head before the main-base reconciliation passed CI run #42917315263:
- TypeScript build, full unit/integration test suite and web-quality.
- Full disposable migration application.
- Capability catalogue governance authorization and runtime-denial qualification.
- Supplier classification runtime-denial and gateway-positive qualification.
- Business profile compatibility, runtime-denial and gateway-positive qualification.
- Runtime boundary verification and migration audit.

Because main's registration gateway changes and actor-gateway-principal qualification have now been integrated, run full CI again on the merge commit's exact head before approving PR #272. The previous green run does not qualify the later merged head.

## Current release gate

PR #272 is ready for review but not approved to merge until the latest exact-head CI passes and the merge-base reconciliation is complete. Capability's original three SECURITY DEFINER functions still grant EXECUTE to ghm_runtime; the capability cutover remains blocked until gateway deployment/configuration and route verification. No production migration, grant/role change, service/environment change, deployment, data mutation or catalogue activation has occurred.

## Main-base reconciliation and exact-head qualification — 2026-11-11

The integration branch was reconciled with current main using a two-parent merge commit:

- Main parent: d1bd49cde73bb4ef428da1f75fcd27b2b285ddd8.
- Integration parent: c0e35b5c98126ac00bb5c32f23934b90b3027da8.
- Reconciled head: 30b65587b4d16d2487a934573197fcfea526673f.

The reconciled tree preserves main's registration identity gateway GET/PUT endpoints and resource API client routing, while adding capability, supplier and Business profile gateway routes. The process wires all five readers. The current main token verifier and key loader are retained. The test script includes main registration gateway tests plus all feature gateway tests. CI also runs the dedicated actor-gateway-principal qualification.

## Exact reconciled-head CI

GitHub Actions PR run #42918791858 passed on exact head 30b65587b4d16d2487a934573197fcfea526673f:
- Build and full test suite.
- Full disposable PostgreSQL migration chain.
- Isolated actor-gateway principal qualification.
- Capability catalogue governance and runtime direct-denial qualification.
- Supplier classification runtime direct-denial and gateway-positive qualification.
- Business profile compatibility and runtime direct-denial/gateway-positive qualification.
- Migration audit policy tests and runtime boundary verification.
- Web-quality build, tests, dependency audit and security-sensitive toolchain checks.
- Cloudflare Pages preview passed.

The branch is 137 commits ahead and 0 behind main. GitHub reports PR #272 mergeable/clean. PR #272 is ready for review but remains unmerged. The CI result does not authorize production deployment, grant changes or feature PR merges.

## Final remaining release blockers

1. Capability's original three SECURITY DEFINER functions still grant EXECUTE to ghm_runtime. The gateway URL is optional for capability API routing. Do not revoke legacy grants until the gateway is deployed/configured and route verification has passed; then add a separately qualified capability cutover migration and direct runtime-denial tests.
2. Supplier classification, Business profile and registration identity gateway paths still require controlled deployment and end-to-end verification before their legacy access is cut over.
3. No production migration, role/grant change, Render service/environment change, deployment, data mutation or catalogue activation occurred. PayFast remains paused; legal-document work remains parked.

## Final documentation checkpoint

After the main-base reconciliation and route integration, exact-head CI run #42919101125 passed on commit 48cde68566196903b44655c71dc5e2a800e5fc17. Both quality and web-quality completed successfully, and Cloudflare Pages passed. This run included the actor-gateway-principal qualification, registration identity migration qualification, capability/supplier/profile PostgreSQL security qualifications, full test suite, migration audit and runtime boundary verification.

PR #272 is mergeable/clean, 137 commits ahead and 0 behind main, and remains ready for review but intentionally unmerged. The exact capability legacy-RPC grant blocker remains open.

## Capability legacy-RPC cutover qualification added
A separate disposable-only qualification now applies `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql` using the schema-owner role, then verifies direct legacy RPC calls are denied to both `ghm_runtime` and `ghm_actor_gateway`, runtime cannot execute gateway wrappers, and the isolated gateway can still list and create capabilities through gateway wrappers. It is wired as `npm run qualify:capability-governance-cutover` in CI after the pre-cutover capability qualification. The script refuses to run unless the qualification database is `ghm_disposable_test` on `localhost`. This is test-only application; the cutover file remains outside the migration directory and is not production-applied.
