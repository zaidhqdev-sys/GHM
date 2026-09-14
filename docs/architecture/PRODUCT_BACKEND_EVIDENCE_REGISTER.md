# Product Backend Evidence Register

## Status

Construction evidence register. This document records what has been verified from the product repositories before GHM implementation and distinguishes qualified GHM construction capabilities from future product-adapter work.

## Zaid Connect

Zaid Connect remains authoritative for its own application contracts and Supabase schema. Its backend boundary includes authentication, database table/view access, PostgreSQL RPCs, Edge Functions, and provider integrations.

The Connect schema must not be copied into GHM by inference. GHM implements only capabilities required by verified product contracts and establishes its own canonical schema through GHM migrations.

The current GHM construction line has independently reconciled and qualified Business Identity, Project, Enquiry, and Review capabilities against the verified product contracts. These are GHM construction capabilities, not evidence that Zaid Connect has been migrated or that a product adapter is authorized.

## QuoteFlow

QuoteFlow currently contains a Supabase client configuration (`src/lib/supabase.ts`) and Supabase environment variables. The inspected invoice persistence module (`src/lib/invoiceStorage.ts`) currently persists invoices through React Native AsyncStorage rather than a remote Supabase table. The presence of the Supabase client therefore does not, by itself, establish that invoice persistence is currently remote.

This distinction remains important for migration scope: GHM must not create remote QuoteFlow tables merely because a Supabase dependency exists. Concrete remote calls and product workflows must be inventoried before a QuoteFlow adapter is designed.

## Evidence rule

For every capability proposed for GHM, record:

1. product repository and exact source path;
2. concrete operation or API contract;
3. data entities and fields actually required;
4. authorization boundary;
5. consistency requirements;
6. rollback requirement;
7. whether the capability is currently remote, local-only, or transitional;
8. whether the corresponding GHM construction slice has been separately qualified.

## Current conclusion

Capability-led construction remains mandatory. The first qualified GHM resource slices are now authorized and evidenced at the construction level through their own contracts and qualification gates. Future product-specific adapters remain separately governed.

The current construction boundary is:

```text
QUALIFIED CONSTRUCTION
  Business Identity
  Transaction
  Authorization
  Project private/public disclosure
  Enquiry
  Review + aggregate reconciliation
  Resource API boundary
  Operational boundary

OPEN / NOT YET AUTHORIZED
  provider/bootstrap authority cleanup
  future resource slices
  Connect adapter
  QuoteFlow adapter
  shadow qualification
  controlled production cutover
```

Nothing in this register authorizes production migration, product configuration changes, or Supabase replacement.