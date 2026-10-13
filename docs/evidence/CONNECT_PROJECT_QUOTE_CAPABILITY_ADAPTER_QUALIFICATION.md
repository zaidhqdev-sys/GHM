# Connect Project Quote Capability Adapter Qualification

## Scope

This slice exposes the existing canonical Project Quote resource through the governed Connect service boundary.

Capabilities:

- `project_quote.readReceived`
- `project_quote.readOwn`
- `project_quote.create`
- `project_quote.update`
- `project_quote.accept`
- `project_quote.reject`

## Ownership

The canonical owner remains `ProjectQuoteService`.

The Connect adapter performs only:

- capability/operation alignment checks
- Connect role checks
- positive identifier validation
- delegation to the canonical service

No Project Quote repository, persistence model, migration, provider, Supabase, or database privilege changes are introduced.

## Role boundary

- customer: read received quotes, accept, reject
- business: read own quotes, create, update

Role mismatches fail before service access.

## HTTP boundary

The Connect service router now:

1. validates the registered Project Quote operation through the existing governed authorization path;
2. parses only operation-specific fields;
3. rejects malformed/unknown input;
4. dispatches to the Project Quote adapter;
5. preserves the existing fail-closed behavior for unsupported Connect resources.

## Original qualification gate — historical

The following checklist records the original branch's pre-merge requirements, not a current hold on the merged mainline slice:

- TypeScript build passes.
- Full `npm test` suite passes.
- Project Quote adapter tests pass.
- Connect HTTP dispatch test passes.
- No migration/provider/Supabase/privilege changes.
- Founder merge gate remains explicit.

## Current bounded status — 2026-10-12

The adapter is integrated on `main`. The later repository-wide checkpoint passed 557/557 tests, after this evidence record was originally written. The old “awaiting local qualification and founder merge gate” status is historical and does not mean the merged construction slice should be reopened.

**Status: integrated construction adapter; production exposure, end-to-end workflow parity, and cutover remain separately gated.**
