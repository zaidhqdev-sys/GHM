# QuoteFlow Customer Reconciliation

**Status: RECONCILIATION COMPLETE — NO CUSTOMER ADAPTER AUTHORIZED**

## Evidence

QuoteFlow currently stores customers in device-local AsyncStorage through `src/lib/customerStorage.ts`.

The current QuoteFlow customer shape is:

- string `id`
- `name`
- nullable `phone`
- nullable `email`
- `createdAt`
- `status`: `active | archived`

The storage key is account-scoped through QuoteFlow's active organization/user storage boundary. This is local product state; the source does not establish a remote QuoteFlow customer table or server-authoritative customer identity.

GHM already has a canonical `customer` resource with:

- numeric GHM customer ID
- canonical GHM account ID
- name, phone, email
- `active | archived` status
- created/updated timestamps
- create/read/list/archive/restore operations
- authenticated GHM authorization
- admin visibility and non-admin account ownership enforcement

## Reconciliation result

The domains are related but are **not yet proven to be the same canonical resource**.

The most important ownership mismatch is:

- QuoteFlow local customer data is scoped by the active QuoteFlow organization when an organization is selected.
- GHM Customer is currently owned by a GHM account identity, not by a GHM Business.

The previously qualified QuoteFlow identity mapping establishes that QuoteFlow user UUID and QuoteFlow organization UUID cannot be inferred to GHM account or Business identifiers. The identity-link authority boundary also remains unqualified.

Therefore an adapter that silently maps a QuoteFlow organization customer to a GHM account-owned customer would create an unauthorized ownership relationship.

## What is established

1. GHM Customer is an existing qualified canonical GHM resource.
2. QuoteFlow Customer is currently local/device-owned product data.
3. QuoteFlow customer status vocabulary is compatible with the current GHM active/archived vocabulary.
4. Field names and basic customer semantics overlap.
5. Identifier types and lifecycle timestamps differ.
6. QuoteFlow does not currently establish a durable cross-system customer ID.
7. No evidence establishes that one QuoteFlow customer must correspond one-to-one with one GHM customer.

## What is not authorized

Do not:

- add QuoteFlow IDs directly to GHM Customer;
- add GHM IDs to QuoteFlow local records as an inferred mapping;
- map by email, phone, name, or organization name;
- reinterpret QuoteFlow organization ownership as GHM account ownership;
- create a customer adapter merely because both products have a Customer concept;
- migrate local QuoteFlow customers into GHM without an explicit migration/mapping contract;
- make GHM Customer production-authoritative for QuoteFlow;
- begin shadow qualification or cutover.

## Required future authority

Before a QuoteFlow Customer adapter or migration can be qualified, a separate contract must establish:

- the canonical cross-system customer relationship;
- whether the customer is owned by a GHM Account, Business, or another canonical owner;
- how QuoteFlow organization membership maps to that owner;
- create/read/update/archive authority;
- stable cross-system identifiers;
- duplicate and merge behavior;
- handling of existing local QuoteFlow customers;
- authorization and privacy boundaries for phone/email;
- idempotency and concurrency;
- migration/recovery behavior;
- shadow qualification and rollback.

## Construction conclusion

**QuoteFlow Customer → GHM Customer: NOT YET AUTHORIZED.**

The correct current boundary is to leave QuoteFlow customer persistence local and GHM Customer independent until the ownership and cross-system mapping authority are explicitly qualified.

This reconciliation does not alter either product and does not authorize production routing or cutover.
