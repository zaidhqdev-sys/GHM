# GHM Legacy User Identity Provenance Reconciliation

**Status:** CONSTRUCTION — READ-ONLY RECONCILIATION BOUNDARY

## Purpose

Reconcile the two live legacy `public.users` rows with an authoritative QuoteFlow/Supabase migration snapshot without treating the legacy PostgreSQL account table as migration authority.

## Required inputs

The reconciliation requires three separately controlled inputs:

- `GHM_LEGACY_AUDIT_DATABASE_URL`: the existing `ghm_db_user` one-off audit connection;
- `GHM_QUOTEFLOW_SOURCE_SNAPSHOT_FILE`: an approved non-production QuoteFlow/Supabase source snapshot satisfying the existing snapshot contract;
- `GHM_LEGACY_USER_RECONCILIATION_FILE`: an operator-reviewed mapping manifest containing `legacyUserId`, exact Supabase `sourceSubject`, evidence reference, reviewer and review timestamp.

The mapping file is the explicit provenance bridge. It must not be generated automatically from email addresses.

## Resolution rule

The live legacy `public.users.id` is historical data only. It is not a GHM identity and it is not a Supabase Auth subject.

Each legacy user is:

1. matched to an explicit operator-reviewed source subject;
2. checked against the approved source snapshot;
3. corroborated with source email when available;
4. marked `PROVENANCE_RECONCILED`, `CONFLICT`, or `BLOCKED`.

Email equality is corroborating evidence only. It never creates or authorizes a mapping.

## Safety

The harness is strictly read-only:

- no INSERT/UPDATE/DELETE;
- no DDL;
- no GRANT/REVOKE;
- no role changes;
- no account provisioning;
- no external identity linking;
- no credential migration;
- no session creation.

Password hashes are never selected or emitted.

## Evidence

The output records SHA-256 hashes of the two input files, snapshot evidence identity, record counts, explicit mapping evidence, and deterministic outcomes. It does not emit raw email addresses.

## Qualification gates

- [x] legacy user table independently audited;
- [x] authoritative QuoteFlow source snapshot contract identified;
- [x] email-only identity resolution prohibited;
- [x] explicit operator provenance mapping required;
- [x] read-only reconciliation boundary defined;
- [ ] approved source snapshot available;
- [ ] explicit mapping manifest available;
- [ ] two legacy users reconciled;
- [ ] production migration separately approved.

## Founder gate

This slice authorizes evidence reconciliation only. It does not authorize production migration, account creation, external identity linking, credential migration, QuoteFlow cutover, Supabase mutation, or legacy table deletion.
