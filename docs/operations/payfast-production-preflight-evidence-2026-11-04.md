# PayFast Production Preflight Evidence — 2026-11-04

**Status: HOLD — evidence preparation only. No production changes authorized.**

**Release candidate:** PR #207, branch `release/payfast-settlement-isolation-main-20261104`  
**Inspected branch head:** `d893477261345fb0268c1b5bad3ca4bf44969404`  
**Production database:** Render `ghm-db`, database `ghm_db`, PostgreSQL 18  
**Scope:** read-only repository and production catalog inspection. No migration, DDL, DML, role, grant, credential, service, or network change was made.

This document records the preflight findings and defines the evidence required before a production change window. It does not authorize merging PR #207, deploying the callback, applying migrations, provisioning credentials, or changing payment records.

## 1. Executive decision

Production is **not ready** for the PayFast migration or cutover.

The source and disposable-environment qualification for PR #207 do not qualify the live database. Five independent gates remain open:

1. The production API database identity has excessive role-administration capability.
2. The dedicated `ghm_payment_provider` LOGIN is absent.
3. The one historical pending checkout (attempt ID 6) has no verified provider classification.
4. The authoritative production migration ledger has not been read by an authorized migration-owner identity in this inspection.
5. Database ingress remains broadly allow-listed; connectivity requirements and a safe narrowing plan are not yet demonstrated.

Backup/export evidence exists, but a restore rehearsal has not been completed. The migration window therefore remains **NO-GO**.

## 2. Repository facts verified at the inspected head

The following files exist at the inspected commit:

| File | Git blob |
|---|---|
| `database/migrations/20261104120000_bind_commercial_payment_attempt_provider.sql` | `145da2b0a73b5fbd6f12119bad38c2ac41add6a5` |
| `database/migrations/20261104130000_isolate_payfast_settlement_identity.sql` | `7ab673d7a3ac07bf674343c5ad2cb893caee343a` |
| `docs/architecture/PAYFAST_ISOLATED_SETTLEMENT_SERVICE_ADR_2026-11-04.md` | `ca6d316bd0c47325dbbbdfc0e4923eac4194c2d5` |
| `docs/operations/payfast-production-rollout-runbook.md` | `fc6637ec14976c6ac8fe7bb9fb35a33b89414aa1` |

### Migration 20261104120000 — provider binding

The migration is a self-contained transaction (`BEGIN` / `COMMIT`). It:

- Adds nullable `provider_code text` to `ghm.commercial_payment_attempt`.
- Adds a check constraint allowing NULL or `payfast`.
- Replaces `ghm.commercial_apply_payment_result(...)` so settlement requires a non-NULL provider code matching the supplied provider.
- Retains the generic settlement implementation and grants its EXECUTE privilege to `ghm_runtime` at this stage.
- Does **not** backfill historical payment attempts.

Consequence: the existing historical attempt will remain NULL after this migration unless separately reconciled. The replacement generic settlement function rejects an attempt whose stored provider is NULL.

### Migration 20261104130000 — PayFast identity isolation

This is a separate transaction. Before making changes, it explicitly raises an exception unless `ghm_payment_provider` exists and has `rolcanlogin = true`.

It then:

- Grants schema USAGE to `ghm_payment_provider`.
- Revokes generic settlement EXECUTE from PUBLIC and `ghm_runtime`.
- Creates `ghm.commercial_get_payfast_attempt(bigint)`.
- Creates `ghm.commercial_apply_payfast_payment_result(...)`, which fixes provider identity to `payfast` and checks the stored provider and currency `ZAR`.
- Grants only the two PayFast-specific function EXECUTE privileges to `ghm_payment_provider`.
- Makes the new functions SECURITY DEFINER, owned by `ghm_schema_owner`, with fixed `pg_catalog, ghm` search path.

**Sequencing risk:** these are two separate committed transactions. The migration runner processes the complete pending migration directory in timestamp order; it is not a command to apply only one selected file. If the provider LOGIN prerequisite is missing, migration one can commit and migration two can fail. Do not start the chain until all preconditions, including the LOGIN, are satisfied and the complete pending set has been verified.

## 3. Production catalog snapshot — read-only

The Render read-only query connection used for this follow-up reported:

| Identity field | Observed |
|---|---|
| `current_database()` | `ghm_db` |
| `session_user` | `ghm_app_user` |
| `current_user` | `ghm_db_user` |

This is **not** the validated `ghm_migrator` audit identity. Do not treat this connection as authority to inspect or modify the migration ledger.

### Payment-attempt schema

The production table `ghm.commercial_payment_attempt` has no `provider_code` column. Its observed columns include attempt ID, business/subscription/price references, status, amount, currency, checkout reference, idempotency key, expiry and timestamps.

The generic function `ghm.commercial_apply_payment_result(...)` exists, is SECURITY DEFINER, is owned by `ghm_schema_owner`, and has fixed search path `pg_catalog, ghm`. Its observed EXECUTE grants include `ghm_runtime` and `ghm_schema_owner`.

The PayFast-specific attempt-read and settlement functions do not exist. The role `ghm_payment_provider` does not exist as a LOGIN.

### Historical attempt inventory

The read-only inventory returned exactly one row:

| Field | Value |
|---|---|
| Attempt ID | `6` |
| Status | `pending_checkout` |
| Created at | `2026-10-07T18:20:31.4392Z` |
| Subscription | Present |
| Expiry | NULL |
| Provider code | Not available; column does not exist |

The row predates provider binding. Its provider identity and business disposition are unknown. Do not infer PayFast from its age, status, checkout URL, or this migration's purpose. Do not backfill, expire, cancel, settle, or delete it without corroborating persisted evidence and a separately approved data-change plan.

### Exact current-head CI recheck — 2026-11-04 22:17 UTC

The release branch advanced after the 22:14 check. The current PR #207 head is `bf56d0423a419d8da9c9564bd245c29063dd8196`. The earlier successful CI run `41923357306` tested `9024a03cbb004836ad4d23db8cb6cae417bf0357`, not this newer head; it is retained as historical evidence only.

The current-head CI run `41923762776` completed successfully at 22:17:14 UTC on exact head `bf56d0423a419d8da9c9564bd245c29063dd8196`. The `quality` job passed all listed steps: isolated least-privilege database-role setup, build, full migrations on disposable PostgreSQL, storage qualifications, full test suite, three-identity commercial settlement qualification, migration audit policy tests, and runtime-boundary verification.

The Cloudflare Pages check `126902847214` also completed successfully for this exact head and reports a preview deployment at `https://16d7bc01.ghm-cu1.pages.dev` with branch preview `https://release-payfast-settlement-i.ghm-cu1.pages.dev`. This is a Pages preview only, not the production API deployment or a production database change.

GitHub's PR API still reports PR #207 open, draft, and unmerged, targeting `main`. No reviews or review comments were present at this check. This exact-head CI result supersedes the prior statement that current-head CI was unverified.

The production decision remains **NO-GO** for the reasons above. CI and a successful Pages preview do not authorize merge, production deploy, role provisioning, migrations, data reconciliation, credential changes, or network changes.

### Release PR and CI recheck — 2026-11-04 22:14 UTC

GitHub confirms PR #207 is still **open, draft, and unmerged**, targeting `main`. Its head is `9024a03cbb004836ad4d23db8cb6cae417bf0357`; base is `61202bb4f61a465f8776b192927aa22e40297fd1`. The PR is 26 commits ahead of base and 0 commits behind at this check.

Exact-head GitHub Actions CI run `41923357306` completed successfully at 22:14:29 UTC. Its single `quality` job passed all steps, including build, applying the full migration chain to disposable PostgreSQL, storage qualification, the full test suite, three-identity commercial settlement qualification, migration audit policy tests, and runtime-boundary verification. This is repository/disposable-environment evidence only; it does not validate the production ledger or production roles.

Cloudflare's check `126901494869` also reports a successful **branch preview** for commit `9024a03`. The reported URL is the release-branch preview, not evidence of a production deployment. No production deployment was requested or initiated by this work.

The successful CI result does not change the production decision: the production migration audit remains INVESTIGATE, the provider LOGIN prerequisite is absent, the live ledger still lacks both PayFast migrations, attempt 6 remains unresolved, and backup/restore, role-hardening, network, and change-control gates remain open. Keep PR #207 draft/unmerged and production **NO-GO**.

### Follow-up read-only checks at release head 737c822b5c26624ef4e68e86e1eb4485c87ff345

The forensic migration audit was rerun from the fetched release head. Authority passed with `session_user = ghm_migrator`, `current_user = ghm_schema_owner` after `SET ROLE`, database `ghm_db`, and a read-only transaction. The audit verdict remains **INVESTIGATE**: 81 repository migrations, 89 live ledger rows, 2 missing migrations (the two PayFast migrations), 0 unexplained checksum mismatches, 0 name mismatches, 10/10 approved retained historical rows, and 0 unrecognized extras. The exact missing migration checksums are recorded in the audit output supplied for this checkpoint.

A separate Render connector inspection was performed read-only and did **not** use the migrator identity. It confirmed:

- The Render query identity remains `session_user = ghm_app_user`, `current_user = ghm_db_user`, database `ghm_db`.
- The live `commercial_payment_attempt` columns still do not include `provider_code`.
- Attempt 6 remains `pending_checkout`, created `2026-10-07T18:20:31.4392Z`, with `expires_at IS NULL`, no checkout reference, and no failure code. Its amount is 19,900 minor units, currency ID 1 (catalogued as ZAR), and subscription ID 16.
- Subscription 16 is recorded as `lifecycle_status = 'active'`, with NULL current-period start/end, no cancellation timestamp, and no provider reference. This is **not** evidence that attempt 6 was paid or that it belongs to PayFast. The subscription/attempt state is unresolved and must not be reconciled by inference.
- Role inspection confirms `ghm_payment_provider` is absent. `ghm_db_user` has `CREATEDB` and `CREATEROLE`; `ghm_migrator` and `ghm_runtime` are LOGIN roles with `NOINHERIT`, and `ghm_schema_owner` is NOLOGIN. Existing role memberships remain as described above.
- A read-only query of `ghm.commercial_event` for events related to business 774 / subscription 16 was denied by PostgreSQL permissions. It was not retried under a more privileged identity. No event payloads were retrieved.

These findings strengthen the conclusion that attempt 6 requires an owner-led historical reconciliation decision. They do not authorize a provider backfill, subscription correction, role change, migration, or payment action.

### Role and membership findings

The catalog inspection observed:

- `ghm_db_user` has `CREATEDB` and `CREATEROLE`.
- `ghm_db_user` has ADMIN OPTION memberships for `ghm_migrator`, `ghm_runtime`, and `ghm_schema_owner` (the migrator and schema-owner memberships are not inheritable/settable under the observed membership options).
- A separate non-admin `ghm_db_user` to `ghm_runtime` membership exists.
- `ghm_app_user` can assume `ghm_db_user` under the observed role graph.

This is a material privilege-escalation concern for the ordinary API database identity. The runbook's candidate cleanup is review-only. A database owner must first map operational dependencies and approve a complete role plan. Preserve the runtime membership needed by the live API; do not blindly revoke it. The `CREATEDB`/`CREATEROLE` attributes are separate from ADMIN OPTION and require their own owner-approved decision.

### Migration ledger limitation

The authoritative ledger is documented as `ghm.ghm_schema_migrations`, owned by `ghm_schema_owner`. The Render inspection identity is denied SELECT. The follow-up's information-schema visibility check did not expose a readable ledger relation, and it did not establish the exact applied/pending rows.

Do not change ledger ACLs just to make the inspection connector work. Obtain the complete ledger evidence through the already validated controlled `ghm_migrator` audit worktree or another explicitly approved owner-authorized read-only route. Confirm database, session identity, effective owner role, read-only transaction, every version/name/checksum, and the complete pending migration set. The last supplied forensic audit verdict was INVESTIGATE; do not substitute catalog inspection for a fresh exact-head audit.

## 4. Backup, recovery and network gates

The existing rollout runbook records a logical export created in Render on 2026-11-04 at approximately 20:42 UTC and a three-day PITR window shown in the Render UI. It explicitly records that no PITR restore or restore rehearsal was performed. Treat this as historical evidence; re-check export availability, retention, recovery point, and current PITR settings before the window.

The database inbound allow-list was observed as `0.0.0.0/0`. Do not narrow it speculatively: first inventory all legitimate service/operator paths, verify private Render connectivity for the API and planned callback, then approve and test a least-exposure rule set. No network change was made by this inspection.

## 5. Required preflight evidence and owners

| Gate | Required evidence | Current state |
|---|---|---|
| Release source | Reviewed exact PR #207 head, files and CI status | Source inspected at `d8934772...`; re-check latest PR head before any window |
| Migration ledger | Full authorized read-only ledger export; exact complete pending set | **OPEN** — current inspection identity cannot read it |
| API role hardening | Owner-approved role graph; reviewed plan for ADMIN OPTION and CREATEDB/CREATEROLE; verified post-change effective privileges | **OPEN** |
| Provider identity | Out-of-band `ghm_payment_provider LOGIN NOINHERIT`, secret custody/rotation plan, CONNECT only before migration | **OPEN** — role absent |
| Historical attempt | Persisted evidence linking attempt 6 to provider, or documented unknown/quarantine decision; approved disposition | **OPEN** |
| Recovery | Current backup/PITR confirmation and a successful restore rehearsal to a separate target | **OPEN** — export recorded; no rehearsal |
| Network | Complete client inventory, private connectivity test, owner-approved ingress allow-list plan | **OPEN** |
| Change control | Named database owner/operator, approved ticket, maintenance window, checkout/callback pause/drain and customer/payment communications plan | **OPEN** |
| Post-migration verification | Exact ledger checksums, function owner/security/search_path, grants, role memberships, and negative tests | Prepared in rollout runbook; not run in production |

## 6. Required read-only checks before scheduling

Run these only through the approved read-only/audit identity, with sensitive values excluded from logs:

1. Re-run `npm run audit:migrations` from a clean checkout at the exact reviewed PR #207 head, using the controlled production migrator connection and the explicit database target guard.
2. Confirm `current_database = ghm_db`, `session_user = ghm_migrator`, successful `SET ROLE ghm_schema_owner`, and a read-only transaction that rolls back.
3. Capture the full authoritative migration ledger and reconcile every version, name and checksum against the exact checkout and retained-history registry.
4. Re-run role membership/attribute/effective-privilege inspection through an authorized catalog identity.
5. Re-inspect payment attempt IDs and relevant persisted checkout/provider evidence without changing rows.
6. Reconfirm backup/PITR, active sessions, locks, and network paths immediately before any approved window.

Any authority failure, unexpected ledger row, checksum/name mismatch, unclassified payment attempt, missing prerequisite, or unavailable recovery path is **NO-GO / INVESTIGATE**.

## 7. Go/no-go criteria

A production window may be proposed only when every gate in section 5 has named evidence and an owner sign-off. The exact migration set must be reviewed as a whole because the runner applies all pending migrations in timestamp order.

During an approved window, follow the existing rollout runbook exactly. Do not improvise partial SQL, manually edit the ledger, skip a migration, or re-grant generic settlement to `ghm_runtime` as a shortcut. If a migration fails, stop and preserve evidence; confirm transaction/ledger state through the authorized audit path and diagnose in a restored rehearsal environment.

**Until separate explicit authorization is given:**

- Do not run `npm run migrate`, `supabase db push`, or any equivalent migration command.
- Do not merge PR #207 or trigger the ordinary API auto-deploy.
- Do not provision or rotate credentials, create the callback service, change Render variables, or alter database networking.
- Do not update attempt 6 or any payment/ledger record.
- Keep PR #207 draft and unmerged.

## 8. Evidence provenance and limitations

This record combines (a) source files read at commit `d893477261345fb0268c1b5bad3ca4bf44969404`, (b) read-only Render catalog queries whose connection identity is stated in section 3, and (c) earlier point-in-time observations explicitly identified as such from the existing production rollout runbook.

The Render connector query role was `ghm_app_user` / effective `ghm_db_user`; it was not the migrator. A read-only query against `ghm.commercial_event` was denied by PostgreSQL permissions and was not retried with elevated privileges. The exact production migration ledger contents were not obtained in this follow-up. No secret, connection string, payment payload, or export URL is included here.

**Final preflight verdict: NO-GO.** This is a documented evidence checkpoint, not a production change authorization.
