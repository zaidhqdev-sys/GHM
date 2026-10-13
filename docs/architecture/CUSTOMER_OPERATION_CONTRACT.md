# GHM Customer Operation Contract

**Status:** CONSTRUCTION QUALIFIED / CLOSED — Customer operations frozen; qualification criteria satisfied on the consolidated mainline

## 1. Initial operation surface

The first GHM Customer capability exposes:

- `read`
- `create`
- `update` — lifecycle only: archive/restore

There is no delete operation and no arbitrary field update operation.

## 2. Create

Input:

- `name`
- optional `phone`
- optional `email`

The authenticated context supplies ownership. The caller cannot select `account_id`.

Create produces:

- generated Customer ID;
- authenticated owner's `account_id`;
- active status;
- generated timestamps.

The service rejects a missing or blank name. Phone/email may be null.

## 3. Read

A non-admin authenticated context may read only Customers owned by its authenticated account/organization.

Admin context may read Customers under the existing GHM administrative boundary.

List supports the canonical `active` / `archived` status filter.

## 4. Archive

Archive is the lifecycle `update` operation.

It changes:

`active → archived`

The operation is owner-scoped for non-admin callers.

No contact fields are changed.

## 5. Restore

Restore is the lifecycle `update` operation.

It changes:

`archived → active`

The operation is owner-scoped for non-admin callers.

## 6. Idempotent lifecycle behavior

Repeated archive or restore requests for an already-target status may return the existing Customer without changing its logical state.

No additional lifecycle states are authorized.

## 7. Transaction boundary

Each repository mutation executes through the authorized transaction helper.

A Customer create is one database transaction.

Archive/restore is one database transaction.

Read operations execute through the same authenticated transaction boundary used by existing GHM resources.

## 8. Authorization boundary

Ownership is derived from authenticated context and enforced in repository predicates.

The service/repository must not accept caller-supplied ownership as authority.

Admin bypass follows the existing GHM authorization convention; it is not a new Customer-specific role.

## 9. Delete boundary

Customer hard delete is deliberately unsupported.

Runtime receives no DELETE privilege.

Historical Customer rows remain available so existing Quotes can retain their Customer relationship after archival.

## 10. Quote dependency

A future Quote create operation must:

1. resolve the Customer within the authenticated owner's scope;
2. require Customer status `active`;
3. snapshot name, phone, and email into the Quote;
4. retain the Customer foreign-key relationship for history.

Customer archival does not cascade into Quote status or content.

## 11. Explicit exclusions

Not authorized by this operation contract:

- arbitrary name/phone/email editing;
- hard delete;
- merge/deduplication;
- global customer lookup;
- authentication for Customers;
- CRM notes;
- consent management;
- invoice/accounting mutations;
- production migration or cutover.

## 12. Qualification record

The original qualification criteria below are satisfied for the bounded Customer construction slice on the consolidated mainline. The schema/acceptance record is preserved in `CUSTOMER_SCHEMA_CONTRACT.md`; broader product-adapter integration and production migration/cutover remain separately gated.

Qualified boundary covers repository/service behavior and runtime qualification for schema ownership, lifecycle, least-privilege access, no-delete behavior, and Quote-compatible historical retention. The criteria in the original gate are historical acceptance evidence, not a current pending qualification.
