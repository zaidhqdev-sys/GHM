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
