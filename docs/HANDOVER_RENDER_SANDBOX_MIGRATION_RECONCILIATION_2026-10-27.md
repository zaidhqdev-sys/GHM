# Handover — Render sandbox migration reconciliation (2026-10-27)

## Purpose

Resume the Render sandbox database migration-ledger investigation without repeating completed forensics or risking database/repository state. This note records verified results and the next safe action. It is a handover, not authorization to modify the database.

## Safety constraints

- **No database migrations have been run as part of this investigation. No database ledger rows have been changed.**
- Do not insert, delete, rename, or rewrite migration-ledger entries just to make counts/checksums line up.
- Do not run migration/deploy commands, reset the database, or stage/commit migration changes without explicit approval.
- Keep all investigation read-only until the two unexplained ledger entries have been identified and their provenance verified.
- The user is working locally in Windows PowerShell at `C:\GHM-main`. The assistant cannot execute commands in that local shell; ask the user to paste outputs.
- Be concise and give one bounded set of commands at a time. Avoid risky broad commands and do not assume a command was run unless its output was provided.

## Verified audit snapshot

The prior forensic audit reported:

- 79 migration files in the repository.
- 89 entries in the sandbox migration ledger.
- 0 repository migrations missing from the sandbox ledger.
- 1 checksum mismatch was investigated and resolved by recovering the exact Git blob.
- Of the 10 ledger entries without a corresponding current repository migration, 8 were previously classified as approved retained historical entries and 2 remain unexplained:
  - `20261019190000` — `create_business_engagement_events`
  - `20261019210000` — `create_business_registration_identity`

Treat the above as the last reported snapshot, not a claim that a new audit has been run since.

## Recovered migration: exact evidence and preservation

File:
`database/migrations/20261026120000_scope_storage_metadata_lookup.sql`

Expected SHA-256 from the sandbox ledger:
`286762d4abf4c89ac14be8d159f376bf594f4394b91f3453deab1fa55db0d9f7`

The exact file bytes were recovered from Git blob:
`55b6ccbb9802b573a02bb0d59f1586c453ac28ea`

The raw blob was exported using `git cat-file blob` through `cmd.exe` redirection (this avoided PowerShell/native-command redirection pitfalls), and the raw file and restored working file both produced the expected SHA-256. The original modified working copy was preserved as:

`C:\GHM-main\database\migrations\20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak`

The pre-recovery working copy differed from the ledger-matching version (including changes to transaction wrappers and a duplicate status predicate). Do not overwrite or delete the backup until the user explicitly approves cleanup.

The last reported Git diagnostics showed:
- `git rev-parse HEAD:database/migrations/20261026120000_scope_storage_metadata_lookup.sql` = `55b6ccbb9802b573a02bb0d59f1586c453ac28ea`
- `git hash-object database/migrations/20261026120000_scope_storage_metadata_lookup.sql` = the same blob ID.
- `git status --short` still showed the migration as modified and the backup as untracked, despite the blob IDs agreeing and `git diff --ignore-space-at-eol` showing no substantive diff. Git also warned that `core.autocrlf=true` may convert LF to CRLF.

This Git status anomaly is not the current priority. Do not blindly run `git restore`, `git checkout`, `git reset`, `git add`, or change line-ending settings to clear the status. The verified working-file SHA-256 and backup are more important than cosmetic status cleanup.

## Environment/tool lessons

- The user's shell is Windows PowerShell.
- Avoid scripts that depend on PowerShell preserving quotes through native command invocation. For exact Git blob export, the known-working pattern was:
  ```powershell
  $blob = "55b6ccbb9802b573a02bb0d59f1586c453ac28ea"
  $tempFile = Join-Path $env:TEMP "ghm-migration-git-blob.raw"
  cmd.exe /d /c "git cat-file blob $blob > `"$tempFile`""
  Get-FileHash $tempFile -Algorithm SHA256
  ```
- Do not use `.NET SHA256.HashData` in this environment; it was unavailable. Use `Get-FileHash -Algorithm SHA256`.
- The recovered file's SHA-256 must be compared against the exact expected hash; do not normalize newlines or rewrite the file before verifying it.

## Next action: investigate only the two unexplained ledger entries

Do not modify the database. First inspect the local repository and all locally available Git history for the two migration names. Run this read-only PowerShell block from `C:\GHM-main` and paste the complete output:

```powershell
$patterns = @(
  '*20261019190000*',
  '*20261019210000*',
  '*create_business_engagement_events*',
  '*create_business_registration_identity*'
)

'=== Matching files in working tree ==='
Get-ChildItem -Path . -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object {
    $name = $_.Name
    $patterns | Where-Object { $name -like $_ }
  } |
  Select-Object FullName, Length, LastWriteTime

'=== Matching paths in all locally available Git refs/history ==='
git log --all --full-history --name-status --pretty=format:'COMMIT %H %ad %s' --date=iso -- database/migrations |
  Select-String -Pattern '20261019190000|20261019210000|create_business_engagement_events|create_business_registration_identity' -Context 3,3

'=== Commit subjects mentioning the migration names ==='
git log --all --oneline --regexp-ignore-case --grep='business engagement events' --grep='business registration identity'
```

Notes:
- This is a repository/history search only; it does not query or mutate the database.
- If the recursive working-tree search is too slow, stop it with Ctrl+C and use a narrower search under `database\migrations`, `docs`, and any known migration/archive folders.
- Do not assume no result means the migrations never existed: history may be missing locally, a remote branch may not be fetched, or the ledger descriptions may not match filenames.
- If migration files or commits are found, inspect their content and provenance before deciding whether the ledger entries are legitimate. If nothing is found, the next step is a read-only inspection of the two ledger rows' available metadata and relevant deployment/release history—not a ledger edit.

## What to report at the next handover

Record:
1. Whether either migration file was found locally.
2. Whether any commit/ref contains either migration and its exact path/blob/commit.
3. The evidence for classifying each ledger entry as approved historical, legitimate but absent from current source, or unexplained.
4. Confirmation that no database changes were made.
5. The next smallest read-only action.

## Completion criteria

This investigation is not complete until both unexplained entries have a documented, evidence-backed explanation or are explicitly left unresolved for the owner to decide. A matching migration count alone is not proof of consistency, and a checksum match for one migration does not resolve the two unexplained ledger entries.
