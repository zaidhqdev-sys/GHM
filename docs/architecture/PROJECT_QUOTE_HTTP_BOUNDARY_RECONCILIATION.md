# Project Quote HTTP Boundary Reconciliation

## Scope

This slice exposes the already-qualified Project Quote domain through HTTP. It does not reopen the Project Quote domain/runtime.

## Canonical operations

The HTTP surface is derived from the existing ProjectQuoteService contract:

- readReceived
- readOwn
- create
- update
- accept
- reject

No additional domain operation is introduced.

## HTTP boundary

- Customer: receive/read Project Quotes for owned Projects and make explicit accept/reject decisions.
- Business: read its own submitted quotes, create quotes, and update editable submitted quotes.
- IDs are positive safe integers.
- Create/update inputs reject unknown/server-owned fields.
- Accept/reject are explicit endpoints with empty request bodies.
- Authentication, resource registration, and role narrowing are checked before service invocation.
- Persistence remains authoritative for ownership, project state, business eligibility, quote state, and decision side effects.

## Deliberately excluded

No arbitrary status mutation, deletion, provider/payment integration, or new domain transition was added.

## Authorization reconciliation

Project Quote is an existing resource contract and therefore receives an explicit project_quote authorization resource and registry definition in this HTTP slice. The HTTP routes additionally narrow customer/business responsibilities per the canonical repository authority.

## Qualification

See docs/evidence/PROJECT_QUOTE_HTTP_QUALIFICATION.md.
