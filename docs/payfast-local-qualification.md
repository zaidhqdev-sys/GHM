# PayFast settlement isolation: local qualification

This workflow qualifies the PayFast settlement database boundary on a disposable
local PostgreSQL 18 instance. It does not require Render, a sandbox database, a
second hosted web service, PayFast credentials, or network access to PayFast.

## Safety boundary

- Do not point these commands at the paid GHM database or any shared database.
- The compose file binds PostgreSQL only to `127.0.0.1:55432`.
- PostgreSQL data lives in container tmpfs and is discarded when the container
  is removed. Do not add a persistent volume.
- All three database URLs must be distinct and target this local database.
- The fixture qualification creates temporary records and cleans them up; its
  settlement transaction is rolled back.
- This is not a Render deployment or a real PayFast ITN end-to-end test.

## Prerequisites

- Docker Engine with the Compose plugin
- Node.js 20 (or the repository's supported Node version) and npm
- A local checkout of this branch


## Native Windows PostgreSQL 18 (PowerShell; no Docker)

A native Windows PostgreSQL 18 installation can be used instead of Compose. This
is the path exercised for the 2026-11-04 local qualification. It uses a separate
PostgreSQL 18 cluster on port `5433` and the database
`ghm_payfast_qualification`. Keep any other local cluster (for example
PostgreSQL 17 on port `5432`) untouched.

### Create the isolated local database and roles

Open PowerShell and connect to the PostgreSQL 18 cluster as its local
administrator:

```powershell
& "$env:ProgramFiles\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5433 -U postgres -d postgres -W -X -v ON_ERROR_STOP=1
```

At the `psql` prompt, run the following once on this local qualification
cluster (skip roles/database that already exist; do not run this against a
shared or hosted database):

```sql
CREATE ROLE ghm_schema_owner NOLOGIN;
CREATE ROLE ghm_migrator LOGIN NOINHERIT;
GRANT ghm_schema_owner TO ghm_migrator;
CREATE ROLE ghm_runtime LOGIN NOINHERIT;
CREATE ROLE ghm_payment_provider LOGIN NOINHERIT;

CREATE DATABASE ghm_payfast_qualification;
GRANT CONNECT ON DATABASE ghm_payfast_qualification
  TO ghm_migrator, ghm_runtime, ghm_payment_provider;
GRANT CONNECT, CREATE ON DATABASE ghm_payfast_qualification
  TO ghm_schema_owner;

\connect ghm_payfast_qualification
GRANT USAGE, CREATE ON SCHEMA public TO ghm_schema_owner;
```

Set each login password interactively at the `psql` prompt; passwords are
separate per role and must not be committed or pasted into documentation:

```text
\password ghm_migrator
\password ghm_runtime
\password ghm_payment_provider
```

Verify the server/cluster and role membership before proceeding:

```powershell
& "$env:ProgramFiles\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5433 -U postgres -d ghm_payfast_qualification -W -X -v ON_ERROR_STOP=1 -c "SELECT current_database(), inet_server_addr(), inet_server_port()"
& "$env:ProgramFiles\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5433 -U postgres -d ghm_payfast_qualification -W -X -v ON_ERROR_STOP=1 -c "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('ghm_schema_owner','ghm_migrator','ghm_runtime','ghm_payment_provider') ORDER BY rolname"
```

Expected database: `ghm_payfast_qualification`; port: `5433`;
`ghm_schema_owner` must have `rolcanlogin = false`. Also verify
`ghm_migrator` is a member of `ghm_schema_owner`. The PostgreSQL 18
service used in this procedure was configured with
`listen_addresses = '*'`; for a local-only setup, restrict PostgreSQL
listening and firewall access to the intended local interface before relying
on it as a local-only database. Do not assume connecting to 127.0.0.1 alone
makes a server bound to all interfaces private.

### Configure the current PowerShell session

Keep the same PowerShell window open while building, migrating and qualifying.
Set the three role-specific URLs using the passwords already set above; replace
each placeholder with that role's URL-encoded password. Do not reuse one
role's password for another:

```powershell
$env:NODE_ENV = "test"
$env:GHM_MIGRATOR_DATABASE_URL = "postgresql://ghm_migrator:<URL-ENCODED-PASSWORD>@127.0.0.1:5433/ghm_payfast_qualification"
$env:GHM_RUNTIME_DATABASE_URL = "postgresql://ghm_runtime:<URL-ENCODED-PASSWORD>@127.0.0.1:5433/ghm_payfast_qualification"
$env:GHM_PAYMENT_PROVIDER_DATABASE_URL = "postgresql://ghm_payment_provider:<URL-ENCODED-PASSWORD>@127.0.0.1:5433/ghm_payfast_qualification"
$env:DATABASE_URL = $env:GHM_RUNTIME_DATABASE_URL
$env:GHM_MIGRATION_DATABASE_NAME = "ghm_payfast_qualification"
$env:GHM_MIGRATION_DATABASE_HOST = "127.0.0.1"
$env:GHM_QUALIFICATION_DATABASE_NAME = "ghm_payfast_qualification"
$env:GHM_QUALIFICATION_DATABASE_HOST = "127.0.0.1"
$env:GHM_NONPRODUCTION_DATABASE_NAME = "ghm_payfast_qualification"
$env:GHM_NONPRODUCTION_DATABASE_HOST = "127.0.0.1"
$env:DATABASE_SSL = "false"
```

Before migration, inspect the three URLs without printing their passwords and
confirm that all three use host `127.0.0.1`, port `5433`, and database
`ghm_payfast_qualification`, with their respective login names. Never point
these variables at the paid GHM database or any shared Render database.

Run from the repository root:

```powershell
npm ci
npm run migrate
npm run qualify:commercial-payment-result-runtime
npm run qualify:payfast-runtime
npm run verify:runtime
```

The qualification target guards require the explicit expected database name
and host to match every role URL before opening connections. A deliberately
mismatched host must be rejected. The migration runs as `ghm_migrator` and
switches to `ghm_schema_owner`; runtime and provider qualification use their
own identities. Do not weaken or bypass these checks to make another target
pass.

This native PostgreSQL instance is persistent, unlike the Compose tmpfs
database. Qualification fixtures are cleaned up by the script; migrations and
their schema remain. Only drop `ghm_payfast_qualification` if you deliberately
want to discard the local qualification database and have confirmed the
database name and port.

## Start a fresh disposable database

From the repository root:

```sh
docker compose -f docker-compose.payfast-qualification.yml up -d --wait
```

The first initialization creates three separate login identities:
`ghm_runtime`, `ghm_migrator`, and `ghm_payment_provider`, plus the
NOLOGIN `ghm_schema_owner`. The credentials are test-only and are defined in
the compose init SQL.

## Configure this terminal only

Copy the template, then source it in the shell where you will run the commands:

```sh
cp payfast-qualification.env.example payfast-qualification.env
set -a
. ./payfast-qualification.env
set +a
```

The local env file is gitignored. Do not replace any URL with a Render or other
shared database URL.

Verify the database target and roles before migrating:

```sh
psql "$GHM_MIGRATOR_DATABASE_URL" -c "SELECT current_database(), inet_server_addr(), current_user"
psql "$GHM_MIGRATOR_DATABASE_URL" -c "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('ghm_schema_owner','ghm_migrator','ghm_runtime','ghm_payment_provider') ORDER BY rolname"
```

Expected database is `ghm`; server address should be the local Docker-published
PostgreSQL endpoint; `ghm_schema_owner` must have `rolcanlogin = false`.

## Run the qualification

```sh
npm ci
npm run build
npm run migrate
npm run qualify:commercial-payment-result-runtime
npm run qualify:payfast-runtime
npm run verify:runtime
```

The database-backed settlement qualification checks that the ordinary runtime
cannot execute generic or PayFast settlement, the provider identity cannot
directly read or write commercial tables, provider mismatch is rejected,
PayFast settlement succeeds through the narrow function, duplicate events are
idempotent, and new events cannot settle a terminal attempt.

The PayFast runtime qualification uses stubbed unit-test network calls. It
does not contact PayFast or need merchant credentials.

For a full local regression run, use `npm test`. It takes longer and exercises
the wider application test suite.

## Tear down and discard the database

When finished:

```sh
docker compose -f docker-compose.payfast-qualification.yml down
```

The database uses tmpfs, so removing the container discards its data. If you
want to stop and later resume the same disposable instance during one session,
use `docker compose ... stop` instead; do not mistake that for a fresh run.

## What this does not prove

Local qualification proves the SQL grants, database execution identities, and
application-level boundary against this local disposable database. It does not
prove hosted network isolation, Render process configuration, proxy trust,
PayFast source-IP freshness, hosted secret provisioning, or live payment
delivery. Those remain deployment gates and are deliberately deferred until
there is an affordable and explicitly authorized deployment plan.

## Native Windows PostgreSQL 18 session note — 2026-11-08

The operator has recovered local administrator password authentication for the native PostgreSQL 18 cluster on `127.0.0.1:5433`. The original `pg_hba.conf` was restored from the verified backup and its SHA256 matched the original; PostgreSQL 18 was restarted and a password-authenticated query succeeded, reporting PostgreSQL 18.6 / port 5433 / user `postgres`. The temporary trust rule is not intended to remain active. Do not repeat recovery unless a new failure is evidenced.

The existing database `ghm_payfast_qualification` was found at 13 MB. A read-only catalog/statistics query listed 56 tables under schema `ghm`; `ghm_schema_migrations` estimated 92 rows, `country` 1, `currency` 1, and `opportunity_type` 11; other listed tables estimated 0. These are planner/statistics estimates, not exact counts, and do not yet establish migration checksum consistency or full qualification readiness.

**Resume rule:** before running `npm run migrate` or any qualification script, inspect the local migration ledger/checksums and role/grant graph, verify all three role-specific URLs target only `127.0.0.1:5433/ghm_payfast_qualification`, and use the repository's guarded forensic audit. Do not drop/recreate the existing database or assume it is empty. PostgreSQL 17 on port 5432, Render and production remain outside this local qualification task.


## Exact ledger and role checkpoint — 2026-11-08 15:53 UTC

A successful read-only psql inspection against 127.0.0.1:5433/ghm_payfast_qualification as local administrator established:

- 92 exact rows in ghm.ghm_schema_migrations; latest version 20261104130000 (isolate_payfast_settlement_identity).
- Exact reference-data counts: country=1, currency=1, opportunity_type=11.
- ghm_schema_owner is NOLOGIN. ghm_migrator is LOGIN/NOINHERIT and has SET (not INHERIT or ADMIN) membership in ghm_schema_owner. ghm_runtime and ghm_payment_provider are LOGIN/NOINHERIT and have no reported membership path to schema owner.
- No mutations were performed.

This establishes the role-transition prerequisite structurally, not the migration checksum result. Next run only the repository's read-only forensic migration audit, explicitly targeting ghm_payfast_qualification and the local ghm_migrator identity on port 5433. Inspect/verify the connection target without printing credentials. Do not run npm run migrate, seed, reset, or qualification scripts until the forensic audit verdict and object ownership/grants are reviewed. Keep PostgreSQL 17 on port 5432, Render and production untouched.

## Migration-audit execution blocked by missing local npm dependencies — 2026-11-08 15:56 UTC

The operator correctly configured and independently verified the audit connection target (host 127.0.0.1, port 5433, database ghm_payfast_qualification, user ghm_migrator). `npm run audit:migrations` did not connect to PostgreSQL: Node.js v24.18.0 exited during module resolution with `ERR_MODULE_NOT_FOUND` for package `dotenv`, imported by `scripts/forensic-migration-reconciliation.mjs`. Repository `package.json` declares `dotenv` as a production dependency (`^16.4.5`) and `package-lock.json` (lockfileVersion 3) is committed. This is a local dependency-installation issue, not an audit verdict or database failure. Next action: run `npm ci` in the repository root, verify `node -e "console.log(require.resolve('dotenv'))"`, then rerun the audit with the already-verified environment variables. `npm ci` may replace local `node_modules`; it does not run migrations or alter PostgreSQL. No DB changes occurred during the failed invocation. Preserve all prior safety boundaries: no migrate/seed/reset, PostgreSQL 17 port 5432 untouched, no hosted or production changes.


## Local npm dependency installation recovered — 2026-11-08 15:58 UTC

The operator ran `npm ci` successfully in the repository root: 166 packages added, 167 audited, zero vulnerabilities reported. npm warned that the `argon2@0.41.1` install script (`node-gyp-build`) is not approved under the current allowScripts policy and therefore was not run. This is not currently a blocker for the forensic migration audit, which needs `dotenv` and `pg`; do not approve additional install scripts unless a later operation demonstrably requires them. Next: verify `require.resolve('dotenv')`, then rerun the read-only audit using the existing verified local PostgreSQL 18 connection environment. `npm ci` changed local dependency installation only; no database operation was run. All production/hosted and PostgreSQL 17 safety boundaries remain unchanged.


## Forensic audit reached PostgreSQL; local migrator authentication rejected — 2026-11-08 15:59 UTC

After successful `npm ci`, `require.resolve('dotenv')` succeeded and `npm run audit:migrations` advanced to opening its PostgreSQL connection. PostgreSQL rejected authentication for `ghm_migrator` with SQLSTATE 28P01 (password authentication failed). The audit did not reach ledger/checksum reconciliation and produced no PASS/INVESTIGATE verdict. This is an authentication prerequisite, not evidence of schema/checksum failure. Next controlled recovery: as local PostgreSQL 18 administrator on 127.0.0.1:5433 only, reset the local `ghm_migrator` password using psql's `\password ghm_migrator` (avoid exposing the password), then re-enter it securely into the local connection URL and verify authentication before rerunning the read-only audit. Do not alter pg_hba.conf for this; do not touch PostgreSQL 17/5432, hosted services, or production. No migration, seed, or reset was run.


## PostgreSQL 18 local forensic migration audit — 2026-11-08 16:02 UTC

The local `npm run audit:migrations` completed against `ghm_payfast_qualification` on PostgreSQL 18 / port 5433. Authority check PASSED: session/current user began as `ghm_migrator`, the expected database matched, `ghm_migrator` could `SET ROLE ghm_schema_owner`, and the post-switch identity was `current_user=ghm_schema_owner`, `session_user=ghm_migrator`. Audit ran in `BEGIN READ ONLY`. Final verdict: `INVESTIGATE` (not PASS).

Counts: repository migrations 90; live ledger rows 92; canonical matches 80; supported legacy CRLF matches 0; missing repository migrations 8; unexplained checksum mismatches 2; name mismatches 0; extra ledger rows 10; approved retained historical rows 8; unrecognized extras 2; orphaned exceptions 0; redundant provenance exceptions 7; invalid retained-history entries 2.

Eight repository migrations absent from the live ledger: `20261105190000_extend_business_directory_location_contact`; `20261105213000_create_business_capability_evidence`; `20261105220000_replace_business_capability_assertions`; `20261105230000_create_founder_directory_review`; `20261106090000_business_logo_storage_binding`; `20261106200000_link_project_to_opportunity`; `20261107211500_reconcile_business_profile_and_founder_authority`; `20261108140000_reconcile_business_profile_contract`.

Two unexplained checksum mismatches: `20261104120000_bind_commercial_payment_attempt_provider` (repository canonical `3f284b7afb1bc83c42331b0346e2853f448948ad9a2f9e92c162c303fb92d3d8`; live ledger `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`) and `20261104130000_isolate_payfast_settlement_identity` (repository canonical `230657b714cc8bfa23e69be9a0c8ff0a4d110b3a7435047e33683a77f3863a22`; live ledger `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`). Neither has a registered historical checksum. Ten extras include eight verified retained historical rows and two unrecognized rows: `20261020130000_create_quoteflow_migration_business_provisioning` (live checksum differs from registered retained checksum `a453171e...`) and `20261031100000_restrict_identity_authority_reader` (no registered retained-history record). Retained-history audit also flags `20261019210000` as `REPOSITORY_MIGRATION_PRESENT`, so its retention record needs reconciliation. Seven old provenance exception records are redundant because their hashes now match repository bytes; defer cleanup until blockers are understood.

Next action is strictly read-only provenance analysis: establish the local checkout branch/HEAD/worktree state and compute canonical/legacy checksums for all eight missing files plus the two mismatched files; compare local files with known GitHub source branches/history. Do not edit manifests, rewrite ledger checksums, apply pending migrations, run seeds, or reset/recreate the database until the evidence explains every mismatch and extra. No production/hosted database or PostgreSQL 17/5432 was touched; no DDL/data mutation occurred.


## Migration file hash and Git-history reconciliation checkpoint — 2026-11-08 16:13 UTC

The operator confirmed all ten audited migration files exist in the local checkout and supplied full raw SHA-256 hashes. The first two files' raw hashes exactly equal the audit script's computed legacy-CRLF repository hashes:
- `20261104120000_bind_commercial_payment_attempt_provider.sql`: `a7e40f38d3a0cdd59175a7342dc726c5d6f625a51949e9793fa33fd67ab69912`.
- `20261104130000_isolate_payfast_settlement_identity.sql`: `fe2efc4e74667a982d75849fc9e41276bdbd3d9f8b83368166d8afd9914c8260`.

Important distinction: this explains the raw-file-vs-canonical line-ending difference, but it does NOT reconcile either file to its live ledger checksum. The two ledger values remain different (`da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff` and `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f` respectively); they remain genuine ledger provenance discrepancies until the exact applied SQL bytes are identified.

The other eight full raw hashes (for the eight migrations absent from the ledger) were recorded by the operator: `20261105190000` = `f26d93e7955dc212ca370a09894bc15420d7708ef0f28a3edd6de3014721a5f0`; `20261105213000` = `afc5dc4d889cf317aab84c747538b29e9f059a4e2ceece2bc3c125131e7f9813`; `20261105220000` = `d38364b188dad024620089dd83165832ba63aa84fb5237061642ea71e7e3d6c0`; `20261105230000` = `f57fbdd169a666a32d3f8b6a4cddfffca814742d60505019c37a2c78fc6f461b`; `20261106090000` = `f912e53ae8bee108f4b1c9ba138c77e90f576b27e2899c9f4d9d33c8a8abcb43`; `20261106200000` = `bf060b4c28c3c1521ead05dfa51ec4de8b9221f8533a03ff05cb5e0007952fba`; `20261107211500` = `36598ad87e381ee9b2651a0fbe6740ac99f6912a91bcb32780328e3a202b3501`; `20261108140000` = `72cde5b257d86e4698b2d07e5a238288efc540ba85660da8af1a4547cece79aa`.

Read-only `git log --all --follow` confirms all ten files are in local Git history. Notable introducing/modifying commits include: both PayFast migrations together at `e7a51d7` (2026-11-06); directory location/contact migration history `1557c24`, `38e1539`, `0b3362d`, `5f24acc`; capability evidence `452f3df`; capability assertion replacement `724dba9`; founder review lifecycle `39ced6f` plus subsequent fixes; logo binding `49dd7da`; Project-Opportunity link `28e5ca5`; business/founder authority reconciliation `1fe1db1`; business profile contract reconciliation history `cc18518`, `4a071de`, `3c51c66`, `2e452f3`. The local checkout remains branch `fix/business-profile-compat-contract-20261108`, HEAD `d9151d936fa3edcde1bb5a5c050811a37db27166`, clean; do not switch branches during this investigation.

Next read-only step: inspect the exact SQL blobs at relevant introducing and follow-up commits, including the full history for the two PayFast migrations and the missing eight; then compare those versions with ledger checksums and the live catalog. File existence and current raw hashes do not prove application. The audit verdict remains INVESTIGATE. Do not run migrations, edit ledger rows or exception manifests, seed/reset/recreate the DB, or touch PostgreSQL 17/5432, hosted DBs, Render, or production.


## Exact PayFast ledger rows verified under schema-owner role — 2026-11-08 20:01 UTC

A read-only query was rerun successfully with `BEGIN READ ONLY; SET LOCAL ROLE ghm_schema_owner; ...; ROLLBACK;` through the local PostgreSQL 18 client at `127.0.0.1:5433`. The session identity was `current_user=ghm_schema_owner` and `session_user=ghm_migrator` in `ghm_payfast_qualification`.

- `20261104120000 bind_commercial_payment_attempt_provider`: live checksum `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`; applied at `2026-11-04 15:20:57.625187+02`.
- `20261104130000 isolate_payfast_settlement_identity`: live checksum `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`; applied at `2026-11-04 15:20:57.629981+02`.

These exact ledger values confirm the audit's two unexplained checksum mismatches. The raw current file hashes match the audit's legacy-CRLF hashes, but neither matches the live ledger. No writes were performed. Next step remains exact historical blob/checksum provenance analysis. Audit disposition remains INVESTIGATE; do not migrate, repair ledger checksums, edit manifests, seed/reset, or touch PostgreSQL 17/5432 or hosted/production resources.


## 2026-11-08 22:05 UTC — PayFast migration checksum history investigation

The local PostgreSQL 18 qualification audit remains **INVESTIGATE** because the two live ledger checksums for the PayFast migrations do not match repository canonical or legacy-CRLF checksums.

Read-only Git history tracing established:
- `20261104120000_bind_commercial_payment_attempt_provider.sql` was renamed in commit `e7a51d7` from `20261007120000_create_commercial_payment_result_boundary.sql`. Five versions were hashed across commits `e7a51d7`, `edd136a`, `52fe215`, `5537573`, and `7196f94`.
- `20261104130000_isolate_payfast_settlement_identity.sql` was newly added in `e7a51d7`; one Git blob was hashed.

No traced blob matched the corresponding live ledger checksum, whether raw or LF-normalized. First migration live checksum: `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`; second: `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`. The traced current Git blobs instead hash to `3f284b7afb1bc83c42331b0346e2853f448948ad9a2f9e92c162c303fb92d3d8` and `230657b714cc8bfa23e69be9a0c8ff0a4d110b3a7435047e33683a77f3863a22`, respectively. Earlier first-migration versions also differ (full values are in the internal runtime reconciliation handover).

This is not explained by line endings. It remains possible that the applied SQL came from another Git object, an external/generated artifact, or a deployment-time source not yet found. Next: search all reachable Git objects/history for the exact live checksums and inspect any archived migration artifact/deployment evidence. Do not change ledger checksums, edit exception manifests, rerun either migration, apply pending migrations, or mutate the database. PostgreSQL 17/5432, hosted databases, Render, and production remain out of scope and untouched.

## 2026-11-08 22:07 UTC — reachable SQL Git-object search

A read-only scan inspected all **132 unique reachable SQL blob objects** in the local Git object graph. It computed raw and LF-normalized SHA-256 for every blob. There were **zero matches** for either live PayFast ledger checksum:
- `20261104120000`: `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`.
- `20261104130000`: `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`.

Together with the earlier historical path/rename trace, this shows the live checksums are not reproduced by any reachable SQL blob in this checkout. It does not rule out external/generated SQL, unreachable Git objects, artifacts or source from another workspace/remote not present locally, or archived CI/deployment artifacts.

Audit remains **INVESTIGATE**. Next step is to seek independent evidence of the exact applied migration artifact (migration runner logs, deployment/CI artifacts, backups, or operator archives) and hash those exact bytes. Do not modify the ledger/checksum, migration files, exception manifests, schema, or run migrations pending provenance resolution. The object scan was read-only; PostgreSQL 17/5432 and all hosted/production resources remain untouched.


## 2026-11-08 22:15 UTC — CI checkout identifies one exact migration blob

The operator fetched and verified CI commit `a1a046d17d04854bfc8259efaa02100b1ae09304` from workflow run [41836364443](https://github.com/zaidhqdev-sys/GHM/actions/runs/41836364443), branch `security/payfast-callback-isolation-20261104`. Hashes of the exact SQL blobs at that commit:

- `20261104120000`, path `database/migrations/20261007120000_create_commercial_payment_result_boundary.sql`, 8,369 bytes: raw/LF SHA-256 `778817028e5377744140b6cec31fccc6fbb84bcf9c47e20c4997b8056ba608b9`; does **not** match live ledger `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`. This is the same hash as the previously traced `edd136a` blob.
- `20261104130000`, path `database/migrations/20261104130000_isolate_payfast_settlement_identity.sql`, 3,499 bytes: raw/LF SHA-256 `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`; **exactly matches** live ledger `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`.

The CI job log confirms `npm run migrate` ran against its disposable GitHub Actions PostgreSQL service, but does not print checksums. The local ledger's `applied_at` values are about six minutes after the CI migration step began; this timing is not proof that the CI job populated the local qualification database. The exact second-blob match identifies a matching source version in the CI checkout, not the database to which the workflow connected. The first mismatch remains unresolved.

Overall forensic audit remains **INVESTIGATE**. Continue with independent provenance for the first migration and connection/run evidence; do not repair ledger checksums, alter exception manifests, run migrations, seed/reset/recreate the DB, or change schema. No database mutation or hosted/production/Render change occurred; PostgreSQL 17/5432 remains untouched. Fetching the commit added Git objects only and did not switch branches.


## 2026-11-08 22:20 UTC — both PayFast ledger checksums matched to exact historical files

**Correction to the earlier 22:05–22:15 notes:** both live PayFast ledger checksums match exact versioned SQL files at implementation commit `a1a046d17d04854bfc8259efaa02100b1ae09304` (PR #206 / CI run [41836364443](https://github.com/zaidhqdev-sys/GHM/actions/runs/41836364443)). The earlier comparison for the first migration hashed the separate old-path file `20261007120000_create_commercial_payment_result_boundary.sql`, rather than the versioned file matching the live ledger's `20261104120000` prefix.

Exact source hashes at `a1a046d`:
- `20261104120000_bind_commercial_payment_attempt_provider.sql` (Git blob `d78677cd88e7a3a9d0ebc66ecf6df2a7d5f34d10`, 8,950 characters): SHA-256 `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`, exactly equal to the live ledger checksum.
- `20261104130000_isolate_payfast_settlement_identity.sql` (Git blob `25c38258e4d91e9364d11b76585ac9936667b756`, 3,499 characters): SHA-256 `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`, exactly equal to the live ledger checksum.

The separate old-path `20261007120000_create_commercial_payment_result_boundary.sql` in that same tree hashes to `778817028e5377744140b6cec31fccc6fbb84bcf9c47e20c4997b8056ba608b9`; it is a different migration path/version and must not be compared as the source for ledger version `20261104120000`. The migration runner derives version from the 14-digit filename prefix and hashes the original source (normalizing LF/CRLF), so both exact paths correctly map to the live rows.

PR #206's local qualification note reports that `npm run migrate` completed on the same native Windows PostgreSQL 18 target `127.0.0.1:5433/ghm_payfast_qualification`, recording 92 migrations. This is a maintainer-reported PR record, not a preserved raw terminal log. CI run 41836364443 used a separate disposable GitHub Actions PostgreSQL service; it did not populate the local database. The two exact source matches explain the checksum bytes, while the PR's local-run record supplies corroborating context for the local qualification history.

The previous 132-blob scan enumerated refs with `git rev-list --objects --all`; the fetched implementation commit was held in `FETCH_HEAD` and was not guaranteed to be included. The scan's scope was therefore narrower than the full set of fetched objects. Do not repeat the earlier claim that no fetched PR source matches the live checksums.

The two PayFast source mismatches are now explained at the historical-file level. Overall audit remains **INVESTIGATE** due the eight migrations absent from the ledger, two unrecognized extra rows, and retained-history validation findings. Do not edit the exception manifest or ledger, run migrations, seed/reset/recreate the DB, or touch PostgreSQL 17/5432, hosted DBs, Render, or production. No database mutation occurred during this source comparison.

## 2026-11-08 22:31 UTC — additional historical migration provenance findings

The owner ran both local Git searches for `20261031100000_restrict_identity_authority_reader`; neither returned a match. GitHub's path-history API also returned no commits for that migration path. Its live ledger checksum is `a6692f473f05647aa8b829a1b9263f69376f2e647b124a013543d8ec7d9186bf`, but no source SQL has been identified. This remains an unrecognized extra; absence from reachable path history is not proof that no local-only, unmerged, unreachable, generated, or external source exists.

The `20261019210000` retained-history entry points to historical blob `7681736389b13c82a81f7a6419826204ef584676` and checksum `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324`. The currently present same-version migration was introduced by commit `e6b396399f41cd6bc6d87044ab99fd32e99cd46e` on 2026-11-05 and is different bytes (owner's local SHA-256 display begins `C8C69A2380BD1D8C98EDEC54DE63B827459AB62A267515DD5ADA54...`). Do not treat that current file as the applied historical source or remove/rewrite it during this audit; the retained-history `REPOSITORY_MIGRATION_PRESENT` finding remains valid pending a history decision.

For QuoteFlow version `20261020130000`, commit `5229b37700f2e21ac4caf2d4c5547bb929ab2de8` changes the migration's two verification-status literals from `unverified` to `pending`. This is useful provenance, but the full file has not yet been proven to hash to live checksum `3c09cc7ecb8f566f0d359832ad91cc7b644570220236713c02a0763a0521345b`; registry checksum `a453171e85f6717476258c6d2d59a39b663be89826316036e6b9891cadfb13e` still differs. Do not approve the retained-history entry without exact-byte verification.

Audit verdict remains **INVESTIGATE**. No database, migration, ledger, registry, exception manifest, hosted resource, or deployment was changed; PostgreSQL 17/5432 remains untouched.

## 2026-11-08 22:35 UTC — QuoteFlow applied migration bytes identified

The live ledger checksum for `20261020130000_create_quoteflow_migration_business_provisioning` is now matched to exact historical SQL bytes. Parent commit `7fb1bbe07fc64ede652ae589ab72bdc96f23d906` (2026-10-26 20:30:50 UTC) contains blob `21731433c2a998fff8d86d628d3589f8768dd618`; SHA-256 of the complete 9,066-character file is `3c09cc7ecb8f566f0d359832ad91cc7b644570220236713c02a0763a0521345b`, exactly equal to the live ledger.

Commit `5229b37700f2e21ac4caf2d4c5547bb929ab2de8` changed `unverified` to `pending` in two places. Its resulting blob `620efa57ac35d494f1aa506f26a7ad810c821d9a` hashes to `a453171e85f6717476258c6d2d59a39b663be89826316036e6b9891cadfb13e9`, which is the current retained-history registry checksum but not the live ledger checksum. The registry's claim that this `pending` version is the original applied checksum is contradicted by the exact `unverified` source match.

The additive `20261020140000_reconcile_quoteflow_provisioning_verification_status.sql` at the same parent says the original migration had already been applied and that the schema check accepts `unverified`, not `pending`; its function continues to create `unverified` Businesses. That corroborates the exact live source match. `5229b37` therefore did not restore the applied bytes; it changed the historical migration after the fact.

Do not edit the ledger, migration, or retained-history registry during this audit. Source provenance is identified, but registry correction requires a separate reviewed decision. Overall verdict remains **INVESTIGATE**; other extra/missing migrations and `20261019210000` retained-history validation remain open. No database or repository migration/manifest was changed.

## 2026-11-08 22:37 UTC — identity-authority migration exact source found

The live row `20261031100000_restrict_identity_authority_reader` now has an exact source match. On branch `reconciliation/ghm-identity-mainline-restored-20261031`, the file is Git blob `e34dd0700885b182c79b1f09f2af5d94281849c2` (482 characters) and SHA-256 `a6692f473f05647aa8b829a1b9263f69376f2e647b124a013543d8ec7d9186bf`, exactly matching the live ledger. It was introduced by commit `d166df2df9fe4a3e00da50935f118ef5322d05ae` at 2026-10-31 22:56:50 UTC, parent `6b67d4c5be110fd178e7980e0718586dfc12e744`. SQL revokes runtime execution on `ghm.auth_read_connect_identity_authority(bigint)` and documents the reserved function as unavailable pending a reviewed runtime caller and account-scope enforcement.

Correction: the earlier search found no matching path history on main/default branch and no matches in the owner's local reachable refs. It did not cover all remote branches. The restored reconciliation branch contains the exact source. Its source provenance is resolved; it remains unrecognized by the audit because the retained-history registry has no record. No registry/manifest edit is authorized in this forensic pass.

The `20261019210000` file on main was introduced only on 2026-11-05 by `e6b396399f41cd6bc6d87044ab99fd32e99cd46e` (blob `c1c3e4d9b4148376109177cf3106aa3519e15df6`, 180 lines); the registry describes an earlier applied historical source (blob `7681736389b13c82a81f7a6419826204ef584676`, SHA-256 `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324`). The path-history API for main shows only the Nov 5 addition. Keep `REPOSITORY_MIGRATION_PRESENT` open pending a deliberate reclassification.

Audit remains **INVESTIGATE**. QuoteFlow `20261020130000` exact applied bytes are matched to commit parent `7fb1bbe...` (live SHA-256 `3c09cc7...`), while registry checksum `a453171e...` points to later `pending` bytes. No database, migration, ledger, registry, exception manifest, hosted resource, or deployment was changed.

## 2026-11-08 22:42 UTC — `20261019210000` is a migration-runner blocker

The same-version Business registration migration was reintroduced on main by commit `e6b396399f41cd6bc6d87044ab99fd32e99cd46e` (2026-11-05), current blob `c1c3e4d9b4148376109177cf3106aa3519e15df6` (local PowerShell hash prefix `C8C69A...`). It contains two later `b.is_active = true` guards, first added in commit `01eae6c7a0fe939873ffbfe714d8268fb730488d` (2026-10-19), parent `5944e594813a1c13c90ca2df0be5b4d808565c32`. The local live ledger and retained-history registry checksum are `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324`, recorded against historical blob `7681736389b13c82a81f7a6419826204ef584676`. Current repository bytes differ from applied bytes.

Main's `config/historical-migration-provenance-exceptions.json` has no `20261019210000` entry. The migration runner `src/db/migrate.ts` rejects a differing checksum for an already-applied version unless the exact live checksum is present in that exception manifest. Therefore, with the observed local ledger, `npm run migrate` would fail at `20261019210000` with a checksum mismatch. Do not run it as a test. The later SQL revision needs a new unused version (preferred) or another explicit, reviewed migration-history repair; the applied historical version should remain represented as provenance. No edits made.

## 15. Clarification of migration audit `missing_count` — 2026-11-08 22:44 UTC

Correction to prior handover shorthand: the forensic script's `missing` array means **repository migration files whose versions do not exist in the live database ledger** (pending/unapplied repository migrations). It does not mean migration files are missing from the repository. The eight versions listed in the local audit are repository-present and ledger-absent. Seven of those files are present on main: `20261105190000_extend_business_directory_location_contact`, `20261105213000_create_business_capability_evidence`, `20261105220000_replace_business_capability_assertions`, `20261105230000_create_founder_directory_review`, `20261106090000_business_logo_storage_binding`, `20261106200000_link_project_to_opportunity`, and `20261107211500_reconcile_business_profile_and_founder_authority`. The eighth, `20261108140000_reconcile_business_profile_contract`, exists on `fix/business-profile-compat-contract-20261108` but is not present on main. Several of the SQL files explicitly state construction-only/no production migration or cutover authorization; their presence and ledger-absent status do not authorize execution. Treat this metric as eight pending repository migrations, not eight missing source files. This correction does not change the audit verdict or permit migration execution. The independent `20261019210000` same-version checksum collision still blocks the current migration runner on the observed local database; its runner transaction would roll back on error. No database or migration source was changed.

## 16. Migration provenance remediation implementation staged — 2026-11-09

A draft code PR is now open for review: [PR #239 — Reconcile historical migration provenance and business identity version collision](https://github.com/zaidhqdev-sys/GHM/pull/239), branch `fix/migration-provenance-reconciliation-20261109`.

Changes on the draft branch:
- Retires the later Business registration SQL body from the already-applied historical version `20261019210000`, leaving its exact applied checksum in retained-history metadata.
- Reintroduces the table contract and active-Business authorization functions in new forward migration `20261108150000_reconcile_business_registration_identity_authorization.sql`. It uses `CREATE TABLE IF NOT EXISTS`, validates the expected seven columns/types and four declaration constraints for an existing table, verifies RLS, restores owner/revokes, and replaces the read/update functions.
- Updates the static migration contract test to point at the new version.
- Corrects QuoteFlow `20261020130000` retained checksum to live-applied `3c09cc7...` and source blob `21731433...`; adds identity-authority `20261031100000` checksum `a6692f47...` with exact commit/blob provenance.
- Does not alter `config/historical-migration-provenance-exceptions.json`.

PR #239 is draft and must not be merged or applied yet. At this checkpoint Cloudflare Pages check passed and GitHub Actions `quality` was still running on head `e1e53bbc02603d075bdf9406e29dc6e83c9c104e` (after the documentation status update). Required evidence still outstanding: exact-head CI success, disposable PostgreSQL 18 empty-install qualification, seeded historical-table qualification including data/owner/RLS/ACL preservation, and a fresh read-only audit of the local qualification database. The complete pending migration set also requires release-readiness review.

No database or ledger was changed; no migration command was run; no production/Render resource or deployment was touched. This implementation is repository-only and remains a draft for review.

## 17. Migration provenance PR #239 exact-head qualification — 2026-11-09

The implementation PR has now passed its full exact-head GitHub Actions quality run before a subsequent documentation-only appendix commit:
- Qualifying implementation head: `77dca310ad4945b28ef919805a3a47797043e2de`.
- GitHub Actions quality run #2222 (`42532985591`): **success**.
- Cloudflare Pages check on that head: **success** (preview build only).
- Build and full disposable PostgreSQL 18 migration application passed.
- Added CI qualification resets both registration identity functions to the exact historical pre-active-Business definitions from commit parent `5944e594813a1c13c90ca2df0be5b4d808565c32`, then executes the new forward migration with the table already present. It asserts both functions contain `b.is_active = true`, RLS enabled, owner `ghm_schema_owner`, runtime direct table SELECT denied, and runtime function execution granted. The transaction is rolled back after the assertions.
- CI log: `PASS: historical functions were upgraded on the pre-existing table; authorization, RLS, owner, and ACL checks passed; transaction rolled back.`
- Full test suite, commercial payment qualification, migration audit policy tests, and runtime boundary verification all passed.

PR #239 remains draft and unmerged. The later appendix-only update on the PR branch triggers another CI run; confirm that exact final head's checks before any readiness change. The owner-local read-only audit still has to be rerun after branch checkout, and the complete pending migration set needs review. No database/ledger or hosted resource was changed; no migration was run against the owner's local or production database.

## 18. PR #239 final-head CI recheck — 2026-11-09

The documentation-only appendix commit on the migration remediation PR has also passed exact-head CI:
- PR #239 final head: `8ba633bbf690cddbc6d3a2b281a36fcf32c6d7ab`.
- GitHub Actions quality run #2223 (`42533143356`): success.
- Cloudflare Pages check: success (preview build only).
- The qualifying implementation code head remains `77dca310ad4945b28ef919805a3a47797043e2de`; its full CI run #2222 also passed, including disposable PostgreSQL 18 fresh migration, historical function fixture upgrade on an existing table, full test suite, commercial-payment DB qualification, migration audit policy tests, and runtime boundary verification.
- CI log from the historical-table upgrade step: `PASS: historical functions were upgraded on the pre-existing table; authorization, RLS, owner, and ACL checks passed; transaction rolled back.`

PR #239 remains draft and unmerged. The only outstanding validation not covered by CI is a fresh read-only audit against the owner's qualified local database after checking out the branch, plus owner review of all pending migrations. No local/production database, ledger, Render service, or deployment was touched.

## 19. Pending migration source review blockers — 2026-11-09

Review of the eight post-2026-11-04 pending migrations found concrete release blockers; source review only, not runtime exploitation proof:
- `20261105190000_extend_business_directory_location_contact.sql` validates `avatar_letter`, `avatar_color`, and `years_in_business` patch keys but omits all three from the final `UPDATE ghm.business SET`, so those accepted fields are not persisted. Because this migration may have been applied elsewhere, do not silently rewrite it; determine environment application status and use a forward correction if needed.
- `20261105213000_create_business_capability_evidence.sql` grants table-wide direct `SELECT` to `ghm_runtime` while defining a `visibility` field, but this migration does not enable RLS or define tenant/visibility-filtered read access. Define intended visibility and Business membership policy, then replace broad read access with tested bounded access.
- `20261105230000_create_founder_directory_review.sql` intentionally leaves the founder reviewer allowlist empty; a separately approved reviewer mapping is still required before the workflow can operate.
- Logo storage binding is touched by both `20261106090000` and `20261107211500`; qualify fresh and partially reconciled states in timestamp order.
- `20261106200000` adds nullable Project→Opportunity linkage; verify app transaction behavior and legacy paths.

The remediation proposal on PR #239 now records these findings. PR remains draft. Do not merge or run migrations until these blockers are addressed, full tests pass, the local read-only audit is rerun, and the pending migration set is reviewed. No owner-local/production database or ledger was changed.

## 20. Profile patch forward fix and evidence-read review refinement — 2026-11-09

The release review identified that migration `20261105190000` accepted/validated `avatar_letter`, `avatar_color`, and `years_in_business` but omitted their assignments from the `UPDATE`. A forward-only correction is now staged in PR #239 as `20261109100000_persist_business_profile_presentation_fields.sql`; the earlier migration remains unchanged. The profile migration contract test now asserts all three assignments in the forward migration.

The capability evidence finding is refined: normal application reads are tenant-scoped because `listForBusiness` calls `withTenantTransaction` (active Business membership checked by `resolveTenantContext`) and filters on the requested Business ID. Therefore the source review does **not** establish cross-tenant exposure through the normal route. Defense-in-depth/product-contract gaps remain: `ghm_runtime` has table-wide SQL SELECT, table RLS is not enabled, and the `visibility` field is not used by the current list query or a public/authenticated discovery path. Define intended visibility behavior and decide on DB-level isolation before broadening reads.

Project creation source review confirmed Opportunity, participant, and Project inserts occur in one authorized transaction. Founder reviewer allowlist remains intentionally empty pending separately approved mapping. PR #239 remains draft; the new forward profile migration and test require exact-head CI/PG18 validation, and local read-only audit remains outstanding. No persistent database was touched.
