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


## 21 November 2026 — PR #300 mainline merge started; semantic conflicts isolated

The user ran the approved `git merge --no-commit --no-ff origin/main` from the synchronized feature branch.

Terminal evidence:
- Pre-merge feature HEAD: `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`.
- `origin/main`: `0dc1b27c2b7de71c77d071966a9f374e13075e2b`.
- Git auto-merged:
  - `database/migrations/20261117020000_revoke_runtime_capability_governance.sql`
  - `scripts/qualify-capability-catalogue-governance.mjs` (then reported content conflict)
  - `src/db/runtime-database-privileges.test.ts` (then reported content conflict)
  - `src/db/runtime-database-privileges.ts` (then reported content conflict)
- Explicit content conflicts:
  - `scripts/qualify-capability-catalogue-governance.mjs`
  - `src/db/runtime-database-privileges.test.ts`
  - `src/db/runtime-database-privileges.ts`
- Git reports merge failed pending conflict resolution; no merge commit has been created.

The migration file was auto-merged, but it must still be inspected to ensure mainline's `pg_temp` SECURITY DEFINER search_path guard and signed-create migration changes are both retained. The mainline contract test `src/db/revoke-runtime-capability-governance-migration-contract.test.ts` must also exist in the merge result.

Remote review for this task:
- Re-read this handover and the canonical migration-batches handover; rechecked PR #300 metadata and current branch comparison.
- PR #300 remains open/not draft and GitHub reports `mergeable=false`.
- Mainline #301/#302 are closed/merged; PRs #297/#298 remain separate draft migration workstreams.
- No production migration, manual cutover, production DB/ACL/role change, Render setting/deployment, secret, or payment state was changed.

### Immediate next action — inspect, do not resolve blindly

The assistant cannot inspect the user's in-progress local index/worktree directly. Before proposing conflict edits, collect the exact unmerged paths, conflict-marker locations, and combined diffs from the local checkout. Do not run `git add`, `git checkout --ours/theirs`, `git restore`, `git merge --abort`, or commit yet. Keep the merge paused and preserve the two known untracked files.

Use:
```powershell
git status --short
git diff --name-only --diff-filter=U
Select-String -Path "scripts\qualify-capability-catalogue-governance.mjs","src\db\runtime-database-privileges.test.ts","src\db\runtime-database-privileges.ts" -Pattern '^(<<<<<<<|=======|>>>>>>>)'
git diff --cc -- "src/db/runtime-database-privileges.ts"
git diff --cc -- "src/db/runtime-database-privileges.test.ts"
git diff --cc -- "scripts/qualify-capability-catalogue-governance.mjs"
```
Return the complete output. Then reconcile semantics using the actual stage definitions and qualification checks. Preserve mainline's 43-function baseline and 1,024-stage state model; do not choose either side wholesale. Ensure the merged script retains signed Gateway catalogue route checks and legacy EXECUTE denial assertions. Verify the auto-merged migration and mainline migration contract test before staging.

No conflict resolution, staging, merge commit, push, CI rerun, PR merge, production operation, or deployment was performed in this task.


## 21 November 2026 — PR #300 conflict evidence reviewed against both remote source branches

The user supplied the complete read-only local conflict report. Confirmed:
- Three unresolved files only: catalogue qualification script, runtime privilege implementation, runtime privilege tests.
- The mainline governance migration is staged as modified, Actor Gateway server is staged as modified, and the mainline governance migration contract test is staged as added.
- The contract test exists locally (`Test-Path=True`).
- Both known untracked files remain present.
- No conflict markers were reported outside the three expected files.

Remote source review confirmed:
- Main's `src/db/runtime-database-privileges.ts` defines a 43-function baseline and ten independent cutover groups, yielding 1,024 reviewed states. It explicitly separates registration read, registration write, and capability governance groups. Its complete implementation also keeps the thirteen-function fully cut-over state.
- Feature branch implementation defines a 39-function baseline and eight groups / 256 states. It combines registration read/write into one group and lacks the three-function capability-governance group. It must not replace main's ten-group/1,024-state model.
- Main's runtime privilege test has the ten-group expectations and asserts that registration write is removed by the automatic migration while registration read is removed by the separate manual cutover. This test expectation is the authoritative mainline direction to preserve; review the merged migration content against it before claiming consistency.
- Feature branch's added manual cutover SQL `database/cutovers/20261120012000_revoke_legacy_business_capability_runtime_create.sql` revokes direct INSERT and sequence privileges on `ghm.business_capability`; it is not a SECURITY DEFINER function EXECUTE cutover and does not add an eleventh runtime function group.
- Feature branch's signed Business Capability SQL function is `ghm.gateway_create_business_capability(bigint,bigint,uuid,text,text,jsonb)`, with SECURITY DEFINER search_path `pg_catalog, ghm, pg_temp`, signed actor assertion, active business/membership/capability checks, and append-only insert. This feature is distinct from the Capability Catalogue governance functions `create_capability_draft`, `update_capability_draft`, and `transition_capability_lifecycle`.
- The feature's catalogue qualification script contains both the signed Gateway catalogue route checks and legacy EXECUTE denial/version-probe checks. Main's version contains the current Gateway route checks and direct gateway SQL calls. Reconcile without losing either the current route coverage or the legacy denial assertions; do not copy older helper/API-shape code over main wholesale.
- The feature's registration group conflation and reduced inventory are stale relative to main. The feature's capability-create table/sequence cutover is a separate permission dimension and must remain covered by its own cutover qualification, not misrepresented as a SECURITY DEFINER EXECUTE stage.

### Next resolution preparation

Before editing local conflict files, inspect the merged governance migration and contract test together, and capture the exact current mainline migration content. Also inspect the full catalogue script on both sides around setup helpers, Gateway create/update/transition calls, legacy denial assertions, and cleanup. No blind `ours/theirs` resolution.

Local commands to collect exact merge-stage content without changing the index:
```powershell
Write-Host "=== Governance migration in merge worktree ===" -ForegroundColor Cyan
Get-Content "database\migrations\20261117020000_revoke_runtime_capability_governance.sql"
Write-Host "=== Migration contract test ===" -ForegroundColor Cyan
Get-Content "src\db\revoke-runtime-capability-governance-migration-contract.test.ts"
Write-Host "=== Catalogue qualification script, current conflict worktree ===" -ForegroundColor Cyan
Get-Content "scripts\qualify-capability-catalogue-governance.mjs"
```
Do not stage, commit, abort, push, or alter production. After this inspection, prepare precise merged file contents that preserve main's 43/10/1,024 runtime function state model, signed Business Capability route coverage, and the feature's legacy denial/version-probe assertions.

## 21 November 2026 — user supplied full merged-file inspection output

Read the user's uploaded 670-line PowerShell transcript. It confirms:
- The merged governance migration content is complete and retains the required search_path=pg_catalog, ghm, pg_temp guard, schema-owner SECURITY DEFINER checks, Actor Gateway EXECUTE requirement, runtime EXECUTE denial, and revocation/verification of the three legacy capability-governance functions.
- The mainline migration contract test is present and asserts the pg_temp-last pinned search_path plus schema-owner SECURITY DEFINER and privilege checks.
- Merge worktree status at capture: staged/merged governance migration SQL, Actor Gateway server, migration contract test; unresolved catalogue qualification script, runtime privilege test, runtime privilege implementation; untracked preserved originals: storage metadata backup (881 bytes) and picomatch scan output (369 bytes).
- The catalogue script conflict has multiple blocks, not just the first displayed conflict. The feature side has typed helper wrappers gatewayCreateDraft, gatewayUpdateDraft, and gatewayTransition that return normalized camelCase records; main side uses raw gatewayCall and PostgreSQL snake_case rows. A safe resolution must use one representation consistently in each block. The feature helper wrappers are assertion-bound and should be retained where used; raw gatewayCall calls also remain assertion-bound. Do not mix lifecycleStatus/isSelectable with lifecycle_status/is_selectable for the same returned object.
- Preserve both runtime legacy create denial checks: ordinary call denial and unsupported-version/version-bypass denial. Tighten expected error only if actual PostgreSQL error behavior is stable; the feature's exact permission denied for function create_capability_draft expectation is more specific than main's generic permission denied.
- Preserve Gateway signed assertion substitution tests (create, update target/payload, transition target/payload), Gateway admin list/create/update/transition positives, non-admin denial, lifecycle hierarchy/replacement/terminal-state tests, runtime direct table/function denial, and final runtime-vs-gateway privilege boundary assertions.
- The runtime privilege source conflict must resolve to main's 43-function / 10-group / 1,024-stage model. Main's group list independently models registrationIdentityWrite, registrationIdentityRead, and capabilityGovernance. Feature's 39-function / 8-group / 256-stage model is stale and cannot be retained.
- Correcting an earlier shorthand: main's runtime stage test includes both registration read and write in the pre-manual-cutover inventory, then models the write-only and read/write cutover groups separately. Do not claim registration write is already excluded from main's pre-cutover baseline. The exact mainline test assertions define the intended stage behavior.
- Feature's separate Business Capability direct INSERT/sequence revoke migration is a distinct table/sequence permission cutover and is not an additional function group. Keep it separate from the runtime function-stage inventory and ensure its own SQL/migration contract qualification remains present.
- No conflict file has been resolved or staged by the user in the supplied transcript; merge remains paused.

No merge commit, push, PR merge, production DB migration, manual production cutover, ACL/role/secret/Render configuration change, deployment, or payment activation occurred.
## 21 November 2026 — PR #300 concrete conflict-resolution plan prepared

Fresh source review repeated before this task: re-read both PR #300 preflight and canonical migration-batches handovers; re-fetched PR #300/#298/#297 metadata and the exact current main and feature source files. PR #300 remains open/unmerged at feature head 6ea0df0610441a54e0f5f55b51a9ca5f13dc4700; local merge is still paused with three unresolved files.

Confirmed source-side resolutions:
- src/db/runtime-database-privileges.ts: use exact current main version (43 baseline functions, 10 independent groups, 1,024 states). Feature version is stale (39 / 8 / 256) and has removed the capabilityGovernance group and split registration write/read incorrectly.
- src/db/runtime-database-privileges.test.ts: use exact current main test as the base (43 / 10 / 1,024 and separate registration write/read stage tests). Feature's assertion that capability-governance legacy functions are absent from the pre-cutover baseline is not compatible with main's current baseline. If adding a specific assertion, assert these three functions are in the baseline and are absent only after the capabilityGovernance group is cut over.
- scripts/qualify-capability-catalogue-governance.mjs: main is the correct base for the latest route and Resource API/service contract. Feature adds useful typed gateway row mapping/helpers, both legacy create denial/version-probe checks, and explicit gateway-vs-runtime privilege assertions. Reconcile those additions onto main rather than taking either side wholesale. Preserve main's Gateway non-admin create denial; feature's service-layer non-admin denial may also be retained as additional coverage. Use one return shape consistently: helper-mapped camelCase objects or raw PostgreSQL snake_case rows.

Recommended safe local sequence: resolve the two TypeScript files to origin/main in the working tree without staging, inspect the diff, then reconcile the script. Use git restore --source=origin/main --worktree -- <two TypeScript paths>; this writes main's exact versions to the worktree but does not stage. Do not use git restore on the script. After verifying all three files contain no conflict markers, run focused unit tests. Stage only after review.

No local worktree edits have been made by the assistant. No merge commit, push, PR merge, production operation, deployment, or paid resource change occurred.
## 21 November 2026 — runtime privilege conflict worktree restored; index still unresolved

The user ran `git restore --source=origin/main --worktree --` for the runtime privilege implementation and test. The output confirms the worktree implementation contains the 43-function guard, 1,024-stage guard, and independent registrationIdentityWrite, registrationIdentityRead, and capabilityGovernance groups.

Important Git index detail: `git restore --worktree` changes only the working-tree copy. `git status` still reports both files as `UU`, and `git diff --name-only --diff-filter=U` still lists them. This is expected until the chosen resolution is staged. The current intended resolution for these two files is exactly `origin/main`; verify `git diff --exit-code origin/main -- <paths>` returns zero before staging them. Then stage only these two paths with `git add -- <paths>` to mark those conflicts resolved. Do not stage the catalogue script or any untracked file.

PR #300 remains open, not draft, and GitHub reports `mergeable=false`; no source branch refs have been pushed or PR merged. Both runtime files are the only conflicts being resolved in this step; the catalogue script remains unresolved and must be reconciled separately. No tests, merge commit, push, production operation, or deployment have been performed yet.
## 21 November 2026 — runtime privilege conflicts resolved in index; catalogue script reconciliation prepared

User terminal confirms both runtime privilege files were verified byte-for-byte against origin/main in the working tree and staged. `git status` now shows them as staged `M`, and the only unresolved path reported by `git diff --name-only --diff-filter=U` is `scripts/qualify-capability-catalogue-governance.mjs`. The two preserved untracked files remain untouched.

Fresh remote source review: PR #300 remains open, not draft, head 6ea0df0610441a54e0f5f55b51a9ca5f13dc4700; GitHub reports mergeable=false. Re-read both PR #300 preflight and canonical migration-batches handovers. PRs #297/#298 remain separate migration-batch workstreams; no production changes authorized.

Compared exact main script (blob b53ddc1875186202307bfe5c96d233de665db906) with feature script (blob d90148189ae683ef1ec1605cd9b4f1733f433ab3). The feature script is the appropriate integration base: it retains main's Gateway list non-admin denial, admin Gateway route tests, lifecycle coverage, and mainline qualification structure, while adding typed Gateway row mapping/helpers, signed substitution tests, both explicit legacy create EXECUTE/version-probe denials, and the runtime-vs-Gateway privilege boundary query. It also adds service-layer non-admin create denial. One mainline check absent from feature script is the direct Gateway non-admin draft-create denial; preserve it as an additional check rather than dropping the service-layer denial.

Prepared resolution: restore the conflicted script worktree from the current feature HEAD (not the index), then insert main's missing Gateway non-admin draft-create denial immediately after the feature's service-layer non-admin draft-create denial. Keep helper-mapped camelCase values in helper-based calls and raw snake_case values only for raw gatewayCall result rows. Then syntax-check and verify no conflict markers. This avoids manually stitching dozens of repeated lifecycle call blocks.

Do not stage the script until the local insertion, syntax check, conflict-marker check, and diff review pass. No merge commit, push, tests, production operation, or deployment performed in this task.
## 21 November 2026 — catalogue script insertion guard correctly stopped; pattern corrected

The user attempted the prior PowerShell insertion after restoring the script from origin/feat/signed-business-capability-create. The script restore succeeded, but the exact-text guard found zero matches and threw before writing. Therefore no catalogue script edit occurred. This is a safe no-change outcome.

Re-inspected exact feature-branch script blob d90148189ae683ef1ec1605cd9b4f1733f433ab3. The service denial block is formatted as a four-line expectReject call (not the five-line shape used by the previous needle). Immediately afterward, the script begins the runtime direct legacy-create denial. The Gateway non-admin list denial exists earlier, but a direct Gateway non-admin draft-create denial is absent.

PR #300 remains open/not draft at head 6ea0df0610441a54e0f5f55b51a9ca5f13dc4700 and GitHub still reports mergeable=false. Runtime implementation and test are staged as resolved mainline files; catalogue script remains the sole unresolved path. Do not stage the script or create a merge commit until corrected insertion, node --check, conflict-marker scan, and diff review pass.

Next local command should use a whitespace-tolerant regex anchored to the literal service.createDraft call and exact service denial marker, require exactly one match, then insert a gatewayCall(businessId, 'capability.create', 'SELECT * FROM ghm.gateway_create_capability_draft($1,...,$11)', [marker-derived values]) expectReject with marker GATEWAY NON-ADMIN DRAFT DENIAL PASS and expected 'System administrator permission required'. No edits made by assistant.
## 21 November 2026 — catalogue script syntax passes; conflict-marker check used stale PowerShell exit code

User's latest terminal output confirms the feature script restore and Gateway non-admin denial insertion succeeded, `node --check` passed, and all four expected denial markers are present (service non-admin, Gateway non-admin, legacy function EXECUTE denial, legacy version-probe denial).

The subsequent conflict-marker check threw. Diagnosis: the command tested `$LASTEXITCODE` after invoking PowerShell's `Select-String` cmdlet. `$LASTEXITCODE` is set by native executables (here `node --check`) and is not a reliable result indicator for `Select-String`; it remained 0 from the successful Node syntax check, causing a false positive even if Select-String found no markers. The next check must capture cmdlet output and test `$null -ne $hits`, or use `git diff --check`/`git grep` appropriately. The remote main and feature script blobs were checked and contain no conflict-marker lines. Local script still needs an explicit accurate scan before staging.

Do not stage script yet. Current index conflict must be marked resolved only after local scan and diff review. PR #300 remains open/not draft at head 6ea0df0610441a54e0f5f55b51a9ca5f13dc4700; GitHub reports mergeable=false. No merge commit, push, tests beyond node syntax check, production operation, or deployment performed.
## 21 November 2026 — local catalogue script clean scan and diff review

User's latest terminal confirms the local catalogue script has no conflict-marker lines and `node --check` passes. Typed Gateway helpers, signed substitution flows, Gateway non-admin create denial, service non-admin denial, legacy create EXECUTE denial, and legacy version-probe denial are present.

Combined diff review exposed only indentation cleanup needed around the newly inserted Gateway denial and following runtime direct-create denial: Gateway `await expectReject` currently has four leading spaces instead of two; following runtime `await expectReject` currently has zero leading spaces instead of two. Syntax remains valid, but normalize before staging. Git warns LF will be replaced by CRLF on next touch; this is a line-ending warning, not a syntax/conflict failure.

After indentation normalization, re-run node --check, exact conflict-marker scan using `$null -ne $markers`, inspect `git diff -- scripts/qualify-capability-catalogue-governance.mjs`, then stage only this script with `git add -- scripts/qualify-capability-catalogue-governance.mjs`. Verify `git diff --name-only --diff-filter=U` is empty. Keep the two untracked files untracked. Then run targeted qualification and inspect the exact SQL signature/error behavior. No merge commit or push yet.

## 21 November 2026 — catalogue qualification script indentation corrected

The user supplied the latest local terminal output from `C:\GHM-main` during the paused PR #300 mainline merge.

Verified:
- Both exact formatting targets matched once each: the Gateway non-admin draft-create assertion and the following runtime legacy-create denial assertion.
- The formatting-only corrections were applied. Both `await expectReject(` statements now use the intended two-space indentation.
- `node --check scripts\qualify-capability-catalogue-governance.mjs` passed.
- The conflict-marker scan returned no markers.
- `git diff --check` reported no whitespace errors. Git emitted only the standard working-copy LF-to-CRLF conversion warning.
- The displayed source lines confirm the Gateway non-admin create probe and runtime legacy create denial probe are properly nested and followed by the separate version-probe denial.

Current local merge state at the user's capture:
- `scripts/qualify-capability-catalogue-governance.mjs` remains the only unresolved path (`UU`).
- The governance migration, Actor Gateway server, mainline migration contract test, and both mainline runtime privilege files are staged as the intended merge resolutions.
- The two preserved untracked originals remain present:
  - `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak`
  - `picomatch-reachability-scan.txt`
- No merge commit or push has occurred.

Remote review repeated before this continuation:
- Re-read this local preflight handover and the canonical Actor Gateway migration-batches handover.
- PR #300 remains open, ready for review (not draft), at feature head `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`; GitHub reports `mergeable=false` because the local merge has not been pushed.
- PR #298 remains open/draft and separate; PR #297 remains open/draft and separate. Neither authorizes production migration execution.

### Next local operation

Before staging the script, inspect its complete diff against the merge base/stages and review that the reconciliation retains mainline Gateway catalogue route checks, typed feature helper usage consistently, signed assertion substitution checks, service- and Gateway-level non-admin denials, both legacy runtime EXECUTE denial probes, lifecycle checks, and runtime-versus-Gateway privilege boundary assertions. Then stage **only** `scripts/qualify-capability-catalogue-governance.mjs`; verify `git diff --name-only --diff-filter=U` is empty and that the two untracked files remain untouched. Do not commit or push until targeted tests and disposable PostgreSQL qualification pass.

No production database, migration ledger, ACL/role, secret/environment, Render configuration/deployment, backup, payment state, or paid resource was changed in this task.


## 21 November 2026 — user's combined-diff review output examined; Gateway bind arity requires verification

The user supplied the read-only review output from `C:\GHM-main`.

Confirmed from the transcript:
- The only unresolved path remains `scripts/qualify-capability-catalogue-governance.mjs`.
- The mainline runtime implementation and test are staged as resolved; their staged diff retains the 43-function / ten-transition / 1,024-stage model and separately represents registration read, registration write, and capability-governance transitions.
- The mainline governance migration, Actor Gateway server, and migration contract test are staged.
- The two preserved untracked originals remain present and untracked.
- The catalogue script combined diff shows the service-layer non-admin denial plus the added Gateway non-admin create denial, followed by the two runtime legacy create denial probes. No conflict marker or whitespace failure was reported in the immediately preceding user output.

A concrete correctness check remains before staging:
- The newly inserted Gateway denial call text contains placeholders `$1` through `$11`, while the visible supplied argument array contains seven values.
- This is not yet confirmed to be a defect because the `gatewayCall` helper may inject signed-assertion bind values. Inspect the helper definition and its argument transformation before deciding. If it does not append four values, the SQL bind arity is inconsistent and must be fixed before qualification.
- The user's combined diff excerpt is not a complete review of every conflict hunk; inspect the helper and the exact Gateway denial call in context, then review the complete script diff/stage content before staging.

Next local read-only inspection:
```powershell
Write-Host "=== Gateway helper definition and bind handling ===" -ForegroundColor Cyan
Select-String -Path "scripts\qualify-capability-catalogue-governance.mjs" -Pattern "gatewayCall|gatewayCreateDraft|gatewayUpdateDraft|gatewayTransition|gateway_create_capability_draft" -Context 8,18
Write-Host "=== Exact Gateway non-admin assertion ===" -ForegroundColor Cyan
$lines = Get-Content "scripts\qualify-capability-catalogue-governance.mjs"
for ($i = 245; $i -le 280; $i++) { "{0,4}: {1}" -f ($i + 1), $lines[$i] }
Write-Host "=== Current unresolved paths and status ===" -ForegroundColor Cyan
git diff --name-only --diff-filter=U
git status --short
```

Do not stage the script until the helper's bind behavior and complete script reconciliation are verified. No local files or Git state were changed by this review; no merge commit, push, production operation, or deployment occurred.


## 21 November 2026 — Gateway non-admin create bind arity verified

The user supplied the requested helper inspection and merge-state output from `C:\GHM-main`.

Verified directly from the displayed `gatewayCall` helper:
- It creates the signed assertion from the original operation arguments.
- It sends five leading values to PostgreSQL: `accountId`, assertion issue time, nonce, context, and signature, followed by the original operation arguments.
- It shifts the original SQL placeholders from position 4 onward by one and inserts the assertion-context bind at position 4.
- Therefore the Gateway non-admin create assertion's seven original capability arguments correctly become twelve total bind values, matching the transformed SQL placeholders `$1` through `$12`. The apparent 11-placeholder/seven-value mismatch is not a defect; no code change is required for this concern.
- The Gateway helper and existing positive create call use the same binding convention. The service-layer and Gateway-level non-admin denial probes remain distinct.

Current state in the user's output:
- `scripts/qualify-capability-catalogue-governance.mjs` remains the only unresolved path (`UU`).
- Mainline runtime privilege implementation/test, governance migration, Actor Gateway server and migration contract test remain staged.
- The two preservation files remain untracked and must not be staged.
- No commit, push, production DB operation or deployment occurred.

PR #300 was rechecked while recording this result. Continue with local conflict resolution only after reviewing the complete combined script diff and final file content. Then stage only the script, verify the unresolved-path list is empty and the preservation files remain untracked. Do not commit/push until targeted tests and disposable PostgreSQL qualification pass.


## 21 November 2026 — catalogue script staged; all merge conflicts resolved in index

The user supplied the final local staging/verification output from `C:\GHM-main`.

Verified:
- `node --check scripts\qualify-capability-catalogue-governance.mjs` passed (the command proceeded to the required-marker checks).
- All eleven required qualification markers were present:
  - Gateway admin list and draft-create positive checks.
  - Gateway non-admin list and draft-create denials.
  - Service non-admin draft denial.
  - Capability request substitution rejection.
  - Forged and replayed actor assertion rejection.
  - Runtime legacy create EXECUTE denial and unsupported-version/version-probe denial.
  - Runtime capability-governance privilege-boundary check.
- Only `scripts/qualify-capability-catalogue-governance.mjs` was staged in this operation.
- `git diff --name-only --diff-filter=U` returned no paths: all merge conflicts are now resolved in the index.
- Staged merge paths now are:
  - `database/migrations/20261117020000_revoke_runtime_capability_governance.sql`
  - `scripts/qualify-capability-catalogue-governance.mjs`
  - `src/actor-gateway/server.ts`
  - `src/db/revoke-runtime-capability-governance-migration-contract.test.ts` (added)
  - `src/db/runtime-database-privileges.test.ts`
  - `src/db/runtime-database-privileges.ts`
- The two preservation originals remain untracked and were not staged:
  - `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak`
  - `picomatch-reachability-scan.txt`
- The signed Gateway bind helper was separately reviewed: it adds five assertion/context values and shifts original operation placeholders, so the seven capability arguments become twelve binds; the inserted denial call's apparent arity mismatch is not a defect.

Remote review repeated before this continuation:
- Re-read this preflight handover; refreshed PR #300/#298/#297 metadata and the relevant feature/handover branch listings.
- PR #300 remains open/not draft at remote head `6ea0df0610441a54e0f5f55b51a9ca5f13dc4700`, GitHub mergeable=false pending the local merge result being pushed.
- PR #298 remains open/draft and separate; PR #297 remains open/draft and separate. No production migration execution is authorized by these PRs.

### Next operation

The merge is now conflict-free in the index but remains uncommitted and unpushed. Before commit, inspect the **entire staged merge diff** and confirm only the six intended tracked paths are staged; keep the two preservation files untracked. Inspect `package.json` and the qualification script's environment/connection-target guard to identify the exact test commands and prove the PostgreSQL target is disposable/local before executing it. Run targeted unit/contract tests and the complete disposable PostgreSQL qualification; do not run against Render `ghm_db`. Do not create the merge commit or push until those checks pass. No production database, migration ledger, ACL/role, secrets, Render configuration/deployment, backup, payment state, or paid resource was changed.


## 21 November 2026 — staged diff reviewed; disposable-database target not yet proven

The user supplied the staged summary, package scripts, qualification connection setup, and final status from `C:\GHM-main`.

Confirmed:
- Exactly six intended tracked files are staged; the path-set comparison emitted no differences.
- Staged summary: 6 files changed, 122 insertions, 40 deletions.
- The two preserved originals remain untracked and excluded.
- The intended qualification entry point is `npm run qualify:capability-catalogue-governance`, which builds and runs `scripts/qualify-capability-catalogue-governance.mjs`.
- The script loads `dotenv/config`, then selects runtime connection from `GHM_RUNTIME_DATABASE_URL ?? DATABASE_URL`, Gateway from `GHM_ACTOR_GATEWAY_DATABASE_URL`, and cleanup/migrator from `GHM_MIGRATOR_DATABASE_URL`. It requires all three and requires them to be distinct, plus a 32-byte assertion test key.
- The inspected preflight does **not** establish that these URLs are local/disposable or reject production hosts. Distinct URLs alone do not establish safe targets. The qualification script creates test accounts/capabilities and performs cleanup through the migrator connection; therefore it must not be run until the actual resolved host/database/user identity for all three connections is independently confirmed as the disposable local qualification database and not Render `ghm_db`.
- No qualification command was run, and no database was touched.

Remote review before this update:
- PR #300 is still open, ready for review (not draft), GitHub mergeable=false pending the local conflict-resolution merge being published.
- PR #298 remains open/draft and separate; PR #297 remains open/draft and separate.
- Relevant feature branch and migration-batches handover branch still exist.
- The canonical preflight handover was re-read before appending this update.

### Next safe operation

Inspect the full script's connection setup and its query/identity checks, and inspect the local environment variable **names and safely redacted host/database components only**. Do not print credentials, passwords, full connection strings, or secrets. Use `new URL(connectionString)` locally to report hostname, port, database pathname, and username only; redact username if it embeds sensitive identifying data. Then establish that all three connections point to the same disposable local PostgreSQL instance (with separate intended roles), preferably by querying `current_database()`, `current_user`, `session_user`, `inet_server_addr()`, and `inet_server_port()` through each connection. Do not execute the qualification script until those checks confirm the target is local/disposable. If no safe disposable target is configured, stop and report that limitation rather than substituting production.


## 21 November 2026 — local dotenv probe found no qualification variables in process environment

The user supplied the connection-setup inspection and redacted environment probe from `C:\GHM-main`.

Verified:
- The qualification script imports `dotenv/config` and reads:
  - `GHM_RUNTIME_DATABASE_URL`, falling back to `DATABASE_URL`
  - `GHM_ACTOR_GATEWAY_DATABASE_URL`
  - `GHM_MIGRATOR_DATABASE_URL`
  - `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`
  - `DATABASE_SSL`
- The user's separate Node probe using `require('dotenv').config()` reported all four database URL variables as NOT SET. The probe did not report the assertion secret or DATABASE_SSL.
- Local Windows services `postgresql-x64-17` and `postgresql-x64-18` are both running.
- This does not prove the `.env` file is absent: the probe was run from the current working directory and only loaded the default `.env` path. It does establish that the expected variables were not loaded by that invocation. Need inspect the actual `C:\GHM-main\.env` file's existence and parse only the relevant variable names and redacted connection metadata. Do not print secrets or full connection strings.
- The qualification script's three database pools remain unverified. Do not run qualification until the three target identities are confirmed local/disposable and separate roles on the intended local PostgreSQL instance. Never substitute Render `ghm_db`.

Remote review repeated before this task:
- Re-read this preflight handover.
- PR #300 remains open/not draft and GitHub mergeable=false; PR #298 remains open/draft and mergeable=true; PR #297 remains open/draft and mergeable=false.
- Feature branch `feat/signed-business-capability-create` and handover branch `feat/actor-gateway-production-migration-batches` both still exist.

### Next action — inspect the actual local .env safely

From `PS C:\GHM-main>`, check the current directory and `.env` existence, then parse `.env` directly without loading or printing secret values. Report only presence, hostname, port, database name, and whether a username/password is set for each required URL; report assertion-secret presence and decoded byte length only. Also inspect whether `DOTENV_CONFIG_PATH` is set, but do not print any value that could contain a secret. No edits, staging, database connections, qualification, commit, or push in this inspection step.


## 21 November 2026 — confirmed no dotenv files in C:\\GHM-main

The user supplied the requested safe filesystem inspection:
- Working directory is `C:\\GHM-main`.
- `.env`, `.env.local`, `.env.development`, and `.env.production` are all absent in this checkout.
- `DOTENV_CONFIG_PATH` is not set.
- No credentials or secret values were printed.
- No database connection or qualification command was run.

This establishes that this checkout has no default dotenv file under those four names. It does **not** establish whether a separate `C:\\GHM\\.env` exists in the other known local checkout. Since the user specifically asked to check the .env, inspect that sibling checkout next without copying secrets into this checkout or displaying values. Do not search the whole disk or create a replacement .env. If the sibling file exists, report only the same redacted connection metadata and secret-presence checks; then assess whether those credentials are actually intended for local disposable qualification. A file's existence or distinct URLs still do not prove the database target is safe.

Remote review before this handover update:
- Re-read this preflight handover.
- PR #300 remains open/not draft with mergeable=false; PR #298 remains open/draft with mergeable=true; PR #297 remains open/draft with mergeable=false.
- Feature branch `feat/signed-business-capability-create` and handover branch `feat/actor-gateway-production-migration-batches` remain present.
- No source changes, local Git changes, database connections, qualification, merge commit, push, production operation, or deployment occurred.

### Next local inspection

From PowerShell, inspect only `C:\\GHM\\.env` existence and parse the exact five relevant variables safely (three database URLs, assertion secret, DATABASE_SSL). Never print raw values, usernames, passwords, or secret material. If no file exists, stop and report it. If it exists, report hostname, port, database name, and boolean credential presence only. Do not copy the file or point qualification at it until target identity is proven disposable/local.


## 21 November 2026 — STOP: C:\\GHM .env points all qualification pools at production ghm_db

The user supplied redacted connection metadata from `C:\\GHM\\.env` and clarified that `DATABASE_SSL` is distinct from an Actor Gateway database SSL-mode setting, which has not been entered into this .env.

Observed metadata:
- `GHM_RUNTIME_DATABASE_URL`: Render host `dpg-dag0sdtbedkc7389vi2g-a.frankfurt-postgres.render.com`, database `ghm_db`.
- `DATABASE_URL`: same Render host and database `ghm_db`.
- `GHM_ACTOR_GATEWAY_DATABASE_URL`: host `dpg-dag0sdtbedkc7389vi2g-a`, database `ghm_db`.
- `GHM_MIGRATOR_DATABASE_URL`: same Render host and database `ghm_db`.
- The assertion secret is present and decodes to 32 bytes.
- `DATABASE_SSL` is present.
- No raw URLs, usernames, passwords, or secret material were exposed in the transcript.

Critical conclusion:
- All three qualification pools point to the same **Render production database `ghm_db`**, despite different URL strings / host representations. This is not a disposable local qualification target.
- The qualification script provisions/updates the actor gateway assertion secret row, creates test accounts/capabilities, executes privileged operations, and attempts cleanup. Running it with these values would mutate production.
- **DO NOT RUN** `npm run qualify:capability-catalogue-governance` with this .env. Do not load these variables into `C:\\GHM-main`, do not change the URLs to make them appear distinct, and do not run the script against Render `ghm_db`.
- The user notes that Actor Gateway database SSL mode is separate and has not been configured in this .env. The qualification script itself uses `DATABASE_SSL === 'true'` to construct the pg TLS option for all three pools. This SSL distinction does not change the fact that the URLs target production. Do not guess or add an SSL mode setting.

Remote review repeated before recording:
- Re-read this PR #300 preflight handover.
- PR #300 remains open/not draft and not yet mergeable at the remote feature head; PR #298 and #297 remain separate draft PRs.
- Feature branch `feat/signed-business-capability-create` and handover branch `feat/actor-gateway-production-migration-batches` remain present.

Current task outcome:
- The local .env check is complete.
- No DB connection was made, no qualification ran, no production rows/secrets/ACLs were changed, and no merge commit/push/deployment occurred.
- The staged conflict-free merge state is unchanged; six intended tracked paths are staged and the two preservation files remain untracked.

Next safe direction:
- Do not proceed with live qualification. Continue with non-mutating checks that do not use database credentials: full staged diff review, package/unit/contract tests that do not connect to PostgreSQL, and static review of migration/script contracts.
- If disposable PostgreSQL qualification is essential, it requires an already-existing local disposable database with the required schema/migrations and separate runtime, Gateway, and migrator roles. Do not create a new paid DB/service, revive the sandbox, or use production as a substitute. If no such local database is available, record the qualification as unavailable and keep the PR unmerged until the owner chooses an acceptable safe path.
