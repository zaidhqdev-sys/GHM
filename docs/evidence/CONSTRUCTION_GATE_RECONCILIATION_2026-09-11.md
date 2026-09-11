# GHM Construction Gate Reconciliation — 2026-09-11

## Purpose

This record reconciles the governed construction state after commit `d35a49d` (`feat: establish governed public Project disclosure boundary`). It does not authorize production deployment, product cutover, provider mutation, DNS/routing changes, credential rotation, or migration of Zaid Connect or QuoteFlow.

## Current qualified state

### Business Identity

- Dedicated `ghm` schema: qualified construction slice.
- Dedicated `ghm_runtime` identity: qualified.
- Dedicated `ghm_migrator` identity: qualified.
- Repository migration runner: qualified.
- Business Identity authorization/runtime boundary: closed for the construction slice.

### Transaction boundary

Transaction Qualification is already recorded as **CLOSED / PASS** for the first canonical Business Identity slice against the relocated `ghm` schema.

The qualified transaction evidence covers:

- atomic duplicate-slug rollback;
- concurrent Business creation serialization;
- transaction commit;
- transaction rollback;
- checked-out client release;
- same-context propagation through `withAuthorizedTransaction`;
- rejection of invalid authentication context before database checkout.

The existence of a later Project or public-disclosure slice does not reopen this primitive. Resource-specific qualification remains required where a resource introduces transaction-sensitive behavior.

### TEMP privilege

The TEMP privilege decision is **CLOSED / NO GRANT REQUIRED** for the current runtime source and qualification harness. No temporary tables or other temporary objects are required by the qualified runtime path.

No `TEMP` privilege is to be granted merely for future convenience.

### Project private resource

The Project private resource is construction-qualified against the dedicated runtime boundary, including:

- authenticated owner binding;
- owner/non-owner read separation;
- owner update rules;
- owner/status immutability;
- input validation;
- closed-project update denial;
- runtime DELETE denial;
- multi-project ownership preservation.

### Project public disclosure

Commit `d35a49d` establishes the separately governed public Project disclosure boundary.

The construction qualification passed:

```text
RUNTIME IDENTITY PASS: ghm_db/ghm_runtime
CLEANUP AUTHORITY PASS: ghm_db/ghm_migrator
PUBLIC PROJECTION VIEW EXISTENCE PASS
PUBLIC PROJECTION COLUMN ALLOWLIST PASS
PUBLIC ACCOUNT OWNERSHIP EXCLUSION PASS
RUNTIME PUBLIC PROJECTION READ PASS
PUBLIC OPEN-ONLY LIFECYCLE PASS
PUBLIC VIEW OPEN-PREDICATE PASS
PUBLIC RESULT DISCLOSURE ALLOWLIST PASS
PUBLIC PROJECTION UPDATE ACL DENIAL PASS
PUBLIC PROJECTION INSERT ACL DENIAL PASS
PUBLIC PROJECTION DELETE ACL DENIAL PASS
PUBLIC SELECT DISCLOSURE PASS
PRIVATE PROJECT OWNERSHIP SEPARATION PASS
PRIVATE/PUBLIC RELATION SEPARATION PASS
PRIVATE PROJECT OWNERSHIP PRESERVATION PASS
GHM PROJECT PUBLIC RUNTIME QUALIFICATION: PASS
```

The HTTP boundary is separately covered by the full automated suite, including anonymous disclosure, authenticated non-owner disclosure, invalid authentication handling, invalid-ID rejection, not-found behavior, and absence of a public mutation surface.

## Provider/bootstrap authority

The provider/bootstrap authority gate remains **OPEN / BLOCKED FOR MUTATION**.

The available construction evidence establishes Render resource/workspace administration but does not establish independent PostgreSQL `postgres` bootstrap authority through the customer-facing control plane. The legacy memberships granted by `postgres` therefore remain unresolved.

The following remain prohibited until independent authority is established:

- revoking the legacy `ghm_db_user` memberships;
- deleting `ghm_db_user`;
- credential rotation performed merely to seek authority;
- destructive legacy cleanup;
- production `DATABASE_URL` changes;
- production cutover.

This limitation does not block separately governed construction resource slices whose database contracts and privileges can be qualified without bootstrap authority.

## Next governed work

The current sequence therefore does **not** require re-running the already-closed Transaction or TEMP gates.

The next construction work may proceed with:

1. reconciliation of product-resource requirements against evidenced source contracts;
2. creation of only the concrete GHM resource slices required by those contracts;
3. dedicated schema migrations and least-privilege grants for each slice;
4. resource-specific repository/service/API qualification;
5. live dedicated-runtime qualification and evidence reconciliation.

Provider/bootstrap cleanup remains an independent blocked gate and must not be approximated through application roles.

## Production safety

Zaid Connect and QuoteFlow remain on Supabase.

No production environment variables, DNS, credentials, routing, traffic, or production data are changed by this reconciliation. No product adapter or cutover authorization is implied.
