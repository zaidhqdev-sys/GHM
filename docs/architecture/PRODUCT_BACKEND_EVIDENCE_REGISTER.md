# Product Backend Evidence Register

## Status

Construction evidence register. This document records what has been verified from the product repositories before GHM implementation.

## Zaid Connect

Zaid Connect remains authoritative for its own application contracts and Supabase schema. Its backend boundary includes authentication, database table/view access, PostgreSQL RPCs, Edge Functions, and provider integrations.

The Connect schema must not be copied into GHM by inference. GHM must implement only the capabilities required by verified product contracts and must establish its own canonical schema through GHM migrations.

## QuoteFlow

QuoteFlow currently contains a Supabase client configuration (`src/lib/supabase.ts`) and Supabase environment variables. The inspected invoice persistence module (`src/lib/invoiceStorage.ts`) currently persists invoices through React Native AsyncStorage rather than a remote Supabase table. The presence of the Supabase client therefore does not, by itself, establish that invoice persistence is currently remote.

This distinction matters for migration scope: GHM must not create remote QuoteFlow tables merely because a Supabase dependency exists. Concrete remote calls must be inventoried before a QuoteFlow adapter is designed.

## Evidence rule

For every capability proposed for GHM, record:

1. product repository and exact source path;
2. concrete operation or API contract;
3. data entities and fields actually required;
4. authorization boundary;
5. consistency requirements;
6. rollback requirement;
7. whether the capability is currently remote, local-only, or transitional.

## Current conclusion

The next implementation work must remain capability-led. The GHM database schema is not yet authorized to contain product-specific tables until the live GHM PostgreSQL catalog and the concrete product backend calls have both been reconciled.
