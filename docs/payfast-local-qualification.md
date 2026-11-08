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
