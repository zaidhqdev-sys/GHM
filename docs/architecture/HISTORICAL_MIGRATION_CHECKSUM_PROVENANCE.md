# Historical Migration Checksum Provenance Record

## Status

This record documents a historical migration-byte provenance exception identified during the GHM migration integrity reconciliation on 2026-09-30.

The live migration ledger is authoritative historical execution evidence. The repository migration files remain the canonical source for future migration execution.

## Reconciliation finding

The live ledger contains 55 applied migrations. Its version cardinality and application chronology are intact, and every ledger entry has a corresponding repository migration file.

Sixteen applied migrations currently have a repository SHA-256 different from the live ledger checksum.

Seven of those fifteen are fully explained by Windows checkout normalization: the ledger checksum matches the historical Git/index bytes exactly, while the current worktree representation uses CRLF under `core.autocrlf=true`. Those seven are not exceptions and must not be rewritten.

The following nine migrations have no exact-byte match recoverable from the repository's visible Git history or repository text/artifact evidence as of 2026-09-30:

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

## Canonical handling

These nine records are classified as **HISTORICAL_PROVENANCE_EXCEPTION**.

This classification does not assert that the current repository file bytes are the bytes originally executed. It also does not assert that the live schema is incorrect.

The historical ledger rows must remain unchanged. Existing migration files must not be rewritten merely to reproduce the ledger hashes, and already-applied migrations must not be rerun.

The strict migration runner remains unchanged: an applied version whose repository checksum differs from the ledger continues to fail closed.

Future migrations must remain deterministically reproducible from canonical repository bytes and must be recorded in the migration ledger.

## Qualification evidence

The reconciliation established:

- migration authority identity: `ghm_schema_owner` / `ghm_migrator` / `ghm_db`;
- 55 ledger rows with no duplicate migration versions;
- all 55 ledger versions represented in the repository;
- intact application chronology;
- exact historical Git/index provenance for the seven line-ending-only cases;
- no exact repository occurrence of any of the nine exception checksums;
- independently qualified/inspected resulting database boundaries for the affected Project, Business verification, Review, Project Quote, Opportunity Capability Requirements, and Commercial slices, including the Commercial access-path index reconciliation.

The inability to recover eight historical byte streams is therefore a provenance limitation, not evidence that those database objects should be recreated or that migration history should be rewritten.

## Operational rule

If an exact original byte stream for one of these eight migrations is recovered in the future, it may be added as provenance evidence without altering the live ledger.

Any schema correction or behavioral change required in the future must be introduced as a new migration with a new version.

## Scope

This record concerns historical migration-byte provenance only. It does not authorize production cutover, production data movement, credential changes, provider cleanup, or reopening of closed resource contracts.
