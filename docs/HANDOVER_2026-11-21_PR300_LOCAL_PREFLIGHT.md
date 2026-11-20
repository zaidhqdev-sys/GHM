# PR #300 local continuation preflight — 21 November 2026

**Related canonical handover:** `docs/HANDOVER_2026-11-17_ACTOR_GATEWAY_MIGRATION_BATCHES.md`  
**Task:** Review the user's local PR #300 preflight and establish the safe next operation.  
**Result:** Read-only review; no local files, refs, PR state, production resources, or deployments changed.

## Preflight evidence supplied from `C:\GHM-main`

The user ran the preflight in the established local checkout. Before switching, Git reported:

- Current branch: `feat/signed-business-capability-create`.
- Two untracked files:
  - `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak`
  - `picomatch-reachability-scan.txt`

The fetch completed and updated remote-tracking refs:

- `origin/main`: `0dc1b27c2b7de71c77d071966a9f374e13075e2b`.
- `origin/feat/signed-business-capability-create`: `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`.
- Migration-batch handover branch: `origin/feat/actor-gateway-production-migration-batches` advanced to `5a9446f6`.
- The two untracked files remained visible after switching; no evidence they were modified or deleted.

The local feature branch remained at `32c7681ec8ffeb00764ca304a1952638a0fd7898` and Git reported it was **64 commits behind** its remote-tracking branch. The local comparison `git rev-list --left-right --count origin/main...HEAD` returned `2 28`; this compares main with the stale local feature branch and must not be represented as the remote PR comparison.

## Fresh remote PR comparison

Compared the fetched remote refs by exact SHA:

- Main: `0dc1b27c2b7de71c77d071966a9f374e13075e2b`.
- PR #300 head: `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`.
- Merge base: `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- PR branch: **92 commits ahead / 2 commits behind** main.
- Compare status: diverged.

PR #300 remains open, ready for review (not draft), and GitHub reports `mergeable=false`. Its latest PR update observed in this review was 2026-11-20T23:33:55Z. Its description still reports disposable PostgreSQL CI run #5449 successful and explicitly states no production migration/manual cutover was run. This does not replace a fresh exact-head run after synchronization.

The two-commit mainline delta and semantic conflict findings in the canonical handover's preceding section remain applicable. In particular, preserve mainline startup diagnostics, the corrected governance migration and contract test, the mainline catalogue route checks, and the 43-function / 1,024-stage runtime privilege model. Do not substitute PR #300's stale 39-function / 256-stage model.

## Safe next operation

**Stop before any branch synchronization.** Do not pull, merge, rebase, reset, stash, clean, or delete files while the two untracked files remain unclassified. The user must first preserve both files outside the working tree or otherwise confirm their intended disposition. Do not add either file to the PR.

After preservation is confirmed:

1. Reconfirm `git status --short --branch` and verify the two files are safely preserved.
2. Fast-forward the local feature branch to `origin/feat/signed-business-capability-create` (the local branch is 64 commits behind; do not merge its stale 32c7681 state).
3. Recheck exact local HEAD and origin refs.
4. Merge `origin/main` into the up-to-date feature branch with a normal merge (no rebase, no force-push).
5. Resolve the documented semantic conflicts and run targeted tests plus full disposable PostgreSQL 18 qualification before pushing.
6. Recheck exact-head CI and GitHub mergeability. Merge only when all required checks pass and GitHub reports mergeable.

The existing Actor Gateway Render service and deployment remain downstream of the qualified code merge sequence. Do not create another service or divert into a separate deployment-debugging task. PRs #297 and #298 remain separate migration-batch work; production manifest stays empty and no production migration is authorized by this preflight.

## Explicit non-changes

No local branch update, branch switch beyond the user's reported switch, merge, rebase, reset, stash, cleanup, push, PR edit/merge, source modification, migration execution, production database/ACL/role change, secret/environment change, Render configuration/deployment, backup, payment activation, or paid resource change was performed by the assistant.
