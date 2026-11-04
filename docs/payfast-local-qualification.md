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
