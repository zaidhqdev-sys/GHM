# GHM Actor Gateway integration handover — 2026-11-10

> **Historical snapshot — superseded on 2026-11-11. This document records intermediate integration checkpoints and must not be used as the current deployment or cutover instruction. The current authoritative status is [HANDOVER_2026-11-11_ACTOR_GATEWAY_PRODUCTION_READINESS.md](./HANDOVER_2026-11-11_ACTOR_GATEWAY_PRODUCTION_READINESS.md) and [PR #272](https://github.com/zaidhqdev-sys/GHM/pull/272). PR #272 is now open, ready for review (not draft), and based on `main`; the 10 November statements about the combined head being unvalidated, the integration branch being behind main, and optional gateway fallback are historical. Current code CI and the production database privilege blocker are recorded in the 11 November handover. PRs #250/#268/#269/#270/#271 remain open/unmerged stacked predecessors; do not merge them independently while #272 consolidates their changes. No production migration, deployment, grant revocation or cutover is authorized by this note.**


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

## Latest exact-head CI result
Current branch head `fbee5509ea197d277e9d2fbc9d997bb61a6c66d9` passed GitHub Actions run #42923701476. Both `quality` and `web-quality` passed. The disposable capability cutover qualification passed after applying the manual cutover SQL in the isolated test database: runtime and gateway direct legacy create/update/transition calls were denied; runtime could not execute gateway wrappers; gateway list/create/update/transition wrappers remained available. Supplier, Business profile, commercial settlement, migration audit and runtime-boundary qualification steps also passed. This does not apply the cutover to production.

## 2026-11-11 fail-closed hardening
The capability catalogue admin HTTP routes now return `503 service_unavailable` whenever `GHM_ACTOR_GATEWAY_URL` is absent. They no longer call the legacy `CapabilityService` for governed list/create/update/transition operations. Regression coverage asserts all four operations fail closed and the legacy service is never invoked. The gateway client continues to forward the original bearer token for ES256 verification at the gateway. Exact-head CI after this change is pending; the prior green run #42924025946 does not cover it.

## 2026-11-11 database-verifiable capability actor assertions
A review of `20261110210000_add_actor_gateway_principal_guard.sql` and the existing disposable qualification exposed a genuine trust gap: `ghm.assert_actor_gateway(bigint)` proved only that the SQL session used the isolated gateway login and that the supplied account was active. It did not prove that the account ID came from the ES256-verified JWT. A direct holder of the gateway DB credential could therefore claim another active account (subject to feature authorization).

A forward-only migration, `20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql`, now introduces a capability-specific HMAC assertion boundary:
- The gateway signs a short-lived assertion over actor ID, exact capability operation, issue time and one-use nonce using a dedicated 32-byte secret.
- PostgreSQL verifies HMAC-SHA256, a 60-second time window, active account status, and one-use nonce replay protection.
- The HMAC secret table is owned by `ghm_schema_owner` and revoked from PUBLIC, runtime, gateway and migrator roles; the isolated gateway login cannot read the signing key.
- Capability list/create/update/transition wrappers each bind the signed assertion to their own operation. Old unsigned gateway wrapper signatures are dropped.
- The Actor Gateway process now requires `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`; the reader creates unique signed assertions for each operation.
- Disposable PostgreSQL qualification provisions only its test key and tests valid admin access, non-admin denial, forged-signature denial, replay denial and cross-operation assertion denial.

The signing key must be independently generated and provisioned to the gateway secret store and the protected database secret table through a controlled owner-only process. Never commit or reuse the CI test key. This change currently hardens **capability governance wrappers only**; the other gateway feature wrappers still need an equivalent independent database assertion review before their own production cutovers.

The new migration and qualification passed exact-head CI run #42934869090 on commit `637d29219dfbfc910f5c2dcf8db0713c3d28c929`; both quality and web-quality passed. No production migration, secret provisioning, role/grant change, Render service/environment change or deployment has occurred. The CI key is disposable-test-only.

## Signed capability actor assertion exact-head CI result
The first signed-assertion implementation passed exact-head GitHub Actions run #42934869090 on commit `637d29219dfbfc910f5c2dcf8db0713c3d28c929`. Both `quality` and `web-quality` passed. The disposable PostgreSQL qualification explicitly passed forged-HMAC denial, replay denial, cross-operation assertion denial, valid admin list/create/update/transition, non-admin denial, and the existing manual legacy RPC cutover denial/gateway-positive checks. Full migration chain, build, complete test suite, supplier classification, Business profile, commercial settlement, migration audit and runtime boundary also passed. The CI signing key is test-only and publicly defined for disposable qualification; it is not a production secret.

The CI result covers capability governance assertions only. The current gateway database assertion model for supplier classification, Business profile and registration identity has not yet been upgraded to the same database-verifiable actor proof. Their own production legacy access cutovers remain blocked pending equivalent analysis and qualification. No production key was generated or provisioned, no production migration/role/grant change was applied, and no Render service/environment or deployment was changed.

## Supplier classification actor assertion hardening — 2026-11-11
The supplier classification wrapper had the same database trust gap as capability governance: it checked the gateway login and accepted a caller-supplied active actor ID. A new forward-only migration `20261111030000_bind_supplier_gateway_actor_to_signed_assertion.sql` reuses the protected 32-byte HMAC key and one-use nonce store, binds the assertion to `supplier.classification.update`, replaces the unsigned wrapper signature, and denies runtime/migrator/public execution. The gateway reader signs the verified JWT subject for every supplier update. Disposable PostgreSQL qualification provisions the test key, verifies the runtime cannot execute the new wrapper, rejects forged signatures, and preserves owner/member authorization tests. Exact-head CI for this supplier extension is pending. The secret remains test-only in CI; no production secret, database migration, Render environment or deployment has been changed.


## Signed supplier actor assertion exact-head CI result
The supplier signed-assertion extension passed exact-head GitHub Actions run #42935773452 on commit `37b8d5527d9338bd239177e453d740e8ab968619`. Both `quality` and `web-quality` passed. The full disposable PostgreSQL migration chain, TypeScript build, complete test suite, capability signed-assertion qualification, capability legacy cutover qualification, supplier classification qualification (including the new signed wrapper and forged-signature denial), Business profile qualification, commercial settlement qualification, migration audit and runtime boundary verification all passed. No production secret was generated/provisioned; no production migration, grant/role change, Render environment/service change or deployment occurred.

The remaining gateway wrappers for Business profile, registration identity and actor self-identity still use the earlier gateway-login-plus-caller-ID assertion and need the same independent database proof review before those paths can be considered closed for production. Do not apply their legacy access cutovers until that work and deployment verification are complete.

## Business profile actor assertion hardening — 2026-11-11
Business profile updates had the same caller-supplied actor gap. New forward-only migration `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion.sql` binds the database wrapper to `business.profile.update` using the protected HMAC secret, 60-second validity and one-use nonce verifier. The gateway reader signs the verified JWT subject; the unsigned wrapper signature is removed. Disposable qualification provisions only the CI test key, checks runtime execute denial, forged assertion denial, and preserves legacy field/alias compatibility and membership authorization coverage. Exact-head CI is pending. Registration identity and actor self-identity still use the older assertion and remain open security gates. No production secret or infrastructure change has been made.

## Registration identity and actor self-read assertion hardening — 2026-11-11
The Business registration identity GET/PUT wrappers and actor self-identity wrapper also relied on the gateway login plus caller-supplied actor ID. A new forward-only migration `20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql` replaces all three unsigned wrapper signatures. Each now requires a one-use HMAC assertion bound to its exact operation (`business.registration.read`, `business.registration.update`, `actor.identity.read`). The readers sign only the account ID derived from the verified ES256 JWT. The disposable actor-gateway principal qualification now provisions the CI-only key, checks valid self/read/write and cross-business/disabled-actor denials, forged self-read assertion denial and runtime EXECUTE denial. Exact-head CI is pending. This is not a production key or production migration.

## Unified signed actor assertion exact-head validation — 2026-11-11
The final unified database-verifiable actor assertion implementation passed exact-head GitHub Actions run #42937910774 on commit `d53f3dbda81a30d0c865586763b09da77d68f354`. Both `quality` and `web-quality` passed. The disposable migration chain and full test suite passed. PostgreSQL qualifications passed for:
- Capability list/create/update/transition: valid admin assertions; forged signature, replay, cross-operation and non-admin denials; legacy cutover runtime/gateway denials and gateway wrapper positives.
- Supplier classification: valid owner update, member denial, invalid value denial, runtime direct/wrapper denial and forged signature denial.
- Business profile: runtime direct/wrapper denial, forged assertion denial, current snake_case and historical camelCase compatibility, alias/coordinate validation and member authorization.
- Actor self-identity and Business registration identity GET/PUT: valid operations, forged assertion denial, disabled actor and cross-business denials, runtime wrapper execution denial.
- Migration audit and runtime boundary checks.

All gateway feature wrappers now use a one-use HMAC-SHA256 assertion bound to the exact operation, account ID, issue time and nonce. PostgreSQL verifies the signature using a protected 32-byte secret unavailable to `ghm_actor_gateway`, enforces a 60-second window, active actor, and replay prevention. The gateway signs only the actor ID obtained from its verified ES256 token. A qualification bug caused by PostgreSQL evaluating a composite-returning function multiple times through `(function()).*` was corrected by selecting from the function in `FROM`, so each signed mutation consumes exactly one assertion.

This is still **disposable qualification only**. No production signing key was generated/provisioned, no production migration or grant/role change occurred, no Render service/environment was changed, and no deployment or production cutover was performed. Production readiness still requires secret custody/rotation design, dedicated gateway service and private networking, deployment, end-to-end checks, and separately authorized legacy grant cutovers. PR #272 remains open and unmerged.
