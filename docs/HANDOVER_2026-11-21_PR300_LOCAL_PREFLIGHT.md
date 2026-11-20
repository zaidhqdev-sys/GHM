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


## 21 November 2026 — preservation verification

The user completed the requested preservation-copy step in `C:\GHM-main`.

Verified output:
- `C:\GHM-preflight-preservation-20261121\20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak` — 881 bytes.
- `C:\GHM-preflight-preservation-20261121\picomatch-reachability-scan.txt` — 369 bytes.
- The original working-tree copies remain present as untracked files:
  - `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak`
  - `picomatch-reachability-scan.txt`
- Git status still shows branch `feat/signed-business-capability-create`, no tracked modifications, and `[behind 64]` relative to `origin/feat/signed-business-capability-create`.

The copies are confirmed present; originals were not deleted or modified. The user has not yet run the local branch fast-forward. Remote PR review repeated: #300 open/not draft/mergeable=false; #298 open/draft/mergeable=true; #297 open/draft/mergeable=false. These remain separate workstreams.

### Next local operation — fast-forward only

The preservation gate is satisfied. In `C:\GHM-main`, first check that the current branch and status still match the above. Then fast-forward the local PR branch to the already-fetched remote feature ref using `git merge --ff-only origin/feat/signed-business-capability-create`. This is intentionally **not** the merge of `origin/main`; do not use pull, rebase, reset, stash, clean, or force-push. After the fast-forward, capture status, HEAD, origin feature SHA, origin main SHA, and `git rev-list --left-right --count origin/main...HEAD`. Stop if Git refuses the fast-forward or if any unexpected working-tree state appears.

No production or Render changes were made. No migration was executed. No PR was merged.


## 21 November 2026 — PR #300 local feature fast-forward verified

The user ran the approved local fast-forward in `C:\GHM-main`.

Verified terminal evidence:
- Before operation, local feature HEAD was `32c7681ec8ffeb00764ca304a1952638a0fd7898`.
- Fetched remote feature ref was `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`.
- `git merge --ff-only origin/feat/signed-business-capability-create` completed successfully as a fast-forward (20 files changed; no conflict).
- After operation, local HEAD and `origin/feat/signed-business-capability-create` both equal `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`.
- `origin/main` remains `0dc1b27c2b7de71c77d071966a9f374e13075e2b`.
- `git rev-list --left-right --count origin/main...HEAD` now returns `2 92`, confirming the local branch is synchronized with the PR head and is 92 commits ahead / 2 behind main.
- The two untracked original files remain present and unchanged in the working tree. Their preservation copies were verified in `C:\GHM-preflight-preservation-20261121` (881 bytes and 369 bytes respectively). No tracked modifications were reported.

Mandatory remote review repeated before proposing the next operation:
- Re-read this preflight handover and the canonical Actor Gateway migration-batches handover.
- PR #300 remains open, ready for review (not draft), at head `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`; GitHub still reports `mergeable=false`.
- Remote comparison remains 92 ahead / 2 behind, merge base `ddb31ff59ab470973edf60a5078a75e5f962f803`.
- Exact-head CI run #5451 / workflow run `44779726228` completed successfully on the pre-synchronization head. It is not a qualification of a newly synchronized merge result.
- PR #301 and #302 are closed/merged. PR #298 remains open/draft and separate; PR #297 remains open/draft and separate. No migration-batch or production authorization follows from PR #300.
- PR #300 description confirms no production migration/manual cutover has been run; PayFast remains out of scope.

### Next local operation

The local feature branch is now safely synchronized to its remote head. The next step is to merge current `origin/main` into this feature branch using a normal merge, preserving the two untracked files. Do not rebase, reset, stash, clean, or force-push. Before merging, recheck status and exact refs. If the working tree still contains only the two known untracked preserved originals, run `git merge --no-commit --no-ff origin/main` so the merge can be inspected and semantic conflicts resolved before creating the merge commit. If any unexpected state exists, stop.

Expected semantic conflict areas remain:
- Preserve mainline Actor Gateway startup-stage diagnostics while retaining the signed Business Capability route.
- Preserve mainline's corrected capability governance migration and its migration contract test.
- Reconcile the catalogue governance qualification script to retain mainline Gateway route checks and least-privilege legacy EXECUTE denial checks.
- Preserve mainline's 43-function / 1,024-stage runtime privilege model; do not regress to the PR branch's 39-function / 256-stage model. Integrate signed-create permission/cutover behavior into the mainline model and verify all relevant cutover combinations.
- Run targeted tests and full disposable PostgreSQL 18 qualification after resolving conflicts; then push normally and require fresh exact-head CI plus GitHub mergeability before considering merge.

No source changes, merge of main, push, PR merge, production migration/cutover, production database/ACL/role change, secret/environment change, Render configuration/deployment, backup operation, payment activation, or paid resource change was performed in this fast-forward task.
