# GHM Connect Public Business / Directory Contract

**Status:** PUBLIC BUSINESS READ + DIRECTORY V1 CONSTRUCTION QUALIFIED / PASS — MERGED VIA PR #10; PRODUCT CUTOVER REMAINS SEPARATELY GATED  
**Source:** Connect audited at `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Historical GHM contract-drafting baseline:** `0e589d57e2d7da991bfc4420ff23fe9db454248a` (qualification and implementation were subsequently merged to `main` in PR #10).

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

GHM exposes a distinct `business.readPublic` projection rather than treating the managed Business Identity object as the public directory response.

The first construction slice is intentionally limited to fields already owned by `ghm.business` and proven safe for public disclosure:

- canonical GHM `businessId`
- `name`
- `slug`
- `description`
- `phone`
- `email`
- `rating`
- `reviewCount`
- `jobsCompleted`
- `verificationStatus`
- `isVerified`
- `createdAt`
- `updatedAt`

The projection enforces the existing public visibility predicate: active Business, verified Business, and approved verification status.

Trust, reviews, categories, capabilities, and hours remain separate qualified public resources. They are not duplicated or implicitly embedded into this first projection slice. A later composed public Business response may consume those existing boundaries only after an explicit contract and qualification prove the response shape and authorization semantics.

The projection must not expose private membership, owner identity, protected verification details, moderation data, or provider-specific identifiers.

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

This contract defines the current bounded directory slice and does not itself authorize geo/radius search or expanded discovery filters. The separate Connect migration reconciliation classifies the confirmed product-parity work as **Extend**, subject to an explicit implementation decision, canonical field ownership, and updated contract/acceptance evidence.

## 8. No schema invention

Do not create columns or tables for Connect fields solely to reproduce the current Supabase response.

If a field has no canonical GHM owner, it remains an explicit gap or provider-local concern until a separate architecture decision establishes ownership.

Do not create a generic `business_directory` table merely to mirror Connect.

Do not duplicate rating, review count, Trust, category, capability, or hours into a second projection table unless a later performance architecture decision explicitly requires materialization.

## 9. Provider boundary

Connect's Supabase UUID remains an external identifier.

GHM public responses must use canonical GHM identifiers internally. Any Connect-facing adapter may translate the canonical Business identity to the external UUID through the existing Business External Mapping boundary.

The public projection itself must not make Supabase the GHM identity authority.

## 10. Construction qualification and current boundary

The public `business.readPublic` projection and Directory v1 construction were founder-authorized, qualified, and merged to `main` in PR #10 (`09bdef2039b80d73244b7f3026f3c4413e2227c5`). The recorded evidence included a passing build, 409/409 full-suite tests, migration/provenance checks, and live PostgreSQL directory qualification covering public visibility, rating order, category UUID/slug, text search, wildcard escaping, pagination/stable ordering, projection allowlist, and runtime dependency privileges.

The numbered construction sequence below is retained as historical implementation provenance, not as an outstanding pre-merge checklist. The qualification does not authorize production product cutover, provider migration, shadow routing, backfill, or schema mutation beyond the qualified construction slice.

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
