# QuoteFlow canonical identity-context API contract (proposal)

Status: proposed for review; not yet implemented or runtime-qualified.

## Purpose

Provide QuoteFlow with authenticated GHM account identity and all current memberships so the app can bootstrap its business chooser without creating a second authority for identity or authorization.

## Route

`GET /api/v1/identity`

Authentication: existing GHM bearer authentication and registered-resource authorization middleware. The account identifier MUST come only from the verified `AuthContext`; clients may not provide an account ID.

Optional query: `businessId`, a positive safe integer in canonical decimal form. Unknown query parameters and repeated/non-string values return `400 { "error": "invalid_request" }`.

## Response DTO

```json
{
  "account": {
    "id": 123,
    "fullName": null,
    "phone": null,
    "avatarRef": null,
    "role": "business"
  },
  "memberships": [
    {
      "id": 456,
      "businessId": 789,
      "accountId": 123,
      "role": "owner",
      "status": "active",
      "business": {
        "id": 789,
        "name": "Example Business",
        "slug": "example-business",
        "isActive": true
      }
    }
  ],
  "activeMembership": null,
  "activeBusiness": null
}
```

The example values are illustrative only. `account.email` is intentionally omitted: the current GHM `AccountIdentity` DTO does not expose email, and the route must not query credential records or invent an email merely to satisfy a client parser. If email is later required, it must be added through a reviewed account-identity projection with explicit privacy and source-of-truth semantics.

The membership list contains all memberships returned by the authenticated account's membership query (currently active memberships only, per repository contract); each included business is projected to safe chooser fields only. Do not expose credentials, access/refresh tokens, or internal persistence fields.

## Selection semantics

- With no `businessId`, always return the caller's membership list. Do not auto-select when there are multiple memberships. `activeMembership` and `activeBusiness` are null when selection is ambiguous or absent.
- With `businessId`, GHM must find an active membership for the authenticated account and an active business. If unauthorized/inactive/not found, fail closed with `404 { "error": "not_found" }` (no existence disclosure).
- A sole membership may be selected by default only if that behavior is explicitly retained in the contract and covered by tests; recommended initial behavior is explicit selection in the response contract, with no hidden client assumption.
- Never accept account IDs from query/body, map IDs by email/name/slug, or coerce numeric GHM business IDs into legacy QuoteFlow organization UUIDs.

## Implementation requirements

1. Add a service operation that retrieves account + all memberships without using the current `resolveIdentity` behavior that throws `business-selection-required` for multiple memberships.
2. Reuse existing repository authorization/tenant boundaries. For a supplied selection, verify membership and business active status in GHM.
3. Register the route with existing `resourceAuthMiddleware` and `requireRegisteredAccess('identity', 'read')` (or the reviewed equivalent registry capability); do not add an unauthenticated bypass.
4. Add HTTP tests for unauthenticated requests, zero/one/multiple memberships, explicit valid selection, unauthorized/inactive selection, malformed/repeated query values, and service errors.
5. Align QuoteFlow's parser to this exact DTO; mocked fetch tests alone do not qualify compatibility. Add a contract test that runs against the GHM HTTP route.
6. Keep production auth cutover disabled. Legacy org-to-business provisioning remains a separate, migration-only gated process.

## Acceptance gates

- TypeScript build and full relevant GHM tests pass.
- Route-level HTTP tests prove auth and selection behavior.
- QuoteFlow client parser and request contract match the implemented DTO.
- Exact-head CI results are recorded in QuoteFlow issue #10.
- Non-production auth/session journey is tested before any runtime wiring is enabled.
