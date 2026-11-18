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
- The first attempted whitespace-normalization correction did not resolve the failure. The next commit changed the SQL regex to a POSIX whitespace class, but its run still failed at the same metadata guard. The earlier claim that whitespace alone was the root cause was premature and is withdrawn.
- Diagnostic commit `66b1dae9830e1f9723e4c34ee754aab0b5beac96` changes the exception to report actual owner, expected owner, `prosecdef`, and `proconfig` for the exact failing function. That run was cancelled by a subsequent branch update before the diagnostic result was captured; a fresh CI run is required.
- No security predicate has been removed or relaxed.
- The same run's web audit reports five high-severity findings caused by the single picomatch ReDoS advisory GHSA-fc5q-39xc-vjpf across the Vite/Vitest dependency tree. The installed version is picomatch 4.0.7. The current advisory says versions through 4.0.7 are affected and does not publish a patched version. Do not force-downgrade Vite or suppress the audit; recheck for an upstream patched picomatch release before remediation.
- The GHM CI workflow currently applies the full migration set to disposable PostgreSQL before running later qualification steps. This is CI-only, not production, but it is the long-running step. No production database was touched.
- No migrations were applied to Render, no production data changed, and no services or paid resources were added.


## Latest API authorization hardening — 18 November 2026

- Project PATCH previously admitted the `admin` role even though the repository update operation remains strictly scoped to `context.userId`. That mismatch did not provide a valid administrator-wide update path and contradicted the customer-only Project contract.
- Commit `c4462abdec2aaa3746c21974f00a6202c49ce022` makes PATCH customer-only.
- Commit `ecc08472ebff8e2c280e0cd60e6cb448f4e3430d` adds an HTTP contract test proving both Project GET and PATCH reject an administrator context. This second commit is on the branch but has not yet received a dedicated CI run.
- No production API deployment or database change has occurred.
