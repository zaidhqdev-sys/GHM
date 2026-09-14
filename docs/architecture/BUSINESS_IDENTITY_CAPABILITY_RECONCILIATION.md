# GHM Business Identity Capability Reconciliation

## Status

**CLOSED / PASS for the first canonical Business Identity construction slice.** The schema, repository, transaction, authorization, Resource API, and operational qualification required for this slice are complete. Production cutover and production Connect changes remain unauthorized.

## Purpose

Define the smallest GHM-owned capability boundary for Zaid Connect Business Identity from verified production evidence, without cloning Supabase tables or legacy schema artifacts.

## Authoritative evidence

The authoritative Connect migration history and generated production contract establish the identity, Business, and membership concepts that GHM must reconcile. The consolidated `src/supabase/supabase_schema.sql` remains non-authoritative.

## Capability boundary

GHM owns a **Business Identity capability**, not a Supabase-shaped table mirror.

Conceptually:

```text
Authenticated account
        │
        ▼
   Account identity
        │
        ├───────────────┐
        ▼               ▼
 Business participation  Business identity
        │               │
        │               ├── stable ID
        │               ├── name / slug
        │               └── lifecycle / verification state
        │
        └── role + membership lifecycle
```

The initial capability surface remains deliberately small: account identity, Business identity, and Business participation. Directory analytics, commercial state, reviews, trust scores, marketplace state, storage implementation, and later product domains remain outside this first slice.

## GHM-specific design decisions

1. GHM identity IDs remain provider-neutral and do not depend on Supabase Auth identifiers or `auth.uid()` semantics.
2. GHM application authorization operates through its own authenticated `AuthContext` and explicit domain authorization services.
3. `businesses.owner_id` is not copied merely for compatibility; the GHM first-slice model represents participation through `business_membership` and enforces the required ownership invariant there.
4. Connect membership permission helpers are product authorization behavior, not PostgreSQL functions GHM must reproduce by name.
5. Connect RLS policies are not GHM's authorization model. GHM enforces authorization at the application/domain boundary and grants runtime SQL privileges only for qualified repository operations.
6. Storage references remain provider-neutral.
7. The first migration contains only the schema required by the first qualified capability and is not a catch-all Connect migration.

## First canonical GHM schema slice

The reconciled minimum schema has now been authored as repository-owned migration `20260909150000_create_business_identity.sql` and applied to the construction database through the dedicated migration authority.

The first slice contains:

- `account_identity`;
- `business`;
- `business_membership`;
- required identity-backed sequences;
- structural constraints for uniqueness, references, membership status/role, and single active ownership.

The physical schema is the GHM-owned representation defined by `BUSINESS_IDENTITY_MINIMUM_SCHEMA.md`; it is not a copy of Connect's full production schema.

## Qualified application operations

The Business Identity operation contract remains the governing application behavior. The first-slice repository operations have been implemented and qualified, including:

- resolve authenticated account identity;
- read/update permitted account profile fields;
- create Business with atomic owner participation;
- read eligible Business identity through explicit projections;
- update permitted Business identity fields;
- read account Business memberships;
- resolve valid active Business context.

Qualification covers input/output contracts, transaction requirements, authorization rules, actual SQL, exact PostgreSQL privileges, negative cases, concurrency, and rollback behavior for the qualified first slice.

## Qualification state

The **schema-authoring gate, repository qualification, transaction qualification, authorization qualification, first-slice Resource API qualification, and operational-boundary qualification are complete for the first Business Identity slice**.

```text
minimum canonical schema
        ↓
explicit repository SQL
        ↓
measured runtime grants
        ↓
positive + negative qualification
        ↓
transaction/auth/authorization qualification
        ↓
first-slice Resource API + operational qualification
        ↓
CLOSED / PASS
```

No additional product schema should be introduced merely because it exists in Connect. Each later capability requires its own evidence-led reconciliation.

Production Zaid Connect remains on Supabase throughout this construction phase.
