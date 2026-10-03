# QuoteFlow Quote Reconciliation

**Status: RECONCILIATION COMPLETE — NO QUOTE ADAPTER AUTHORIZED**

## Evidence

QuoteFlow currently stores quotes locally through AsyncStorage using `quoteflow.quotes.v1`, scoped through its authenticated account/organization storage boundary.

QuoteFlow Quote contains:

- string local `id`
- customer name, phone, email
- optional string `customerId`
- description
- amount
- line items
- follow-up date
- `active | won | lost` status
- local reminder identifier/date
- notes
- creation timestamp

QuoteFlow line items contain local string identifiers and optional local Item identifiers.

GHM already has a canonical `quote` resource with:

- numeric GHM Quote ID
- GHM account ownership
- numeric GHM Customer ID
- customer snapshot fields
- description and calculated amount
- follow-up date
- `active | won | lost` status
- reminder fields
- notes
- persisted quote line items
- optional numeric catalog-item reference
- governed create/read/list/status/notes operations
- authenticated account ownership enforcement

The field/status overlap is substantial, but it is not sufficient by itself to authorize cross-system replacement.

## Ownership and identity boundary

QuoteFlow Quote is scoped by the QuoteFlow authenticated user/organization storage boundary.

GHM Quote is owned by the GHM account identity and requires a GHM Customer relationship. QuoteFlow Customer is currently reconciled as local/device-owned and is not authorized to map to GHM Customer.

Therefore QuoteFlow's current `customerId` cannot be treated as a GHM Customer ID. The two identifier spaces are different, and no cross-system customer mapping authority currently exists.

Likewise, QuoteFlow's organization is not yet authorized to map to a GHM Business/account for Quote ownership. The existing QuoteFlow identity-link authority contract explicitly keeps that mapping unqualified.

## Reconciliation result

The two Quote domains are structurally similar and GHM has a materially corresponding resource, but the required ownership and foreign-key mappings are not yet authorized.

**QuoteFlow Quote → GHM Quote: NOT YET AUTHORIZED.**

No adapter should be implemented until the identity, tenant, customer, and migration boundaries are explicitly qualified.

## Required future authority

A future Quote adapter/migration contract must establish:

1. QuoteFlow user/account → GHM account mapping.
2. QuoteFlow organization → GHM Business/tenant mapping, if Business ownership is required.
3. QuoteFlow Customer → GHM Customer mapping or a deliberate canonical-customer strategy.
4. Stable identifier translation for Quote, Customer, line item, and Item/catalog references.
5. Canonical ownership and authorization for create/read/list/update operations.
6. Treatment of locally stored quotes created before any cross-system mapping exists.
7. Item/catalog relationship semantics.
8. Reminder ownership and notification boundary.
9. Status and notes mutation authority.
10. Duplicate detection, idempotency, concurrency, migration, recovery, shadow qualification, rollback, and cutover.

## Important semantic differences

QuoteFlow uses local string IDs for quotes, customers, line items, and items.

GHM uses numeric identifiers and persists Quote line items independently.

QuoteFlow line items can reference local Items through `itemId`; GHM Quote line items can reference a GHM catalog item through `catalogItemId`. These references cannot be translated by shape alone.

QuoteFlow reminders are device-local notification state. GHM Quote stores reminder metadata, but this does not establish that GHM should own QuoteFlow's current device notification behavior.

## What is not authorized

Do not:

- cast or copy QuoteFlow IDs into GHM numeric identifiers;
- map customers by name, phone, or email;
- infer GHM account ownership from QuoteFlow organization membership;
- infer QuoteFlow organization ↔ GHM Business from names or subscription state;
- create a Quote adapter;
- migrate existing local quotes;
- replace AsyncStorage with GHM;
- create mapping tables solely to make the adapter work;
- introduce production routing, shadow traffic, or cutover.

## Construction conclusion

GHM Quote is sufficiently similar to warrant a dedicated future adapter contract, but current cross-system identity and customer ownership authorities are incomplete.

The current QuoteFlow Quote remains local/device-owned.

This reconciliation changes no application logic, database schema, provider configuration, production routing, shadow traffic, or cutover.
