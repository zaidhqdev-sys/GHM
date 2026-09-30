# Business Hours Source Audit

**Status:** RECONCILED — construction branch `construction/business-hours-resource`

## Production source

Repository: `zaidhqdev-sys/zaid-connect`

Authoritative production migration:

`supabase/migrations/20260727010000_reconcile_core_production_runtime_contracts.sql`

Supporting production consumers:

- `src/lib/lib_supabase.js`
- `src/features/business-profile/BusinessProfileScreen.jsx`
- `src/features/workspace/useBusinessProfileEditor.js`

## Reconciled production behavior

Zaid Connect defines `business_hours` as a Business-owned weekly schedule with:

- `business_id`;
- `day_of_week` from 0 through 6;
- `is_closed`;
- optional `open_time` and `close_time` constrained by closed/open state;
- `created_by`;
- timestamps;
- one row per Business per day.

The production database contract enables RLS and public reads only for active, directory-approved Businesses, while Business-authorized management reads remain available.

Management replacement is mediated by `replace_business_hours`, which requires authentication and `business.manage`, accepts a JSON array of at most seven entries, validates day/time state and duplicate days, then atomically replaces the Business schedule. The function derives `created_by` from the authenticated user.

The production editor loads Business Hours and includes them in Business profile save. The editor validates the hours draft before save and uses the governed replacement operation rather than individual row mutation.

The public Business Profile also loads Business Hours independently from reviews/capabilities, so auxiliary schedule failure does not invalidate the authoritative Business record.

## Scope decision for GHM

The GHM boundary is therefore:

```text
business_hours
```

with operations:

```text
read
readPublic
replace
```

There is no item-level create/update/delete operation. Replacement is the atomic lifecycle operation.

The GHM design deliberately does not copy Supabase/RLS implementation details. Instead, authorization is expressed through the existing GHM Business membership model and a database-owned replacement function exposed to the runtime role through EXECUTE only.

## Explicit exclusions

The source audit does not establish contracts for booking availability, appointments, holidays, temporary exceptions, staff availability, service-specific hours, timezone conversion, analytics, notifications, or real-time open-now status. Those remain separate capabilities requiring their own source evidence.

## Safety boundary

This audit authorizes construction of the provider-neutral GHM Business Hours resource only. It does not authorize production schema changes, Supabase migration, credential changes, DNS/routing changes, traffic changes, or product cutover.
