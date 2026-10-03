# Connect Opportunity Capability Adapter Qualification

## Scope

This slice adds the governed Connect adapter and HTTP dispatch path for the canonical GHM Opportunity resource.

Capabilities covered:

- `opportunity.read`
- `opportunity.create`
- `opportunity.update`
- `opportunity.transition`

The adapter delegates to the existing `OpportunityService`; it does not introduce a second persistence owner or bypass Opportunity authorization/service boundaries.

## Authorization and validation

- Connect authorization must resolve the Opportunity resource/capability/operation before dispatch.
- Capability/resource/operation alignment is enforced by the adapter.
- Opportunity identifiers are required to be positive safe integers.
- Unsupported or mismatched capabilities fail closed before service access.
- HTTP input is restricted to the fields supported by the canonical Opportunity contracts.
- Lifecycle transition status is explicitly validated before dispatch.

## HTTP coverage

Connect HTTP integration coverage verifies Opportunity create and transition reach the canonical OpportunityService through the governed Connect service chain.

## Regression qualification

Latest local qualification:

- `npm test`
- **484 tests**
- **484 passed**
- 0 failed
- 0 cancelled
- 0 skipped
- 0 todo

## Infrastructure scope

This slice makes no production database migration changes.

It makes no Supabase/provider integration changes and does not alter database privilege boundaries.

## Result

**PASS**

Opportunity is now represented as a governed Connect capability backed by the canonical GHM Opportunity resource/service.
