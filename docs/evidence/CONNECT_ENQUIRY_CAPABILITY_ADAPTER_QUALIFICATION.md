# Connect Enquiry Capability Adapter — Qualification

## Scope

This slice exposes the already-qualified canonical GHM Enquiry service through the existing Connect service trust boundary.

The adapter is intentionally bounded to the registered Connect capability vocabulary:

- `enquiry.read`
- `enquiry.create`
- `enquiry.update`

## Dispatch boundary

`POST /api/v1/connect/service` continues to enforce:

1. Connect service assertion verification;
2. assertion replay protection;
3. active integration lifecycle;
4. trusted request context;
5. registered resource/operation resolution;
6. current GHM identity resolution;
7. current account authorization;
8. resource-specific capability dispatch;
9. canonical Enquiry service execution.

The adapter does not access PostgreSQL directly and does not bootstrap identity.

## Role-bound operations

- Customer `enquiry.create` → `EnquiryService.createEnquiry`
- Customer `enquiry.read` → `EnquiryService.getOwnEnquiry`
- Business `enquiry.read` with an enquiry id → `EnquiryService.getReceivedEnquiry`
- Business `enquiry.read` with a business id → `EnquiryService.getReceivedEnquiries`
- Business `enquiry.update` → `EnquiryService.updateReceivedEnquiryStatus`

Admin contexts do not gain Enquiry execution through this adapter merely because the global resource authorization list contains the resource. The adapter fails closed for unsupported role/resource combinations.

## Input boundary

The HTTP parser accepts only fields required by the corresponding Enquiry capability and rejects unknown fields, invalid identifiers, invalid statuses, and non-marketplace sources.

Enquiry persistence, ownership, marketplace-target eligibility, status semantics, and transaction behavior remain owned by the canonical Enquiry service/repository.

## Qualification state

Implementation and focused tests are present on branch `construction/connect-enquiry-capability-adapter`.

**PASS is withheld until the branch build/test suite is executed and the resulting evidence is reconciled here.**

No production migration, Supabase change, provider change, or direct database privilege change is part of this slice.
