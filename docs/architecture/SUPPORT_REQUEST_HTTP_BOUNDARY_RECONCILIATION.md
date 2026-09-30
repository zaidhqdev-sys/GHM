# Support Request HTTP Boundary Reconciliation

**Status:** CONSTRUCTION RECONCILED — 2026-09-30
**Branch:** `construction/support-request-http-api`
**Base:** `construction/trust-score-http-api`

## Authority checked

The HTTP construction was audited against the canonical Support Request sources before implementation:

- `src/resources/support-request/contracts.ts`
- `src/resources/support-request/service.ts`
- `src/resources/support-request/repository.ts`
- `src/resources/registry.ts`
- `src/auth/authorization.ts`
- `docs/architecture/SUPPORT_REQUEST_OPERATION_CONTRACT.md`
- existing HTTP router conventions on the cumulative construction branch.

No Support Request domain, schema, repository, service, or runtime privilege was reopened.

## Exact HTTP surface

| HTTP surface | Canonical service operation | Authority |
|---|---|---|
| `GET /api/v1/support-requests` | `listSupportRequests` | customer/admin |
| `GET /api/v1/support-requests/:requestId` | `getSupportRequest` | customer/admin |
| `POST /api/v1/support-requests` | `createSupportRequest` | customer only |
| `PATCH /api/v1/support-requests/:requestId/status` | `updateSupportRequestStatus` | admin only |
| `GET /api/v1/support-requests/:requestId/messages` | `getMessages` | customer/admin |
| `POST /api/v1/support-requests/:requestId/messages` | `replyAsCustomer` / `replyAsAdmin` | authenticated customer/admin by role |

The message reply endpoint dispatches to the exact role-specific service operation. It does not accept caller-controlled `senderKind`.

## Authorization reconciliation

The resource registry exposes:

`read, create, updateStatus, readMessages, replyAsCustomer, replyAsAdmin`

The HTTP layer checks the registered operation and resource access. It additionally enforces the role boundary that is not expressible by the broad resource registry:

- customer: create, read/list, read messages, customer reply;
- admin: read/list, read messages, status mutation, admin reply;
- business: no Support Request HTTP access.

The underlying repository remains authoritative for ownership and Business membership checks.

## Input boundary

HTTP parsing accepts only source-authorized caller fields.

Create:

- `businessId?`
- `category`
- `subject`
- `description`

Status:

- `status`
- `resolutionSummary?`

Reply:

- `body`

Server-owned fields such as account identity, priority, timestamps, resolution timestamps, sender kind, and message identity are not caller-controlled.

## Explicit non-surface

No endpoint was added for:

- arbitrary Support Request PATCH;
- delete;
- message edit/delete;
- priority mutation;
- sender-kind selection;
- attachments;
- provider delivery;
- external helpdesk synchronization.

## Documentation reconciliation result

The existing operation contract already defines the canonical lifecycle, conversation operations, ownership, Business association, validation, and exclusions. This HTTP slice records the transport mapping separately rather than changing the domain contract.

No conflicting source was found that authorizes a broader HTTP surface.
