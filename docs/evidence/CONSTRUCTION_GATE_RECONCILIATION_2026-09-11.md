# GHM Construction Gate Reconciliation — 2026-09-11

## Purpose

This record reconciles the governed construction state after the qualified Enquiry resource slice. It does not authorize production deployment, product cutover, provider mutation, DNS/routing changes, credential rotation, or migration of Zaid Connect or QuoteFlow.

## Current qualified state

### Business Identity

- Dedicated `ghm` schema: qualified construction slice.
- Dedicated `ghm_runtime` identity: qualified.
- Dedicated `ghm_migrator` identity: qualified.
- Repository migration runner: qualified.
- Business Identity authorization/runtime boundary: closed for the construction slice.

### Transaction boundary

Transaction Qualification is **CLOSED / PASS** for the first canonical Business Identity slice against the relocated `ghm` schema.

The qualified transaction evidence covers atomic duplicate-slug rollback, concurrent Business creation serialization, transaction commit, transaction rollback, checked-out client release, same-context propagation through `withAuthorizedTransaction`, and rejection of invalid authentication context before database checkout.

Resource-specific qualification remains required where a resource introduces transaction-sensitive behavior.

### TEMP privilege

The TEMP privilege decision is **CLOSED / NO GRANT REQUIRED** for the current runtime source and qualification harness. No temporary tables or other temporary objects are required by the qualified runtime paths.

No `TEMP` privilege is to be granted merely for future convenience.

### Project private resource

The Project private resource is construction-qualified against the dedicated runtime boundary, including authenticated owner binding, owner/non-owner read separation, owner update rules, owner/status immutability, input validation, closed-project update denial, runtime DELETE denial, and multi-project ownership preservation.

### Project public disclosure

The separately governed public Project disclosure boundary is construction-qualified. Its runtime evidence covers projection existence, approved disclosure-column allowlist, account-ownership exclusion, open-only lifecycle behavior, result disclosure allowlist, runtime mutation denial, private/public relation separation, and private ownership preservation. The HTTP boundary is covered by the automated suite.

### Enquiry resource

The Enquiry construction slice is now **CLOSED / PASS**.

The governing operation contract is `docs/architecture/ENQUIRY_OPERATION_CONTRACT.md`. Enquiry is a customer-to-Business relationship distinct from Project. Canonical identity bindings are `ghm.account_identity.id` for the customer and `ghm.business.id` for the recipient. Initial recipient authorization is limited to an active owner membership.

The live dedicated-runtime qualification passed:

```text
RUNTIME IDENTITY PASS: ghm_db/ghm_runtime
CLEANUP AUTHORITY PASS: ghm_db/ghm_migrator
ENQUIRY CREATE + CUSTOMER BINDING + SNAPSHOT PASS
ENQUIRY OWN READ PASS
ENQUIRY CROSS-CUSTOMER READ DENIAL PASS
ENQUIRY RECEIVED OWNER READ PASS
ENQUIRY CROSS-BUSINESS READ DENIAL PASS
ENQUIRY ADMINISTRATOR READ DENIAL PASS
ENQUIRY MEMBER READ DENIAL PASS
ENQUIRY OWN-BUSINESS CREATE DENIAL PASS
ENQUIRY OWNER STATUS UPDATE PASS
ENQUIRY LIFECYCLE PERSISTENCE PASS
ENQUIRY ADMINISTRATOR STATUS DENIAL PASS
ENQUIRY MEMBER STATUS DENIAL PASS
ENQUIRY CROSS-BUSINESS STATUS DENIAL PASS
ENQUIRY RUNTIME SNAPSHOT UPDATE ACL DENIAL PASS
ENQUIRY RUNTIME RECIPIENT UPDATE ACL DENIAL PASS
ENQUIRY RUNTIME DELETE ACL DENIAL PASS
ENQUIRY RUNTIME STATUS-ON-CREATE ACL DENIAL PASS
ENQUIRY RUNTIME TABLE ACL PASS
GHM ENQUIRY RUNTIME QUALIFICATION: PASS
```

The qualification used the dedicated `ghm_runtime` connection for application behavior and `ghm_migrator` with `SET LOCAL ROLE ghm_schema_owner` for fixture creation and cleanup. No production data or production credentials were used.

The Enquiry runtime table boundary is intentionally least-privilege: table-wide `SELECT` is true while table-wide `INSERT`, table-wide `UPDATE`, and `DELETE` are false. Column-level INSERT permits only the approved create fields, and column-level UPDATE permits only `status`. The qualification explicitly proved denial of snapshot mutation, recipient mutation, DELETE, and client-supplied status on create.

The repository was corrected to respect those grants: create relies on the database default for `status = 'new'`, and status mutation changes only `status` rather than attempting to update `updated_at`.

The qualification harness was corrected to assert the intended table-level ACL boundary rather than incorrectly requiring table-wide INSERT/UPDATE privileges.

## Provider/bootstrap authority

The provider/bootstrap authority gate remains **OPEN / BLOCKED FOR MUTATION**.

The available construction evidence does not establish independent PostgreSQL `postgres` bootstrap authority through the customer-facing control plane. The legacy memberships granted by `postgres` therefore remain unresolved.

The following remain prohibited until independent authority is established:

- revoking the legacy `ghm_db_user` memberships;
- deleting `ghm_db_user`;
- credential rotation performed merely to seek authority;
- destructive legacy cleanup;
- production `DATABASE_URL` changes;
- production cutover.

This limitation does not block separately governed construction resource slices whose database contracts and privileges can be qualified without bootstrap authority.

## Current construction sequence

Business Identity, Transaction, TEMP, Project private/public, and Enquiry resource-specific gates are now qualified as recorded above. The next construction work must proceed from evidenced product-resource requirements and must continue to use dedicated `ghm` schema ownership, least-privilege runtime grants, resource-specific qualification, and evidence reconciliation.

Provider/bootstrap cleanup remains an independent blocked gate and must not be approximated through application roles.

## Production safety

Zaid Connect and QuoteFlow remain on Supabase.

No production environment variables, DNS, credentials, routing, traffic, or production data were changed by this reconciliation. No product adapter or cutover authorization is implied.
