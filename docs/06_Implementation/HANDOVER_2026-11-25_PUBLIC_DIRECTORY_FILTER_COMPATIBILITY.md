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