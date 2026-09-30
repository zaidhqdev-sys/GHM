# Connect Public Business / Directory Source Audit

**Status:** SOURCE EVIDENCE ONLY — NO CONSTRUCTION AUTHORIZATION  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**GHM reference:** Business Identity first-slice contracts + public projection  
**Date:** 2026-09-18

## 1. Purpose

Reconcile Connect’s authoritative public Business allowlist and directory behavior with GHM’s first-slice public Business projection. No schema or resource implementation is authorized by this document.

## 2. Authoritative Connect public allowlist

Source: `src/lib/lib_supabase.js` `PUBLIC_DIRECTORY_BUSINESS_COLUMNS`.

```text
id, owner_id, name, slug, verification_status, is_verified,
created_at, updated_at, description, category, province, city,
physical_address, latitude, longitude, phone, whatsapp, email,
website, logo_url, avatar_letter, avatar_color, is_active,
is_supplier, tier, is_featured, rating, review_count,
profile_views, jobs_completed, years_in_business, insurance_verified,
registration_status, legal_name
```

### Explicitly excluded from public select

Source comments + migration `20260825190000_remediate_businesses_registration_number_column_privileges.sql`:

- `registration_number`
- `directory_review_submitted_at`
- `directory_review_last_reason`
- `directory_review_last_event_type`

Runtime also strips registration number via `omitPublicRegistrationNumber`.

Private registration identity for managers uses RPC `get_business_registration_identity` (requires `business.manage`).

## 3. Directory operations

Source: `directoryService` in `lib_supabase.js`.

| Operation | Behavior |
|---|---|
| `search` | Public select; requires `verification_status='approved'` and `is_active=true`; filters q/category/province/city/tier; optional client-side lat/lng/radius |
| `getById` / `getBySlug` | Public allowlist select |
| `getFeatured` | approved+active+`is_featured`; order rating |
| `getNearby` | approved+active with coordinates; Haversine filter client-side |
| `getByCategory` / `getByCity` | Delegate to `search` |

Consumers include directory hooks and Business Profile screens.

## 4. Field reconciliation vs GHM first-slice public Business

GHM public projection (SQL contract / `BusinessIdentity`):  
`id`, `name`, `slug`, `verification_status`, `is_active`, `created_at`, `updated_at`  
Service eligibility also requires `verificationStatus === 'approved'`.

| Connect public field | In GHM first-slice public projection? | Notes |
|---|---|---|
| `id` | Yes (bigint vs UUID) | Keyspace mismatch |
| `owner_id` | No | Connect exposes owner UUID publicly |
| `name` | Yes | |
| `slug` | Yes | |
| `verification_status` | Yes | |
| `is_verified` | No as public field | GHM eligibility uses approved/active; `is_verified` not first-slice public column |
| `created_at` / `updated_at` | Yes | |
| `description` | No | |
| `category` | No | Separate Connect category domain also exists |
| `province` / `city` / `physical_address` | No | |
| `latitude` / `longitude` | No | Required for nearby/search distance |
| `phone` / `whatsapp` / `email` / `website` | No | Contact surface |
| `logo_url` / `avatar_letter` / `avatar_color` | No | Media/presentation |
| `is_active` | Yes | |
| `is_supplier` | No | |
| `tier` | No | Commercial-linked presentation |
| `is_featured` | No | Featured directory |
| `rating` / `review_count` | No | Review aggregates exist on GHM Business but not in first-slice public select |
| `profile_views` | No | Analytics domain |
| `jobs_completed` / `years_in_business` | No | |
| `insurance_verified` | No | |
| `registration_status` / `legal_name` | No | Public in Connect allowlist; registration_number remains private |
| `registration_number` | Excluded both sides | Must remain private |

## 5. Search / filter / sort / geo

Connect implements directory query behavior in application SQL filters + client distance math. GHM has no dedicated directory search resource.

Required evidence before any GHM directory construction:

- Which allowlist fields become GHM public columns vs derived projections
- Whether `owner_id` should remain public
- Search indexes and geo strategy (DB vs application)
- Featured/tier filters vs commercial entitlements
- Privacy review for contact fields

## 6. Conclusions

1. Connect public Business surface is **much wider** than GHM first-slice public Business (35 vs 7 fields).
2. GHM does **not** over-expose Connect’s excluded 4A private fields in the first-slice public projection.
3. Directory search/featured/nearby are Connect product requirements evidenced in source; GHM does not yet provide them.
4. Construction of an extended public Business / directory contract requires explicit authorization after field-by-field product decisions.
5. Closed Business Identity first slice remains closed; this audit does not reopen it.
