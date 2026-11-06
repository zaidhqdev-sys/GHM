# PayFast Production Isolation Handover — 2026-11-04

> **Current operational handover.** This record consolidates the PayFast settlement-isolation release and production-preflight work through 2026-11-04 22:19 UTC. It supplements, and does not rewrite, the historical dated handovers. The production decision remains **NO-GO**. No production migration, data mutation, role/grant change, credential change, network change, merge, or production deployment is authorized by this handover.

## 1. Mission and hard safety boundary

Complete the production readiness work for isolated PayFast settlement without weakening the existing GHM API database boundary or making an unreviewed change to live payment/subscription data.

Until a separately approved production change plan exists:

- Keep PR #207 open as a draft and unmerged.
- Do not run `npm run migrate` against production.
- Do not provision `ghm_payment_provider`, alter role memberships/attributes, or change grants.
- Do not backfill, expire, cancel, settle, delete, or otherwise mutate historical payment attempts/subscriptions.
- Do not change Render secrets, services, deployment settings, database ingress, DNS, or provider activation.
- Do not treat passing disposable CI or a Cloudflare Pages preview as production qualification.

## 2. Repository and release position

| Item | Current evidence |
|---|---|
| Repository | `zaidhqdev-sys/GHM` |
| Release branch | `release/payfast-settlement-isolation-main-20261104` |
| PR | [#207](https://github.com/zaidhqdev-sys/GHM/pull/207) |
| PR state at 22:19 UTC | Open, draft, unmerged; base `main` |
| Exact head | `bf56d0423a419d8da9c9564bd245c29063dd8196` |
| Base SHA | `61202bb4f61a465f8776b192927aa22e40297fd1` |
| Current handover/evidence update | `fbbd043427637fe77b41472005cc4cc8f5e16690` |

PR #207 contains the focused PayFast settlement-isolation release. Do not merge it as a shortcut around the open production gates. Recheck the live PR head, review state, required checks, and diff before any future approval/window.

## 3. Exact-head qualification

GitHub Actions run [#41923762776](https://github.com/zaidhqdev-sys/GHM/actions/runs/41923762776) completed successfully on the exact head `bf56d0423a419d8da9c9564bd245c29063dd8196` at 22:17:14 UTC.

The quality job passed:

- isolated least-privilege database-role setup;
- build;
- complete migration chain against disposable PostgreSQL;
- storage qualification steps;
- full test suite;
- three-identity commercial settlement qualification;
- migration audit policy tests;
- runtime-boundary verification.

Cloudflare Pages check `126902847214` also succeeded for this exact head and produced a Pages preview. It is a branch preview only, not a production API deployment or production database change.

**Interpretation:** source/disposable-environment qualification is green. Production qualification is not. Earlier CI runs on older heads must not be presented as the current-head result.

## 4. Production migration audit

The maintainer reran `npm run audit:migrations` from a clean checkout fetched at release head `737c822b5c26624ef4e68e86e1eb4485c87ff345`, after the historical checksum registry correction had landed. The audit authority check passed:

- expected database: `ghm_db`;
- initial `session_user = ghm_migrator`, `current_user = ghm_migrator`;
- read-only transaction: true;
- `can_set_schema_owner = true`;
- after role switch: `current_user = ghm_schema_owner`, session user remains `ghm_migrator`.

Audit result: **INVESTIGATE**.

| Audit item | Result |
|---|---:|
| Repository migrations | 81 |
| Live ledger rows | 89 |
| Canonical checksum matches | 8 |
| Supported legacy CRLF matches | 62 |
| Approved historical-provenance matches | 9 |
| Missing migrations | 2 |
| Unexplained checksum mismatches | 0 |
| Name mismatches | 0 |
| Extra rows | 10 |
| Approved retained historical rows | 10 |
| Unrecognized extras | 0 |
| Orphaned exceptions | 0 |
| Redundant exceptions | 7 |

The two missing migrations are:

1. `20261104120000_bind_commercial_payment_attempt_provider.sql`
   - canonical SHA-256: `3f284b7afb1bc83c42331b0346e2853f448948ad9a2f9e92c162c303fb92d3d8`
   - supported legacy CRLF SHA-256: `a7e40f38d3a0cdd59175a7342dc726c5d6f625a51949e9793fa33fd67ab69912`
2. `20261104130000_isolate_payfast_settlement_identity.sql`
   - canonical SHA-256: `8804d609a9378fceb20793f687b85d33c9b6d1165be37656dbac437ecaa66011`
   - supported legacy CRLF SHA-256: `1112b5e3e807e4a90331111a4b6d36d620d8eacf38a465e0f3f2163fde8ce8a8`

The audit script itself was unchanged between the earlier and later evidence commits; the corrected historical registry was already present. The 10 retained historical rows were recognized, with no unexplained checksum or name mismatches. This does not make the two missing migrations safe to apply: the complete pending set and all preconditions still need final exact-head review before a change window.

## 5. Production database and payment-attempt evidence

Production target: Render PostgreSQL 18, database `ghm_db`, schema `ghm`, resource `dpg-dag0sdtbedkc7389vi2g-a`.

A separate Render catalog/query connector inspection ran read-only under `session_user = ghm_app_user`, `current_user = ghm_db_user`. This is not the validated migrator identity and was not used to read the protected migration ledger.

Observed facts:

- `ghm.commercial_payment_attempt` does not yet have a `provider_code` column.
- The PayFast-specific read/settlement functions are absent.
- `ghm_payment_provider` is absent.
- Attempt ID 6 remains `pending_checkout`, created `2026-10-07T18:20:31.4392Z`, with NULL expiry, no checkout reference, and no failure code.
- Attempt 6 amount is 19,900 minor units, currency ID 1 (catalogued as ZAR), and subscription ID 16.
- Subscription 16 is recorded as `lifecycle_status = 'active'`, with NULL current-period start/end, no cancellation timestamp, and no provider reference.
- These records do not prove that attempt 6 was paid, abandoned, or associated with PayFast.
- A read-only query of `ghm.commercial_event` for related events was denied by PostgreSQL permissions. It was not retried under a more privileged identity; no event payloads were retrieved.

**Disposition:** unresolved. Do not infer provider identity from migration intent, age, status, amount, subscription state, or missing checkout metadata. Obtain independent persisted evidence through an owner-authorized path, or document an explicit owner-approved unknown/quarantine decision. Any subsequent data disposition requires its own approved change plan.

## 6. Production role and access findings

Observed catalog facts:

- `ghm_db_user` has `CREATEDB` and `CREATEROLE`.
- `ghm_db_user` has ADMIN OPTION memberships for `ghm_migrator`, `ghm_runtime`, and `ghm_schema_owner` (with membership options differing by role).
- A separate non-admin `ghm_db_user` to `ghm_runtime` membership exists.
- `ghm_app_user` can assume `ghm_db_user`.
- `ghm_migrator` and `ghm_runtime` are LOGIN roles with NOINHERIT; `ghm_schema_owner` is NOLOGIN.
- `ghm_payment_provider` LOGIN does not exist.

This is a material privilege-escalation concern for the ordinary API connection. Do not blindly revoke the runtime membership that the live API depends on. The rollout runbook contains candidate SQL for owner review only; it is not authorization to execute it.

Before any role change, the database owner must approve a complete role graph/remediation plan, identify the supported Render-managed administrator identity, preserve required API runtime access, separately decide the `CREATEDB`/`CREATEROLE` attributes, and require before/after effective-privilege evidence. Provider identity provisioning and secret custody are separate gated actions.

## 7. Backup, recovery, network and operational gates

Previously recorded evidence:

- A logical export was recorded in Render on 2026-11-04 at approximately 20:42 UTC.
- A three-day PITR window was visible in the Render UI.
- No restore rehearsal has been completed.
- Database ingress was observed with `0.0.0.0/0` in its allow-list.
- No full service/operator connectivity inventory or tested narrowing plan has been completed.

These are point-in-time observations. Reconfirm backup/export availability, retention and PITR immediately before any future window, and complete a restore rehearsal to a separate target. Inventory every legitimate API, callback, operator, and recovery connection path before an owner-approved network plan. Do not narrow ingress speculatively.

## 8. Current blockers and required evidence

| Gate | Required next evidence | Status |
|---|---|---|
| Exact release | Current PR head/diff/reviews/required checks rechecked | Recheck before any window |
| Migration ledger | Fresh exact-head read-only audit and complete ordered pending set | **INVESTIGATE / OPEN** |
| Historical attempt 6 | Owner-authorized persisted evidence or documented unknown/quarantine decision | **OPEN** |
| API role hardening | Owner-approved role graph and supported remediation plan; before/after verification design | **OPEN** |
| Provider identity | Approved `ghm_payment_provider LOGIN NOINHERIT` provisioning/secret plan; not yet created | **OPEN** |
| Backup/recovery | Current backup/PITR confirmation and successful restore rehearsal | **OPEN** |
| Database network | Connectivity inventory, private-route tests, owner-approved least-exposure plan | **OPEN** |
| Change control | Named owner/operator, approved ticket, maintenance window, callback/checkout pause-drain-retry plan | **OPEN** |
| Post-migration proof | Exact ledger/checksums, object owner/security/search_path, grants, memberships and negative tests | Prepared in runbook; not executed |

## 9. Next actions — safe order

1. **Release owner:** recheck PR #207 head, review state, complete diff, and exact-head CI. Keep draft/unmerged while production gates are open.
2. **Database owner:** provide an approved read-only path to independent persisted evidence for attempt 6 and subscription 16. If no reliable provider evidence exists, record the explicit unknown/quarantine decision; do not mutate the row.
3. **Database owner / security owner:** produce and approve a complete role remediation plan, including `ghm_db_user` attributes, grantors, membership options, preserved API runtime membership, and separate provider identity requirements.
4. **Operations owner:** verify current backup/PITR state and perform a restore rehearsal to an isolated target.
5. **Network/Render owner:** inventory API, callback, operator, and recovery connectivity; prove private connectivity; propose a tested allow-list plan.
6. **Migration owner:** rerun the exact-head migration audit after the production ledger path and all required evidence are ready; inspect the entire ordered pending set, not only the two PayFast files.
7. **Change owner:** assemble a reviewed change ticket and maintenance window with callback/checkout pause, retry, rollback, communications, and post-change checks.
8. Only after all gates close and separate explicit authorization is granted may a production migration/service plan be scheduled. This handover itself grants no such authorization.

## 10. Authoritative companion documents

- [PayFast production preflight evidence](operations/payfast-production-preflight-evidence-2026-11-04.md)
- [PayFast production rollout runbook](operations/payfast-production-rollout-runbook.md)
- [PayFast isolated settlement service ADR](architecture/PAYFAST_ISOLATED_SETTLEMENT_SERVICE_ADR_2026-11-04.md)
- [GHM current-state index](GHM_CURRENT_STATE.md)
- [GHM remaining-work register](GHM_REMAINING_WORK_REGISTER_2026-10-05.md)
- [Production DB and Render runtime handover (2026-10-24)](operations/handover-production-db-and-render-2026-10-24.md)

The dated September/October handovers remain historical snapshots. This November 4 handover is the consolidated PayFast operational checkpoint; update it when new owner-authorized evidence changes a gate.


## 11. Live checkpoint update — 2026-11-04 22:27 UTC

This section supersedes older head/CI/attempt-6 summaries above where they conflict.

### Release state and exact-head qualification

- Current PR #207 head: `5fb9c1d1d1e8473aee15ff66e7f9cbab7cd93fb6`.
- PR remains open, draft, unmerged, base `main` at `61202bb4f61a465f8776b192927aa22e40297fd1`; GitHub reports mergeable/clean. It has 29 commits, 3,442 additions and 394 deletions. No submitted reviews or review comments were found; the one issue comment is the Cloudflare Pages preview bot.
- Exact-head Actions run [#41924548996](https://github.com/zaidhqdev-sys/GHM/actions/runs/41924548996) completed successfully at 22:22:27 UTC. Every quality step passed: isolated least-privilege roles, build, full migration chain on disposable PostgreSQL, storage qualifications, full test suite, three-identity commercial settlement qualification, migration audit policy tests, and runtime-boundary verification.
- Cloudflare Pages preview succeeded for `5fb9c1d`: [preview](https://ea9b6676.ghm-cu1.pages.dev), [branch preview](https://release-payfast-settlement-i.ghm-cu1.pages.dev). This is not the production API deployment.
- GitHub compare confirms the four commits from audited source head `737c822b5c26624ef4e68e86e1eb4485c87ff345` through `5fb9c1d` changed only two documentation files. No migration file, audit script, retained-history registry, or exception registry changed. Therefore the read-only production audit result below remains applicable to the current head's audit inputs; the only reason its verdict is INVESTIGATE is the two intentionally pending PayFast migrations.

### Current migration audit interpretation

The read-only audit at `737c822b5c26624ef4e68e86e1eb4485c87ff345` passed its production authority checks (`ghm_migrator` session identity, `SET ROLE ghm_schema_owner`, database `ghm_db`, read-only transaction). It reconciled 81 repository migrations against 89 ledger rows: 10 retained historical rows approved, zero unrecognized extras, zero checksum/name mismatches, and exactly two missing migrations—the two PayFast migrations listed in section 4. Because all audit inputs are unchanged through current head `5fb9c1d`, this is the current release's effective audit result. Verdict remains **INVESTIGATE** because those two migrations have not been applied; this is expected, not an unexplained ledger inconsistency.

The Render SQL connector cannot reproduce the audit: it connects as `ghm_app_user` / effective `ghm_db_user`, and PostgreSQL denies access to the protected migration ledger. No attempt was made to elevate that connector or weaken ledger permissions.

### Attempt 6: qualification-fixture provenance established

A fresh read-only production query joined attempt 6 to its plan, price, currency, business and subscription. It returned:

- Business 774: `Commercial Prepare Qualification`, created `2026-10-07T18:20:26.571586Z`.
- Plan: `Commercial Prepare Qualification`, code `commercial_prepare_1791397229599`.
- Owner account 1584: `Commercial Prepare Qualification Owner`, active business account; one active owner membership for business 774.
- Subscription 16: created at the same fixture timestamp, status `active`.
- Attempt 6: created `2026-10-07T18:20:31.4392Z`, status `pending_checkout`, amount 19,900 minor units, ZAR, monthly, no checkout reference, no expiry, no failure code; idempotency key `commercial-prepare-qualification-1791397232513`.

This is a strong, exact match to the fixture construction in `scripts/qualify-commercial-payment-prepare-runtime.mjs`: that script inserts a business named `Commercial Prepare Qualification`, a plan with the same name and `commercial_prepare_${Date.now()}` code, an active subscription and a payment attempt using idempotency key prefix `commercial-prepare-qualification-${Date.now()}`. The matching owner account name and timestamps reinforce the match. The script's `finally` block is designed to delete the fixture, but these rows remain in production; cleanup evidently did not complete or was interrupted.

**Disposition update:** attempt 6 is now identified with high confidence as an orphaned commercial-payment qualification fixture, not an ordinary customer checkout. This resolves the earlier uncertainty about whether it was a customer payment. It does **not** prove a PayFast transaction or a successful payment: the checkout reference is NULL, the current production schema has no `provider_code` column, and the related `commercial_event` table remains unreadable to the connector. Do not backfill provider identity or mutate/delete the fixture as part of the migration. Treat its cleanup as a separate, narrowly scoped production data-change item requiring explicit approval and before/after evidence.

### Remaining production gates

1. The two PayFast migrations remain pending. The production migration runner applies the entire ordered pending set; the reviewed audit identifies exactly these two.
2. The production provider LOGIN `ghm_payment_provider` is absent; the second migration requires it to exist first.
3. `ghm_db_user` still has `CREATEDB`/`CREATEROLE` and elevated role-membership administration. A safe owner-approved remediation must preserve the API's required runtime membership and be verified before/after.
4. Backup/PITR evidence is historical; no restore rehearsal is recorded.
5. Database ingress was observed as `0.0.0.0/0`; the full connection inventory and tested narrowing plan remain open.
6. The callback service, its secret/network configuration, callback pause/drain/retry plan, and coordinated API deployment window remain unprepared.
7. PR #207 has no human review approval and must remain draft/unmerged until the production change plan is approved.

No production data, schema, role, credential, service, network, or payment state was changed during this checkpoint.
