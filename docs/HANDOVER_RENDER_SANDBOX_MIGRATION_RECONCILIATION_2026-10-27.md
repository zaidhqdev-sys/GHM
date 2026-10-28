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


## Addendum — deployed commit confirms both SQL files; sandbox target still unresolved (2026-10-27)

Further read-only checks were completed after the user confirmed the audit was against a sandbox database:

1. A direct read-only connection to Render Postgres instance `ghm-payfast-sandbox-db` (`dpg-db4416vlk1mc73eocug0-a`) confirms:
   - `current_database() = ghm_payfast_sandbox_db`
   - `current_user = ghm_payfast_sandbox_db_user`
   - `ghm_schema_migrations` table count = 0
   - A second catalog query found **zero non-system base tables** in that database.
2. Therefore this specific Render database is reachable but empty. It cannot be the same database state that produced an 89-row migration ledger unless the state/target has changed since the audit. Do not recreate tables or apply migrations to it.
3. The Render service `ghm-identity-qualification` is configured to deploy from `integration/ghm-identity-merge-candidate-20261018`. Its last listed deployment commit is `7fb1bbe07fc64ede652ae589ab72bdc96f23d906` (2026-10-26). Inspecting that exact commit's Git tree confirms both migrations are present with the expected Git blob IDs:
   - `database/migrations/20261019190000_create_business_engagement_events.sql` — `c83965ce74347cc7ca3799e9b0f3f4f9460dcd2d` (1502 bytes)
   - `database/migrations/20261019210000_create_business_registration_identity.sql` — `c1c3e4d9b4148376109177cf3106aa3519e15df6` (7295 bytes)
4. The separate Render Postgres instance `ghm-identity-qualification-20261018` (`dpg-dba0tu3rjlhs738fs2sg-a`) has an empty IP allowlist, and the hosted read-only query tool cannot connect. No allowlist, credentials, or database configuration was changed.
5. The service's deployed commit proves the files are included in the deployed source tree; it does **not** prove those migrations were applied to the database, nor does it provide the ledger checksums.

### Current conclusion

The two migration entries now have strong repository/deployment-source provenance. The remaining blocker is identifying which sandbox database held the reported 89-row ledger and reading its two checksums. The named PayFast sandbox database currently has no application tables. The identity qualification database is a plausible candidate because it is paired with the integration-branch service that deploys both files, but this is not yet confirmed and its ledger has not been inspected.

### Next safe step

Do not change the IP allowlist or use the empty PayFast sandbox database as a substitute. From the already-approved local connection context that produced the 89-row audit, run read-only identification and ledger queries. First confirm `current_database()`, then list non-system tables, then retrieve only the two matching rows from `ghm_schema_migrations`. Do not share secrets. Compare the stored SHA-256 checksums to the exact raw SQL bytes from deployed commit `7fb1bbe07fc64ede652ae589ab72bdc96f23d906`; Git blob SHA-1 IDs above are not interchangeable with SQL SHA-256 checksums.


## Addendum — likely audit target identified by user (2026-10-27 19:08 UTC)

The user states that because `ghm-payfast-sandbox-db` is empty, the earlier 89-entry ledger must be in `ghm-db` (`ghm_db`, Render ID `dpg-dag0sdtbedkc7389vi2g-a`). This is a reasonable hypothesis, but it remains **unverified**. The hosted Render read-only query connection to `ghm-db` was blocked because its IP allowlist is empty. Do not change the allowlist to test this.

Next safe step: use the same already-authorized local connection context that produced the 89-row audit to run read-only identification queries, and confirm `current_database()` before reading the ledger. Because `ghm-db` is the primary database, keep all access read-only and do not run migrations or alter data. If the 89-row audit did in fact target `ghm_db`, retrieve only the two target ledger rows and compare their stored checksums to the SQL bytes in deployed commit `7fb1bbe07fc64ede652ae589ab72bdc96f23d906`.


## Addendum — primary `ghm_db` catalog inspection (2026-10-27 19:09 UTC)

The user asked to proceed on the hypothesis that the original 89-entry ledger was in `ghm-db`. Read-only Render queries now establish the following:

- Connected database: `ghm_db`; connected role: `ghm_db_user`.
- The migration ledger table **does exist** at `ghm.ghm_schema_migrations` (not `public.ghm_schema_migrations`). The earlier public-schema-only check was insufficient and must not be interpreted as absence of the ledger.
- Catalog metadata reports the schema and table owner as `ghm_schema_owner`.
- `pg_stat_user_tables.n_live_tup` reports an estimated 78 live rows for `ghm.ghm_schema_migrations`. This is only a statistics estimate, not an exact count and not evidence for 89 rows.
- A direct SELECT against `ghm.ghm_schema_migrations` failed with `permission denied for schema ghm` for the hosted tool's `ghm_db_user` role. No permissions were changed.

### Next step

Use the already-authorized local database connection/role that performed the original audit, or ask the database owner to run these read-only queries. Do not grant privileges, change roles/allowlists, or modify data just to make the hosted query tool work.

```sql
SELECT current_database() AS database_name, current_user AS connected_role;

SELECT count(*) AS exact_ledger_entries,
       count(DISTINCT version) AS distinct_versions
FROM ghm.ghm_schema_migrations;

SELECT version, name, checksum, applied_at
FROM ghm.ghm_schema_migrations
WHERE version IN ('20261019190000', '20261019210000')
ORDER BY version;
```

Run the last query only after the first two confirm the intended database and exact ledger count. Compare the returned checksums with SHA-256 over the exact raw SQL bytes from the deployed integration commit. Do not equate Git blob IDs with file SHA-256 values. Keep all queries read-only.


## Addendum — role membership checked; hosted query still cannot read ledger (2026-10-27 19:11 UTC)

Additional read-only catalog inspection of `ghm_db` found that `ghm_db_user` is a member of `ghm_schema_owner` with admin option, and `ghm_schema_migrations` is owned by `ghm_schema_owner`. However, the hosted query tool wraps each query in a read-only transaction and opens/closes a fresh connection per call. It rejects multiple SQL commands in one prepared statement, so a `SET ROLE` followed by a ledger SELECT cannot be performed in one call. No role changes or grants were made.

Current known evidence:
- Database `ghm_db` contains `ghm.ghm_schema_migrations`.
- Table statistics estimate 78 live rows; this is not an exact count.
- Direct SELECT under `ghm_db_user` fails due to lack of schema/table read privilege.
- Exact row count and checksums remain unverified.

Do not try to bypass permissions with ad hoc functions or alter database grants. The straightforward next action is to use the user's existing authorized audit connection/role and run the documented SELECT-only queries, or have the database owner execute them. The current hosted tool cannot complete the row inspection under its connection restrictions.


## Addendum — authoritative primary-database migration/effects audit (2026-10-27 23:55 UTC)

**This addendum supersedes earlier assumptions in this document that the immediate task was only to explain two unexplained historical ledger entries.** The latest local audit is connected to the primary Render database `ghm_db` using the already-configured `GHM_MIGRATOR_DATABASE_URL`, and `SET ROLE ghm_schema_owner` succeeds. The connection context was confirmed as:

- `current_database() = ghm_db`
- `current_user = ghm_schema_owner`
- `transaction_read_only = on`

No database changes have been made. The audit and all preflight queries used read-only transactions and rolled back.

### Latest migration-ledger audit

The latest audit reported:

- Repository migrations: **89**
- Live ledger entries: **78**
- Canonical checksum matches: **7**
- Supported legacy CRLF matches: **62**
- Approved historical matches: **9**
- Missing repository migrations in the live ledger: **11**
- Unexplained checksum mismatches: **0**
- Name mismatches: **0**
- Extra ledger entries: **0**
- Orphaned exceptions: **0**
- Redundant exceptions: **7**
- Overall verdict: **INVESTIGATE**

The 11 missing versions are:

1. `20261016100000_add_connect_identity_authority_contract`
2. `20261016120000_create_account_external_mapping`
3. `20261016170000_add_connect_directory_contract`
4. `20261016180000_extend_owner_managed_directory_profile`
5. `20261016190000_expose_authenticated_account_email`
6. `20261018210000_grant_runtime_account_profile_column_updates`
7. `20261019190000_create_business_engagement_events`
8. `20261019210000_create_business_registration_identity`
9. `20261020130000_create_quoteflow_migration_business_provisioning`
10. `20261020140000_reconcile_quoteflow_provisioning_verification_status`
11. `20261026120000_scope_storage_metadata_lookup`

These are missing ledger records **and** their expected schema effects are absent in the inspected primary database. Do not treat this as a ledger-only repair. Do not write ledger entries or apply SQL until the preflight and deployment compatibility checks are complete.

### Read-only object inventory on primary `ghm_db`

The expected effects below were absent:

- Identity columns: `ghm.account_identity.connect_role`, `business_operator_intent`.
- Directory columns on `ghm.business`: `category`, `province`, `city`, `physical_address`, `whatsapp`, `website`, `logo_url`, `avatar_letter`, `avatar_color`, `is_supplier`, `tier`, `is_featured`, `profile_views`, `years_in_business`.
- Tables: `ghm.account_external_mapping`, `ghm.connect_founder_directory_reviewer`, `ghm.business_engagement_event`, `ghm.business_registration_identity`, `ghm.quoteflow_migration_business_provisioning_audit`.
- Functions: `auth_read_connect_identity_authority`, `auth_lookup_account_external_mapping`, `auth_read_account_email`, `read_business_registration_identity`, `update_business_registration_identity`, `auth_provision_quoteflow_migration_business`.

A corrected function inventory (using PostgreSQL's identity-argument strings correctly) confirmed these deployed functions:

- `ghm.storage_get_object(p_object_id bigint)` exists, is `SECURITY DEFINER`, owned by `ghm_schema_owner`, and executable by `ghm_runtime`.
- `ghm.update_business_profile(p_account_id bigint, p_business_id bigint, p_patch jsonb)` exists, is `SECURITY DEFINER`, owned by `ghm_schema_owner`, and executable by `ghm_runtime`. Its deployed definition permits only `name`, `slug`, `description`, `phone`, and `email`; it does not support the new directory fields.

The existing storage getter filters only on `storage_object.id = p_object_id`. Migration `20261026120000_scope_storage_metadata_lookup` replaces it with an account-aware two-argument signature and drops the old one-argument function. **This is security-relevant and potentially breaking for callers that still use the old signature.** Verify deployed application call sites and the exact release compatibility before applying it.

The stored `update_business_profile` definition as printed by `pg_get_functiondef` included suspicious joined tokens such as `IFp_account_id` and `patch_keysLOOP`. Do not infer the function is broken from the printed output alone; validate the exact deployed definition and migration source if this becomes material. The reliable finding for this audit is that the live function's allowed-key list is the old five-field list and the directory columns are absent.

### Additional preflight results

- `ghm.business_external_mapping` exists with **3 rows**. Aggregate checks found zero blank providers, zero blank external IDs, zero null business IDs, and 3 distinct provider/external-ID pairs. No identifiers were output.
- Approximate catalog statistics showed 23 rows in `account_identity`, 16 in `business`, 3 in `business_external_mapping`, and 2 in `business_membership`. These are estimates from catalog statistics, not exact row counts.
- The business table was reported at approximately 80 kB; `account_identity` at 64 kB; `business_external_mapping` at 96 kB; `business_membership` at 128 kB. These small sizes do not replace checking locks, constraints, dependencies, or application behavior.
- No conflicting indexes or constraints were found for the specific names queried by the preflight.
- The storage function inventory returned only the one-argument getter; runtime execution is currently allowed.
- The directory-column catalog query returned no expected directory columns.
- The privilege views showed current `ghm_runtime` table/column grants, including SELECT on `account_identity`, INSERT/SELECT on `business`, and UPDATE on `business.rating`, `review_count`, and `updated_at`. Treat these as catalog-view output, not a complete effective-privilege proof. In particular, do not infer that a migration's privilege effect is safe merely because a queried row is absent.
- A previous comprehensive preflight had two known defects: it compared `pg_get_function_identity_arguments()` (which includes argument names) to type-only strings, incorrectly marking existing functions absent; and its “constraint violations = 0” checks referenced directory fields that do not exist, so those zeros were meaningless. Use the corrected function inventory and do not reuse those invalid zero counts.

### Migration dependencies and risk notes

- `20261016100000` introduces identity authority fields, a private reviewer-authority table, and a read function. The role is intentionally nullable; do not infer contractor/supplier authority from legacy business role.
- `20261016120000` creates explicit provider-scoped account mapping. Its lookup is migrator-only and is not an authentication mechanism. It also revokes runtime DML on `business_external_mapping`; review current application dependencies before changing that permission.
- `20261016170000` adds directory fields, constraints, and partial indexes. It revokes runtime UPDATE on protected directory fields; the new profile API intentionally excludes tier, featured status, avatar/media, and analytics.
- `20261016180000` replaces the profile update function and depends on the directory columns from `20261016170000`.
- `20261018210000` grants column-scoped account-profile updates and depends on the identity columns from `20261016100000`.
- `20261016190000` exposes only the active canonical login email through a narrow function. Callers must derive the account ID from authenticated server context.
- `20261019190000` creates engagement events and grants narrowly scoped runtime insert/select permissions.
- `20261019210000` creates private self-declared registration data and membership-checked owner/administrator functions; it is not independent verification of registration.
- `20261020130000` and `20261020140000` create/replace a migration-only QuoteFlow provisioning function. The function can create a business, owner membership, mapping and audit row when invoked; its execution is granted to `ghm_schema_owner`, not `ghm_runtime`. Do not invoke it as part of migration reconciliation.
- `20261026120000` is security-relevant and has a signature-removal compatibility risk as described above.

### Current go/no-go status

**Do not apply all 11 migrations as a blind batch yet.** The schema effects are missing, but the remaining go/no-go checks are:

1. Inspect exact migration SQL and dependency order (source review has been completed for the 11 files on `integration/ghm-identity-merge-candidate-20261018`).
2. Check deployed application references/call sites for `storage_get_object` and directory-profile fields against the exact running service commit. Repository code search did not return usable matches; that is not proof that callers are absent.
3. Verify the current `business_external_mapping` runtime usage before applying its privilege revocation.
4. Confirm migration runner behavior and the intended target/release. Do not assume the qualification service's integration branch authorizes changing the primary database.
5. Re-run the read-only preflight after any reviewed remediation and before any write operation.

No migrations have been executed, no ledger rows inserted/updated/deleted, no grants or role memberships changed, no allowlists changed, and no branches promoted as part of this investigation.

### How to resume without repeating work

Start from this addendum and the 11-version list. Do **not** repeat the initial two-entry historical-migration search, the Render instance inventory, or the flawed function-signature preflight. The current immediate task is application compatibility and migration readiness for the primary `ghm_db`, with special attention to the old storage getter and runtime privileges. The documentation handover PR remains [#188](https://github.com/zaidhqdev-sys/GHM/pull/188) unless its status is separately verified.


## Addendum — source-to-live-schema compatibility findings (2026-10-28, continued read-only review)

Read-only GitHub source inspection was performed against both the known live `main` deployment commit `0da8fdc792fa7873a89c4b0d507b3b4047688e68` and the qualification/integration commit `7fb1bbe07fc64ede652ae589ab72bdc96f23d906`. No repository source, database state, or deployment was changed.

### Confirmed storage caller mismatch — high priority

The file `src/storage/repository.ts` has the same Git blob on `main` and the integration candidate (blob `abd1c335128ff7768e8a838a1ef491eb077846e3`). Its `getById(id)` method calls:

```ts
client.query("SELECT * FROM ghm.storage_get_object($1, $2)", [
  Number(id),
  this.context.userId,
]);
```

This supplies the account ID from the server-side authenticated `AuthContext`, matching the new migration's intended contract; it does not take that account ID from request input. The HTTP storage router uses this repository for object complete/access/delete paths.

However, the primary `ghm_db` live catalog currently contains only `ghm.storage_get_object(p_object_id bigint)`, not the two-argument `storage_get_object(bigint,bigint)` required by the deployed application source. Migration `20261026120000_scope_storage_metadata_lookup.sql` exists in both inspected source refs, but its ledger entry and schema effect are missing in the primary database. **This is a confirmed app/schema compatibility mismatch:** any path invoking `getById` is expected to fail with a PostgreSQL function-signature resolution error until code/schema are reconciled. Do not assume all storage routes are affected; the mismatch is specifically on callers that use `getById`.

The intended migration replaces the ID-only getter with a two-argument account-aware function and drops the old overload. This is the intended direction for least-privilege access, and the application call site already passes the authenticated account ID. Before applying it, still confirm the exact currently running deployment and exercise the migration's dedicated qualification against an approved disposable test database. The existing `scripts/qualify-storage-getter-postgres.mjs` explicitly refuses any database other than `ghm_disposable_test`; **do not repoint or bypass that guard to run it against `ghm_db`**.

### Directory feature is branch-scoped; do not apply candidate schema effects to main blindly

The integration candidate's `src/resources/directory/repository.ts` selects the new `ghm.business` fields (`category`, `province`, `city`, `physical_address`, `whatsapp`, `website`, `logo_url`, `avatar_letter`, `avatar_color`, `is_supplier`, `tier`, `is_featured`, `profile_views`, `years_in_business`) and filters on province/city/supplier. The candidate's profile-update migration `20261016180000` expands the SECURITY DEFINER function to allow a limited set of owner-managed descriptive fields, and depends on columns from `20261016170000`.

By contrast, `main`'s `src/resources/directory/repository.ts` selects only the pre-existing business fields and does not reference those new columns. Thus the new directory columns are an integration-candidate feature dependency, not a reason by themselves to migrate the primary database for the currently known `main` runtime. The candidate service is configured to deploy from the integration branch with auto-deploy disabled and must be qualified against its intended database before promotion. Do not promote the candidate or apply all 11 migrations to `ghm_db` as a shortcut.

### External business mapping privilege check

The primary preflight showed no `ghm_runtime` table-level grants on `ghm.business_external_mapping`. Source history also contains `20261012120000_revoke_runtime_business_mapping_table_access.sql`, which revokes all direct runtime table privileges; the new account-external-mapping migration's DML revocation is therefore not the first revocation for that table. Keep access through the existing narrow SECURITY DEFINER lookup/link functions, and do not restore direct table access for convenience. This reduces the privilege-change uncertainty, but does not replace a fresh effective-privilege check before any migration.

### Updated action order

1. **Keep all database activity read-only.** The storage caller mismatch is now evidenced; do not run migrations or hand-edit the ledger as an emergency patch.
2. Record/verify the exact live deployment still uses commit `0da8fdc792fa7873a89c4b0d507b3b4047688e68` before treating this as current runtime behavior.
3. Use the already-defined disposable-database storage qualification only on `ghm_disposable_test`, and inspect its latest result if available. Do not run qualification scripts that create fixtures against `ghm_db`; the directory/profile qualification scripts include INSERTs and cleanup and are not read-only.
4. Prepare a reviewed, explicit migration plan for the intended database and release. At minimum it must reconcile the missing migration ledger records with missing schema effects, respect migration dependencies, and account for the old storage function being removed. Any actual migration run requires separate explicit authorization.
5. For the integration candidate, establish the correct target database first, then run its directory/business-profile qualification only against an approved disposable or staging target. Do not use the primary database simply because the local migrator URL points there.

### Resume point

The next useful step is to verify the current live Render deployment status/commit and inspect existing qualification evidence for the storage getter, while keeping all database operations read-only. The compatibility mismatch and candidate/main distinction above are now documented; do not repeat broad GitHub code search, which previously returned no usable results.


## Addendum — Render deployment status rechecked (2026-10-28)

Read-only Render service/deployment queries reconfirmed:

- `ghm-payfast-sandbox-runtime` (`srv-db5vtgl9fdbs73eaclbg`) is configured for `main`, auto-deploy on commit. Its latest listed live deployment is commit `0da8fdc792fa7873a89c4b0d507b3b4047688e68`, deploy `dep-dbft4np5efls73ec8skg`, completed 2026-10-26 22:22 UTC.
- `ghm-identity-qualification` (`srv-dbahvenbtjjs73f83rlg`) is configured for `integration/ghm-identity-merge-candidate-20261018`, auto-deploy off. Its latest listed live deployment is commit `7fb1bbe07fc64ede652ae589ab72bdc96f23d906`, deploy `dep-dbfrn1586sus73euig9g`, completed 2026-10-26 20:45 UTC.
- No deploy was triggered and no service settings were changed.

**Important scope qualification:** the source-to-schema incompatibility is proven between the audited primary database `ghm_db` catalog (one-argument getter only) and the storage repository source in both inspected commits (two-argument getter call). However, the Render service's effective database target was not read from its environment configuration, so do not claim yet that the live Render service definitely connects to `ghm_db`. Confirm the service-to-database mapping using safe metadata that does not reveal secrets before describing this as a live production incident. If the runtime service does use `ghm_db`, storage `getById` paths are expected to fail until the schema and code are reconciled.

The documented qualification evidence on `main` says the scoped getter migration and persistence qualification passed on the separate qualification database. That evidence is **not** proof the primary `ghm_db` has the migration applied. The qualification script deliberately hard-checks `ghm_disposable_test`; never bypass that guard or run fixture-creating directory/profile qualification scripts against `ghm_db`.

Next step remains read-only: establish the runtime service's database target without exposing connection strings or secrets, and inspect any existing `ghm_disposable_test` storage qualification output. Then draft a database-specific reviewed migration plan; do not apply migrations or edit ledger records without explicit authorization.


## Addendum — qualification guardrails and next external dependency (2026-10-28)

Inspected the current `main` qualification scripts read-only:

- `scripts/qualify-storage-getter-postgres.mjs` requires an explicit `GHM_RUNTIME_DATABASE_URL` and hard-fails unless both `current_database()` is exactly `ghm_disposable_test` and both `current_user` and `session_user` are exactly `ghm_runtime`. It performs catalog and rejection checks and reports `mutations_performed: false`. Do not bypass or edit these checks to target the primary database.
- `scripts/qualify-storage-persistence.mjs` is **mutating**. It requires the separate `GHM_QUALIFICATION_DATABASE_URL` and `GHM_STORAGE_QUALIFICATION_ALLOW_MUTATIONS=true`, then only permits a database name that clearly identifies a sandbox/qualification/test/disposable target. Do not run it as part of this read-only investigation.
- `scripts/qualify-directory-runtime.mjs` and `scripts/qualify-business-profile-runtime.mjs` create fixture accounts/businesses/categories or profile fixtures and perform cleanup using the migrator connection. They assert database name `ghm_db`; do not run them against the current primary database while migration readiness is unresolved.
- Existing evidence in `docs/architecture/GHM_STORAGE_PERSISTENCE_QUALIFICATION.md` states that the scoped getter and persistence qualification passed on a separate qualification database. That does not demonstrate that the primary `ghm_db` has the migration.

Render read-only service/deploy metadata reconfirmed the latest known live commits as recorded above. The available Render tools do not expose service environment-variable values in the service metadata response, so the runtime service's actual database target remains unverified. Do not print or copy connection strings or secrets to establish it; verify only a non-secret database identity through an approved safe diagnostic.

**Workspace gate:** Render returned “no workspace selected” for the database inventory call. The workspace list returned one team workspace, `ZAID Technologies` (`tea-d9svua6417fc73bhcutg`), but the operator must explicitly confirm which workspace to use before continuing Render database inventory/query calls. No workspace was selected automatically and no Render database query was run in this step.

Resume actions:
1. Confirm the intended Render workspace.
2. Inspect database inventory and safe, non-secret service-to-database mapping evidence.
3. If `ghm_disposable_test` is available and its connection is already configured, run only the guarded read-only getter qualification there and capture its output; do not change its guards.
4. Continue to keep `ghm_db` read-only until a migration plan for the intended service/database pair is reviewed and explicitly authorized.


## Addendum — confirmed Render environment mapping and sandbox schema (2026-10-28 00:04 UTC)

The user explicitly authorized use of the Render workspace **ZAID Technologies** (`tea-d9svua6417fc73bhcutg`). Subsequent calls passed that workspace ID explicitly; no global workspace selection was changed.

### Environment mapping now established from Render metadata

- `ghm-payfast-sandbox-runtime` (`srv-db5vtgl9fdbs73eaclbg`) has Render environment ID `evm-db43vk4s728c739fn460`.
- `ghm-payfast-sandbox-db` (`dpg-db4416vlk1mc73eocug0-a`) has the same environment ID `evm-db43vk4s728c739fn460`.
- `ghm-db` (`dpg-dag0sdtbedkc7389vi2g-a`) has a different environment ID, `evm-d9t1la7qj5pc73dludsg`.
- `GHM-Internal-Runtime` also has the primary `ghm-db` environment ID, but it is a separate service and was not established as the storage caller under investigation.
- `ghm-identity-qualification` shares the PayFast sandbox environment ID but its database target cannot yet be verified through the Render SQL tool because that qualification database blocks external connections via an empty IP allowlist. Do not change that allowlist merely to make this investigation easier.

This environment-ID match is strong Render-level evidence that the PayFast sandbox runtime belongs with `ghm-payfast-sandbox-db`, not the primary `ghm-db`. It is not a substitute for inspecting secret environment-variable values; those were not retrieved or exposed.

### Read-only Render SQL catalog check: sandbox versus primary

Using Render's read-only Postgres query tool, the safe catalog probe returned:

| Database | Legacy one-argument getter | Scoped two-argument getter | Directory columns |
|---|---:|---:|---:|
| `ghm_db` (primary) | present | absent | 0 of 14 |
| `ghm_payfast_sandbox_db` | absent | present | 0 of 14 |

The sandbox catalog also lists `ghm.ghm_schema_migrations` and `ghm.quoteflow_migration_business_provisioning_audit`. A follow-up attempt to read schema-qualified ledger rows was denied by the connected database role's lack of `USAGE` on schema `ghm`; no access was changed and no ledger row values were retrieved. The first probe's information-schema counts for new tables are not authoritative here because information-schema visibility is privilege-filtered. Use catalog metadata for existence checks, and do not infer table absence from an empty information-schema result under this role.

### Updated interpretation

The previously observed storage-function mismatch is confirmed for the **primary `ghm_db`**, but Render environment metadata points the PayFast sandbox runtime at the separate `ghm_payfast_sandbox_db`, where the account-scoped getter is already present. Therefore, do **not** describe the primary database mismatch as a confirmed outage for `ghm-payfast-sandbox-runtime`. The primary database still has the legacy signature and missing candidate directory schema, and the separate `GHM-Internal-Runtime` environment association means its use of that database deserves its own deliberate review before any changes.

The sandbox database has the storage getter signature required by the source, but its directory columns are absent; this is consistent with the current `main` source not depending on the integration candidate's directory columns. The sandbox schema inventory also shows the QuoteFlow provisioning audit table. This limited catalog probe does not establish the complete migration ledger state or prove every migration's effects; those require a permission-appropriate read-only audit.

### Resume here

1. Keep using explicit workspace ID `tea-d9svua6417fc73bhcutg` on Render calls.
2. Continue read-only catalog auditing of `ghm_payfast_sandbox_db` and `ghm_db` separately; do not query or expose business/account row contents.
3. Do not alter allowlists or grants to overcome the qualification DB's external-connection block.
4. Before planning primary-database changes, inspect `GHM-Internal-Runtime`'s database dependency using safe non-secret metadata and determine which release actually needs the candidate schema.
5. No migrations, ledger edits, permission changes, allowlist changes, or deployments were performed in this step.


## Addendum — internal runtime target explicitly confirmed by user (2026-10-28 00:08 UTC)

The user explicitly confirmed that **`GHM-Internal-Runtime` uses the primary `ghm_db` database** and that PayFast-specific variables were deliberately not added to the internal runtime. Treat this as authoritative operator-provided configuration context; do not ask again which database the internal runtime should use and do not suggest adding PayFast variables to it.

### Current Render deployment facts

Read-only Render metadata for `GHM-Internal-Runtime`:

- Service ID: `srv-damupsek1f9s73eq8kkg`
- Dashboard: https://dashboard.render.com/web/srv-damupsek1f9s73eq8kkg
- Branch: `main`; auto-deploy trigger: checks pass
- Render environment ID: `evm-d9t1la7qj5pc73dludsg` (same environment as primary `ghm-db`)
- Latest listed live deploy: `dep-dbgen8c9v7es73cuh390`
- Deployed commit: `0da8fdc792fa7873a89c4b0d507b3b4047688e68`
- Deploy finished: 2026-10-27 18:22:08 UTC

The current `main` source at that commit has the storage repository calling `ghm.storage_get_object($1, $2)`, passing the object ID and server-authenticated `AuthContext.userId`. The primary `ghm_db` catalog has only `ghm.storage_get_object(p_object_id bigint)`; the account-scoped two-argument overload is absent. With the user-confirmed runtime-to-database mapping, this is now a **confirmed code/schema signature mismatch for GHM-Internal-Runtime's configured database**. Calls through the storage repository's `getById` path are expected to fail function resolution until code and schema are reconciled. This does not prove that every request fails or that the route is currently being exercised.

A read-only Render log search for the literal `storage_get_object` and for application-level error severity from 2026-10-27 18:22 UTC through 2026-10-28 00:09 UTC returned no matching entries. This is not proof of healthy behavior: the route may not have been called, logs may omit SQL details, or errors may be surfaced differently.

### Required next action — plan the minimal safe remediation

1. Keep the primary database read-only while preparing a reviewed, exact plan. The candidate migration `20261026120000_scope_storage_metadata_lookup.sql` creates `storage_get_object(bigint,bigint)`, sets its owner/search path, grants execution to runtime and schema owner, revokes PUBLIC/migrator execution, and drops the old one-argument overload. It is security-relevant and changes a function signature, so compatibility must be deliberate.
2. The repository caller already passes `AuthContext.userId` rather than a request-body account ID, which matches the migration's intended contract. Confirm the exact auth-context type/ID semantics and migration runner's behavior before executing.
3. The primary ledger currently lacks all 11 listed migration records and corresponding expected schema effects. Do not apply only the storage migration and then mark the other 10 as complete. Build a per-migration dependency/effect plan and reconcile each ledger entry only after verifying its effects and checksum.
4. The directory migrations are candidate-feature schema changes and are not needed by the inspected `main` directory repository, which uses the older columns. Keep them separate from the immediate storage compatibility fix unless another primary-runtime dependency demonstrates need.
5. Use `ghm_disposable_test` for guarded storage qualification; do not bypass script database/role checks or run fixture-creating qualification scripts against primary `ghm_db`.
6. Any actual production database migration or ledger write still requires explicit user authorization after presenting the concrete plan. No changes were made in this investigation.

### Resume point

Do not re-ask whether `GHM-Internal-Runtime` uses `ghm_db`; it does per explicit user confirmation. Next, prepare the ordered, risk-reviewed migration plan and identify the exact migration-runner command/options without executing it. Preserve the separation between primary runtime and PayFast sandbox runtime.


## Addendum — migration-runner review and PayFast configuration clarification (2026-10-28 00:14 UTC)

### PayFast configuration clarification

The prior note saying PayFast-specific variables were deliberately not added to `GHM-Internal-Runtime` incorrectly attributed the decision to the user. The user clarified that PayFast is the payment merchant and `GHM-Internal-Runtime` is production, and that the earlier advice not to add the variables came from the assistant without a code-verified rationale. Treat that earlier advice as provisional and withdrawn, not as an operator policy. Do not add/remove/alter variables during this migration investigation; separately inspect the production code's required PayFast configuration and reconcile it with the user's intended production setup. Do not expose secret values.

### Migration runner findings — read-only source review

- `main`'s `src/db/migrate.ts` reads `GHM_MIGRATOR_DATABASE_URL`, sets role `ghm_schema_owner`, verifies role/session identity, takes advisory transaction lock 731824, loads every matching migration file in `database/migrations`, and runs every version absent from the ledger. It has no single-version selector.
- The inspected `main` runner does **not** require an explicit approved database name/host. The integration candidate's runner does use `assertPostgresTargetConfiguration` with `GHM_MIGRATION_DATABASE_NAME` and `GHM_MIGRATION_DATABASE_HOST`, and checks the connected database against that target. Do not invoke the unguarded `main` runner against production as a diagnostic or first remediation step.
- The runner applies all missing migrations it finds in sorted order, so it is not safe to assume `npm run migrate` would apply only the storage getter. It also wraps the batch in a transaction, while some migration files contain their own `BEGIN`/`COMMIT`; that interaction must be explicitly resolved/reviewed before using the runner, because a nested `COMMIT` in PostgreSQL can end the surrounding transaction.
- On `main`, the current storage repository call is `ghm.storage_get_object($1, $2)` with `this.context.userId`. `AuthContext.userId` is typed as a positive numeric ID by the auth-context guard, and the SQL migration expects an account ID. This confirms the value is server-authenticated, not request-body input, but the interface alone does not prove that every auth provider maps `userId` to `ghm.account_identity.id`. Trace the authentication adapters before claiming the semantic identity match is fully proven.
- The candidate-only migration files are not all present at the same paths on `main` (direct fetch of the two disputed historical files and both QuoteFlow provisioning files returned 404 on `main`, while they are present on the integration candidate). Do not copy candidate-only schema changes into production simply to reconcile the ledger. First produce a branch-specific inventory of which of the 11 missing versions actually exist on `main`, which belong only to the candidate release, and which are needed by the deployed production code.
- No migration command was executed; no database or ledger writes, environment changes, or deployments occurred.

### Next safe sequence

1. Build a branch-by-branch matrix of all 11 missing versions: file present on `main`/candidate, runtime code dependency, schema effect currently absent, prerequisites, transaction wrapper, and whether the effect is production-required.
2. Trace `AuthContext.userId` through the production authentication adapter to confirm it is the account identity primary key used by `business_membership.account_id`.
3. Resolve the runner's target guard and transaction-boundary behavior before any execution. Prefer a reviewed, target-pinned migration procedure that cannot accidentally run every candidate migration against production.
4. Keep the production database read-only until the exact minimal migration set and rollback/forward-recovery strategy are documented and separately approved.


## Addendum — branch-specific missing-migration matrix and production remediation scope (2026-10-28 00:17 UTC)

### Repository inventory resolved the main/candidate ambiguity

Read-only GitHub Contents API inventories show:
- `main`: 79 migration files; among the 11 versions missing from the primary ledger, **only** `20261026120000_scope_storage_metadata_lookup.sql` exists.
- `integration/ghm-identity-merge-candidate-20261018`: 89 migration files; all 11 versions exist.
- Primary `ghm_db`: 11 ledger entries missing according to the audit performed against the 89-file candidate inventory. That is a candidate-branch reconciliation result, not evidence that all 11 should be applied to the production `main` schema.

This is the central distinction: production is running `main`, and the ten older missing entries are candidate-only migrations. Running the candidate migration batch against production would apply feature and identity-schema changes that are not part of the currently deployed production branch. **Do not do that.** The immediate production compatibility issue is the one shared migration `20261026120000`.

### Missing-version matrix

| Version | Present on production `main`? | Present on candidate? | Effect / dependency | Production disposition |
|---|---|---|---|---|
| `20261016100000` | No | Yes | Adds identity authority fields/reviewer table and authenticated authority reader | Candidate-only; do not apply to production as ledger cleanup |
| `20261016120000` | No | Yes | Adds private account/external identity mapping and restricted lookup function; tightens mapping access | Candidate-only; do not apply to production as ledger cleanup |
| `20261016170000` | No | Yes | Adds 14 business-directory columns, constraints, and indexes | Candidate directory feature; not required by inspected `main` directory repository |
| `20261016180000` | No | Yes | Expands owner-managed business-profile patch keys; depends on `16170000` | Candidate-only; dependent on candidate directory columns |
| `20261016190000` | No | Yes | Adds authenticated account-email reader | Candidate-only; inspect production code dependency before any future promotion |
| `20261018210000` | No | Yes | Grants account-profile column updates; depends on identity authority fields from `16100000` | Candidate-only; privilege change, do not apply independently |
| `20261019190000` | No | Yes | Creates business engagement events and runtime insert/select grants | Candidate-only feature schema; not a ledger-only fix |
| `20261019210000` | No | Yes | Creates private business-registration identity storage and owner/admin-gated reader/updater | Candidate-only feature/security schema; not a ledger-only fix |
| `20261020130000` | No | Yes | Creates QuoteFlow provisioning audit and privileged provisioning function with record-creation effects | Candidate-only; do not invoke provisioning function; review effects before any future promotion |
| `20261020140000` | No | Yes | Replaces provisioning function to store new records as `unverified`; depends on `20130000` | Candidate-only; must follow its prerequisite if ever promoted |
| `20261026120000` | **Yes** | **Yes** | Replaces ID-only storage getter with account-scoped getter and drops old signature | **Only missing migration in production `main`; immediate remediation candidate** |

### Authenticated identity semantics confirmed in source

The production source explicitly documents `GhmAuthContext.accountId` as the canonical `ghm.account_identity.id`. The bearer authenticator loads the account state using `SELECT id FROM ghm.account_identity WHERE id = $1`, then `toLegacyAuthContext` maps `accountId` to `AuthContext.userId`. Therefore, for this GHM bearer-auth path, the storage repository's `this.context.userId` is sourced from the authenticated account identity, not from request-body input. Other legacy authentication adapters should still be checked for any alternate construction of `AuthContext` before the rollout.

### Execution blocker identified

The current production `main` migration runner wraps the whole batch in `BEGIN` and calls `client.query(normalizeMigrationSqlForExecution(migration.sql))` for each file. The storage migration itself contains explicit `BEGIN;` and `COMMIT;`. PostgreSQL transaction control inside a SQL string can terminate the runner's outer transaction before the ledger insert, risking a schema change without an atomically committed ledger row. The candidate runner has a target-name/host guard, but still needs its transaction-boundary behavior reviewed. Do not invoke either runner until the nested-transaction issue is fixed or an execution method that preserves atomic schema-plus-ledger behavior is prepared.

The Render Postgres query connector is read-only; it cannot apply SQL changes. No production schema or ledger change was attempted. The next implementation step is to prepare a migration-runner hardening patch and tests on a non-production branch: explicit database name/host guard, deterministic migration selection or an explicit allowlist, and safe handling of migration transaction boundaries. Then qualify the exact storage migration against a disposable database and prepare a separately approved production rollout. Do not use the 11-file candidate batch for production.


## Addendum — implementation started on guarded migration PR (2026-10-28 00:20 UTC)

Following the user's direction to proceed with backend correction, a draft code PR was opened: [PR #189 — Guard production migrations and fix storage migration transaction boundary](https://github.com/zaidhqdev-sys/GHM/pull/189).

Branch: `fix/guarded-production-storage-migration-20261028`, based on production `main` commit `0da8fdc792fa7873a89c4b0d507b3b4047688e68`.

Changes in the draft:
- Add a reusable PostgreSQL target guard requiring explicit `GHM_MIGRATION_DATABASE_NAME` and `GHM_MIGRATION_DATABASE_HOST` values, validating the supplied URL's database and host, and rejecting non-PostgreSQL URLs.
- Apply the guard in `src/db/migrate.ts` and verify the connected database name matches the approved name before migrations run.
- Remove the explicit outer `BEGIN`/`COMMIT` from `20261026120000_scope_storage_metadata_lookup.sql` so the migration runner's existing transaction owns both schema effects and its migration-ledger insert atomically.
- Add unit tests for missing/mismatched target configuration and malformed/non-PostgreSQL URLs, and include the tests in the package test command.

This is a code proposal only. The PR is draft, not merged. CI/build/tests have not been run from this environment, no production variables were changed to supply the new guard values, and no migration was executed. Before merge, CI must pass and the guarded storage getter qualification must pass on `ghm_disposable_test`. After merge, the production migration still requires an explicitly target-pinned execution step with the new guard variables set; do not run the candidate branch's 11-migration batch against production.

The primary production database remains unchanged, and the ten candidate-only migration effects remain out of production scope. The PayFast variable discussion is separate from this migration PR; no payment variables were changed.
