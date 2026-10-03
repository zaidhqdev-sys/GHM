# Connect Business Offering Adapter Qualification

Status: CONSTRUCTION QUALIFIED — local validation complete

## Scope

Adds the explicit Connect-to-GHM Business Offering capability adapter.

Included:
- `business_offering.read`
- `business_offering.create`
- `business_offering.update`
- capability/resource/operation binding checks
- authenticated `business` or `admin` role enforcement before service access
- positive business identifier validation
- non-empty offering identifier validation for update
- canonical Business Offering service delegation
- negative coverage proving customer context is rejected before service access

Excluded:
- production Connect cutover
- Supabase changes
- database migrations
- provider/payment changes
- HTTP routing changes
- shadow qualification
- production authorization of the adapter

## Authorization boundary

The adapter consumes the already-resolved `ConnectAuthorizedOperation` context.

The adapter requires:
- resource = `business_offering`
- capability matches the requested dispatch capability
- operation matches the capability suffix
- authenticated role = `business` or `admin`

Customer context is rejected before the canonical Business Offering service is called. This role gate is enforced at the Connect capability seam rather than delegated to the downstream service/repository.

The canonical Business Offering service and repository remain owners of domain membership/management authorization.

## Evidence

Construction branch: `construction/connect-business-offering-capability-adapter`

Base: `2571b81e2f3a70068160270e3beb621dc0085b33`

Qualification commit: `a3c17a3073a06fb3f2d667123b0f6a5e79e65ee3`

Files:
- `src/integrations/connect/business-offering-adapter.ts`
- `src/integrations/connect/business-offering-adapter.test.ts`

Validation evidence:
- `npm test`: 504 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo
- `git diff --check`: clean in the local qualification run

## Boundary interpretation

This is a construction-qualified product/resource seam. It does not authorize production traffic, Supabase replacement, credential changes, provider integration, shadow qualification, or controlled cutover.

The adapter remains subject to the broader Connect integration lifecycle gates and founder-controlled release authorization.
