# GHM Business Profile Source Audit

## Status

**SOURCE RECONCILIATION COMPLETE — CONSTRUCTION CONTRACT AUTHORIZED**

Founder-authorized construction slice for Business Profile input parity required by the already-qualified GHM Trust resource. This document does not authorize production migration, cutover, adapters, shadow traffic, or Supabase changes. Trust and Saved Business remain QUALIFIED / CLOSED.

## 1. Canonical product sources

Connect (local audit checkout):

```text
C:\zaid-connect-audit\supabase\migrations\20260718130542_establish_directory_business_contract.sql
C:\zaid-connect-audit\supabase\migrations\20260721170743_establish_trust_and_saved_business_contracts.sql
C:\zaid-connect-audit\src\features\workspace\businessProfileEditor.js
```

GHM evidence:

```text
docs/architecture/TRUST_SOURCE_AUDIT.md
docs/architecture/TRUST_SCHEMA_CONTRACT.md
docs/architecture/TRUST_OPERATION_CONTRACT.md
docs/architecture/BUSINESS_IDENTITY_OPERATION_CONTRACT.md
docs/HANDOVER_2026-09-16.md
```

## 2. Verified Connect field ownership

### Owner-editable (directory UPDATE grant + editor whitelist)

Includes Trust-relevant profile inputs:

```text
description
phone
email
```

Also owner-editable in Connect but **out of scope** for this Trust-input parity slice (not required by Trust calculation): category, location, website, avatar presentation, years_in_business, registration identity fields, etc.

### Forbidden owner edits (Connect `FORBIDDEN_OWNER_EDIT_FIELDS` + comments)

Trust-relevant protected inputs:

```text
insurance_verified   -- "Protected trust attribute owned by the future verification contract."
jobs_completed       -- protected; not in owner UPDATE grant
```

Also forbidden (deny via update vocabulary; do not invent columns if absent on GHM):

```text
rating, review_count, profile_views, verification_status, is_verified,
is_active, tier, is_featured, logo_url, id, owner_id, ...
```

## 3. Trust calculation inputs (Connect)

| Trust dimension | Business source | Owner-mutable? |
|---|---|---|
| profile_complete | `description` non-blank | yes |
| phone_verified | `phone` non-blank | yes |
| email_verified | `email` non-blank | yes |
| insurance_verified | `insurance_verified is true` | **no** |
| completed_projects | `jobs_completed` | **no** |
| reviews_score | `rating` | **no** (Review-owned) |

## 4. Current GHM Business schema audit (pre-extension)

Live `ghm.business` columns before this slice:

```text
id, name, slug, verification_status, is_active, created_at, updated_at,
is_verified, rating, review_count
```

Missing Trust inputs:

```text
description          -- absent
phone                -- absent
email                -- absent
insurance_verified   -- absent
jobs_completed       -- absent
```

Canonical owner remains the Business Identity resource (`business.updateProfile`). No separate `business_profile` resource is required.

## 5. Construction mandate

1. Add only the five missing Trust-input columns.
2. Authorize owner/administrator mutation of `description`, `phone`, `email` (plus existing `name`/`slug`) through a governed update boundary.
3. Persist `insurance_verified` and `jobs_completed` as protected defaults only — no owner mutation authority and no fake verification/evidence workflow.
4. Wire Trust calculation to consume the new columns without changing Trust thresholds or operation vocabulary.
5. Do not reopen Trust or Saved Business qualification.

## 6. Completeness verdict

Connect source establishes a complete ownership boundary for this narrow Trust-input parity extension. Construction may proceed.
