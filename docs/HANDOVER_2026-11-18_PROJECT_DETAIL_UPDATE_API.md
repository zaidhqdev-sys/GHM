# GHM Project detail/update API — 18 November 2026

## Purpose

Connect's authenticated Project service client already calls `GET /api/v1/projects/:projectId` and `PATCH /api/v1/projects/:projectId`. The GHM Project service and repository contracts already provide account-scoped `getOwnedProject` and `updateOwnedProject`, and the update input parser already exists in `src/http/app.ts`, but the HTTP routes were missing.

## Change

- Add authenticated Project detail GET and update PATCH routes.
- Require registered Project read/update operations.
- Restrict Project detail read and update to customer accounts; administrator and business roles are denied, matching the customer-owned Project repository contract.
- Derive the actor from the verified GHM auth context; no client-supplied account ID.
- Delegate ownership enforcement and persistence to the existing Project service/repository.
- Return 404 for an unowned/nonexistent Project; reject malformed IDs and invalid update payloads.
- Add HTTP integration tests for successful read/update, not-found, and business-role denial.

## Scope

No deletion endpoint is added. No database schema or migration, production data, deployment, payment provider, new service, or paid resource is involved. The branch is draft until CI and authorization tests pass.


## Role boundary correction

The existing Project repository scopes records to the authenticated account ID and does not implement administrator-wide ownership bypass. Therefore detail read and update routes are customer-only, matching the existing Project list route. The Project create route now also explicitly rejects non-customer roles. Business-role integration tests cover denial for GET, PATCH and POST.


## CI investigation — 18 November 2026

- The TypeScript build, Actor Gateway Worker dry-run bundle, GHM web build and all 26 web tests passed in run 44207713671.
- The migration step failed at `20261117020000_revoke_runtime_capability_governance.sql` while validating `ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text)`.
- The first attempted whitespace-normalization correction did not resolve the failure. The subsequent migration history review identified the actual mismatch: `20261112090000_pin_security_definer_search_path.sql` deliberately pins every GHM `SECURITY DEFINER` function to `search_path = pg_catalog, ghm, pg_temp`, and `20261112140000_add_signed_storage_metadata_actor_gateway.sql` explicitly preserves that three-entry path on the shared signed assertion verifier. The later cutover guard incorrectly required only `pg_catalog, ghm`, so it rejected the intended temporary-schema-safe configuration.
- Commit `e5bdfdb409a4607fbf3040be04ea9a0c7d9b928f` updates the guard to accept only the canonical pinned path `pg_catalog, ghm, pg_temp` after whitespace normalization. This preserves the security invariant: `pg_catalog` first, trusted `ghm` second, and `pg_temp` explicitly last. It does not permit arbitrary schemas or remove the owner, `SECURITY DEFINER`, ACL, or runtime-denial checks.
- This correction is awaiting CI qualification. The earlier metadata diagnostic commit remains in branch history but the final guard uses the generic failure message again.
- The same run's web audit reports five high-severity findings caused by the single picomatch ReDoS advisory GHSA-fc5q-39xc-vjpf across the Vite/Vitest dependency tree. The installed version is picomatch 4.0.7. The current advisory says versions through 4.0.7 are affected and does not publish a patched version. Do not force-downgrade Vite or suppress the audit; recheck for an upstream patched picomatch release before remediation.
- The GHM CI workflow currently applies the full migration set to disposable PostgreSQL before running later qualification steps. This is CI-only, not production, but it is the long-running step. No production database was touched.
- No migrations were applied to Render, no production data changed, and no services or paid resources were added.


## Latest API authorization hardening — 18 November 2026

- Project PATCH previously admitted the `admin` role even though the repository update operation remains strictly scoped to `context.userId`. That mismatch did not provide a valid administrator-wide update path and contradicted the customer-only Project contract.
- Commit `c4462abdec2aaa3746c21974f00a6202c49ce022` makes PATCH customer-only.
- Commit `ecc08472ebff8e2c280e0cd60e6cb448f4e3430d` adds an HTTP contract test proving both Project GET and PATCH reject an administrator context. This second commit is on the branch but has not yet received a dedicated CI run.
- No production API deployment or database change has occurred.


## Final migration guard finding — 18 November 2026

- The failure was caused by an inconsistency between the global SECURITY DEFINER path pinning migration (which requires `pg_catalog, ghm, pg_temp`) and the later capability cutover guard (which incorrectly required `pg_catalog, ghm`).
- The fix now validates the exact pinned three-schema path, with whitespace normalization only. It does not relax ownership, SECURITY DEFINER, gateway-only execution, or runtime denial requirements.
- Project PATCH now explicitly denies administrator roles as well as business roles, matching the account-owned Project service contract. A dedicated admin denial HTTP test was added.
- The branch has not been merged or deployed. All migration execution remains CI-only against disposable PostgreSQL.


## CI result and Project route test correction — 18 November 2026

- Run [44210945203](https://github.com/zaidhqdev-sys/GHM/actions/runs/44210945203) completed. All migrations applied successfully to disposable PostgreSQL. The isolated auth issuer baseline qualification, isolated Actor Gateway principal qualification, local Actor Gateway Worker smoke test, Argon2id interoperability qualification, storage provider attestation qualification, storage metadata grant/revocation qualification, signed Connect Business provisioning qualification, Business registration forward migration qualification, Opportunity marketplace SQL qualification, and storage lifecycle/tenant authorization qualification all passed.
- Correction to the earlier interim report: the isolated Actor Gateway principal did **not** fail. It passed. The 7 failures were all Project HTTP tests in `src/http/app.test.ts`; the tests used `business` auth contexts after the route contract had been changed to customer-only. Expected customer operations consequently returned 403 before reaching payload validation/service execution. The implementation's role guard behaved as designed; the test fixtures were stale.
- Commit `f697549eafa605033f1ec355886f939a7e34356e` updates the seven customer-operation fixtures/assertions to use customer contexts.
- Commit `72f4b82340c6862a8d7c11a8d7810550aff973f2` adds explicit HTTP denial coverage for both business and administrator roles across Project create, detail read and update, asserting the Project service is never called.
- The run's web dependency audit remains blocked by five high-severity findings in the existing picomatch/Vite dependency tree. No force downgrade or audit suppression has been applied.
- A new CI run is required for the latest two commits. No merge, deployment, production migration, payment activation, or paid infrastructure change has occurred.
