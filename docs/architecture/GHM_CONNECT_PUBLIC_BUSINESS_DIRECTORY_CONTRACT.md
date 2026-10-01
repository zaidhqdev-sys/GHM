# GHM Connect Public Business / Directory Contract

**Status:** CONTRACT RECONCILIATION — FOUNDER CONSTRUCTION GATE REQUIRED  
**Source:** Connect audited at `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**GHM baseline:** `0e589d57e2d7da991bfc4420ff23fe9db454248a`

## 1. Purpose

Define the narrow backend boundary required to represent Connect's public Business presentation and directory behavior without inventing GHM storage or treating Connect's Supabase schema as canonical.

This document is a contract only. It authorizes no production cutover, provider migration, shadow routing, backfill, or schema mutation.

## 2. Connect evidence

Connect's canonical public directory Business projection currently exposes:

- `id`
- `owner_id`
- `name`
- `slug`
- `verification_status`
- `is_verified`
- `created_at`
- `updated_at`
- `description`
- `category`
- `province`
- `city`
- `physical_address`
- `latitude`
- `longitude`
- `phone`
- `whatsapp`
- `email`
- `website`
- `logo_url`
- `avatar_letter`
- `avatar_color`
- `is_active`
- `is_supplier`
- `tier`
- `is_featured`
- `rating`
- `review_count`
- `profile_views`
- `jobs_completed`
- `years_in_business`
- `insurance_verified`
- `registration_status`
- `legal_name`

Connect directory listing filters by category, city, supplier status and tier, and orders by featured status then rating. Pagination is part of the current client contract.

Connect also has a separate business-details read by ID and by slug.

## 3. Canonical GHM ownership

Already canonical in GHM:

| Capability | Canonical owner | Status |
|---|---|---|
| Business id/name/slug/lifecycle | Business Identity | Existing |
| description/phone/email | Business Identity | Existing |
| verification status / active state | Business Identity | Existing |
| rating/review_count | Review aggregate + Business | Existing and maintained |
| jobs_completed | Business/Trust-backed field | Existing |
| insurance_verified | Business/Trust-backed field | Existing |
| public reviews | Review | Existing |
| public Trust | Trust Score | Existing |
| business hours | Business Hours | Existing |
| capabilities | Business Capability | Existing |
| categories/assignments | Business Category | Existing |
| Connect UUID mapping | Business External Mapping | Existing |
| Connect account mapping | Connect Identity Adapter | Existing |

## 4. Fields not yet proven canonical in GHM

The following Connect public fields must **not** be invented in GHM merely because Connect exposes them:

- `province`
- `city`
- `physical_address`
- `latitude`
- `longitude`
- `whatsapp`
- `website`
- `logo_url`
- `avatar_letter`
- `avatar_color`
- `is_supplier`
- `tier`
- `is_featured`
- `profile_views`
- `years_in_business`
- `registration_status`
- `legal_name`

Some of these may be legitimate future GHM capabilities; current evidence does not establish their canonical owner or construction contract.

In particular, Connect's `owner_id` is a provider UUID and must not be copied into a GHM public projection as though it were a GHM account identifier.

## 5. Public Business read boundary

GHM should expose a distinct `business.readPublic` projection rather than treating the managed Business Identity object as the public directory response.

The public projection should compose only fields whose canonical ownership and public visibility are already qualified.

Initial qualified projection:

- canonical GHM `businessId`
- `name`
- `slug`
- `description`
- public-safe contact fields already owned by Business Identity
- `verificationStatus` only where public eligibility permits it
- `isActive` only as a visibility predicate, not as an uncontrolled public management field
- `rating`
- `reviewCount`
- public Trust summary where the existing Trust public contract is applicable
- public category assignments where the existing category public semantics are applicable
- public capabilities where the existing capability read contract permits them
- public business hours where applicable

The projection must not expose private membership, owner identity, protected verification data, moderation data, or provider-specific identifiers.

## 6. Public visibility predicate

The existing qualified public Business-related resources establish a common visibility boundary around an active, approved/verified Business.

The implementation must reuse the canonical Business visibility rules rather than independently inventing a second definition.

Where existing resource contracts differ, the implementation must reconcile them explicitly before construction.

## 7. Directory is a separate boundary

Directory/search is not equivalent to `business.readPublic`.

`business.readPublic` answers: "What is the public presentation of this known Business?"

Directory answers: "Which publicly eligible Businesses match these discovery criteria?"

Therefore directory/search requires its own contract and operation semantics.

At minimum, the future directory contract must explicitly define:

- filters
- pagination
- stable ordering
- visibility eligibility
- category semantics
- city/location semantics
- supplier/tier semantics only if their canonical GHM ownership is established
- whether featured ordering exists and who owns it
- whether geo/radius search is required
- deterministic handling of missing/invalid filters
- response projection
- maximum page size
- authorization/public access boundary.

No geo/search implementation is authorized by this document.

## 8. No schema invention

Do not create columns or tables for Connect fields solely to reproduce the current Supabase response.

If a field has no canonical GHM owner, it remains an explicit gap or provider-local concern until a separate architecture decision establishes ownership.

Do not create a generic `business_directory` table merely to mirror Connect.

Do not duplicate rating, review count, Trust, category, capability, or hours into a second projection table unless a later performance architecture decision explicitly requires materialization.

## 9. Provider boundary

Connect's Supabase UUID remains an external identifier.

GHM public responses must use canonical GHM identifiers internally. Any Connect-facing adapter may translate the canonical Business identity to the external UUID through the existing Business External Mapping boundary.

The public projection itself must not make Supabase the GHM identity authority.

## 10. Construction gate

Construction requires explicit founder approval after review of this contract.

If approved, construction must proceed in this order:

1. Freeze/reconcile the `business.readPublic` contract.
2. Add the distinct public operation to the canonical registry.
3. Implement the smallest qualified projection from existing canonical resources.
4. Add focused repository/service tests.
5. Add live PostgreSQL qualification where visibility and composition require database evidence.
6. Separately freeze the Directory/Search contract before implementing discovery.
7. Run the complete GHM suite and diff-check.
8. Reconcile the exact construction delta against `main`.
9. Founder verifies before mainline promotion.

## 11. Explicit non-authorizations

This contract does not authorize:

- new Business columns for unproven Connect fields
- new directory tables
- geo indexing
- search engine introduction
- storage/media migration
- Supabase routing changes
- Connect production cutover
- shadow traffic
- provider bootstrap changes
- payment/realtime changes
- migration of existing Connect Business records
- modification of existing qualified Business Identity semantics
