# GHM Business Identity Capability Reconciliation

## Status

Construction-stage capability contract. No business migration is authorized by this document yet.

## Purpose

Define the smallest GHM-owned capability boundary for Zaid Connect Business Identity from verified production evidence, without cloning Supabase tables or legacy schema artifacts.

## Authoritative evidence

### Connect identity foundation

The authoritative Connect migration `20260718030909_establish_identity_foundation.sql` establishes:

- `profiles` as the application identity record linked one-to-one to `auth.users`;
- persisted account role as text with the values `customer`, `contractor`, `supplier`, `admin`;
- nullable `full_name`, `phone`, `avatar_url`, and unique `referral_code`;
- timestamps;
- `businesses` with UUID identity, required `owner_id`, required `name` and unique `slug`;
- Business verification state and consistency rules;
- ownership and public-approved-business read behavior;
- profile self-read/self-update behavior;
- owner-controlled Business creation/update behavior.

The same migration explicitly deferred directory, marketplace, payments, analytics, trust, reviews, audit logs, and storage buckets. fileciteturn78file0L2-L2

### Connect membership foundation

The authoritative Connect migration `20260721023613_establish_business_membership_foundation.sql` adds `business_memberships` with:

- `business_id` → `businesses.id`;
- `account_id` → `profiles.id`;
- `membership_role` values `owner`, `administrator`, `member`;
- `membership_status` values `active`, `inactive`, `revoked`;
- optional `created_by` → `profiles.id`;
- uniqueness of `(business_id, account_id)`;
- one active owner per Business;
- compatibility preservation of `businesses.owner_id`;
- automatic synchronization of owner membership;
- business membership authorization helpers.

This migration explicitly positions membership as the generalized Account-to-Business participation model while preserving the older ownership field for compatibility. fileciteturn79file0L2-L2

### Final generated production contract

The generated `database.types.ts` confirms that the current Connect production contract still contains the three core objects and their evolved fields:

- `profiles` contains `id`, nullable `full_name`, `role`, nullable `phone`, nullable `avatar_url`, nullable `referral_code`, and timestamps;
- `businesses` contains evolved identity, contact, geographic, verification, directory, and operational fields;
- `business_memberships` contains `account_id`, `business_id`, `membership_role`, `membership_status`, `created_by`, and timestamps.

The generated types also confirm that later production domains reference these identity objects rather than replacing them. fileciteturn85file0L2-L2 fileciteturn86file0L2-L2

## Non-authoritative artifact

`src/supabase/supabase_schema.sql` is not the schema source for GHM migration design. It contains an older consolidated model with PostgreSQL ENUMs and legacy structures including `catalogue_items`, `quotes`, and `conversations`. fileciteturn80file0L2-L2

Where the consolidated artifact conflicts with timestamped migrations and the generated production contract, the migration history and generated contract win.

## Capability boundary

GHM should own a **Business Identity capability**, not a Supabase-shaped table mirror.

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

The initial capability surface should be deliberately small:

### Account identity

Required concepts:

- stable account identifier;
- display name;
- phone/contact identity where required by product contract;
- avatar reference where required;
- persisted application role;
- timestamps.

### Business identity

Required concepts for the first capability:

- stable Business identifier;
- owner/participating account relationship;
- name;
- unique slug;
- active/lifecycle state;
- verification state where required to enforce public visibility.

Do **not** pull directory analytics, commercial state, reviews, trust scores, marketplace state, or storage implementation into this first capability merely because those concepts eventually reference Business.

### Business participation

Required concepts:

- Business membership;
- account identifier;
- Business identifier;
- membership role;
- membership lifecycle status;
- creator/audit actor where required;
- uniqueness and single-owner invariants.

## GHM-specific design decisions

1. GHM identity IDs should remain provider-neutral. Do not make the GHM domain model depend on Supabase Auth identifiers or `auth.uid()` semantics.
2. GHM application authorization should operate through its own authenticated `AuthContext` and explicit domain authorization services.
3. `businesses.owner_id` should not be copied simply because it exists in Connect. The canonical GHM participation model should determine whether ownership is represented as a membership role, a dedicated owner relation, or both for a measured compatibility reason.
4. Connect's `business_memberships` permission helpers are product authorization behavior, not PostgreSQL functions that GHM must reproduce by name.
5. Connect's RLS policies are not GHM's authorization model. GHM should enforce authorization at the application/domain boundary and grant the runtime role only the SQL privileges its repositories actually execute.
6. Storage references remain provider-neutral. Supabase Storage may remain the current provider behind the GHM storage capability boundary.
7. The first migration must contain only the schema required by the first qualified capability. It must not become a catch-all migration for the entire Connect schema.

## Required repository operations before migration authorization

The Business Identity repository contract must be defined before DDL is written. At minimum it must cover:

- resolve authenticated account identity;
- read account identity;
- update permitted account profile fields;
- create Business where authorized;
- read Business according to public/private visibility rules;
- update permitted Business identity fields;
- read account Business memberships;
- read Business membership for an authorized participant;
- establish/maintain ownership or owner membership according to the final GHM model.

Each operation must record:

1. input contract;
2. output contract;
3. transaction requirement;
4. authorization rule;
5. SQL actually executed;
6. required table/sequence/function privileges;
7. negative authorization cases;
8. rollback behavior.

## Current gate result

**Capability identified and bounded. Schema migration not yet authorized.**

The evidence is sufficient to begin the GHM Business Identity repository contract and SQL design. It is not sufficient reason to copy the full Connect identity schema into GHM.

The next implementation gate is therefore:

```text
Business Identity capability
        ↓
repository contract
        ↓
explicit SQL design
        ↓
minimum canonical GHM schema
        ↓
first migration
        ↓
measured runtime grants
        ↓
positive + negative qualification
```

Production Zaid Connect remains on Supabase throughout this construction phase.
