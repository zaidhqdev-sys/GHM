# Opportunity Requirements HTTP Boundary Reconciliation

**Status:** CONSTRUCTION QUALIFICATION — HTTP SLICE IN PROGRESS

Canonical domain authority remains `OPPORTUNITY_CAPABILITY_REQUIREMENTS_CONTRACT.md` and the typed contracts/service/repository under `src/resources/opportunity-requirements/`.

This slice does not reopen the qualified Opportunity Capability Requirements domain. It exposes only its existing read and complete-replacement operations.

## Exposed surface

- GET `/api/v1/opportunities/:opportunityId/requirements` → `read`
- PUT `/api/v1/opportunities/:opportunityId/requirements` → `replace`

The HTTP layer requires authenticated GHM context, explicit registry operation, and resource access. The canonical repository/service remains authoritative for Opportunity visibility and management authority.

## Input ownership

Replacement accepts only `capabilityId`, `importance`, `minimumProficiencyLevel`, `description`, and `sortOrder`. Server-owned identifiers/provenance/timestamps are rejected.

No DELETE, arbitrary PATCH, individual requirement mutation, Capability governance, provider integration, payment work, or production cutover is introduced.

## Qualification

Router tests are included in the configured suite. Full local qualification is required before this slice is marked qualified.
