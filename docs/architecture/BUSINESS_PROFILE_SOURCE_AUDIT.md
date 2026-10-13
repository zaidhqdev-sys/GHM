# GHM Business Profile Source Audit

## Status

**HISTORICAL SOURCE AUDIT — CONSTRUCTION COMPLETED AND QUALIFIED**

The source reconciliation recorded here authorized the Business Profile Trust-input schema/owner-update extension, which is now qualified on the consolidated mainline. It did **not** change the Trust calculation function: those dimensions remain deliberately scored as `0` until a separate Trust-scoring change is authorized and qualified. This file is retained as provenance and is not an open gate for the already-qualified profile extension.

Historical record of the Founder-authorized construction slice for Business Profile input parity required by the already-qualified GHM Trust resource. The bounded profile extension is now qualified; this source audit is not a current construction authorization or an open gate. It does not authorize production migration, cutover, adapters, shadow traffic, or Supabase changes. Trust and Saved Business remain QUALIFIED / CLOSED.

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

## 5. Original construction mandate — reconciled against the qualified slice

1. Add only the five missing Trust-input columns.
2. Authorize owner/administrator mutation of `description`, `phone`, `email` (plus existing `name`/`slug`) through a governed update boundary.
3. Persist `insurance_verified` and `jobs_completed` as protected defaults only — no owner mutation authority and no fake verification/evidence workflow.
4. **Trust-scoring reconciliation:** the qualified Business Profile extension is recorded as feeding owner-managed `description`, `phone`, and `email` values into the existing Trust calculation (`profile_complete`, `phone_verified`, and `email_verified`). Protected `insurance_verified` and `jobs_completed` remain default-only and are not owner-mutable. Any further Trust formula, threshold, or protected-input change requires a separate reviewed authorization and qualification.
5. Do not reopen Trust or Saved Business qualification.

## 6. Completeness verdict

Connect source establishes the ownership boundary for this narrow Trust-input parity extension. The five-column schema extension and owner-update boundary are qualified; the existing Trust calculation consumes the three owner-managed profile inputs as recorded by `BUSINESS_PROFILE_QUALIFICATION.md`. Protected verification/job-completion inputs remain default-only. This source audit does not authorize new Trust scoring formulas, threshold changes, evidence workflows, or production cutover.
