# Product Backend Capability Inventory

**Status:** Construction capability inventory — reconciled through Business Capability lifecycle/verification transition qualification (2026-10-03)

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
- Customer
- Quote
- Enquiry / Lead
- Review and approved-only aggregate reconciliation
- Opportunity Core
- Opportunity capability requirements
- Opportunity Participation initial boundary
- Project Quote
- Capability Catalogue
- Business Capability assertion/read/create boundary
- Business Capability lifecycle/verification transition authority
- Business Hours
- Commercial trial operation
- Commercial reference data and payment preparation boundary
- Notification
- Support Request
- Saved Business
- Business Offering (read/readPublic/create/update; deactivation; runtime qualification)
- Resource API boundary
- Operational boundary

These qualifications establish GHM capability construction only. The Connect Saved Business adapter, Business Offering adapter, Business Capability read adapter, and Opportunity Participant adapter are bounded governed product/resource seams; they do not constitute production product migration.

Connect trusted request context establishment, governed operation resolution, GHM authorization binding, resource capability dispatch, the first saved_business.read service HTTP boundary, and durable service-assertion replay protection are construction-qualified bounded prerequisites.

## QuoteFlow

The current repository uses `@supabase/supabase-js` and contains a `supabase/` directory. Its source structure also includes dedicated storage modules for:

- account storage
- customer storage
- business profile storage
- item storage
- invoice storage

The product also contains notification functionality and local/secure account state handling.

Concrete QuoteFlow backend usage must continue to be inventoried from source before a product adapter is designed. QuoteFlow Customer reconciliation is complete with no adapter authorized because ownership differs from GHM Customer. QuoteFlow Business Profile is also reconciled as local/device-owned with no qualified GHM Business Profile resource or adapter authorized. A Supabase dependency alone does not authorize a corresponding remote GHM capability.

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

Several are already present as qualified construction primitives; remaining candidates require their own evidence and gates.

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
  Customer
  Quote
  Enquiry / Lead
  Review + aggregate reconciliation
  Opportunity Core
  Opportunity capability requirements
  Opportunity Participation initial boundary
  Project Quote
  Capability Catalogue
  Business Capability assertion/read/create boundary
  Business Capability lifecycle/verification transition authority
  Business Hours
  Commercial trial operation
  Commercial reference data + payment preparation boundary
  Notification
  Support Request
  Saved Business
  Business Offering
  Resource API boundary
  Operational boundary

  Connect integration lifecycle authority
  Connect trusted request context
  Connect governed operation resolution
  Connect GHM authorization binding
  Connect service HTTP read boundary (saved_business.read)
  Connect service assertion replay protection
  Connect Business Offering adapter seam
  Connect Business Capability read adapter seam
  Connect Opportunity Participant adapter seam

REQUIRES FUTURE GOVERNED WORK

  Trust evidence hardening / additional authoritative evidence domains
  Commercial payment provider result / webhook application
  Opportunity participant lifecycle transition workflows
  Opportunity outcome / matching workflows
  Business Hours exceptions / booking / open-now
  remaining platform candidates (storage, realtime, provider webhooks, telemetry)
  broader Connect product adapters
  QuoteFlow product adapter
  shadow qualification
  controlled cutover
```

Trust Score itself is **QUALIFIED / CLOSED** for its current construction boundary. Commercial reference data and provider-neutral payment preparation are also qualified; provider checkout, callbacks/results, webhook application, production credentials, and cutover remain separately governed.

The Opportunity Participant resource and Connect adapter are **CLOSED / PASS for construction qualification**. The full 515/515 repository suite and the dedicated live PostgreSQL runtime qualification both passed on 2026-10-03. Participant lifecycle transition workflows remain separately governed future work.

Broader product adapters remain separately gated. Provider/bootstrap authority cleanup remains an independent open construction concern. Production Connect and QuoteFlow remain on Supabase.


The Business Capability lifecycle/verification transition authority is **CLOSED / PASS for construction qualification**. On 2026-10-03 the repository suite passed 516/516 tests and the dedicated live PostgreSQL lifecycle qualification passed, including authorization, transition validity, stale-state protection, verifier provenance, assertion immutability, direct-mutation denial, and the runtime transition execution boundary.
