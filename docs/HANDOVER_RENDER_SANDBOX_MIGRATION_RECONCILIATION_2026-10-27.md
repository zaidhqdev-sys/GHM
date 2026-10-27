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


## Addendum — remote branch/PR provenance discovered on 2026-10-27

The first remote GitHub investigation found both exact migration files on dedicated migration branches; the initial local-only search is therefore no longer the right first step.

### Business engagement events

- File: `database/migrations/20261019190000_create_business_engagement_events.sql`
- Git blob SHA: `c83965ce74347cc7ca3799e9b0f3f4f9460dcd2d`
- Found on `migration/business-engagement-events-20261019` and refreshed branch `migration/business-engagement-events-refresh-20261021`.
- Related refreshed PR [#174](https://github.com/zaidhqdev-sys/GHM/pull/174) was merged on 2026-10-21 into `integration/ghm-identity-merge-candidate-20261018`, merge commit `5d3958434afc16ab7d1c6db61fb334dcd4201e29`.
- PR #174 says the refreshed integration work carries the business-engagement implementation forward.

### Business registration identity

- File: `database/migrations/20261019210000_create_business_registration_identity.sql`
- Git blob SHA: `c1c3e4d9b4148376109177cf3106aa3519e15df6`
- Found on `migration/ghm-business-registration-identity-20261019` and refreshed branch `migration/business-registration-identity-refresh-20261021`.
- Related refreshed PR [#172](https://github.com/zaidhqdev-sys/GHM/pull/172) was merged on 2026-10-21 into `integration/ghm-identity-merge-candidate-20261018`, merge commit `7681736389b13c82a81f7a6419826204ef584676`.
- PR #172 describes a private self-declared registration identity table and narrow owner/administrator-authorized functions; it explicitly requires migration/security review before promotion.

GitHub code search on the default branch `main` did not return either filename/name, and the current `main` migration directory listing did not include either file. That does **not** prove the sandbox ledger entries are invalid: both files existed in dedicated branches and their changes were merged into the integration candidate branch. The branch/PR evidence is a strong lead for why the sandbox ledger may contain them, but it is not yet proof of which commit was deployed to Render or whether these exact file bytes match the sandbox ledger checksums.

### Revised next action

Do not repeat the broad search for these names. The next step is to establish deployment provenance and checksum equality, read-only:

1. Retrieve the two complete sandbox ledger rows (migration version/name, checksum, applied timestamp, and any execution/deployment metadata available). Do not change them.
2. Determine the exact commit/ref deployed to the Render sandbox around the migration timestamps, if available from Render deployment history or the owner’s records.
3. Compare that commit/ref with the integration candidate branch and the two PR merge commits above. Establish whether the deployed commit contains both migration blobs.
4. Compare each ledger checksum to the exact raw SQL bytes from its matching deployed commit/file. Do not assume a Git blob SHA is equivalent to a SHA-256 checksum; they are different hash schemes. Preserve raw bytes when hashing.
5. Until these checks agree, classify the two entries as **likely explained by integration-branch migration history, but not yet checksum/deployment-verified**. Do not edit ledger rows, run migrations, or promote/merge branches as part of this investigation.

The handover PR itself is documentation-only: [PR #188](https://github.com/zaidhqdev-sys/GHM/pull/188). It has not been merged at the time of this addendum.


## Addendum — Render inventory and target-database ambiguity (2026-10-27)

Read-only Render inventory identified three PostgreSQL instances in workspace `ZAID Technologies`:

- `ghm-db` — database `ghm_db`, ID `dpg-dag0sdtbedkc7389vi2g-a`, environment `evm-d9t1la7qj5pc73dludsg`.
- `ghm-payfast-sandbox-db` — database `ghm_payfast_sandbox_db`, ID `dpg-db4416vlk1mc73eocug0-a`, environment `evm-db43vk4s728c739fn460`.
- `ghm-identity-qualification-20261018` — database `ghm_identity_qualification_20261018`, ID `dpg-dba0tu3rjlhs738fs2sg-a`, environment `evm-db43vk4s728c739fn460`.

Related services:
- `ghm-payfast-sandbox-runtime` (`srv-db5vtgl9fdbs73eaclbg`) deploys from `main`, with auto-deploy enabled.
- `ghm-identity-qualification` (`srv-dbahvenbtjjs73f83rlg`) deploys from `integration/ghm-identity-merge-candidate-20261018`, with auto-deploy disabled.

A read-only Render Postgres query against `ghm_payfast_sandbox_db` returned no application tables and no migration ledger table. This is an important mismatch with the earlier reported 89-row ledger audit. Do **not** conclude that the ledger disappeared or recreate it: the query may have targeted a different database than the one used for the prior audit, or this Render database may be empty and not the audit target.

Attempts to query the other two Render databases through the hosted Render connection were blocked because their IP allowlists are empty. Do not change those allowlists to enable this investigation. The Render deploy history for `ghm-payfast-sandbox-runtime` shows the latest live deployment is from `main` commit `0da8fdc792fa7873a89c4b0d507b3b4047688e68` (2026-10-26). The qualification service's latest listed deployment is from integration commit `7fb1bbe07fc64ede652ae589ab72bdc96f23d906` (2026-10-26). This inventory alone does not establish which database was the earlier 89-row audit target.

### Revised immediate next step — identify the exact audited database before any further DB query

Ask the user for the exact database target used by the prior 89-row audit (Render instance name/ID or a redacted connection target showing only host and database name). Do not request credentials or a full connection string. Alternatively, have the user run a read-only query in the same already-approved local connection context used for that audit:

```sql
SELECT current_database() AS database_name,
       current_user AS connected_role,
       inet_server_addr()::text AS server_address,
       inet_server_port() AS server_port;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_name = 'ghm_schema_migrations'
ORDER BY table_schema, table_name;
```

Share only the results, not passwords, tokens, or a complete connection URL. Once the exact target is identified, repeat the SELECT-only lookup for the two ledger rows on that database. Do not use the Render database with no ledger as a substitute, and do not alter any IP allowlist, credentials, ledger row, or migration state.

### Updated assessment of the two entries

Both migration SQL files have now been recovered from remote Git branches with exact blob IDs and are associated with refreshed PRs merged into the integration candidate branch (#174 for engagement events and #172 for registration identity). This makes their provenance plausible and traceable, but **the actual database target and the two stored checksums still need to be matched**. Keep each entry classified as “branch/PR provenance found; applied-database and checksum match unverified” until that evidence is obtained.
