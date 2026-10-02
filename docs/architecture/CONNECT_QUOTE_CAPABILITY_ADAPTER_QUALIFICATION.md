# Connect Quote Capability Adapter Qualification

## Status

**CONSTRUCTION QUALIFIED — QUOTE CAPABILITY ADAPTER SUB-SLICE PENDING LOCAL VALIDATION**

## Scope

Connect now has a bounded adapter for the already-qualified GHM Quote resource:

- `quote.read`
- `quote.create`
- `quote.update`

The adapter delegates exclusively to the existing typed `QuoteService`.

## Mapping

- `quote.read` without an ID → `listQuotes`
- `quote.read` with an ID → `getQuote`
- `quote.create` → `createQuote`
- `quote.update` with status → `setQuoteStatus`
- `quote.update` with notes → `setQuoteNotes`

The adapter does not invent quote fields or persistence behavior. Existing QuoteService validation remains authoritative, including customer existence, line-item rules, follow-up date, status and notes handling.

## Boundary controls

- Authorized resource and operation must match the requested capability.
- The adapter consumes only the GHM-derived immutable AuthContext.
- Caller-supplied account/user/role/admin state is not accepted.
- Invalid IDs are rejected before service access.
- Empty quote updates are rejected.
- No SQL, repository, table, or arbitrary method selection is exposed.
- HTTP dispatch is explicitly bounded to Quote capabilities.

## Chain

`Connect service assertion → replay protection → active integration → trusted request context → governed operation → GHM identity/authorization → Quote capability adapter → QuoteService → governed persistence`

## Non-goals

This slice does not authorize auth/session migration, production cutover, QuoteFlow migration, schema changes, generic dispatch, direct DB access, storage, realtime, payments, webhooks, or reopening the existing Quote resource.

## Evidence

Focused tests cover list/read, item read, create, status/notes updates, capability mismatch, invalid identifiers and empty updates. The HTTP route also has a governed-chain Quote read test.

Full test-suite and TypeScript-build success remain required before merge.
