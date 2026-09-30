# GHM Business Profile Operation Contract

## Status

**CONSTRUCTION CONTRACT — AUTHORIZED FOR BUSINESS PROFILE TRUST-INPUT EXTENSION**

Extends existing Business Identity `business.updateProfile`. Does not authorize production cutover, adapters, shadow traffic, HTTP product endpoints, or Trust/Saved Business reopen.

## 1. Canonical concept

Business Profile Trust-input parity adds owner-managed descriptive contact fields and protected Trust input columns on `ghm.business`, preserving Business Identity membership authorization (`business.manage` ≡ active owner/administrator).

## 2. Operation surface

Existing operation:

```text
business.updateProfile
```

Allowed patch fields after this slice:

```text
name
slug
description
phone
email
```

Rejected (non-exhaustive protected / unsupported):

```text
insurance_verified
jobs_completed
rating
review_count
profile_views
verification_status
is_verified
is_active
tier
is_featured
logo_url
id
created_at
updated_at
arbitrary column names
```

## 3. Authorization

```text
AuthContext.userId -> active membership on target Business
membership_role IN ('owner', 'administrator')
membership_status = 'active'
```

Denied:

- unauthenticated
- customer without manage membership
- member role
- cross-Business membership
- unrelated accounts

Platform `admin` AuthContext role does not invent Business management without membership.

## 4. Validation

| Field | Rule |
|---|---|
| `name` | required when present; trimmed non-blank |
| `slug` | trimmed non-blank when present |
| `description` | null/omit ok; else length ≤ 5000 |
| `phone` | null/omit/blank→null; else trimmed length 7–32 |
| `email` | null/omit/blank→null; else trimmed length 3–320 and basic email shape |

Empty patch rejected.

## 5. Transaction / privilege boundary

Single authorized transaction calling:

```text
ghm.update_business_profile(context.userId, businessId, patch jsonb)
```

No caller-controlled session GUCs. No blanket runtime UPDATE of profile/protected columns.

## 6. Read surface

Managed/public Business reads may return owner-managed profile fields and protected Trust input columns as persisted state. Public eligibility rules remain unchanged (`is_active` + approved verification for public Business).

## 7. Trust interaction

After profile mutation, Trust calculate (already QUALIFIED / CLOSED) may consume new values. This slice does not change Trust operations, thresholds, or reopen Trust qualification.

## 8. Explicit non-goals

- Owner mutation of protected Trust inputs
- Verification/evidence workflows for insurance/jobs
- Directory/category/geo/logo commercial fields
- HTTP routes beyond any already-qualified Resource API surface
- Production cutover
