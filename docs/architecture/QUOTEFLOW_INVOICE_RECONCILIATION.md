# QuoteFlow Invoice Reconciliation

**Status: RECONCILIATION COMPLETE — NO INVOICE ADAPTER AUTHORIZED**

## Evidence

QuoteFlow Invoice is stored locally through AsyncStorage using `quoteflow.invoices.v1`, scoped through the authenticated account/organization storage boundary.

Current QuoteFlow Invoice fields include:

- local string `id`
- local `quoteId`
- invoice number
- customer name, phone, email
- description
- amount
- line items
- nullable tax rate
- invoice date
- due date
- `unpaid` status

Invoice numbers are generated locally from the local invoice collection.

The current GHM repository search found no qualified Invoice resource, invoice table, invoice HTTP surface, invoice repository/service, or invoice-specific commercial domain corresponding to QuoteFlow Invoice.

## Reconciliation result

QuoteFlow Invoice is currently a product-local invoicing domain.

It cannot be mapped to GHM Quote merely because it contains a `quoteId`. An invoice is a distinct business document with its own numbering, dates, tax semantics, payment state, and customer/document relationships.

GHM's provider-neutral commercial payment foundation is also not an invoice resource and must not be repurposed as one without a separate contract.

**QuoteFlow Invoice → GHM: NOT YET AUTHORIZED.**

## What is not authorized

Do not:

- treat QuoteFlow Invoice as a GHM Quote;
- infer invoice ownership from QuoteFlow organization identity;
- infer customer identity from the local QuoteFlow customer/quote IDs;
- create a GHM Invoice resource solely to mirror QuoteFlow;
- attach invoice state to GHM commercial payment preparation without an explicit invoice contract;
- migrate local invoices;
- build an invoice adapter;
- introduce production routing, shadow traffic, or cutover.

## Required future authority

If invoicing is eventually moved behind GHM, a dedicated contract must establish:

- canonical invoice ownership and tenant;
- relationship to canonical Quote and Customer;
- invoice numbering authority and uniqueness;
- line-item snapshot semantics;
- tax authority and calculation semantics;
- issue/due-date semantics;
- payment status and lifecycle;
- credit notes/voids/refunds, if applicable;
- accounting/audit requirements;
- document generation/storage ownership, if applicable;
- idempotency, concurrency, migration, recovery, shadow qualification, rollback, and cutover.

## Construction conclusion

Keep QuoteFlow Invoice local.

This reconciliation changes no application logic, database schema, provider configuration, production routing, shadow traffic, or cutover.
