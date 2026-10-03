# Commercial Reference Data — Construction Gate

**Status:** OPEN / BLOCKED — reference-data authority unresolved
**Date:** 2026-10-03

Commercial payment preparation is blocked because the authorized Commercial schema references `ghm.country` and `ghm.currency`, while GHM currently has no canonical reference-data migration for those relations.

The source audit and bounded contract now establish the proposed ownership boundary, but they do not authorize mutation or seed rows.

## Required founder authorization

Before schema construction:
- approve `ghm.country` and `ghm.currency` as GHM-owned canonical reference resources;
- approve the initial seed authority and exact initial rows;
- approve migration ordering before Commercial qualification;
- approve runtime read-only access.

## Sequencing

1. Reference-data authorization.
2. Country/currency migration construction.
3. Live schema and privilege qualification.
4. Commercial payment-preparation construction.
5. Commercial payment-preparation qualification.
6. Provider result/application and cancellation remain separately governed.

No provider credentials, checkout calls, production configuration, or cutover work is authorized by this gate.