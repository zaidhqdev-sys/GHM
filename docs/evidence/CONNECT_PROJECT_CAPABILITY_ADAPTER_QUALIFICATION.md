# Connect Project Capability Adapter Qualification

## Scope

This slice adds the governed Connect adapter and HTTP dispatch path for the canonical GHM Project resource.

Capabilities covered:

- `project.read`
- `project.create`
- `project.update`

The adapter delegates to the existing `ProjectService`; it does not introduce a second persistence owner or bypass Project authorization/service boundaries.

## Authorization boundaries

- Project capability/resource/operation alignment is enforced before dispatch.
- Project identifiers are validated as positive safe integers.
- Project creation and update require customer context.
- Unsupported authorization contexts fail closed before ProjectService access.

## HTTP coverage

The Connect service router validates the supported Project input shapes and dispatches through the governed authorization chain.

The HTTP integration coverage verifies Project create reaches the canonical ProjectService through Connect.

## Regression qualification

Latest local qualification:

- `npm test`
- **476 tests**
- **476 passed**
- 0 failed
- 0 cancelled
- 0 skipped
- 0 todo

## Infrastructure scope

This slice makes no production database migration changes.

It makes no Supabase/provider integration changes and does not alter database privilege boundaries.

## Result

**PASS**

Project is now represented as a governed Connect capability backed by the canonical GHM Project resource/service.
