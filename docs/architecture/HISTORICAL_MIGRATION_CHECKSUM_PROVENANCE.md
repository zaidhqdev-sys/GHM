# Historical Migration Checksum Provenance Record

## Status

This record documents a historical migration-byte provenance exception identified during the GHM migration integrity reconciliation on 2026-09-30.

The live migration ledger is authoritative historical execution evidence. The repository migration files remain the canonical source for future migration execution.

## Reconciliation finding

The live ledger contains 55 applied migrations. Its version cardinality and application chronology are intact, and every ledger entry has a corresponding repository migration file.

The 2026-09-30 reconciliation classified **22** ledger/repository checksum mismatches: seven line-ending-only cases with exact historical Git/index provenance, plus fifteen historical-provenance exceptions whose original byte streams were not recoverable from the available repository evidence. The seven line-ending-only cases are not exceptions and must not be rewritten.

The following fifteen migrations had no exact-byte match recoverable from the repository's visible Git history or repository text/artifact evidence as of 2026-09-30:

| Version | Migration | Live ledger checksum |
|---|---|---|
| 20260911030000 | create_project_public_projection | 7c154d42d5444ee976fb0bf0bf24c172783d7ff4f62ee89d2e9157d3f8333e401 |
| 20260911210000 | reconcile_business_verification_state | 70d0ef6c298264462916197fb26f72c2a75480300dfb21750225975958062a36 |
| 20260911211500 | reconcile_business_verification_default | 32db502ea3a79317a95a0e54b4c72269e717900e2c770d456276f091dd4685a3 |
| 20260912030000 | grant_review_runtime_access | 6a8e49e62d8ce0c8f848ae6b90fb93ef724f3d1986c0736dd9a4962d6938500d |
| 20260914120000 | create_project_quote | e9da5f34d0a1f0a330318102fd3ea2b2999c4aaa2e40a42604052fdddc4285ae |
| 20260914130000 | reconcile_project_quote_transition_privilege | aaac327303f6f67c9742cfab2bcf39cde532854566afd1574fbebabefbad42a7 |
| 20260914220000 | create_opportunity_capability_requirements | 076fd7a54c1e671bd4c7d49535a0540e4d6ac6c50fa97a21c6e0f0a4621892dd |
| 20260915193000 | reconcile_commercial_payment_transaction | 55694a2e0359691cc4c5d5c990927aa9b11a73a78147c3fa0d35402170d22c67 |
| 20260915194500 | reconcile_commercial_access_path_indexes | 24e65f01e364c7dc4b89340b8412e5f05f837dacc832d21d27e230ff8ad434d2 |
| 20260915200000 | reconcile_commercial_payment_transaction_status | 721d5dccf2344afaf8aedfb858f037fc2a82df005d2e6580427a7f4c49de5a87 |
| 20260915203000 | reconcile_commercial_runtime_sequence_acl | b2d883f1efa15c47d54fb948b1ce2e00d2aa7c959d91689e5637bae1b9c3a80c |
| 20260915210000 | reconcile_commercial_subscription_access_path | 92e1142c0fd77dd17c54d95e4fa2d6368f95cbc08f183db586e56f9c03263aeb |
| 20260915220000 | reconcile_commercial_payment_transaction_provider_event_idempotency | 7ba13a02205cf31be27008fad69f1fa2480b74e422b50567cc0ddf8792532cf4 |
| 20260916003000 | reconcile_commercial_event_runtime_read_acl | dd66d4330497a177e1e2cbd8ccb50baaaa15617b438a56f7b6c5d0652d3ac97c |
| 20260916004500 | reconcile_commercial_event_runtime_read_acl | f5b76db1d8f2ec437835d97093ab7085ba51e47faf9cf243f2267f2f920f1b42 |

## Subsequent exception added after the 2026-09-30 snapshot

The current `config/historical-migration-provenance-exceptions.json` contains **16 repository-recorded exceptions**: the fifteen listed in the 2026-09-30 snapshot plus the separately recorded `20261005211000_correct_founder_system_admin_bootstrap_existing_account` exception with ledger checksum `f70b3a76ad959307ed780166ad2dba23eaa296a5f95117ff460c760722dfaad0`. The historical table and the 55-row qualification below remain dated evidence from 2026-09-30; they do not assert the current live ledger row count or independently prove that every configured exception still matches the live ledger.

## Canonical handling

These fifteen records are classified as **HISTORICAL_PROVENANCE_EXCEPTION**.

This classification does not assert that the current repository file bytes are the bytes originally executed. It also does not assert that the live schema is incorrect.

The historical ledger rows must remain unchanged. Existing migration files must not be rewritten merely to reproduce the ledger hashes, and already-applied migrations must not be rerun.

The current migration runner normalizes SQL to LF before computing the canonical checksum and accepts a legacy CRLF checksum only when it matches the same SQL represented with CRLF. A genuinely different checksum continues to fail closed, except for the narrowly documented historical-provenance handling already represented by this record. This compatibility change does not rewrite ledger checksums, recover the missing historical byte streams, or authorize rerunning applied migrations.

Future migrations must remain deterministically reproducible from canonical repository bytes and must be recorded in the migration ledger.

## Qualification evidence

The reconciliation established:

- migration authority identity: `ghm_schema_owner` / `ghm_migrator` / `ghm_db`;
- 55 ledger rows with no duplicate migration versions;
- all 55 ledger versions represented in the repository;
- intact application chronology;
- exact historical Git/index provenance for the seven line-ending-only cases;
- no exact repository occurrence of any of the fifteen exception checksums;
- independently qualified/inspected resulting database boundaries for the affected Project, Business verification, Review, Project Quote, Opportunity Capability Requirements, and Commercial slices, including the Commercial access-path index, payment-status, runtime ACL, subscription access-path, provider-event idempotency, and event runtime read-ACL reconciliations.

The inability to recover eight historical byte streams is therefore a provenance limitation, not evidence that those database objects should be recreated or that migration history should be rewritten.

## Operational rule

If an exact original byte stream for one of these eight migrations is recovered in the future, it may be added as provenance evidence without altering the live ledger.

Any schema correction or behavioral change required in the future must be introduced as a new migration with a new version.

## Scope

This record concerns historical migration-byte provenance only. It does not authorize production cutover, production data movement, credential changes, provider cleanup, or reopening of closed resource contracts.

## Forensic reconciliation policy clarification — 2026-10-17

The forensic audit distinguishes **current migration reconciliation** from **historical byte provenance**:

- Current repository SQL is hashed after CRLF/CR-to-LF normalization. A ledger checksum matching that canonical checksum is an exact canonical match.
- A ledger checksum matching the same SQL represented with CRLF is accepted as a supported legacy line-ending match. This compatibility does not modify the ledger or migration file.
- A registered checksum in this file's companion exception registry records historical applied-byte provenance. It is not required to equal the current live ledger checksum and must not be labelled orphaned solely because the live checksum differs.
- An exception is orphaned only when its migration version no longer has a corresponding live ledger row or repository migration file. An exception that now duplicates a supported current repository checksum is reported as redundant, separately from an orphan.
- Any ledger checksum that matches neither the canonical bytes, supported legacy CRLF bytes, nor a specifically registered historical checksum remains an unexplained mismatch and fails the audit. Missing/extra versions, duplicate versions, name mismatches, and failed authority checks remain blocking.
- The forensic audit must run inside an explicitly read-only database transaction and validate the expected database identity. The target database is selected using `GHM_MIGRATION_AUDIT_DATABASE`; absent that setting, the historical default remains `ghm_db`. A sandbox audit must set the intended sandbox database explicitly.

This clarification changes audit classification only. It does not rewrite or remove historical exception records, update migration ledger rows, rerun migrations, or authorize any database mutation, deployment, cutover, or production action.

## Applied-byte checksum reconciliation — 2026-10-26

The applied historical migration `20261020130000_create_quoteflow_migration_business_provisioning.sql` had a checksum mismatch because the repository copy differed from the bytes already applied to the qualification database. Commit [`5229b37700f2e21ac4caf2d4c5547bb929ab2de8`](https://github.com/zaidhqdev-sys/GHM/commit/5229b37700f2e21ac4caf2d4c5547bb929ab2de8) restored the historical SQL bytes rather than changing the live ledger or rewriting migration history. The restored file matches the recorded database checksum. The user's subsequent `npm run migrate` completed successfully with exit code 0 on 2026-10-26; supported legacy line-ending checksum messages were informational, and no failure was reported. This records the qualification-database run only and is not evidence that production was migrated.

