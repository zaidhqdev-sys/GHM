# QuoteFlow Migration Snapshot Validator Contract

**Status:** CONSTRUCTION QUALIFIED — NON-PRODUCTION DRY-RUN ONLY

This slice implements the first executable migration-boundary capability for QuoteFlow existing-user migration. It validates a controlled non-production snapshot and deterministically generates a dry-run manifest. It does not access Supabase, create GHM accounts, link identities, mutate Businesses, handle credentials, or change QuoteFlow runtime.

## Canonical input

The validator accepts one versioned snapshot containing Supabase Auth UUIDs as opaque source subjects, account metadata, legacy organization identifiers and owner evidence, membership references, reproducible extraction evidence, explicit `non_production` classification, and record counts.

It rejects duplicate account UUIDs, duplicate organization identifiers, unresolved membership/account references, invalid UUIDs, unsupported source/environment, and count mismatches.

## Deterministic dry-run output

The generator consumes the validated snapshot plus explicit operator resolution data and produces account and organization outcomes without mutation.

Account outcomes are `MIGRATED`, `RESET_REQUIRED`, `CONFLICT`, or `BLOCKED`. Organization outcomes are `MAPPED`, `CREATE_REQUIRED`, `CONFLICT`, or `BLOCKED`.

The exact `(provider=supabase, sourceSubject)` remains the provenance key. No email-only target resolution is performed.

## Security boundary

- No plaintext password or Supabase token is accepted.
- No production snapshot is accepted.
- No real source export is committed to the repository.
- Qualification uses synthetic fixture data only; the fixture contains no real user data.
- No permanent migration tables are introduced.
- No GHM database mutation occurs.

## Qualification

`npm run qualify:quoteflow-migration-snapshot` builds GHM and executes deterministic validation tests against synthetic non-production fixture data.

The qualification proves snapshot validation and manifest semantics only. It does not prove production source extraction, account provisioning, credential migration, Business creation, membership creation, or QuoteFlow cutover.

## Historical next-gate note — superseded

The original next slice was migration provisioning/reconciliation execution. That sequence has since advanced: credentialless migration account provisioning and existing-account reconciliation execution are construction-qualified. The migration-only legacy-organization-to-GHM-Business provisioning implementation remains unqualified, and the complete non-production reset/re-enrollment DB + HTTP ceremony remains unqualified. Use `QUOTEFLOW_MIGRATION_BUSINESS_PROVISIONING_CONTRACT.md`, `QUOTEFLOW_MIGRATION_RESET_REENROLLMENT_CEREMONY.md`, and `GHM_REMAINING_WORK_REGISTER_2026-10-05.md` for current remaining gates. This validator remains qualified for synthetic, non-production dry-run only; it does not authorize production source extraction or migration execution.