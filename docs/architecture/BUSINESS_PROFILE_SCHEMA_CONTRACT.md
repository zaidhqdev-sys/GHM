# GHM Business Profile Schema Contract

**Status:** CONSTRUCTION CONTRACT — SCHEMA DESIGN FROZEN

## 1. Purpose

Extend `ghm.business` with the missing Trust calculation input columns reconciled from Connect, without inventing a second Business identity relation.

Does not authorize production migration, cutover, adapters, or Supabase changes.

## 2. Canonical relation

```text
ghm.business
```

Canonical resource remains Business Identity (`business`).

## 3. Columns added by this slice

| Column | Type | Nullability | Default | Ownership |
|---|---|---|---|---|
| `description` | `text` | NULL | none | owner-managed profile |
| `phone` | `text` | NULL | none | owner-managed profile |
| `email` | `text` | NULL | none | owner-managed profile |
| `insurance_verified` | `boolean` | NOT NULL | `false` | protected Trust input |
| `jobs_completed` | `integer` | NOT NULL | `0` | protected Trust input |

Constraints (Connect-aligned):

```text
description IS NULL OR length(description) <= 5000
phone IS NULL OR length(btrim(phone)) BETWEEN 7 AND 32
email IS NULL OR length(btrim(email)) BETWEEN 3 AND 320
jobs_completed >= 0
```

## 4. Preserved existing columns

Do not re-add or duplicate:

```text
name, slug, verification_status, is_verified, is_active,
rating, review_count, created_at, updated_at
```

`rating` / `review_count` remain Review-owned aggregates.

## 5. Explicitly not added

Out of Trust-input scope for this slice:

```text
category, province, city, physical_address, latitude, longitude,
whatsapp, website, logo_url, avatar_letter, avatar_color,
tier, is_featured, profile_views, years_in_business,
registration_*, legal_name, owner_id
```

## 6. Runtime privilege boundary

- Runtime retains SELECT on `ghm.business`.
- Runtime does **not** retain table-level UPDATE on `ghm.business`.
- Runtime UPDATE is limited to Review-owned aggregates: `rating`, `review_count`, `updated_at`.
- Runtime must **not** UPDATE:
  - `description`, `phone`, `email`, `name`, `slug` (mutated only via governed function)
  - `insurance_verified`, `jobs_completed` (never via Business profile mutation)
  - lifecycle/verification fields (`verification_status`, `is_verified`, `is_active`, …)
- Profile mutation is exposed only through:

```text
ghm.update_business_profile(p_account_id, p_business_id, p_patch jsonb)
```

SECURITY DEFINER, owned by `ghm_schema_owner`, EXECUTE to `ghm_runtime`.

## 7. Trust calculation binding

`ghm.calculate_business_trust_score` consumes Connect formulas against these Business columns. Scoring thresholds and Trust operation vocabulary are unchanged.

## 8. Explicit non-goals

- Fake verification/evidence authority to populate protected fields
- Separate `business_profile` table/resource
- Public HTTP product endpoint
- Production/cutover/adapter/shadow
- Reopening Trust or Saved Business
