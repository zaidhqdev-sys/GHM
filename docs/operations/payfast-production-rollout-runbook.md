# PayFast production rollout runbook (approval-gated)

**Status:** Planning only. No production database, Render service, secret, or PayFast setting has been changed.  
**Scope:** Render PostgreSQL database `ghm_db` (schema `ghm`) and a *new, separate* production PayFast callback service.  
**Not in scope:** The existing production GHM API runtime must not receive callback credentials or callback database access.

## 1. Current release position

- PayFast settlement isolation was squash-merged by PR #206 into
  `integration/ghm-identity-merge-candidate-20261018` at
  `d90b83bbf762e55321c1a985cb88051a496647e0`.
- The merge is on the integration candidate branch, **not `main`**.
  The focused production-baseline promotion is PR #207, branch
  `release/payfast-settlement-isolation-main-20261104`, currently open as a
  draft. Its latest head `f531e1f44e10b9492fcabd2d3cc5836afdd3c6d9` is based
  on `main` commit `61202bb4f61a465f8776b192927aa22e40297fd1`; exact-head
  CI run [#41905406452](https://github.com/zaidhqdev-sys/GHM/actions/runs/41905406452)
  passed all jobs on 2026-11-04. GitHub reports the PR mergeable/clean. The
  production `GHM-Internal-Runtime` service still tracks `main` and its latest
  live deployment remains `61202bb4f61a465f8776b192927aa22e40297fd1`. No
  production deployment of PR #206 or #207 occurred. PR #207 remains draft
  and unmerged pending the production database plan and deployment window.
- The two feature migrations are:
  - `20261104120000_bind_commercial_payment_attempt_provider`
  - `20261104130000_isolate_payfast_settlement_identity`
- The migration runner reads the complete `database/migrations` directory in
  timestamp order and applies every migration not already recorded in the
  migration ledger. It is **not** a command to apply only the two PayFast files.
- The second migration deliberately fails unless the cluster-level
  `ghm_payment_provider` LOGIN already exists.
- The provider-binding migration leaves historical attempts' new
  `provider_code` as NULL. Do not backfill by assumption.


## 1A. Verified production snapshot — read-only, 2026-11-04

The following facts were observed through Render's read-only database and
resource inspection. They are an inventory snapshot, not approval to change
anything; re-check immediately before a scheduled window.

- Render resource `ghm-db` is PostgreSQL 18, resource ID
  `dpg-dag0sdtbedkc7389vi2g-a`, database name **`ghm_db`**, application
  schema **`ghm`**, Frankfurt region, 1 GB disk, `0.1c-256mb` plan.
- The existing production service is `GHM-Internal-Runtime`, resource ID
  `srv-damupsek1f9s73eq8kkg`; it tracks `main`, runs `npm start`, and
  health-checks `/healthz`. It is the ordinary API, not a callback service.
- The production database resource's current IP allow-list includes
  `0.0.0.0/0`. This does not restrict database ingress to known source IPs; whether the
  service-to-database private route is used must be verified separately.
  Restrict the database allow-list to the actual required Render private
  network/approved operator paths before introducing the callback service. Do not change it until the
  complete required connection paths are known and tested; avoid accidental
  API/database outage.
- The existing API service's Render IP allow-list also includes
  `0.0.0.0/0`; that is public web ingress and is distinct from database
  ingress. Review API edge/proxy behavior separately.
- A read-only production connection reported `session_user = ghm_app_user`
  and `current_user = ghm_db_user`. `pg_db_role_setting` confirms a
  database-level `role=ghm_db_user` setting for `ghm_app_user`, and the
  application login can SET ROLE to `ghm_db_user`. Catalog inspection found
  ADMIN OPTION memberships granted by `postgres` from `ghm_db_user` to
  `ghm_migrator`, `ghm_runtime` and `ghm_schema_owner`; the migrator and
  schema-owner memberships have neither INHERIT nor SET. There is also a
  separate non-admin `ghm_db_user` -> `ghm_runtime` membership grant.
  `ghm_db_user` itself also has `CREATEDB` and `CREATEROLE`, an additional
  escalation path not removed by the candidate membership REVOKEs below.
  This is not the intended least-privilege API identity. The ordinary API
  identity can administer memberships in infrastructure roles, a material
  privilege-escalation path. Remove those ADMIN OPTION grants under an
  approved database-owner change, preserve only the API's required
  non-admin runtime membership, and verify the complete role graph and
  effective privileges afterward. Do not revoke the runtime membership
  blindly while the live API depends on it.
- Roles `ghm_schema_owner`, `ghm_migrator`, and `ghm_runtime` exist;
  `ghm_payment_provider` does **not** currently exist. The dedicated
  provider LOGIN prerequisite is therefore not met.
- The production `ghm.commercial_payment_attempt` table currently has no
  `provider_code` column, and the PayFast-specific read/settlement functions
  are absent. The generic `ghm.commercial_apply_payment_result` function is
  owned by `ghm_schema_owner` and currently grants EXECUTE to
  `ghm_runtime`. The feature migrations have not yet been applied to this
  production database.
- The Render read-only query identity could not SELECT the migration ledger
  table `ghm.ghm_schema_migrations` (permission denied). Its location was
  confirmed, but its contents and exact pending migration set were **not**
  verified. The ledger is owned by `ghm_schema_owner` and has no explicit
  table ACL; that read-only denial is expected. Obtain ledger evidence using
  the authorized migration owner or another explicitly approved read-only
  role before scheduling anything. Do not change ledger privileges merely to
  make an inspection tool work.
- Current catalog sizes were approximately 112 kB total for
  `ghm.commercial_payment_attempt`, 64 kB for
  `ghm.commercial_provider_event`, and 144 kB for
  `ghm.commercial_payment_transaction`. The attempt table has six existing
  indexes including its primary key, unique idempotency key, status/expiry
  index, business indexes and subscription index. A read-only activity sample
  observed zero other active sessions at that instant. These are point-in-time
  observations, not a lock-free migration guarantee; still assess active
  sessions and blockers immediately before the change.
- The current payment attempt inventory contains **one** row, status
  `pending_checkout`, created 2026-10-07. It predates the provider-binding
  migration and would remain `provider_code IS NULL` after that migration.
  Do not assume it is PayFast; identify it from reliable persisted evidence
  and decide its safe disposition before cutover.
- The database resource currently has a broad IP allow-list and the provider
  role is absent. No database setting, role, migration, Render service,
  credential or payment record was changed during this inspection.

These observations change the rollout plan: first reconcile the production
role graph and historical pending attempt, verify the full migration ledger,
and close the database ingress exposure with a tested network plan. Only then
can the dedicated provider role and callback-service plan be finalized.

### Candidate role cleanup SQL (review only; not executed)

The catalog showed the ADMIN OPTION memberships below were granted by
`postgres`. If the production database owner confirms there is no legitimate
delegation dependency, the following is the narrowly scoped candidate cleanup
for a PostgreSQL 18 administrator. It removes the API role's ability to grant
migration/schema-owner roles, and removes only the unnecessary ADMIN OPTION
on the runtime membership while preserving the separate non-admin
`ghm_db_user` -> `ghm_runtime` INHERIT/SET membership:

```sql
REVOKE ghm_migrator, ghm_schema_owner
  FROM ghm_db_user GRANTED BY postgres;

REVOKE ADMIN OPTION FOR ghm_runtime
  FROM ghm_db_user GRANTED BY postgres;
```

Do not execute this from the ordinary API credential or as part of the PayFast
migration. It requires the authorized role administrator and a separately
approved change. Separately assess and, if approved, remove the
`CREATEDB`/`CREATEROLE` attributes from `ghm_db_user` using the supported
Render-managed administrator path; the membership REVOKEs shown here do not
change those role attributes. Capture role attributes before and after. Before and after, capture the full
`pg_auth_members` rows including `grantor`, `admin_option`,
`inherit_option` and `set_option`. Confirm `ghm_app_user` still receives
only the intended ordinary runtime privileges through its configured
`ghm_db_user` role, and confirm it cannot SET ROLE or administer
`ghm_migrator` / `ghm_schema_owner`. If the command fails because the
Render-managed grantor cannot be administered through the available owner
credential, stop and obtain the supported Render/database-owner remediation;
do not work around it by using an API credential.

## 2. Hard service and credential boundary

| Component | Database identity / configuration |
|---|---|
| Existing production GHM API | Remains ordinary API; `DATABASE_URL` uses `ghm_runtime`. No provider URL, provider password, PayFast callback secrets, or callback ITN route. |
| New production PayFast callback service | Separate Render service running `npm run start:payfast-callback`; its only database URL is `PAYFAST_CALLBACK_DATABASE_URL`, authenticated as `ghm_payment_provider`. |
| Production migration process | One-off controlled migration invocation using `GHM_MIGRATOR_DATABASE_URL` authenticated as `ghm_migrator`, which switches to `ghm_schema_owner`. Never use the API or provider login for migrations. |

The callback service needs its own service identity, network policy, logs,
health/readiness checks, scaling and secret rotation. It must not be created by
repurposing the existing production API service.

## 3. Before any production change — evidence and decisions

Do not proceed to migration or service creation until every item below is
verified and explicitly approved by the production owner.

### Release and compatibility

- [ ] Do **not** merge the entire integration candidate branch into `main` as
      a production shortcut; it contains broader identity/integration history.
      Prepare a focused release PR from `main` containing the PR #206 squash
      change (`d90b83bbf762e55321c1a985cb88051a496647e0`) and its reviewed
      dependencies only. Review the exact diff and resolve any cherry-pick or
      compatibility conflicts before approval.
- [ ] The production `GHM-Internal-Runtime` Render service currently tracks
      `main` with auto-deploy enabled and trigger `checksPass`. Merging a focused
      release PR to `main` will therefore trigger production deployment after
      required checks pass. Schedule that merge as part of the approved change
      window, after the database migration is complete and callback traffic is
      paused/retry-safe; do not merge early and assume deployment can be held.
- [ ] Verify the exact release commit and all required CI on the focused
      production release PR before the change window.
- [ ] Rehearse the complete application + migration sequence against a
      production-like, isolated PostgreSQL database with the same migration
      ledger history and relevant data shape.
- [ ] Confirm the exact deploy/migration order and expected callback interruption
      window. The second migration revokes generic settlement execution from
      `ghm_runtime`; the old general-API ITN route must not be relied on after
      that boundary is applied. The new callback service must not receive traffic
      until it is ready and verified.
- [ ] Identify all other pending migrations in the production repository
      migration set. Review their SQL, checksums, dependencies, lock behavior
      and application compatibility; do not assume only the two PayFast
      migrations will run.

### Production database and backup

- [ ] Confirm the actual production Render PostgreSQL host, database name
      (`ghm_db`, with application objects in schema `ghm`), region, private connection route, TLS requirements and current
      migration ledger. Never infer the host from sandbox or local values.
- [ ] Confirm a recoverable managed backup/PITR point, retention window and
      restore procedure. Perform a restore rehearsal to a separate database
      and record the recovery point/time before scheduling the change.
- [ ] Record table size, row count, indexes and current activity for
      `ghm.commercial_payment_attempt`; assess the brief strong table lock
      needed by `ALTER TABLE ... ADD COLUMN`, transaction duration, blockers,
      statement/lock timeouts, and acceptable maintenance window.
- [ ] Identify payment/checkout activity and pending ITN traffic during the
      window. Define a customer-safe pause/drain/retry communication plan.
      Do not silently drop callbacks or acknowledge them before settlement
      commits.

### Provider identity

- [ ] Verify `ghm_schema_owner` and `ghm_migrator` exist with the intended
      ownership/membership model; verify the actual production chain `ghm_app_user` -> `ghm_db_user` ->
      `ghm_runtime`, and remove the unintended ADMIN OPTION on role memberships
      after an approved replacement grant plan. The final API identity must
      be documented and least-privileged.
- [ ] Provision `ghm_payment_provider LOGIN NOINHERIT` out-of-band on the
      production PostgreSQL cluster. Set its unique password through the
      approved secret-handling process; never put it in Git, SQL files,
      command history, chat, or CI logs.
- [ ] Grant only database `CONNECT` to `ghm_payment_provider` before the
      migration. The migration grants schema usage and only the two narrow
      PayFast function EXECUTE privileges. Do not grant table privileges or
      membership in another role.
- [ ] Verify the provider role can log in and has no unexpected memberships,
      superuser, create-role, create-database, replication or bypass-RLS
      privileges. Capture sanitized evidence, never its credential.

### Network and service

- [ ] Confirm private callback-to-database connectivity and TLS from the
      intended Render service, with no public database exposure.
- [ ] Determine the actual Render ingress/proxy chain. Configure
      `PAYFAST_CALLBACK_TRUST_PROXY` only after verifying the edge sanitizes
      forwarded headers and the exact trusted hop count. Do not guess.
- [ ] Verify inbound callback routing, outbound HTTPS to the correct PayFast
      server-confirmation endpoint, DNS, egress policy, timeouts, readiness and
      health checks.
- [ ] Confirm current PayFast published source-IP ranges and the application's
      allow-list behavior before enabling external traffic.
- [ ] Define callback service rollback, log/alert ownership, credential rotation
      and on-call coverage.

## 4. Read-only preflight (production owner runs)

Run read-only catalog and data checks against the confirmed production
connection using an authorized read-only session. Do not put passwords in
commands or output.

First establish the target and role facts:

```sql
SELECT current_database(), inet_server_addr(), inet_server_port(),
       current_user, session_user;

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname IN
  ('ghm_app_user', 'ghm_db_user', 'ghm_schema_owner', 'ghm_migrator', 'ghm_runtime', 'ghm_payment_provider')
ORDER BY rolname;

SELECT member_role.rolname AS granted_role,
       parent_role.rolname AS member_of
FROM pg_auth_members m
JOIN pg_roles parent_role ON parent_role.oid = m.roleid
JOIN pg_roles member_role ON member_role.oid = m.member
WHERE member_role.rolname IN
  ('ghm_app_user', 'ghm_db_user', 'ghm_migrator', 'ghm_runtime', 'ghm_payment_provider')
ORDER BY 1, 2;
```

Inspect the migration ledger location and contents (do not assume it is in
`public`):

```sql
SELECT to_regclass('ghm.ghm_schema_migrations') AS ghm_ledger,
       to_regclass('public.ghm_schema_migrations') AS public_ledger;

SELECT version, name, checksum
FROM ghm.ghm_schema_migrations
ORDER BY version;
```

If the ledger is not `ghm.ghm_schema_migrations`, stop and identify the
authoritative ledger before continuing. Compare the entire production ledger
with the exact release checkout's migration files and checksum policy. Record
the full ordered pending migration list. Do not run `npm run migrate` until
every pending migration has been reviewed.

Inspect the current payment attempt shape and provider distribution:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'ghm'
  AND table_name = 'commercial_payment_attempt'
ORDER BY ordinal_position;

SELECT attempt_status, count(*) AS attempts
FROM ghm.commercial_payment_attempt
GROUP BY attempt_status
ORDER BY attempt_status;
```

After confirming `provider_code` exists (for a post-migration inspection),
use:

```sql
SELECT provider_code, attempt_status, count(*) AS attempts
FROM ghm.commercial_payment_attempt
GROUP BY provider_code, attempt_status
ORDER BY provider_code NULLS FIRST, attempt_status;
```

The current read-only snapshot shows one pending-checkout attempt dated
2026-10-07. Do not infer historical provider identity from the checkout URL
or from a single status field. Inventory the historical NULL-provider population
read-only, classify each retained attempt using reliable persisted evidence,
and document unknowns. Any backfill, expiry or quarantine operation requires
a separately reviewed and explicitly approved data-change plan.

## 5. Controlled migration and deployment window

This is a coordinated payment-processing change, not an unattended deploy.

1. Freeze unrelated schema changes and confirm backup/PITR and restore contact.
2. Enter the approved maintenance/cutover window. Apply the agreed customer
   checkout and callback drain/pause procedure. Ensure the general API's old
   ITN route will not be used after the settlement privilege revocation.
3. Provision and verify the dedicated `ghm_payment_provider` LOGIN and
   database CONNECT as specified above.
4. From the exact approved release checkout, inspect the complete pending
   migration set and run the migration audit. Reconfirm
   `GHM_MIGRATOR_DATABASE_URL`, `GHM_MIGRATION_DATABASE_NAME` and
   `GHM_MIGRATION_DATABASE_HOST` refer to the approved production `ghm_db`
   target (application schema `ghm`). The target guard checks the URL database and host before connecting.
5. Run `npm run migrate` once under the approved change ticket and operator
   supervision. The runner applies all pending files in timestamp order using
   `ghm_migrator` then `SET ROLE ghm_schema_owner`; it does not accept a
   selected migration filename. Capture sanitized output and the resulting
   ledger. If any migration fails, stop; do not improvise SQL or skip a file.
6. Verify the two PayFast migration versions/checksums in the authoritative
   ledger; inspect function owners, SECURITY DEFINER/search_path, and grants.
   Confirm `ghm_runtime` cannot execute either settlement function and
   `ghm_payment_provider` can execute only the PayFast attempt-read and
   PayFast-specific settlement functions. Confirm the provider login has no
   direct commercial-table DML/read grants.
7. Deploy the approved application release to the ordinary API service with
   only its ordinary API configuration. Separately create/deploy the new
   callback service using `npm run start:payfast-callback`. Configure callback
   variables only on that callback service, after it exists and the service,
   DB, network, proxy and readiness checks have been approved.
8. Verify callback startup and `/readyz` report the database identity as
   `ghm_payment_provider` for both `session_user` and `current_user`.
   Verify the general API has no provider credential and does not register the
   ITN route. Verify health, ingress, trusted proxy behavior, TLS and sanitized
   logs.
9. Complete a supervised end-to-end test in the approved PayFast environment
   using a controlled test transaction and reconcile the callback, provider
   event, payment transaction, attempt and subscription. Do not use a real
   customer payment as a smoke test. Live payment activation requires its own
   explicit approval.
10. Resume checkout/notification traffic only after the release owner signs
    off the observed results. Monitor callback errors, retries, duplicate
    events, settlement latency and reconciliation.

## 6. Rollback and recovery

- The two migrations are forward schema/privilege changes. Do not improvise a
  down migration or manually re-grant generic settlement execution to
  `ghm_runtime` as an emergency shortcut.
- If migration fails before commit, capture the error and confirm the database
  transaction rolled back and the migration ledger is unchanged for the failed
  version. Stop and diagnose in a restored rehearsal environment.
- If migration committed but application/callback deployment fails, keep
  payment notifications paused or safely retryable, preserve evidence, and
  follow the approved incident plan. Do not restore over production without
  the database owner's explicit recovery decision.
- Recovery from a committed incompatible schema change may require managed
  PITR/backup restore to a separate recovery target, assessment of writes since
  the recovery point, and an approved reconciliation plan. Restoring production
  can discard legitimate post-backup business/payment data; it is not a casual
  rollback button.
- Reverting application code does not restore the old settlement privileges or
  undo schema. A code rollback alone is not a complete database rollback.
- After any recovery, reconcile provider notifications and transaction state
  before resuming payment processing. Preserve idempotency evidence.

## 7. Exact callback-service configuration handover

**Do not configure these variables yet.** The handover happens only after the
production release is promoted, the migration plan/backup is approved, the
provider role is provisioned, the migration is authorized and complete, and
the separate callback service is created with verified private connectivity.

At that point the production callback service—not the ordinary API service—
will receive the callback-specific configuration. The exact values and
variable-by-variable instructions will be supplied at that time, including
explicit `PAYFAST_ENVIRONMENT`, `PAYFAST_CALLBACK_DATABASE_URL`,
`PAYFAST_CALLBACK_DATABASE_SSL`, `PAYFAST_MERCHANT_ID`, optional
`PAYFAST_PASSPHRASE`, and the verified `PAYFAST_CALLBACK_TRUST_PROXY`
setting. Use the Render-assigned `PORT`; do not set a guessed public URL or
proxy hop count. Merchant credentials must be provisioned out-of-band.

No production change is authorized by this runbook. Every production migration,
service creation, secret write, notify-URL change and live activation requires
the production owner's explicit approval at the relevant step.

## Focused release candidate and fresh production recheck — 2026-11-04 20:10 UTC

PR #207 is the focused release candidate from `main`, not the integration
branch. It is open as a draft and GitHub reports it mergeable. The code-bearing
release head `7f2c507ae5afc9c25dd4c60518e5fc9fe18023b0` passed the required
`quality` and Cloudflare Pages checks in
[CI run #41852323909](https://github.com/zaidhqdev-sys/GHM/actions/runs/41852323909).
The first baseline attempt exposed a missing TLS helper that existed only on
the integration branch; the callback server was made self-contained and the
corrected release head passed the full CI workflow. A documentation-only
production recheck was then committed as `14a0c961b2f60bffc5e8d8c1f565f68396758128`;
its exact-head CI run [#41904379757](https://github.com/zaidhqdev-sys/GHM/actions/runs/41904379757)
was still running when this note was written. PR #207 remains draft; no merge
or production deploy was performed.

A fresh read-only recheck through Render at 2026-11-04 20:10 UTC confirmed:

- `GHM-Internal-Runtime` still tracks `main`, uses `npm start`, has
  auto-deploy enabled with `checksPass`, and its latest live deploy remains
  `61202bb4f61a465f8776b192927aa22e40297fd1`.
- Production PostgreSQL resource `ghm-db` remains PostgreSQL 18,
  database `ghm_db`, application schema `ghm`, Frankfurt, plan
  `0.1c-256mb`, 1 GB disk. Its database IP allow-list still includes
  `0.0.0.0/0`.
- The read-only database connection still resolves to
  `session_user=ghm_app_user` and `current_user=ghm_db_user`.
  The role catalog still shows `ghm_db_user` with CREATEDB and CREATEROLE,
  ADMIN OPTION memberships in `ghm_migrator`, `ghm_runtime`, and
  `ghm_schema_owner` granted by `postgres`, plus the separate
  non-admin `ghm_db_user` to `ghm_runtime` membership. The CREATEDB and
  CREATEROLE role attributes are an additional privilege-escalation path,
  separate from the ADMIN OPTION memberships. The production owner must
  decide whether those attributes can be removed from the application role
  after confirming no operational dependency, and verify the supported
  Render-managed administrator path for doing so. The candidate membership
  REVOKEs below do not remove CREATEDB/CREATEROLE. This is not a
  least-privilege production runtime arrangement; do not apply a casual
  revocation or use this API identity for role administration.
- `ghm_payment_provider` is still absent. The payment-attempt table still
  has no `provider_code` column and still contains exactly one
  `pending_checkout` attempt: ID 6, created 2026-10-07 18:20:31 UTC.
  No provider classification or reconciliation has been inferred.
- The authoritative migration ledger relation resolves as
  `ghm.ghm_schema_migrations`; its contents remain unreadable to the
  Render read-only query identity. The full applied and pending migration
  set therefore remains unverified.

This recheck is read-only evidence only. No production role, grant, database
setting, migration, payment record, Render service, secret, notify URL, or
PayFast configuration was changed. The role-administration path, full ledger
evidence, historical pending attempt disposition, private database ingress,
and backup/restore rehearsal remain the immediate production blockers. PR
#207 must remain unmerged until the production migration and deployment
window is approved and coordinated, because merging to `main` triggers the
ordinary API auto-deploy.


## Exact-head release and production snapshot refresh — 2026-11-04 20:17 UTC

The latest PR #207 head is `f531e1f44e10b9492fcabd2d3cc5836afdd3c6d9`.
Its exact-head CI workflow [#41905406452](https://github.com/zaidhqdev-sys/GHM/actions/runs/41905406452)
completed successfully: build, all migrations on disposable PostgreSQL, full
test suite, commercial settlement identity qualification, migration audit
policy and runtime-boundary verification all passed. GitHub reports PR #207
open, draft, unmerged, and mergeable with a clean mergeability state. The
runbook and ADR are release evidence only; this does not authorize merge or
production rollout.

The production resource/service metadata was rechecked read-only. The database
remains `ghm-db` / `ghm_db` on PostgreSQL 18, with IP allow-list
`0.0.0.0/0`. `GHM-Internal-Runtime` still tracks `main`, runs
`npm start`, and auto-deploys when checks pass. The current `main` and
latest live deployment remain `61202bb4f61a465f8776b192927aa22e40297fd1`.
The earlier database catalog snapshot remains the latest available read-only
role/attempt/ledger evidence: `ghm_db_user` has CREATEDB/CREATEROLE and
ADMIN OPTION memberships, `ghm_payment_provider` is absent, the single
historical `pending_checkout` attempt (ID 6) remains unclassified, and the
ledger contents are still not readable by the Render inspection identity.

No production change was made. PR #207 remains draft and unmerged. No callback
service or callback-specific Render variables should be configured yet.

## Exact release-head qualification refresh — 2026-11-04 20:22 UTC

PR #207's current exact head is `f531e1f44e10b9492fcabd2d3cc5836afdd3c6d9`,
based on `main` commit `61202bb4f61a465f8776b192927aa22e40297fd1`.
Exact-head CI [#41905406452](https://github.com/zaidhqdev-sys/GHM/actions/runs/41905406452)
completed successfully. The `quality` job passed build, all migrations on
disposable PostgreSQL, storage qualification, the full test suite, commercial
payment settlement identity qualification, migration audit policy tests and
runtime-boundary verification. GitHub reports PR #207 open, draft, unmerged,
and mergeable with a clean mergeability state.

This is source/CI qualification, not production database qualification or
authorization to merge. The ordinary production API auto-deploys from
`main`; the production role graph, migration ledger contents, historical
pending checkout, database ingress and backup/recovery remain unresolved.
No production change was made.


## Production operator handover — Render UI and direct psql audit, 2026-11-04 21:06 UTC

This section records the operator's follow-up inspection so the same checks
are not repeated unnecessarily. Treat it as a point-in-time snapshot and
re-check only if the resource, credentials, role graph, or rollout state
changes. No production database writes, role changes, credential rotations,
network edits, migrations, service changes, or PayFast configuration changes
were made during this work.

### Render resource and release configuration confirmed by the operator

- The operator confirmed the Render production service is configured with
  branch `main`, build command `npm ci && npm run build`, start command
  `npm start`, and auto-deploy after CI checks pass.
- The operator explicitly confirmed `ghm-db` is the production database and
  has no links to the sandbox. Do not use sandbox/local qualification as a
  reason to treat this database as disposable.
- The production database is Render PostgreSQL resource
  `ghm-db`, ID `dpg-dag0sdtbedkc7389vi2g-a`, database `ghm_db`.

### Backup/export checkpoint

- Render Recovery UI showed Point-in-Time Recovery for the prior 3 days
  (Pro workspace upgrade offered for a 7-day recovery window).
- A complete logical export was successfully created and listed in Render
  on 2026-11-04 at 22:42 local UI time (20:42 UTC), file timestamp
  `2026-11-04T20:42Z`. Render states export files are retained for at least
  7 days.
- The export file URL contains an access token. Do not copy it into Git,
  tickets, logs, or chat; use the Render UI to retrieve it when required.
- This is a logical export checkpoint, not a restore rehearsal. No PITR
  restore was started and no additional database was created.

### Render credentials and networking UI

- Render Info → Credentials showed two managed credentials:
  `ghm_app_user` marked Default and `ghm_db_user` non-default; both were
  created approximately two months earlier and showed zero open connections
  at the time of inspection. Passwords were not disclosed.
- The operator did not create a new default credential, rotate, or delete
  either credential. Do not use the Render “New default credential” action
  casually: it changes the default identity and may affect Blueprint-managed
  connection variables.
- Render Networking showed `0.0.0.0/0` (“everywhere”) at workspace,
  environment, and PostgreSQL inbound-rule levels. The operator made no
  networking changes. Identify all external clients and test private service
  connectivity before narrowing any of these rules; do not remove rules
  speculatively.

### Windows psql / Render CLI connection path

- The operator launched `render psql dpg-dag0sdtbedkc7389vi2g-a` from
  Windows PowerShell in `C:\\GHM`. Render's Connect → external PSQL
  command initially reported `psql not found on path`.
- Windows had PostgreSQL 17 and 18 installed. PostgreSQL 18's executable
  existed at `C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe`,
  but neither version's bin directory was on PATH.
- The issue was resolved for that PowerShell session only, without installing
  anything or changing the persistent Windows PATH:
  ```powershell
  $env:Path = "C:\\Program Files\\PostgreSQL\\18\\bin;$env:Path"
  where.exe psql
  psql --version
  render psql dpg-dag0sdtbedkc7389vi2g-a
  ```
- `psql (PostgreSQL) 18.6` connected successfully to production over TLS
  1.3. The operator is keeping that separate terminal open for subsequent
  approved read-only inspection. PostgreSQL 17 / local port 5432 and
  PostgreSQL 18 / local port 5433 are local qualification instances and must
  not be confused with this Render production connection.
- No connection URL, password, or export token was recorded here.

### Direct production session identity and safety setting

The direct Render PSQL session returned:

```text
current_database = ghm_db
current_user = ghm_db_user
session_user = ghm_app_user
transaction_read_only = off
```

The operator then ran `SET default_transaction_read_only = on;` and
verified `SHOW default_transaction_read_only;` returned `on`. This is a
session default only, not a server-enforced immutable read-only credential;
it can be changed within the session and must not be treated as a security
boundary. Continue to issue SELECT/catalog inspection only. Do not run DDL,
DML, GRANT/REVOKE, role changes, or migration commands from this connection.

### Direct role attributes and membership inventory

The operator queried `pg_roles` for the relevant identities. Results:

| Role | LOGIN | SUPERUSER | CREATEDB | CREATEROLE | REPLICATION | BYPASSRLS |
|---|---:|---:|---:|---:|---:|---:|
| `ghm_app_user` | yes | no | no | no | no | no |
| `ghm_db_user` | yes | no | **yes** | **yes** | no | no |
| `ghm_migrator` | yes | no | no | no | no | no |
| `ghm_runtime` | yes | no | no | no | no | no |
| `ghm_schema_owner` | no | no | no | no | no | no |
| `ghm_payment_provider` | **absent** | — | — | — | — | — |

The membership query returned these exact rows:

| Member | Granted role | ADMIN OPTION | INHERIT OPTION | SET OPTION |
|---|---|---:|---:|---:|
| `ghm_db_user` | `pg_read_all_stats` | no | yes | yes |
| `ghm_db_user` | `pg_signal_backend` | no | yes | yes |
| `ghm_db_user` | `ghm_schema_owner` | **yes** | no | no |
| `ghm_db_user` | `ghm_migrator` | **yes** | no | no |
| `ghm_db_user` | `ghm_runtime` | no | yes | yes |
| `ghm_db_user` | `ghm_runtime` | **yes** | no | no |
| `ghm_app_user` | `pg_read_all_stats` | no | yes | yes |
| `ghm_app_user` | `pg_signal_backend` | no | yes | yes |
| `ghm_app_user` | `ghm_db_user` | no | yes | yes |
| `ghm_migrator` | `ghm_schema_owner` | no | no | yes |

This independently confirms that `ghm_app_user` inherits `ghm_db_user`,
and that `ghm_db_user` has both CREATEDB and CREATEROLE plus ADMIN OPTION
membership grants over `ghm_schema_owner`, `ghm_migrator`, and one of its
two `ghm_runtime` memberships. There is also a separate non-admin
INHERIT/SET membership in `ghm_runtime`. The two runtime membership rows
must be treated as separate grants. The role attributes are a separate
escalation path and are not removed by membership REVOKEs.

Do not repeat this same role-attribute and membership inventory unless the
role graph is changed or a pre-change/post-change verification is being
performed. Before any future approved role remediation, capture grantor as
well as all membership option columns and verify the resulting effective
application privileges. No remediation was executed.

### Schema and object ownership

Direct catalog inspection confirmed:

| Object | Owner |
|---|---|
| Schema `ghm` | `ghm_schema_owner` |
| Table `ghm.commercial_payment_attempt` | `ghm_schema_owner` |
| Table `ghm.ghm_schema_migrations` | `ghm_schema_owner` |

The payment-attempt table and migration ledger are ordinary tables
(`relkind = r`). The ownership arrangement is consistent with a non-login
schema owner and is a positive existing separation.

### Migration ledger inspection result and limitation

- `ghm.ghm_schema_migrations` exists. Its owner is
  `ghm_schema_owner`.
- Querying `information_schema.columns` for the ledger returned zero rows
  under the application/effective role. This was a visibility limitation,
  not evidence that the table had no columns.
- Querying `pg_attribute` / `pg_class` / `pg_namespace` exposed the
  ledger structure:

  | Position | Column | Type |
  |---:|---|---|
  | 1 | `version` | varchar(64) |
  | 2 | `name` | varchar(255) |
  | 3 | `checksum` | varchar(64) |
  | 4 | `applied_at` | timestamp with time zone |

- Selecting `version, name, applied_at` from
  `ghm.ghm_schema_migrations` returned
  `ERROR: permission denied for table ghm_schema_migrations`.
- Therefore the ledger's schema is now known, but its row contents, checksums,
  applied versions, and exact production pending migration set remain
  **unverified**. Do not repeat the same SELECT from the
  `ghm_app_user`/`ghm_db_user` session; it is known to be denied. Do not
  grant table access or alter ACLs just to make this application session read
  the ledger. Obtain the authoritative ledger evidence from the approved
  migration owner or a separately authorized read-only identity, then compare
  every row/version/checksum with the exact release checkout before any
  migration.
- This does not change the prior finding that the feature migrations are not
  verified as applied. The current exact applied/pending migration set must
  remain a rollout blocker until authorized evidence is obtained.

### Inspection commands already completed — do not repeat as initial audit

The following checks have been completed against production and recorded
above: database/session identity; role attributes for the six relevant roles;
membership graph for the application/database/migrator/runtime/provider roles;
schema owner; owners of `commercial_payment_attempt` and
`ghm_schema_migrations`; ledger relation existence and column definitions;
ledger row-access denial; Render backup/export availability and successful
export creation; managed credential names/default designation; and all three
levels of inbound IP allow-list.

Repeat only where necessary as a targeted pre-change or post-change
verification, after a relevant production change, or if the resource identity
has changed. Immediate unresolved blockers are: authorized ledger visibility,
supported database-administrator path, safe role remediation plan, external
client inventory/private networking plan, historical pending attempt
classification, and backup restore rehearsal. Keep PR #207 unmerged and do
not configure callback environment variables until the existing approval
gates in this runbook are met.


## Migration-authority path analysis — 2026-11-04 21:12 UTC

Follow-up source inspection was completed after the production application
credential was confirmed unable to SELECT the migration ledger. This is
repository/source evidence, not a production connection or change.

### What the exact release branch expects

- The current release branch contains **81** timestamped SQL migration files,
  from `00000000000000_create_migration_ledger.sql` through
  `20261104130000_isolate_payfast_settlement_identity.sql`. The complete
  ordered list is in `database/migrations/` on the exact release branch.
- The two PayFast feature migrations are the final two files:
  `20261104120000_bind_commercial_payment_attempt_provider.sql` and
  `20261104130000_isolate_payfast_settlement_identity.sql`.
- The migration runner in `src/db/migrate.ts` loads **all** matching
  timestamped SQL files, sorts them by version, and checks the complete
  migration ledger. It applies every file not already recorded; it is not
  limited to the PayFast pair.
- Before running, it requires `GHM_MIGRATOR_DATABASE_URL`, production
  `DATABASE_SSL=true`, and explicit database/host target guards via
  `GHM_MIGRATION_DATABASE_NAME` and `GHM_MIGRATION_DATABASE_HOST`.
  It requires `session_user = ghm_migrator`, then runs
  `SET ROLE ghm_schema_owner` and requires `current_user = ghm_schema_owner`.
  It takes advisory transaction lock 731824 and performs ledger comparison
  and pending migrations inside a transaction.
- Therefore the current Render PSQL session
  (`session_user=ghm_app_user`, `current_user=ghm_db_user`) is **not** an
  authorized migration connection and must not be used to run migrations.
  The recorded membership row `ghm_migrator -> ghm_schema_owner` has
  `set_option=true`, so the intended migration login can assume the owner
  role. The current `ghm_db_user` -> `ghm_migrator` membership has
  `set_option=false`; its ADMIN OPTION does not make this API session a
  valid migrator session.
- The dedicated forensic audit command is `npm run audit:migrations`,
  implemented by `scripts/forensic-migration-reconciliation.mjs`. It opens
  `BEGIN READ ONLY`, verifies the exact `ghm_migrator` session and
  `ghm_schema_owner` effective role, reads all ledger rows
  (`version,name,checksum,applied_at`), and compares the full live ledger
  with the 81 repository migrations, retained-history records, and
  historical checksum exceptions. It reports a PASS/INVESTIGATE verdict.
  It requires `GHM_MIGRATOR_DATABASE_URL` and defaults the expected database
  to `ghm_db` unless `GHM_MIGRATION_AUDIT_DATABASE` is set. It is
  read-only and rolls back its transaction.
- Checksum policy accepts canonical LF and supported legacy CRLF hashes, plus
  explicitly registered historical provenance exceptions. The audit also
  flags missing migrations, unrecognized extra ledger rows, name/checksum
  mismatches, and invalid retained-history/exception records.
- The checked-in GitHub Actions workflow uses only disposable PostgreSQL
  credentials for CI and does not configure a production migrator URL. CI
  success is not evidence of the production migration ledger.

### Safe next step — identify an already-authorized migrator connection

- The Render Credentials UI inspection showed only managed credentials
  `ghm_app_user` and `ghm_db_user`; it did not show a managed
  `ghm_migrator` credential. The role catalog confirms that
  `ghm_migrator` exists and has LOGIN, but its password/connection source
  has not been established.
- Do not infer or reuse either managed application credential, do not expose
  secret values, do not create/rotate the default credential, and do not set
  a new password on production without an explicit, separately approved
  credential-provisioning plan.
- The next administrative investigation is to inspect the **names only** of
  existing Render service/environment-group variables and approved secret
  stores for an existing `GHM_MIGRATOR_DATABASE_URL` (or documented
  equivalent) and confirm its intended target. Never reveal or copy its value
  into chat. If no existing authorized migrator credential is found, stop
  and prepare a controlled credential-provisioning decision with the
  production owner; do not work around the permission denial by granting
  SELECT on the ledger to `ghm_db_user`.
- Once the existing authorized migrator connection is identified, run
  `npm run audit:migrations` from the exact release checkout in a controlled
  operator environment, with the target guards set to production
  `ghm_db` and its actual host. Capture the sanitized JSON verdict and
  full ordered missing/extra/mismatch findings in the handover. Do not run
  `npm run migrate` as part of this audit.
- This source audit does not establish any applied migration versions or
  approve any production migration. The production ledger remains
  **unverified** until the forensic audit succeeds against the authoritative
  production ledger.

No production database, role, credential, service, network rule, payment
record, secret, or migration was changed during this source analysis.


### Render workspace service inventory rechecked — 2026-11-04 21:13 UTC

A read-only Render workspace service listing identified four web services:

| Service | Resource ID | Branch | Build / start | Deploy trigger | Region | Relevance |
|---|---|---|---|---|---|---|
| `GHM-Internal-Runtime` | `srv-damupsek1f9s73eq8kkg` | `main` | `npm ci && npm run build` / `npm start` | checksPass | Frankfurt | Production ordinary API |
| `ghm-payfast-sandbox-runtime` | `srv-db5vtgl9fdbs73eaclbg` | `main` | `npm ci --include=dev && npm run build` / `npm start` | commit | Frankfurt | Existing sandbox-named service; do not repurpose or place production callback secrets here |
| `ghm-identity-qualification` | `srv-dbahvenbtjjs73f83rlg` | `integration/ghm-identity-merge-candidate-20261018` | `npm ci --include=dev && npm run build` / `npm start` | commit | Frankfurt | Qualification service; not production |
| `zaid-ai-workforce` | `srv-d9t1la7avr4c73fc46c0` | `main` | `npm ci` / `npm start` | off | Frankfurt | Separate project; do not assume it connects to GHM database |

The production API's service metadata independently confirms the operator's
settings: branch `main`, build `npm ci && npm run build`, start
`npm start`, auto-deploy trigger `checksPass`, Frankfurt, free plan,
health path `/healthz`. No service or environment configuration was changed.
This listing alone does not prove which services have a database connection;
that must be established by inspecting service/environment-group variable
**names** and any separately managed external clients. Do not infer a
database connection from service presence or names.

The Render tool/API inspection available in this workflow exposes service
metadata but not a safe names-only inventory of environment variables or
environment groups. Therefore the next required operator action is in the
Render dashboard: inspect the production API service's Environment tab and
any linked environment groups, looking only for the presence/name of
`GHM_MIGRATOR_DATABASE_URL` (or a documented equivalent). Do not reveal,
copy, screenshot, or paste values. Also check whether any other GHM service
or approved secret manager has a dedicated migrator connection. Report only
the variable key name, owning service/group, and whether it is present;
never disclose its value. If absent, stop for an explicit credential
provisioning decision rather than altering current credentials.


**Credential-boundary clarification:** Inspecting variable *names* on
`GHM-Internal-Runtime` is solely to detect accidental credential placement.
If `GHM_MIGRATOR_DATABASE_URL` or an equivalent privileged migrator
credential is present on the ordinary production API service or its linked
runtime environment group, do **not** use it from that service or copy it
elsewhere. Record only that the key is present and stop for a separately
approved secret-boundary remediation. The production API must not receive
migration credentials. The authorized migration connection should be made
available only to the controlled operator/migration execution context for the
approved change window, not to the ordinary API runtime.


### Operator environment setup already completed — avoid repeating setup prompts

The operator has previously configured the required environment variables in
the existing Windows PowerShell working session for the local PostgreSQL 18
qualification workflow. Do not ask them to repeat that setup or re-enter
already configured local qualification variables. Preserve the existing
PowerShell session and the untracked
`.ghm-quoteflow-readonly-preflight.mjs` file.

Important target distinction: the prior handover confirms local qualification
environment setup; it does **not**, by itself, establish that an authorized
production `GHM_MIGRATOR_DATABASE_URL` exists in Render or that the local
PowerShell variable points to production. Never infer a production target
from the fact that environment variables are already set. Before invoking
`npm run audit:migrations`, inspect only sanitized target metadata (database
name and host, never URL credentials) and ensure the session user is
`ghm_migrator`. The currently open Render PSQL session is
`session_user=ghm_app_user` / `current_user=ghm_db_user` and cannot be used
for the forensic ledger audit.

The previously suggested inspection of the ordinary production API
Environment tab is not a required next step and should not be repeated as a
generic request. The API must not receive migrator credentials. Any
production migrator credential must be available only in the approved,
controlled migration operator context and must be explicitly authorized.


## Follow-on production snapshot and release review — 2026-11-04 21:20 UTC

This is a targeted continuation of the completed audit, not a request to
repeat the Render UI or role-catalog checks.

### Latest release evidence

- PR #207 remains open, draft, unmerged, and reported mergeable/clean.
- Current head: `3499305ffe43e7212d36327b3a36076c181057c7`.
- Exact-head CI run [#41914536555](https://github.com/zaidhqdev-sys/GHM/actions/runs/41914536555)
  completed successfully on that commit.
- This CI run validates the release branch's automated checks only; it does
  not qualify the production DB, role provisioning, networking, or payment
  cutover. Do not merge PR #207 without explicit release authorization and
  the outstanding production gates.

### Targeted production payment-attempt statistics

A fresh Render read-only query at 2026-11-04 approximately 21:18 UTC returned:

| Metric | Result |
|---|---:|
| `ghm.commercial_payment_attempt` table size | 8 KB |
| Total relation size including indexes/TOAST | 112 KB |
| `pg_stat_user_tables.n_live_tup` | 1 |
| `pg_class.reltuples` | -1 (no usable planner estimate) |
| `last_analyze` / `last_autoanalyze` | NULL |

A fresh grouped status query returned exactly one row:
`pending_checkout = 1`, created at
`2026-10-07 18:20:31.4392 UTC`. No other attempt statuses were returned.
This agrees with the earlier snapshot; it does not establish whether the
attempt is PayFast or whether it should be settled, expired, cancelled, or
reconciled. It remains unclassified and must not be backfilled by assumption.

A contemporaneous relation-lock query returned no rows for
`ghm.commercial_payment_attempt`. This is only a momentary snapshot, not
evidence that a future migration window will be lock-free. Recheck active
transactions, relation locks, connection load, and callback/checkout traffic
immediately before any approved DDL.

### Static review of the two feature migrations

The exact release branch SQL was reviewed without executing it:

- `20261104120000_bind_commercial_payment_attempt_provider.sql` adds
  nullable `provider_code text`, adds a CHECK allowing NULL or `payfast`,
  and replaces the generic settlement function with a provider-code-bound
  implementation. It deliberately does not backfill historical rows.
- The `ALTER TABLE ... ADD COLUMN` and constraint are inside a transaction.
  There is no volatile default or table rewrite requested by the new column,
  but `ALTER TABLE` still requires a strong table lock (normally
  ACCESS EXCLUSIVE); lock acquisition and wait behavior must be managed in
  the approved window.
- `20261104130000_isolate_payfast_settlement_identity.sql` fails unless
  `ghm_payment_provider` already exists as a LOGIN role. It revokes generic
  settlement EXECUTE from PUBLIC and `ghm_runtime`, creates
  provider-specific SECURITY DEFINER read/settlement functions owned by
  `ghm_schema_owner`, revokes their public/runtime execution, and grants
  only the provider login the intended wrapper/read functions.
- The second migration does not create or set the provider credential.
  Role and credential provisioning is an explicit out-of-band prerequisite.
- Since the migration runner applies every pending migration in timestamp
  order, these two-file observations do not establish that the complete
  81-file release migration set is safe to apply to production. The live
  ledger must be reconciled first.

### Existing operator environment note — preserve prior setup

The handover's previous note about the operator's configured PowerShell
variables refers to the native local PostgreSQL 18 qualification workflow.
Do not ask the operator to redo that setup. It is not proof of a production
migrator URL or authorization. Do not print environment values or attempt a
production migration from a guessed/local target. The open Render PSQL
session is the application login and remains unsuitable for the audit.

### Remaining blockers (not resolved by this continuation)

1. Obtain the exact live migration ledger through an already-authorized
   `ghm_migrator` connection in a controlled operator context. The known
   application session's SELECT denial is definitive; do not repeat it or
   grant the application role ledger access.
2. Establish the approved database-owner/admin path and a safe role
   remediation plan for `ghm_db_user`'s CREATEDB/CREATEROLE attributes and
   ADMIN OPTION memberships, preserving live API availability.
3. Provision and verify `ghm_payment_provider` LOGIN and credential only
   under an explicit production owner decision, before the second migration.
4. Establish required private service/database connectivity and enumerate
   all external database clients before narrowing the broad inbound rules.
5. Reconcile the one historical `pending_checkout` attempt using reliable
   provider evidence; do not assume it belongs to PayFast.
6. Complete backup restore rehearsal, DDL lock/activity assessment, payment
   pause/retry procedure, rollback plan, maintenance window, and explicit
   production approval.
7. Keep PR #207 unmerged and the production API on its current release until
   the production change is deliberately authorized. Do not configure
   PayFast callback environment variables yet.

No production database, role, credential, network rule, Render service,
secret, payment attempt, or migration was changed during this continuation.


## Recovery of prior production migrator evidence and migration baseline — 2026-11-04 21:23 UTC

A deeper search of the existing handover files recovered prior evidence that
was omitted from the recent summary. This supersedes the earlier statement
that the production migrator credential had never been established. Do not
ask the operator to reset or rediscover it.

### Prior authoritative production audit — 2026-10-24

The existing
`docs/operations/handover-production-db-and-render-2026-10-24.md`
records a successful read-only production migration reconciliation performed
against `ghm_db` on 2026-10-24:

- Initial `current_user=session_user=ghm_migrator`.
- `ghm_migrator` could SET ROLE `ghm_schema_owner`; after the switch,
  `current_user=ghm_schema_owner` and `session_user=ghm_migrator`.
- The audit reconciled 78 repository migrations against 78 live ledger rows.
- 7 canonical checksum matches, 62 supported legacy CRLF matches, and 9
  approved historical-provenance matches.
- Missing migrations: 0; unexplained checksum mismatches: 0; name mismatches:
  0; extra ledger rows: 0; orphaned exceptions: 0.
- Overall verdict: **PASS**. Seven registered exceptions were redundant
  informational cleanup, not blockers.
- Latest recorded production migration at that time:
  `20261012120000`.
- The audit ran read-only and rolled back; it did not apply migrations.

This is authoritative historical evidence for the production migration
baseline **as of 2026-10-24**, not a current reconciliation against the
2026-11-04 release branch.

### Existing production migrator credential — already provisioned

The same prior handover explicitly records that the production
`GHM_MIGRATOR_DATABASE_URL` password had already been reset with approval,
validated against production (including `SET ROLE ghm_schema_owner`), and
was already saved in Render and the original local `.env`. Do not reset,
rotate, recreate, or ask the operator to rediscover this credential absent
new evidence. No secret value or connection URL is included in this repo.

The earlier audit was run from the separate Windows worktree
`C:\\GHM-prod-migration-audit` with a process-scoped environment override,
rather than overwriting the original `.env`. The original handover also
records that the local `.env` had at one point pointed its migrator URL at
the sandbox; therefore do not assume a dotenv file or process variable
without checking the sanitized target in the actual operator session.

### Credential placement issue recovered from the Render variable inventory

The 2026-10-24 operator-provided Render inventory explicitly lists
`GHM_MIGRATOR_DATABASE_URL` on `GHM-Internal-Runtime`, in addition to the
ordinary `DATABASE_URL` that authenticates as `ghm_runtime`. It records
that the migrator variable was the later addition to that production API
service. This is a confirmed credential-boundary hygiene issue: the
migration credential should not be present in the ordinary API runtime.
However, do not remove or alter it without an approved change because this
handover does not prove whether any deployed process or operator workflow
currently depends on its presence. The migration runner is a separately
invoked command; `npm start` does not automatically run migrations. Plan a
controlled removal after confirming the current API code path has no
dependency, while retaining the already validated operator-side credential
in the approved local/secret-management context. Never copy it into the
callback service or the ordinary API's runtime configuration.

### Reconciliation of the 78 → 79 → 81 migration inventories

A Git tree comparison was performed between the audited 2026-10-24 source
commit `8376c88cc99db156e9cd3488669ec35e4ed498cf`, production baseline
`main` commit `61202bb4f61a465f8776b192927aa22e40297fd1`, and the current
PR #207 release branch:

| Snapshot | Timestamped migration files | Latest migration |
|---|---:|---|
| Audited source commit (2026-10-24) | 78 | `20261012120000_revoke_runtime_business_mapping_table_access.sql` |
| Current production `main` baseline | 79 | `20261026120000_scope_storage_metadata_lookup.sql` |
| PR #207 release branch | 81 | `20261104130000_isolate_payfast_settlement_identity.sql` |

The only migration files added between the audited source commit and current
`main` are:
- `20261026120000_scope_storage_metadata_lookup.sql`
- `20261104120000_bind_commercial_payment_attempt_provider.sql`
- `20261104130000_isolate_payfast_settlement_identity.sql`

A fresh Render read-only catalog query against production found
`ghm.storage_get_object(bigint,bigint)`, owned by
`ghm_schema_owner`, marked SECURITY DEFINER, with fixed search_path
`pg_catalog, ghm`. A follow-up `pg_get_functiondef` inspection returned
the same account-scoped public-logo/active-membership function body as
`20261026120000_scope_storage_metadata_lookup.sql`. This is strong
independent evidence that the 79th migration's intended schema change is
present in production. It does **not** independently prove the corresponding
ledger row/checksum, and it does not replace the current exact-branch audit.

Consequently, the evidence now supports this narrower working hypothesis:
production had a clean 78/78 baseline on 2026-10-24, and the only
non-PayFast migration subsequently added to `main` is visibly reflected in
the current production catalog. The exact current ledger should therefore
reconcile to the 79-file `main` baseline before the two PayFast migrations.
This remains a hypothesis until the current authorized forensic audit
returns its exact rows/checksums.

### Exact next operator-side action — reuse the already validated credential

Do not inspect Render environment tabs again, do not reset credentials, and
do not repeat the application-session ledger SELECT that already returned
permission denied.

The existing Windows audit worktree is recorded as
`C:\\GHM-prod-migration-audit`. From that worktree, use the current PR #207
release checkout (or a clean worktree at its exact head) and the already
provisioned production migrator credential from the approved local operator
environment. Keep the production target explicit:
`GHM_MIGRATION_AUDIT_DATABASE=ghm_db`, `DATABASE_SSL=true`; confirm
sanitized `current_database=ghm_db`, `session_user=ghm_migrator`, and
successful `SET ROLE ghm_schema_owner` before trusting the verdict.
The command is `npm run audit:migrations`, not `npm run migrate`.
It is a read-only audit that starts `BEGIN READ ONLY` and rolls back.

Because the branch has 81 migrations while production is expected to have
the 79-file main baseline, a clean current-branch audit should report exactly
the two PayFast migrations as missing and no other missing/extra/name/
checksum issues. Any different result is INVESTIGATE: stop, retain the full
sanitized output in this handover, and do not apply migrations. Do not run
the audit from a checkout whose migration files do not exactly match PR #207
head `806aee40ead53d060c845c2d62c6e7f1e54b417c` or a later reviewed head.

No production DB, role, credential, service, or network configuration was
changed during this evidence recovery.


### Latest targeted production catalog verification — 2026-11-04 21:24 UTC

Read-only Render Postgres queries against production `ghm_db` additionally
confirmed:

- `ghm.storage_get_object(bigint,bigint)` exists, is owned by
  `ghm_schema_owner`, is SECURITY DEFINER, and has fixed search_path
  `pg_catalog, ghm`. Its live `pg_get_functiondef` matches the
  account-scoped function body in the 2026-10-26 storage migration.
- `ghm.commercial_payment_attempt.provider_code` does not exist.
- `ghm_payment_provider` does not exist.
- The PayFast-specific settlement function is absent.
- The existing generic `ghm.commercial_apply_payment_result(...)` function
  remains SECURITY DEFINER, owned by `ghm_schema_owner`, and executable by
  `ghm_runtime` and `ghm_schema_owner`. The provider-isolation migration
  has not been applied.

These results corroborate that the production catalog is at the 79-file
mainline feature baseline for storage and has not yet received the two
PayFast-specific migrations. They do not reveal the exact ledger row/checksum
for the storage migration.

### Current PR/CI checkpoint after evidence recovery

- PR #207 current head:
  `d314863d1ca549d7a11f99106ee7b81c0eea933b`.
- PR remains open, draft, unmerged, and mergeable.
- CI run [#41915671089](https://github.com/zaidhqdev-sys/GHM/actions/runs/41915671089)
  is in progress on that exact head. Prior documentation commits passed,
  but do not call this head green until this run completes successfully.

### Critical correction to the current credential blocker

The production `GHM_MIGRATOR_DATABASE_URL` credential is **not missing**.
The 2026-10-24 handover proves that it was already provisioned, reset with
approval, validated against production, and used for a successful 78/78
read-only production audit. The earlier "credential source not established"
wording in this runbook was inaccurate and is superseded by the recovered
evidence above.

The remaining task is not to provision or reset credentials. It is to rerun
the forensic audit against the **exact current PR #207 checkout**, using the
already validated production migrator connection from the recorded separate
operator audit worktree `C:\\GHM-prod-migration-audit` or an equivalent
controlled local worktree. Explicitly set
`GHM_MIGRATION_AUDIT_DATABASE=ghm_db` and `DATABASE_SSL=true`; never print
or paste `GHM_MIGRATOR_DATABASE_URL`. Confirm that the audit itself reports
`session_user=ghm_migrator`, switches to `ghm_schema_owner`, and targets
`ghm_db`.

Expected current-release reconciliation, based on the historical PASS and
the current production catalog evidence, is 79 matching mainline migrations
plus exactly two pending PayFast migrations:
- `20261104120000_bind_commercial_payment_attempt_provider`
- `20261104130000_isolate_payfast_settlement_identity`

This expected result is a hypothesis, not a substitute for the audit.
Any missing/extra migrations, name or checksum mismatches, authority failure,
or target mismatch is INVESTIGATE and blocks migration. Run
`npm run audit:migrations` only; do not run `npm run migrate`.

### Migrator credential placement remediation — separate, not a prerequisite to audit

The old Render variable inventory shows the validated migrator URL was
present on the ordinary production API service `GHM-Internal-Runtime`.
Static source inspection of the current release confirms
`GHM_MIGRATOR_DATABASE_URL` is read by `src/db/migrate.ts`, while
`src/server.ts` and `src/config.ts` do not reference it; Render's ordinary
`npm start` runs `dist/server.js`, not the migration runner. The distinct
PayFast callback process reads only `PAYFAST_CALLBACK_DATABASE_URL`.
This makes the API-service variable unnecessary for the ordinary runtime
according to the reviewed source, but removing it is still a production
environment change. Do not remove it until the operator explicitly approves
the change and the current service/environment-group ownership is confirmed.
Keep the already validated credential in the controlled operator context;
never move it to the callback service.

No production credentials, roles, schema, records, services, or networking
were changed by these read-only checks.


## Current production migration reconciliation — 2026-11-04 21:38 UTC

The exact PR #207 checkout at
`516fc48e9ec4a36cf36907f9b852cd7e69e6683f` was audited from the separate
Windows worktree `C:\\GHM-prod-migration-audit`. The production migrator
URL was selected from the existing local operator `.env` using a
process-scoped override; the sandbox URL and both local `.env` files were
left unchanged. No secret or connection URL is recorded here.

### Connection authority and transaction safety

The read-only audit authority check **passed**:

- `current_database = ghm_db`.
- Initial `current_user = session_user = ghm_migrator`.
- `ghm_migrator` could SET ROLE `ghm_schema_owner`.
- After SET ROLE, `current_user = ghm_schema_owner` while
  `session_user = ghm_migrator`.
- The audit ran in a read-only transaction and rolled back.

This proves the audit reached the intended production database with the
expected migrator/effective owner authority. It does not make the migration
set safe to apply.

### Exact reconciliation result — INVESTIGATE

| Metric | Result |
|---|---:|
| Repository migration files | 81 |
| Live ledger rows | 89 |
| Canonical checksum matches | 8 |
| Supported legacy CRLF matches | 62 |
| Approved historical-provenance matches | 9 |
| Missing repository migrations | 2 |
| Unexplained checksum mismatches | 0 |
| Name mismatches | 0 |
| Extra ledger rows | 10 |
| Approved retained historical rows | 8 |
| Unrecognized extra ledger rows | 2 |
| Orphaned exceptions | 0 |
| Redundant exceptions | 7 |
| Invalid retained-history records | 0 |

The only missing rows are the expected pending PayFast migrations:

- `20261104120000_bind_commercial_payment_attempt_provider`
- `20261104130000_isolate_payfast_settlement_identity`

The two extra ledger rows not recognized by the current retained-history
registry are:

| Version | Ledger name | Applied at (UTC) |
|---|---|---|
| `20261019190000` | `create_business_engagement_events` | `2026-10-28T00:29:44.177Z` |
| `20261019210000` | `create_business_registration_identity` | `2026-10-28T00:29:44.177Z` |

Their live checksums were reported by the audit, but no checksum mismatch
was reported for matched repository rows. These two are *unrecognized
extras*, not approved retained history yet. Do not delete their ledger
entries, alter checksums, or add exceptions just to force a PASS.

### Git-history provenance discovered

A read-only `git log --all --full-history` search found historical
versions of both migration paths in repository history.

For `20261019190000_create_business_engagement_events.sql`, relevant
history includes:

- `cf955adda30709d626f186b38b81bc4af2f6f44d` (2026-11-01):
  restore business engagement event schema migration.
- `5d3958434afc16ab7d1c6db61fb334dcd4201e29` (2026-10-21):
  feature change associated with PR #174.
- `15b0dca8674c7adcf8109ff702d884e802bc26a5` and
  `c06419e427a95a8afc253dcb9a132e45def47787` (2026-10-19):
  engagement-event grants and endpoint changes.

For `20261019210000_create_business_registration_identity.sql`,
relevant history includes:

- `bb1171119b01d9f05723bac9b0eec8544d85fbff` (2026-11-01):
  restore business registration identity schema and qualification coverage.
- `7681736389b13c82a81f7a6419826204ef584676` (2026-10-21):
  private Business registration identity API associated with PR #172.
- `01eae6c7a0fe939873ffbfe714d8268fb730488d` and
  `c46e0a67506ce4e6a94aa86d2361b1c871f18728` (2026-10-19):
  registration-identity SQL guards and storage changes.

The history search also returned intermediate refresh/qualification commits
on 2026-10-21 and a preservation commit
`038d7f8be86262ce821ad9c7bf300f88831222fa` dated 2026-10-26. The 2026-11-01
restore commits post-date the live ledger's 2026-10-28 applied_at timestamp;
therefore their existence alone does not prove which historical file bytes
were applied in production.

### Required next forensic step

Before changing the retained-history registry, compare each live ledger
checksum with the SHA-256 of the exact historical Git blob for the matching
migration path at commits that pre-date 2026-10-28. Use binary Git blob
content (not PowerShell text redirection, which can alter line endings).
Record the exact matching commit and blob checksum for each migration.
Also inspect the restore commits and the current branch's migration-history
policy to explain why these files are absent from the 81-file current release
tree despite having live ledger rows.

Only if the ledger checksums match a verified historical migration blob and
the project policy explicitly permits retaining that migration as historical
history should the registry/runbook be updated to recognize these two rows.
If no exact match is found, or if the historical SQL has dependencies or
security implications that are not represented in the current release, keep
the verdict at INVESTIGATE and escalate for a reviewed reconciliation.

### Safety decision

**Do not run `npm run migrate`. Do not merge PR #207.** The two PayFast
migrations are pending, but the two unrecognized historical ledger rows
block a PASS. No production schema, role, grant, payment record, Render
service, secret, or network setting was changed by this audit or Git-history
inspection. The audit itself was read-only and rolled back.


### Historical migration blob checksum comparison — 2026-11-04 21:44 UTC

The operator computed SHA-256 directly from raw Git blob bytes using
`git show` piped through Node's crypto hash (no working-tree text
conversion). The two live ledger checksums each match historical migration
blobs from commits dated before the ledger's 2026-10-28 applied_at timestamp.

| Migration version | Historical commit | Raw Git blob SHA-256 | Matches live ledger |
|---|---|---|---|
| `20261019190000` engagement events | `5d3958434afc16ab7d1c6db61fb334dcd4201e29` | `293d0fe2e1ffeff0918761ac45562b2299237ee4a58a3f10ef42349437d82019` | Yes |
| `20261019190000` engagement events | `15b0dca8674c7adcf8109ff702d884e802bc26a5` | `293d0fe2e1ffeff0918761ac45562b2299237ee4a58a3f10ef42349437d82019` | Yes |
| `20261019190000` engagement events | `c06419e427a95a8afc253dcb9a132e45def47787` | `ef5f42aab8b26f5d8afb4d4ff06de78070358bb6ffdd58fc44b3b20dd43d1993` | No |
| `20261019210000` registration identity | `7681736389b13c82a81f7a6419826204ef584676` | `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5e467327324` | Yes |
| `20261019210000` registration identity | `01eae6c7a0fe939873ffbfe714d8268fb730488d` | `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5e467327324` | Yes |
| `20261019210000` registration identity | `c46e0a67506ce4e6a94aa86d2361b1c871f18728` | `529ae32849ce5f74ffad5aad138562ec0998365d7897f581875fee5e4cdbdfde` | No |

The live ledger checksums therefore have exact pre-2026-10-28 Git-blob
matches for both rows:
- Engagement events: `293d0fe2e1ffeff0918761ac45562b2299237ee4a58a3f10ef42349437d82019`,
  present in commits `5d395843...` and `15b0dca8...`.
- Registration identity: `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5e467327324`,
  present in commits `76817363...` and `01eae6c7...`.

This materially resolves the byte-provenance question: both live rows
correspond to historical migration file contents that existed before their
recorded application time. The alternate earlier feature commits
`c06419e...` and `c46e0a6...` contain different bytes and are not the
versions recorded in the live ledger.

**Audit status remains INVESTIGATE pending policy review.** Exact blob
matches establish provenance, but do not by themselves authorize adding
retained-history exceptions. Review the historical migration contents,
their dependency/security implications, and the repository's policy for
retaining migrations removed from the current tree. If policy permits, add
the two exact checksums as narrowly scoped approved historical records and
rerun the read-only audit. Do not delete or rewrite production ledger rows.

No production database or Render resource was changed by this checksum
comparison. Do not run `npm run migrate` or merge PR #207.


### Retained-history policy review and registry correction — 2026-11-04 21:47 UTC

The current audit implementation and policy tests were reviewed before changing
the retained-history registry.

- `scripts/forensic-migration-reconciliation.mjs` explicitly distinguishes
  active repository migrations from ledger-only historical migrations. A
  ledger-only row is accepted only when the retained-history registry has
  the same version, name, and exact checksum; the record must also have
  non-empty source and reason fields.
- `classifyRetainedHistoricalMigration` rejects a missing live row, a
  ledger name/checksum mismatch, or a retained-history entry whose migration
  is still present in the active repository directory. This prevents the
  registry from masking an active migration.
- `scripts/migration-audit-checksum.test.mjs` already tests exact
  retained-history matches, checksum mismatch, orphaned rows, and accidental
  reappearance in the active migration directory.
- The repository's current retained-history registry documents the same
  intended treatment for migrations removed from the active directory but
  still represented in an applied ledger. `database/README.md` identifies
  repository migrations as canonical authority and requires every applied
  migration to remain reconciled to the ledger.
- Both November 1 restore commits are one-file additions only. Their parent
  trees lacked the migration files; the restore commits re-add those SQL
  files without application-code or registry changes. This is consistent
  with restoring historical source evidence while the focused release keeps
  the migrations outside its active migration set.
- The two SQL bodies were reviewed at the exact matching historical commits.
  The engagement-events migration creates a private event table, indexes it,
  sets ownership to `ghm_schema_owner`, revokes PUBLIC/migrator access, and
  grants the runtime only the listed insert/select columns and sequence use.
  The registration-identity migration creates a private RLS-enabled table,
  denies direct PUBLIC/runtime table access, and exposes narrowly scoped
  SECURITY DEFINER read/update routines with fixed `pg_catalog, ghm`
  search_path and active owner/administrator membership checks. These are
  historical application capabilities, not PayFast settlement changes.
- The live ledger recorded both exact checksums at
  `2026-10-28T00:29:44.177Z`; their exact historical blobs predate that
  timestamp. The later November 1 commits restore the files to source
  history, not to the current active migration directory.

Based on that policy and evidence, the two rows have now been added to
`config/retained-historical-migrations.json` on this release branch, with
their exact production ledger names/checksums, historical source commits,
and provenance reasons. No generic checksum exception was added, no live
ledger row was edited, and neither SQL file was reintroduced as a pending
migration.

Registry commit: `73be6ac9339ad1af1728959fe8540bd53e559677`.

**This is a source-control reconciliation only. It is not yet a production
audit PASS.** The next required check is to rerun
`npm run audit:migrations` from the existing production-audit worktree
after updating it to the latest release-branch commit, using the already
validated process-scoped production migrator target if still present. The
expected outcome is 81 active repository migrations, 89 ledger rows, 2
verified retained historical rows, 0 unrecognized extras, 2 expected
missing PayFast migrations, 0 checksum/name mismatches, 0 orphaned
exceptions, and 0 invalid retained-history records. The verdict should
remain INVESTIGATE because the two PayFast migrations are still pending.
Do not run `npm run migrate`.

No production database, role, grant, payment record, Render service,
credential, secret, or network configuration was changed.


### Follow-up production audit used stale local checkout — 2026-11-04 21:50 UTC

The operator reran `npm --prefix C:\GHM-prod-migration-audit run audit:migrations`
and the read-only production authority check passed again
(`ghm_migrator` session, `ghm_db`, read-only transaction, SET ROLE to
`ghm_schema_owner`).

The result still reported:
- `approved_retained_historical_count: 8`;
- `unrecognized_extra_count: 2`;
- both 20261019190000 and 20261019210000 with
  `registered_historical_name: null` and
  `registered_historical_checksum: null`;
- `invalid_retained_history_count: 0`;
- verdict `INVESTIGATE`.

This output is consistent with the local audit worktree not yet containing
registry commit `73be6ac9339ad1af1728959fe8540bd53e559677` (and subsequent
runbook commit `dd70a05fe744cfb8e6c1a1025b2c4d274e251571`). It does not
test or refute the registry entries added in that commit. The production
authority check is valid; the repository-policy comparison is stale.

Next action: inspect local worktree status, fetch the release branch, and
advance the clean detached audit worktree to the current branch head without
discarding local changes. Then rerun the same read-only audit using the
already validated process-scoped production migrator connection. Do not
modify the registry again unless the updated audit reports a specific
validation defect. Do not run migrations or merge PR #207.


## 2026-11-04 — retained registration checksum independently verified

The retained historical migration registry entry for version `20261019210000` contained a 63-character checksum, which failed the reconciliation script's required 64-character SHA-256 format validation. The exact raw Git blob was hashed locally with Node.js using `git show` and `crypto.createHash('sha256')` against both historical commits `7681736389b13c82a81f7a6419826204ef584676` and `01eae6c7a0fe939873ffbfe714d8268fb730488d`. Both independently returned the same 64-character digest:

```text
4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324
```

The registry entry was corrected to this exact raw-blob SHA-256. This is a release-branch provenance/configuration correction only; it does not modify the production database, migration ledger, Render services, credentials, or environment variables. The read-only production reconciliation must be rerun against the updated release-branch checkout before treating the retained-history classification as validated. No migrations are authorized or applied by this correction.


## Exact release-head and callback-boundary review — 2026-11-05

This addendum supersedes older release-head references above where they differ.
It does not authorize production changes.

### Release and CI evidence

PR #207 remains open, draft, and unmerged. The current PR head at this
review is `c6f2af481c92eccee63587d7c6fe43e5e247139f`, based on `main`.
Exact-head CI run [#41931948641](https://github.com/zaidhqdev-sys/GHM/actions/runs/41931948641)
completed successfully. The `quality` job passed build, all migrations on
disposable PostgreSQL, the full test suite, commercial settlement identity
qualification (including the negative unbound-attempt read assertion),
migration audit policy tests, and runtime-boundary verification.

This is disposable-environment code qualification only. It is not evidence
that production migrations, roles, callback service, credentials, ingress,
or live payment flows are ready.

### Migration effects reviewed against the current release source

The current release migration `20261104120000_bind_commercial_payment_attempt_provider.sql`:

- Adds nullable `provider_code` and a check allowing NULL or `payfast`.
- Does not backfill historical attempts.
- Replaces the generic settlement routine with a provider-match guard.
- Retains generic routine EXECUTE for `ghm_runtime` until the second migration.

The current release migration `20261104130000_isolate_payfast_settlement_identity.sql`:

- Requires the out-of-band `ghm_payment_provider` LOGIN role to exist.
- Grants that role schema `USAGE`.
- Revokes generic settlement routine EXECUTE from `PUBLIC` and `ghm_runtime`.
- Adds provider-scoped SECURITY DEFINER read and settlement functions with fixed
  search path and owner `ghm_schema_owner`.
- Grants EXECUTE on those two functions only to `ghm_payment_provider`.
- The read function filters by both attempt ID and `provider_code='payfast'`.
- The settlement function checks provider identity and ZAR currency, then
  calls the generic provider-guarded settlement routine as its owner.

The lookup filter was hardened in commit
`b17d64f7e3a6bf66555fa724198a60617e6270f4`; the disposable qualification
script gained a negative test for a NULL/unbound attempt. That test passed in
exact-head CI.

### Deployment topology confirmed in source

- Callback entry point: `src/payfast-callback-server.ts`.
- Package start command: `npm run start:payfast-callback`.
- Callback process database variable: `PAYFAST_CALLBACK_DATABASE_URL`.
- Production callback startup requires explicit `PAYFAST_ENVIRONMENT` and
  `PAYFAST_CALLBACK_DATABASE_SSL=true`.
- Startup/readiness verifies the connected database identity is
  `ghm_payment_provider`.
- Callback service must be a separate Render service; do not add callback
  credentials or provider database URL to `GHM-Internal-Runtime`.
- `PAYFAST_CALLBACK_TRUST_PROXY` must remain false until the actual Render
  proxy chain and sanitized forwarded-header behavior have been verified.
- Repository review and the Render service inventory did not identify an
  existing dedicated production callback service. The sandbox runtime is not
  a substitute for one.

### Current operational facts that remain release blockers

The latest direct operator and read-only Render evidence recorded in the
companion session handover remains authoritative for the current session:

- `ghm_payment_provider` exists as LOGIN NOINHERIT without elevated role
  attributes, but its membership from `ghm_db_user` is ADMIN OPTION true
  and grantor `postgres`; no safe revocation was performed.
- `ghm_db_user` has CREATEDB and CREATEROLE; `ghm_app_user` can SET ROLE
  to `ghm_db_user`. This application privilege path remains unresolved.
- Provider database CONNECT is effective through PUBLIC ACL, not a dedicated
  provider grant; do not revoke PUBLIC CONNECT without a full client audit.
- Provider currently has no `ghm` schema USAGE. PayFast-specific functions
  are absent in production; generic settlement remains executable by runtime.
- The production migration ledger contents are not available to the Render
  read-only inspection identity. The release migration audit's pending set
  cannot be substituted for an authoritative production ledger comparison.
- Historical attempt ID 6 remains unclassified; do not backfill or delete it
  automatically.
- Database ingress includes `0.0.0.0/0`; no tested narrowed/private-only
  connectivity plan or restore rehearsal is complete.
- A logical export exists, but it is not a restore rehearsal.
- No production callback service, callback-specific credential, PayFast notify
  URL cutover, or supervised live payment qualification exists.

### Cutover order and stop conditions

The production cutover must remain a single coordinated window:

1. Confirm authoritative production ledger and every pending migration.
2. Complete approved database role-graph remediation and historical attempt
   disposition; verify provider has no memberships and no table privileges.
3. Complete a separate-database restore rehearsal and tested network plan.
4. Create and qualify the separate callback service with only its provider
   credential; verify readiness identity, proxy behavior, TLS, inbound and
   outbound paths before it receives traffic.
5. Freeze/drain checkout and callback processing under a customer-safe plan.
6. Apply the full reviewed pending migration set once using the migrator
   identity; do not selectively run only the two PayFast migrations.
7. Verify the ledger, SECURITY DEFINER owners/search paths and effective
   function privileges for provider/runtime identities.
8. Promote/deploy the ordinary API release in coordination with the callback
   service; merging PR #207 to `main` triggers the existing API auto-deploy.
9. Run a controlled non-customer end-to-end test, reconcile all resulting
   payment records, and resume notifications only after explicit release
   sign-off.

Until all gates are evidenced and the relevant production actions are
specifically approved, PR #207 remains draft and unmerged. Do not run
`npm run migrate`, change role memberships/attributes, narrow database
networking, configure production secrets, create or deploy the production
callback service, alter PayFast notify URLs, or process a live payment.


## Checkout-to-callback configuration contract and current PayFast protocol check — 2026-11-05

### Important correction: the ordinary API still needs outbound checkout configuration

The ordinary API is the checkout initiator. Source review of `src/config.ts`
and `src/resources/commercial/payfast-http.ts` confirms it reads the
following configuration to create and sign the PayFast checkout form:

- `PAYFAST_ENVIRONMENT`
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- optional `PAYFAST_PASSPHRASE`
- `PAYFAST_RETURN_URL`
- `PAYFAST_CANCEL_URL`
- `PAYFAST_NOTIFY_URL`

Therefore the API must retain its merchant checkout configuration. In
particular, `PAYFAST_NOTIFY_URL` must eventually point to the new callback
service's public HTTPS URL plus
`/api/v1/commercial/payfast/itn`. The actual hostname must come from the
created and verified service; do not guess or configure a placeholder.

The merchant passphrase is used by the API when signing outgoing checkout
fields and by the callback process when verifying inbound ITN signatures.
If configured, it is a shared PayFast merchant secret and must be provisioned
securely to both processes. This is not the provider database credential.
The API must **not** receive `PAYFAST_CALLBACK_DATABASE_URL`, the
`ghm_payment_provider` password, or any callback-service-only database
credential. `PAYFAST_MERCHANT_KEY` is needed by the checkout API and is not
needed by the callback process.

The callback service receives the ITN at the route above and uses only its
dedicated provider database identity. Do not direct the PayFast notify URL to
the old general API route after the second migration revokes runtime EXECUTE
on the generic settlement function.

This clarifies the earlier shorthand that the API must have "no PayFast
callback credentials": the correct boundary is no provider DB credential or
callback DB access, while preserving the merchant fields required to generate
checkout forms and the shared passphrase if used for PayFast signing.

### PayFast ITN protocol facts checked against current official documentation

The current source implementation's allowed payment statuses
(`COMPLETE` and `CANCELLED`) match PayFast's ITN documentation, which
documents those statuses for the standard ITN payload. The implementation's
source-IP ranges match the ranges published in PayFast's developer
documentation:

- `197.97.145.144/28`
- `41.74.179.192/27`
- `102.216.36.0/28`
- `102.216.36.128/28`
- `144.126.193.139`

References checked 2026-11-05:
- [PayFast ITN documentation](https://developers.payfast.co.za/docs/itn-instant-transaction-notification/)
- [PayFast developer documentation — ports and IP addresses](https://developers.payfast.co.za/)
- [PayFast support — current IP address guidance](https://support.payfast.help/portal/en/kb/articles/what-ip-addresses-does-payfast-use-20-9-2022)

PayFast support notes that service IPs may change and publishes DNS names
(`www.payfast.co.za`, `api.payfast.co.za`, `ips.payfast.co.za`,
`w1w.payfast.co.za`, `w2w.payfast.co.za`) for current A records. Keep the
application's inbound ITN source allow-list under periodic review against
official documentation. Do not blindly resolve those DNS records inside
request handling or silently widen the allow-list; make source-range updates
as reviewed code changes with tests.

### Release and CI freshness

At this review, PR #207 is open, draft, unmerged, and its current head is
`b69e6e51ac7bc102f1ba8c8ede235feca747e90c`. Comparing this head to the
last code-bearing CI head `c6f2af481c92eccee63587d7c6fe43e5e247139f`
shows only two documentation files changed (the handover and this runbook).
Exact-head CI run #41931948641 passed on the code-bearing head; the two
documentation-only commits have not been run through a separate CI job.
Do not misstate the docs head as an independently CI-tested code head.


### ITN acknowledgement and retry semantics — additional acceptance gate

PayFast's current ITN documentation says the notification endpoint should
return HTTP 200 to prevent retries; a non-200 response causes PayFast to retry
the notification immediately, then after 10 minutes and at increasing
intervals. The current callback server returns HTTP 400 for a number of
permanent validation failures (including malformed fields, invalid source IP,
merchant/signature/amount mismatch, and a PayFast server-confirmation response
that is not `VALID`), and HTTP 500 for unexpected/internal failures.

Before production activation, explicitly decide and test the acknowledgement
policy for:
- permanently invalid/untrusted ITNs (avoid unbounded retries while preserving
  an auditable rejection signal);
- transient PayFast validation endpoint/network failures (retain retryability);
- database unavailability or settlement transaction failure (retain retryability);
- successful and duplicate/replayed ITNs (acknowledge only after durable
  settlement/idempotency outcome is known).

Do not change this policy by returning 200 before validation or before the
settlement transaction commits. The current code's HTTP 400 behavior for
permanent rejects is a known retry-amplification consideration and must be
covered by an explicit test and operator decision before go-live.

Official protocol references reviewed:
- [PayFast ITN documentation](https://developers.payfast.co.za/docs/itn-instant-transaction-notification/)
  documents `CANCELLED` and `COMPLETE`, the notify URL, server confirmation,
  signature verification, expected amount comparison, and the requirement to
  return HTTP 200 to stop retries.
- [PayFast ports and IP address guidance](https://developers.payfast.co.za/)
  publishes the inbound ITN ranges currently represented in
  `src/resources/commercial/payfast.ts`: `197.97.145.144/28`,
  `41.74.179.192/27`, `102.216.36.0/28`,
  `102.216.36.128/28`, and `144.126.193.139`.
- [PayFast support: IP addresses](https://support.payfast.help/portal/en/kb/articles/what-ip-addresses-does-payfast-use-20-9-2022)
  recommends following its published DNS A-record names because addresses can
  change over time: `www.payfast.co.za`, `api.payfast.co.za`,
  `ips.payfast.co.za`, `w1w.payfast.co.za`, and `w2w.payfast.co.za`.

The code's static inbound source ranges match the currently published developer
documentation at this review, but they require a monitored update process.
Do not treat the ranges as permanently fixed. The official docs are the
authority for future changes.


### ITN acknowledgement policy — implemented in release candidate code

The callback boundary now distinguishes permanent notification rejection from
transient processing failure using `PayfastItnPermanentError` and
`classifyPayfastItnFailure`.

Acknowledgement contract:
- HTTP 200 only for successful durable settlement/idempotent replay, or a
  permanent rejection that has been logged with a sanitized reason code.
- HTTP 500 for transient failures, including database connection/query errors,
  PayFast validation endpoint non-success HTTP responses/timeouts, and
  unexpected internal failures. PayFast can retry these notifications.
- Malformed form bodies, unsupported/malformed parser input (400/413/415),
  invalid source IP/signature/merchant/amount, invalid provider/attempt/status,
  a PayFast confirmation body other than `VALID`, and known permanent
  settlement conflicts are classified as permanent. The callback logs only
  an event name, normalized reason code, and error class; it does not log the
  raw ITN body or personal/payment fields. It returns HTTP 200 to stop repeated
  delivery of a permanently rejected notification.
- No response is sent before the boundary has finished. A success response
  follows completion of the settlement function call; transient DB errors
  remain HTTP 500.

Unit tests cover permanent vs transient classification, malformed request
classification, non-VALID confirmation, confirmation network failure,
database failure, and permanent settlement rejection. Exact-head CI must pass
before treating this implementation as qualified. A supervised sandbox ITN
test is still required to validate real PayFast retry behavior, callback
logging/monitoring, and replay handling. This policy does not authorize
production activation.


ITN acknowledgement implementation exact-head CI evidence (2026-11-05):
- Code commit: `d0e2a8caad7fb726d312f0660a53c567f6c472a3`
- CI run #41933348996 / workflow #1951: completed successfully.
- Build, full test suite (including new ITN policy tests), disposable
  PostgreSQL migrations, commercial settlement identity qualification,
  migration audit policy tests, and runtime boundary verification all passed.
- [Exact CI run](https://github.com/zaidhqdev-sys/GHM/actions/runs/41933348996)

This is not production payment testing. Supervised sandbox ITN and replay
tests, production role remediation, authoritative migration ledger audit,
restore rehearsal, callback service deployment and controlled cutover remain
separate mandatory gates.


### Follow-up hardening after exact-head review — 2026-11-05

A subsequent code review found that the initial verification-error wrapper
classified every exception thrown by `verifyPayfastItn` as permanent. That
could have acknowledged an unexpected implementation/runtime failure with
HTTP 200. This was too broad.

The wrapper now uses an explicit allow-list of the verifier's known permanent
validation messages (missing/invalid signature, invalid source IP, merchant
mismatch, amount mismatch, and missing payment status). Any unrecognized
verification exception remains transient and maps to HTTP 500. The HTTP status
mapping is centralized in `payfastItnHttpStatus` and has direct tests proving
permanent rejects map to 200 while unexpected and network errors map to 500.

This hardening was committed after the successful CI run #41933348996, so it
requires a new exact-head CI pass. Do not use the earlier passing CI result as
evidence for these later commits. The policy remains unqualified for
production until new CI and supervised sandbox end-to-end testing pass.


Exact-head CI for the follow-up verifier-classification hardening:
- Head: `1ee05eaf63196867376b0bf9588b555c5b540152`
- Run #41934339437 / CI #1961: **success**.
- Build, all disposable PostgreSQL migrations, full test suite, commercial
  settlement identity qualification, migration audit policy tests and runtime
  boundary verification all passed.
- [Exact-head CI](https://github.com/zaidhqdev-sys/GHM/actions/runs/41934339437)

This validates the allow-listed permanent-verifier classification and
centralized HTTP acknowledgement mapping in this code head. It does not
replace supervised PayFast sandbox delivery/retry testing.


### Sandbox callback deployment reality check — 2026-11-05

Read-only Render inspection of service `ghm-payfast-sandbox-runtime`
(`srv-db5vtgl9fdbs73eaclbg`) confirms it is **not** running the dedicated
PayFast callback process:

- Branch: `main`; latest live commit: `61202bb4f61a465f8776b192927aa22e40297fd1`.
- Build: `npm ci --include=dev && npm run build`.
- Start command: `npm start`, which runs `node dist/server.js`, not
  `npm run start:payfast-callback`.
- Render service health check: `/readyz`.
- Public URL: `https://ghm-payfast-sandbox-runtime.onrender.com`.
- Render logs show `GHM Core Engine listening on port 10000`.
- Service is public (`0.0.0.0/0` service IP allow-list), Frankfurt, free
  plan, and auto-deploys on commits to `main`.

Therefore its name is not evidence of a PayFast callback endpoint. Do not
send ITNs to it, change its start command, add callback credentials, or
repurpose it. A separately provisioned sandbox callback service must run
the release candidate's callback entry point on an isolated non-production
database with a dedicated non-production `ghm_payment_provider` identity.

The callback entry point source requires:
- `PAYFAST_CALLBACK_DATABASE_URL` authenticated directly as
  `ghm_payment_provider`;
- `PAYFAST_ENVIRONMENT=sandbox`;
- `PAYFAST_MERCHANT_ID`;
- `PAYFAST_CALLBACK_DATABASE_SSL=true` when `NODE_ENV=production`;
- the optional shared PayFast passphrase if configured by the sandbox
  merchant; and
- `PAYFAST_CALLBACK_TRUST_PROXY` left false until the actual Render edge
  forwarding chain is verified and sanitized.

No environment-variable values were read or disclosed. No service, database,
credential, secret, deploy, notify URL, or payment record was changed.
Sandbox end-to-end testing remains blocked pending a distinct non-production
database/role, sandbox merchant credentials, and a separately created
callback service with verified proxy/source-IP handling.


### Existing GHM identity qualification Render service — read-only verification (2026-11-05)

The Render workspace does contain a separately named service:
- Name: `ghm-identity-qualification`
- Service ID: `srv-dbahvenbtjjs73f83rlg`
- URL: `https://ghm-identity-qualification.onrender.com`
- Region/plan: Frankfurt / Free
- Branch: `integration/ghm-identity-merge-candidate-20261018`
- Latest live deploy: `dep-dblk9pvb9u1s73bkaaag`
- Deployed commit: `ee91f42503e064571d57e87ed0d5cd1e9d5badd5`
- Build/start: `npm ci --include=dev && npm run build`; `npm start`
- No Render health-check path configured.
- Public service ingress allow-list: `0.0.0.0/0`.

Read-only deployment logs for the live instance explicitly show:
`npm start` -> `node dist/server.js` -> `GHM Core Engine listening on port 10000`.
The package at the deployed commit also defines `start:payfast-callback`
as `node dist/payfast-callback-server.js`, but Render is not invoking it.

Interpretation: the identity-qualification service **does exist and is live**,
but its current deployed process is the ordinary GHM Core Engine. The service
name and integration branch do not prove that identity qualification scripts
have been run against its database, nor that this service is an isolated
PayFast callback runtime. It must not be pointed at PayFast or repurposed
without a reviewed deployment change. This finding corrects any earlier
wording that implied no identity-qualification Render service existed.

The latest live commit is a documentation-only commit on the integration
branch. No environment-variable values were inspected. No deploy, restart,
service configuration, database, secret, callback URL, or payment record was
changed. The separate `ghm-payfast-sandbox-runtime` service remains a
different service and also runs `node dist/server.js`.


### Superseding clarification — identity qualification uses the shared PayFast sandbox DB

This section corrects the interpretation in the immediately preceding Render
service note. The ordinary `node dist/server.js` process is the intended GHM
application runtime for the identity-qualification workload; it is not, by
itself, evidence that the service is unused for qualification or that its DB
is isolated from the PayFast sandbox environment.

The earlier owner-confirmed Render handover
(`docs/operations/handover-production-db-and-render-2026-10-24.md`, addenda
dated 2026-10-26 and 2026-10-31) explicitly records:
- `ghm-identity-qualification` (`srv-dbahvenbtjjs73f83rlg`) targets the
  owner-confirmed non-production database `ghm_payfast_sandbox_db`,
  Render resource `ghm-payfast-sandbox-db`
  (`dpg-db4416vlk1mc73eocug0-a`), not production `ghm_db`.
- Its runtime and migrator URLs were reported as targeting that same sandbox
  database with different credentials. The live secret values were not read
  back.
- A live deployment on 2026-10-31 ran commit
  `7a17a781a9a1910a6ea76b8819f4714680ac282e`; the handover records a
  successful `/readyz` HTTP 200 probe and a read-only role audit of the
  sandbox runtime identity.
- The owner confirms qualification tests have been run through this established
  service against the shared PayFast sandbox DB. This is owner/handover
  evidence of the existing qualification workflow; it is not evidence that
  the new isolated callback listener has been deployed or that real PayFast
  ITNs/retry delivery have been exercised.

The current Render inspection independently confirms the service still exists,
is live on the integration branch, and starts `node dist/server.js`. The
Render service environment association matches the sandbox DB environment.
That process selection is consistent with the established GHM API-based
qualification service; it must not be mistaken for a missing qualification
service. The separate `ghm-payfast-sandbox-runtime` service is also an API
process, not the callback listener.

**Corrected interpretation:** the existing shared PayFast sandbox database is
the intended non-production qualification database and is already used by
the identity-qualification service. Do not create another database or change
the service's database target merely because it is shared by the GHM identity
qualification and PayFast sandbox work. Keep production `ghm_db` excluded.
The sandbox database is a free-tier resource recorded with expiry
`2026-11-08T01:17:15Z`; retention/upgrade is a separate owner decision.

The outstanding distinction is callback cutover: the current service's
`npm start` does not launch `dist/payfast-callback-server.js`. Do not send
PayFast ITNs to the ordinary API endpoint or change the start command without
a reviewed callback deployment plan. No service, DB, secret, environment
variable, migration, notify URL, or payment record was changed by this
clarification.


### Read-only shared PayFast sandbox schema reconciliation — 2026-11-05

Target verified via Render resource metadata and read-only SQL:
- Render DB: `ghm-payfast-sandbox-db`, ID `dpg-db4416vlk1mc73eocug0-a`
- Database: `ghm_payfast_sandbox_db`; PostgreSQL 18; primary; Frankfurt; currently available.
- SQL identity: `session_user=current_user=ghm_payfast_sandbox_db_user`.
- Identity qualification service `ghm-identity-qualification` is in the same Render environment as this DB. The historical owner-confirmed handover records its runtime/migrator URLs target this shared sandbox using distinct credentials; secret values were not inspected.
- Resource expiry recorded by Render: `2026-11-08T01:17:15.779117Z` (free tier).

Read-only catalog findings:
- `ghm.commercial_payment_attempt` exists, but its columns do **not** include `provider_code`.
- `ghm_payment_provider` role is absent.
- `ghm.commercial_get_payfast_attempt(bigint)` and
  `ghm.commercial_apply_payfast_payment_result(...)` are absent.
- The older `ghm.commercial_apply_payment_result(...)` SECURITY DEFINER function still exists.
- The migration ledger relation is `ghm.ghm_schema_migrations`, with columns
  `version`, `name`, `checksum`, `applied_at`.

Conclusion: the release's two PayFast isolation migrations are **not reflected
in the current shared sandbox schema**:
1. `20261104120000_bind_commercial_payment_attempt_provider.sql`
2. `20261104130000_isolate_payfast_settlement_identity.sql`

This conclusion is based on absence of their defining schema/role/function
artifacts, not on a direct ledger-row comparison. The Render SQL connector's
read-only identity cannot use schema `ghm`, cannot SELECT the migration ledger,
and cannot SET ROLE to `ghm_schema_owner` or `ghm_migrator`. Although it has
admin-option membership records for some roles, PostgreSQL reports
`set_option=false`; no role switch was attempted. Therefore exact ledger
rows/checksums and applied migration count remain **unverified**. Obtain those
through the approved owner-controlled read-only audit path using a credential
that is already authorized to assume `ghm_schema_owner`; do not broaden the
Render connector's privileges to work around this limitation.

No migration, DDL, ledger read via elevated role, fixture write, grant, role
creation, credential read, service change, or payment write was performed.
Production `ghm_db` was not queried. Do not apply the two migrations as part
of this audit: they require a separate approved sandbox migration window and
the out-of-band `ghm_payment_provider` role prerequisite.


### Owner-terminal command for exact read-only sandbox ledger reconciliation

The existing `scripts/forensic-migration-reconciliation.mjs` is suitable for
this check: it opens `BEGIN READ ONLY`, verifies the session is
`ghm_migrator`, verifies `current_database()` against
`GHM_MIGRATION_AUDIT_DATABASE`, executes `SET ROLE ghm_schema_owner`,
reads `ghm.ghm_schema_migrations`, and always rolls back. It performs no
migration or write.

The Render SQL connector cannot perform the role switch, and this workspace
cannot access the owner's local terminal or read local environment variables.
Therefore the exact sandbox ledger audit must be executed in the owner's
terminal. Do not paste connection strings, credentials, or environment
variable values into chat.

From a checkout of the release branch, first confirm locally (without printing
the URL) that the existing `GHM_MIGRATOR_DATABASE_URL` is the approved
sandbox migrator connection for `ghm_payfast_sandbox_db`, not production.
Then run:

```sh
GHM_MIGRATION_AUDIT_DATABASE=ghm_payfast_sandbox_db DATABASE_SSL=true npm run audit:migrations
```

The script must report authority `pass: true`, before identity
`ghm_migrator`, after identity `ghm_schema_owner`, and
`expected_database: ghm_payfast_sandbox_db`. Preserve the full JSON output
locally. Share only the non-secret JSON audit report if a second review is
needed. If the identity/database gate fails, stop; do not retry against another
URL, alter role memberships, or run `npm run migrate`.

This is a prepared command, not a claim that the exact ledger audit has already
run. No local terminal or sandbox migrator credential was accessed by ChatGPT.


### Operator-run audit clarification — 2026-11-05

The owner ran `npm run audit:migrations` from PowerShell using Bash-style
inline environment assignment syntax. PowerShell rejected those assignments,
then continued to execute the npm command. As a result, the audit used the
script's default expected database `ghm_db` and reported:
`session_user=current_user=ghm_migrator`, `current_database=ghm_db`,
`SET ROLE ghm_schema_owner` successful, read-only transaction true,
verdict `INVESTIGATE`. This was a production read-only audit, not the
shared sandbox audit. No migration or write was performed. Its results match
the previously recorded production ledger finding: exactly the two PayFast
migrations are missing; no unexplained checksum mismatches or unrecognized
extras.

**Do not interpret that output as sandbox evidence.** For PowerShell, set
environment variables using `$env:NAME = 'value'` syntax. Before running
the audit again, the owner must use the already-approved sandbox-only
`GHM_MIGRATOR_DATABASE_URL` from their secure local secret source. The
previous run connected to production, so the currently loaded local URL must
be treated as production until explicitly switched and verified. Never print
or share the URL. Then set
`$env:GHM_MIGRATION_AUDIT_DATABASE = 'ghm_payfast_sandbox_db'` and
`$env:DATABASE_SSL = 'true'`, run `npm run audit:migrations`, and confirm
the script's authority output says `current_database=ghm_payfast_sandbox_db`
both before and after `SET ROLE`. If it reports `ghm_db` or any other
database, stop; do not proceed. Remove temporary environment overrides after
the run. No local secret was inspected by ChatGPT.
