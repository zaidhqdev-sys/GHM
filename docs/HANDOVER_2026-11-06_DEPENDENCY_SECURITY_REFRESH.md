# Handover — dependency security refresh and mainline integration (2026-11-06)

## Executive status

The dependency security refresh has been applied to a dedicated integration branch based on the latest fetched `origin/main`, validated locally, and pushed to GitHub for review.

- Repository: `zaidhqdev-sys/GHM`
- Integration branch: `integration/ghm-dependency-security-refresh`
- Mainline base at branch creation: `1f23d88b` (`docs: record legal acceptance database trust boundary gate (#220)`)
- Dependency implementation commit on integration branch: `e36a930b` (`fix: refresh dependencies for security advisories`)
- Original validated commit: `f2369937` on `construction/ghm-dependency-security-refresh`
- Published integration ref was verified at `e36a930b057c622b86a979ba0b6824ae89f0e353` before this handover documentation update.
- State at handover preparation: branch pushed; pull request not yet created; no merge or deployment performed.

This handover records the dependency-refresh work only. It does not change any product, database, migration, provider, or production-readiness gate.

## Change scope

Only these runtime dependency files are part of the dependency-refresh implementation commit:

- `package.json`
- `package-lock.json`

The lockfile refresh moved the affected transitive packages to:

| Package | Previous | Refreshed |
|---|---:|---:|
| `body-parser` | `1.20.6` | `1.20.9` |
| `express` | `4.22.2` | `4.22.3` |
| `proxy-addr` | `2.0.7` | `2.0.8` |
| `qs` | `6.15.3` | `6.16.2` |

The package manifest's Node engine minimum was raised from `>=18.0.0` to `>=20.0.0`. The observed installed AWS SDK packages (`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, both `3.1127.0`) declare Node `>=20.0.0`, so the prior manifest minimum did not describe the actual dependency runtime requirement.

No direct application dependency was intentionally added or removed as part of this refresh.

## Validation evidence

Validation was run from the user's Windows PowerShell working copy using Node `v24.18.0` and npm `11.16.0`.

### Original dependency branch

- Test suite: 543 passed, 0 failed, 2 skipped (545 total).
- `npm audit`: 0 vulnerabilities.
- The initial test invocation required `GHM_AUTH_TOKEN_PEPPER` in the process environment. The repository's `.env` value was not automatically loaded by the test command. For validation, a temporary test-only placeholder was assigned to the process environment and removed afterward. No real pepper value is recorded here and no secret value was changed.

### Integration branch based on main

After cherry-picking the dependency commit onto the latest fetched `origin/main`:

- Test suite: 651 passed, 0 failed, 2 skipped (653 total).
- `npm audit`: 0 vulnerabilities.
- Cherry-pick completed without conflicts.
- The integration branch's tracked working tree was clean after validation; the only local untracked item was the pre-existing `npm-audit-fix-dry-run.json`, which was not staged or committed.

The larger test count reflects the newer mainline baseline; the 651-pass result is the relevant validation for this integration candidate.

## Branch and history decisions

1. The initial branch `construction/ghm-dependency-security-refresh` contained the dependency commit `f2369937`.
2. Its remote counterpart also had a distinct documentation-only commit `b101bfc6` and had diverged from the local branch. That remote-only documentation commit was not an ancestor of the fetched `origin/main`.
3. To avoid merging the old divergent history or overwriting documentation, a new branch was created from `origin/main` at `1f23d88b`.
4. Only `f2369937` was cherry-picked onto that branch, producing `e36a930b`. No conflicts occurred.
5. The integration branch was pushed to `origin` and the remote ref was verified to point to the same commit as the local branch at that time.

The original local construction branch, its remote counterpart, and their distinct documentation history were not rewritten, merged, force-pushed, or deleted.

## Safety and non-actions

- No production deployment was performed.
- No database connection, schema, migration, or data was changed.
- No application or provider secrets were changed.
- No merge, rebase, reset, clean, or force-push was performed.
- The untracked `npm-audit-fix-dry-run.json` was deliberately preserved and excluded from commits.
- The integration branch is a review candidate; its dependency change is not yet part of `main`.

## Pull-request and follow-up status

At the time this handover was drafted, the integration branch had been pushed successfully but its pull request had not yet been opened. The next step is to open a PR from `integration/ghm-dependency-security-refresh` into `main`, include this handover and the living-document references, and review the exact diff and CI status.

Do not merge the PR or deploy from it without separate review and authorization. After any remote documentation commits are added, the user's local checkout should fetch and fast-forward the integration branch with `git pull --ff-only`; do not use a force operation. The untracked audit dry-run JSON should remain untouched.

## Resume commands

From `C:\\GHM-checksum-validation`:

```powershell
git fetch origin
git switch integration/ghm-dependency-security-refresh
git pull --ff-only
git status --short --branch
git log -5 --oneline --decorate
```

Then inspect the PR and its CI checks. Keep the local untracked audit file; do not add it to the PR.
