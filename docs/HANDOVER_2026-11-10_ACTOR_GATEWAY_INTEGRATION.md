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
