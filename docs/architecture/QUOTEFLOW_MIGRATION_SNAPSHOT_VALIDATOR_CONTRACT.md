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

## Next gate

The next construction slice is migration provisioning/reconciliation execution, separately gated and requiring an approved non-production source snapshot plus an explicit target-resolution capability.