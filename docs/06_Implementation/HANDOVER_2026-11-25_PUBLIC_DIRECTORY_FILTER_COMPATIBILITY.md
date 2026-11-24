# GHM handover — public Directory filter compatibility
Date: 2026-11-25

## Objective
Keep the existing Connect Marketplace behavior while replacing its Supabase backend dependency with GHM. This is a narrow compatibility correction, not a redesign or new product gate.

## Source finding
- GHM main public directory route in src/http/app.ts previously allowed q/category/province/city/geo/sort/page/pageSize but rejected businessType.
- The Directory contract and PostgreSQL repository already support businessType: suppliers|contractors; the repository filters canonical ghm.business.is_supplier.
- GHM PR #243 contained route-parser support and HTTP tests, but remains draft/unmerged and stacked with other work. Do not merge it wholesale for this isolated fix.
- Connect's active Marketplace listing still queries Supabase and preserves approved + verified + active visibility, search, category, province, supplier/contractor filter, count, and ordering by featured then rating then creation date.

## Implemented in this focused branch
Branch: fix/public-directory-business-type-filter-20261125
- src/http/app.ts: allow businessType; validate exactly suppliers or contractors; pass it to Directory service.
- src/http/app.test.ts: cover supplier query parsing, contractor query parsing and rejection of unknown values.
- Code commits:
  - 268802d0d8cf1bf92a7c95673442748530f9e4d4 — route compatibility.
  - 3b19843c10ea539115faf4bfda0aeb5a126c76d3 — HTTP contract coverage.
- Draft PR: #308.

## Remaining parity before Connect Marketplace listing cutover
Legacy Marketplace orders is_featured DESC, rating DESC, created_at DESC. Current GHM Directory repository orders by rating/review count (or requested supported sort); it has no canonical featured projection or governed feature/unfeature workflow. Do not infer featured status from Trust, verification, subscription, review or supplier classification. This remains a real product-parity gap to resolve from the pre-GHM baseline, not a reason to redesign the Marketplace.

## Validation boundary
- Route and regression test changes are committed.
- No local full GHM test suite or exact-head CI result is claimed.
- No production runtime verification has been performed.
- Existing GitHub Actions allowance limitation remains documented; do not blindly rerun while exhausted.

## Safety / scope
No production DB migration, production data mutation, Render deployment/configuration, secrets, service creation, paid infrastructure, PayFast activation or Connect cutover was performed. Existing branches and PRs #243/#244, Connect #68/#70/#71 remain untouched.
## 2026-11-25 — Featured listing parity investigation

Rechecked current Connect main and GHM main before continuing.

### Original Connect behavior confirmed
- Connect main `84d7edb64346f1b698f9b76bcb54d2e653df1292`, `src/features/marketplace/marketplaceService.js`: public listing selects approved, verified and active businesses; optional search/category/province/supplier filter; exact count; order is `is_featured DESC`, `rating DESC`, `created_at DESC`.
- Connect main `src/supabase/supabase_schema.sql`: Business columns include `is_featured boolean default false` and `featured_until timestamptz`. The Business tier enum also contains `featured`, but this is not equivalent to the listing flag and must not be substituted.
- Marketplace UI consumes `business.is_featured` to mark featured cards. This is observable product behavior, not merely an internal sort preference.

### GHM main behavior confirmed
- GHM `src/resources/directory/repository.ts` selects canonical business fields and filters `is_supplier`; no `is_featured` or `featured_until` projection, active feature lifecycle or featured-first ordering is present in this repository.
- GHM `DirectoryQuery` supports supplier/contractor filtering but has no featured filter/order contract.
- PR #308 only repairs HTTP parsing for businessType. It does not deliver featured parity.

### Next required backend work
- Inspect canonical GHM Business schema/migrations and existing admin/owner governance before choosing where a featured flag and expiry belong. Do not infer or copy the legacy Supabase value into production without a source-of-truth migration plan.
- Preserve `is_featured` display data and `featured_until` expiry semantics in the GHM public Directory response; expired features must not remain featured.
- Preserve featured-first ordering, then rating, then creation time, with stable pagination and count.
- Find the existing legitimate authority that sets/unsets featured status. Do not create a browser-writable flag or grant ordinary Business owners/admin clients direct DB mutation.
- Once GHM endpoint and authority exist, update Connect Marketplace client and UI mapping, remove Supabase listing reads, and add exact contract coverage.

### Current status
- Investigation only; no featured schema or write API has been added yet.
- No GHM PR #308 merge, Connect Marketplace cutover, DB migration, production data write, deploy or service change.
- Keep PR #308 draft until its exact-head CI is available and then integrate it with the smallest safe change.