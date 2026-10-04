# GHM Business Profile Qualification

## Status

**QUALIFIED / CLOSED**

Business Profile Trust-input parity and durable tenant-boundary adoption are qualified and closed. Trust Score and Saved Business remain QUALIFIED / CLOSED and are not reopened.

## Command

```text
npm run qualify:business-profile-runtime
```

## Result

```text
GHM BUSINESS PROFILE RUNTIME QUALIFICATION: PASS
```

## Verified

Positive:

- owner update of `description`, `phone`, `email`;
- administrator update of permitted profile fields;
- authenticated updates resolve the canonical tenant through `resolveTenantContext` on the same PostgreSQL transaction used for the mutation;
- cross-Business update denial occurs at the durable tenant boundary;
- caller cannot select or rebind tenant identity through the profile mutation;
- persisted reconciliation;
- Trust calculation consumes owner-managed profile values (`profile_complete` / `phone_verified` / `email_verified`).

Negative:

- unauthenticated / customer / member / cross-Business update denial;
- owner denial for protected fields (`insurance_verified`, `jobs_completed`, `rating`, `review_count`, `profile_views`, `verification_status`, `is_verified`, `is_active`, `tier`, `is_featured`, `logo_url`);
- runtime direct UPDATE denial for profile and protected columns;
- concurrent profile updates remain authorized and non-malformed.

Privilege:

- runtime cannot CREATE in schema `ghm`;
- runtime UPDATE limited to Review aggregates (`rating`, `review_count`, `updated_at`);
- profile mutation EXECUTE-only via `ghm.update_business_profile`.

## Automated suite

```text
npm run build
npm test
git diff --check
```

Result: `520/520` automated tests passed on the tenant-adoption branch; runtime qualification passed; `git diff --check` clean.

## Explicit limitations

- Protected Trust inputs remain default-only; no verification/evidence authority invented;
- directory/geo/logo/commercial Business fields remain out of scope;
- no adapter, shadow, cutover, or production claim;
- Trust scoring thresholds and Trust operation vocabulary unchanged.
