# GHM Project detail/update API — 18 November 2026

## Purpose

Connect's authenticated Project service client already calls `GET /api/v1/projects/:projectId` and `PATCH /api/v1/projects/:projectId`. The GHM Project service and repository contracts already provide account-scoped `getOwnedProject` and `updateOwnedProject`, and the update input parser already exists in `src/http/app.ts`, but the HTTP routes were missing.

## Change

- Add authenticated Project detail GET and update PATCH routes.
- Require registered Project read/update operations.
- Restrict route roles to customer or admin; business accounts cannot read or mutate customer-owned Projects through these endpoints.
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
- The migration step failed at `20261117020000_revoke_runtime_capability_governance.sql` while validating the signed Capability Gateway verifier function.
- Root cause identified: the migration compared `pg_proc.proconfig` to one exact whitespace spelling of the search_path setting. The signed assertion migration chain legitimately writes both `search_path=pg_catalog, ghm` and `search_path=pg_catalog,ghm`. This was a formatting-sensitive guard, not evidence that the function lacked SECURITY DEFINER or the required owner.
- Follow-up commit `f1ce5568a0d93d0889b80ff52f8102a538e6483f` normalizes whitespace in the search_path comparison while retaining the required schema, owner, SECURITY DEFINER and EXECUTE privilege checks. This correction is not yet CI-validated.
- The same run's web audit reports five high-severity findings caused by the single picomatch ReDoS advisory GHSA-fc5q-39xc-vjpf across the Vite/Vitest dependency tree. The installed version is picomatch 4.0.7. The current advisory says versions through 4.0.7 are affected and does not publish a patched version. Do not force-downgrade Vite or suppress the audit; recheck for an upstream patched picomatch release before remediation.
- The GHM CI workflow currently applies the full migration set to disposable PostgreSQL before running later qualification steps. This is CI-only, not production, but it is the long-running step. No production database was touched.
- No migrations were applied to Render, no production data changed, and no services or paid resources were added.
