# GHM Customer Operation Contract

**Status:** CONSTRUCTION CONTRACT — OPERATIONS FROZEN

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

## 12. Qualification gate

Customer is not qualified until repository/service tests and runtime qualification prove the schema, ownership, lifecycle, privilege boundary, no-delete boundary, and Quote-compatible historical behavior.
