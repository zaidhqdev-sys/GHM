# Product Backend Capability Inventory

**Status:** Construction capability inventory — reconciled through current qualified GHM slices

This document records capabilities GHM may eventually support to replace current managed backend dependencies. It deliberately separates capability requirements from Supabase implementation details and does not authorize production migration.

## Zaid Connect

The approved interface specification identifies these current backend boundary classes:

- Authentication/session identity
- PostgreSQL table/view access
- PostgreSQL RPC functions
- Supabase Edge Functions
- Protected external provider calls
- Realtime-backed application behavior
- Storage-backed application behavior

Known domain areas include:

- profiles
- businesses and directory visibility
- business ownership/membership
- leads
- reviews
- projects
- project quotes
- notifications
- opportunities and capability requirements
- business capabilities/evidence
- commercial trial/subscription/payment domains
- support conversations
- business profile views
- trust/saved-business relationships

This is a capability inventory, not a proposed wholesale GHM schema. Exact data contracts remain subject to source reconciliation and separate qualification.

The following GHM construction capabilities have now been implemented and qualified where their individual gates are closed:

- Business Identity and eligibility
- Transaction boundary
- Authorization boundary
- Project private/public disclosure
- Enquiry
- Review and approved-only aggregate reconciliation
- Resource API boundary
- Operational boundary

These qualifications establish GHM capability construction only. They do not establish a Connect adapter, production migration, or cutover.

## QuoteFlow

The current repository uses `@supabase/supabase-js` and contains a `supabase/` directory. Its source structure also includes dedicated storage modules for:

- account storage
- customer storage
- business profile storage
- item storage
- invoice storage

The product also contains notification functionality and local/secure account state handling.

Concrete QuoteFlow backend usage must continue to be inventoried from source before a product adapter is designed. A Supabase dependency alone does not authorize a corresponding remote GHM capability.

## Shared GHM Capability Candidates

These remain platform-level candidates subject to evidence and qualification:

1. Identity and authentication
2. Session/token validation
3. Role and resource authorization
4. Transactional PostgreSQL access
5. Explicit domain resource APIs
6. File/object storage abstraction
7. Realtime/event delivery
8. Notification delivery boundary
9. External provider/webhook boundary
10. Audit/operational telemetry
11. Health/readiness/liveness
12. Migration/version management

Several of these are already present as qualified construction primitives; remaining candidates require their own evidence and gates.

## Governance Constraint

GHM must not expose an unrestricted `tables/:table` interface as the long-term product contract. Product capabilities must be explicit, typed, authorized, and testable.

## Qualification Rule

A capability is not considered migrated merely because a technically similar endpoint exists. A production replacement requires the complete product workflow to be demonstrated against GHM, including authorization, persistence, failure behavior, observability, and rollback behavior.

## Current Boundary

```text
QUALIFIED CONSTRUCTION
  Business Identity
  Transaction
  Authorization
  Project private/public disclosure
  Enquiry
  Review + aggregate reconciliation
  Resource API
  Operational boundary

REQUIRES FUTURE GOVERNED WORK
  remaining platform/resource capabilities
  Connect product adapter
  QuoteFlow product adapter
  shadow qualification
  controlled cutover
```

Provider/bootstrap authority cleanup remains an independent open construction concern. Production Connect and QuoteFlow remain on Supabase.