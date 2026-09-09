# Product Backend Capability Inventory

**Status:** Initial evidence inventory

This document records capabilities GHM must eventually support to replace the current managed backend dependencies. It deliberately separates capability requirements from Supabase implementation details.

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

Important rule: this list is a capability inventory, not a proposed GHM schema. Exact data contracts remain subject to source and production reconciliation.

## QuoteFlow

The current repository uses `@supabase/supabase-js` and contains a `supabase/` directory. Its source structure also includes dedicated storage modules for:

- account storage
- customer storage
- business profile storage
- item storage
- invoice storage

The product also contains notification functionality and local/secure account state handling.

The next inventory pass must inspect the concrete Supabase calls and database contracts behind these modules before designing GHM endpoints.

## Shared GHM Capability Candidates

These are the likely platform primitives, subject to evidence validation:

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

## Governance Constraint

GHM must not expose an unrestricted `tables/:table` interface as the long-term product contract. Product capabilities must be explicit, typed, authorized, and testable.

## Qualification Rule

A capability is not considered migrated merely because a technically similar endpoint exists. The complete product workflow must be demonstrated against GHM, including authorization, persistence, failure behavior, and rollback behavior.
