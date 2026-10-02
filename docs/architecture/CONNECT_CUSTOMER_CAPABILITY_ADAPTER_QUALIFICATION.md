# Connect Customer Capability Adapter Qualification

## Status

**CONSTRUCTION QUALIFIED — CUSTOMER CAPABILITY ADAPTER SUB-SLICE PENDING LOCAL VALIDATION**

## Scope

This slice adds the Connect-side adapter for the already-qualified GHM Customer resource.

The supported capabilities are:

- `customer.read`
- `customer.create`
- `customer.update`

The adapter delegates only to the existing typed `CustomerService`. It does not create a second Customer resource model, repository, authorization system, or persistence path.

## Capability mapping

- `customer.read` with no `customerId` → `CustomerService.listCustomers`
- `customer.read` with `customerId` → `CustomerService.getCustomer`
- `customer.create` → `CustomerService.createCustomer`
- `customer.update` with status `archived` → `CustomerService.archiveCustomer`
- `customer.update` with status `active` → `CustomerService.restoreCustomer`

Customer update remains deliberately limited to the status transition already owned by the existing Customer service. Name, phone, and email are not invented as a new update contract.

## Security and ownership invariants

1. The requested capability must exactly match the GHM-authorized capability.
2. The authorized resource must be `customer`.
3. The authorized operation must match the capability.
4. The adapter uses the immutable GHM `AuthContext` supplied by authorization binding.
5. No Connect-supplied account ID, user ID, role, or admin flag is accepted.
6. No identity bootstrap occurs in the adapter.
7. No SQL, table name, repository method selection, or arbitrary service selection is accepted from Connect.
8. Invalid customer identifiers fail before resource-service access.
9. The existing Customer service remains authoritative for validation, ownership, and persistence.
10. HTTP dispatch is bounded to the three explicit Customer capabilities; no registry-wide fallback is introduced.

## Transport boundary

The existing Connect service endpoint may dispatch the three Customer capabilities through the established chain:

`service assertion → replay protection → active integration → trusted request context → governed operation → GHM identity/authorization → Customer capability adapter → CustomerService`

The Connect browser-origin rejection, service assertion, replay protection, lifecycle gate, identity mapping, and resource authorization remain owned by their existing qualified boundaries.

## Qualification evidence

Focused automated coverage includes:

- Customer list/read dispatch;
- Customer item read dispatch;
- Customer create input delegation;
- Customer archive/restore update mapping;
- capability mismatch rejection;
- operation mismatch rejection;
- invalid identifier rejection;
- HTTP Customer read dispatch through the full governed chain;
- HTTP Customer create reaching the typed service boundary.

The full test suite and TypeScript build remain merge gates.

## Explicit stop boundary

This slice does not authorize:

- Connect/Supabase auth or session migration;
- production routing or cutover;
- QuoteFlow integration;
- new Customer schema or privilege changes;
- direct product database access;
- generic resource dispatch;
- Customer profile-field mutation beyond the existing status update contract;
- storage, realtime, payments, webhooks, or analytics;
- reopening the already-qualified Customer resource construction.

