# PayFast production rollout runbook (approval-gated)

**Status:** Planning only. No production database, Render service, secret, or PayFast setting has been changed.  
**Scope:** Render PostgreSQL database `ghm_db` (schema `ghm`) and a *new, separate* production PayFast callback service.  
**Not in scope:** The existing production GHM API runtime must not receive callback credentials or callback database access.

## 1. Current release position

- PayFast settlement isolation was squash-merged by PR #206 into
  `integration/ghm-identity-merge-candidate-20261018` at
  `d90b83bbf762e55321c1a985cb88051a496647e0`.
- The merge is on the integration candidate branch, **not `main`**. Production
  release work must wait for an explicitly reviewed promotion to the production
  release branch and successful CI on that exact release head.
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
  and `current_user = ghm_db_user`. Membership inspection showed
  `ghm_app_user` can SET ROLE `ghm_db_user`; `ghm_db_user` is a member of
  `ghm_runtime` and `ghm_schema_owner`, with recorded ADMIN OPTION on both
  memberships (and no SET OPTION on those memberships). This is not the
  simple `ghm_runtime`-only identity described by the target design. Review
  and correct this role graph deliberately before migration; in particular,
  remove unnecessary role-administration capability from the ordinary API
  identity after proving the intended replacement grants. Do not blindly
  revoke roles while the live API depends on inherited privileges.
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
approved change. Before and after, capture the full
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
