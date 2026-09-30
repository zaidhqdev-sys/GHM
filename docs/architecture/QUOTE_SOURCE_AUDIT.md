# QuoteFlow Quote Source Audit — QuoteFlow → GHM

**Status:** SOURCE AUDIT — RECONCILED / CONSTRUCTION AUTHORIZED

## Scope

This audit establishes the production QuoteFlow Quote contract before construction of a provider-neutral GHM Quote resource.

## Production source of truth

Primary sources in `zaidhqdev-sys/QuoteFlow`:

- `src/types.ts`
- `src/lib/quoteStorage.ts`
- `src/state/QuotesContext.tsx`
- `src/screens/NewQuoteScreen.tsx`
- `src/screens/QuoteDetailScreen.tsx`
- `src/lib/accountStorage.ts`

Related downstream source:

- `src/state/InvoicesContext.tsx`
- `src/lib/invoiceStorage.ts`
- `src/lib/invoiceMath.ts`

## Ownership / account boundary

QuoteFlow persistence is scoped by `getAccountStorageKey('quoteflow.quotes.v1')`.

The account storage key resolves to:

1. active organization scope when an organization is active;
2. otherwise authenticated user scope;
3. otherwise authentication is required and persistence fails.

Therefore the canonical GHM Quote resource is account/organization-owned. This audit does not infer that GHM's existing `business` role is the Quote owner merely because a generic `quote` authorization vocabulary already exists.

## Canonical Quote fields

The production Quote model contains:

- `id`
- `customerName`
- `phone`
- `customerEmail`
- `customerId`
- `description`
- `amount`
- `lineItems`
- `followUpDate`
- `createdAt`
- `status`
- `reminderId`
- `reminderDate`
- `notes`

Status vocabulary is exactly:

```text
active
won
lost
```

## Customer relationship

A Quote requires selection of a registered active Customer before creation.

The Quote stores both:

- `customerId`, identifying the selected registered Customer;
- customer name, phone, and email snapshots copied from that Customer at quote creation.

The source does not authorize replacing `customerId` or customer snapshots through the existing Quote mutation surface. GHM must not invent customer reassignment semantics in the initial slice.

Customer itself is a separate account-scoped resource in QuoteFlow. It has:

- `id`
- `name`
- `phone`
- `email`
- `createdAt`
- `status` (`active` or `archived`)

## Line items and amount

A new Quote starts with at least one line item. Each line item contains:

- `id`
- `description`
- `quantity`
- `unitPrice`
- optional `itemId`

Quote creation requires every submitted line item to have a non-empty description, quantity greater than zero, and unit price greater than zero.

The Quote total/amount is derived from the line-item subtotal at creation time. Saved catalogue Items can populate a line item, but the Quote stores its own line-item snapshot and is not dependent on the catalogue Item remaining active.

The production source uses the line-item subtotal directly for the Quote `amount`. GHM must preserve the established arithmetic semantics and must not introduce a different rounding rule without further source evidence.

## Description

The Quote `description` is generated at creation from the submitted line-item descriptions joined by `, `. It is therefore a presentation/search summary derived from the quote's line items, not an independent free-form creation field in the current UI.

## Follow-up

`followUpDate` is required and must be a valid `YYYY-MM-DD` date key.

QuoteFlow schedules a reminder for active Quotes. Reminder scheduling is application behavior; the reminder identifier/date are persistence metadata associated with that scheduling result.

The initial GHM Quote capability must not become a notification scheduler or provider-specific reminder implementation.

## Lifecycle behavior

The observed QuoteFlow mutation surface is:

- create Quote;
- set Quote status;
- set Quote notes;
- read Quote / read Quote history.

Allowed statuses are `active`, `won`, and `lost`.

Observed status behavior:

- `active` → `won` is supported;
- `active` → `lost` is supported;
- `won`/`lost` → `active` is supported as Reopen;
- reopening preserves the existing follow-up date and schedules a reminder again;
- changing status cancels the existing reminder and clears reminder metadata before scheduling a replacement when applicable.

The source does not establish a more restrictive transition graph than the available status operations. GHM must not invent additional lifecycle states or transition rules.

## Notes

Notes are mutable independently of status. The production mutation surface exposes `setQuoteNotes(id, notes)` and persists the resulting quote.

No separate note resource is evidenced by QuoteFlow.

## Invoice boundary

Invoice creation is explicitly downstream of Quote lifecycle:

- an invoice may be created only when the Quote is `won`;
- repeated invoice creation for the same Quote returns the existing invoice;
- the invoice stores a snapshot of customer/contact/line-item/amount data.

Invoice is therefore a separate capability. It must not be folded into the initial GHM Quote schema or Quote mutation contract.

## External contact behavior

QuoteFlow can open WhatsApp or the device dialler using the Quote phone number. It does not send messages or place calls on the user's behalf.

This is presentation/device behavior and is outside the GHM Quote resource.

## Explicit exclusions

The initial GHM Quote capability does not include:

- Invoice;
- PDF generation;
- WhatsApp sending;
- calling;
- notification scheduling infrastructure;
- catalogue Item ownership;
- Customer CRUD;
- speculative Quote editing of customer identity;
- provider-specific AsyncStorage behavior;
- production QuoteFlow migration or cutover.

## Construction boundary

Construction is authorized for an account/organization-owned `ghm.quote` resource representing the evidenced QuoteFlow Quote contract.

The initial provider-neutral slice should contain only the persisted Quote state and operations directly evidenced by the production source.

No change to QuoteFlow production is authorized by this audit.
