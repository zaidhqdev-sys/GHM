# Connect GHM Authorization Binding Qualification

**Status:** CONSTRUCTION QUALIFIED — GHM AUTHORIZATION BINDING SUB-SLICE ONLY
**Evidence:** 431/431 tests passing; TypeScript build passing on the qualification branch

## Scope

This slice binds a trusted Connect request to the current GHM end-user authorization context without allowing the Connect integration principal to become that user or to select privileged authorization state.

Canonical chain:

    verified ES256 service assertion
      → active Connect integration lifecycle
      → trusted request context
      → governed operation resolution
      → GHM external identity resolution
      → current account auth state
      → GHM resource authorization

## Implemented controls

- trusted request context is required;
- the governed operation must match the trusted request;
- explicit provider=supabase end-user identity is required;
- the existing Connect identity adapter resolves the external subject;
- identity bootstrap is explicitly disabled;
- current GHM account state is loaded from GHM;
- disabled or missing accounts fail closed;
- system-admin status is derived from current GHM account state;
- the resulting AuthContext is GHM-derived and validated;
- resource access is decided by the existing GHM authorization boundary;
- integration identity is never used as end-user identity;
- caller-supplied user/account/role/admin state is not accepted;
- no resource operation is executed.

## Qualification evidence

Focused tests cover successful identity-to-AuthContext derivation, bootstrap exclusion, missing identity, unmapped identity, inactive account, operation mismatch, and GHM-derived system-admin state.

## Explicit non-qualification

This slice does not qualify:

- HTTP exposure or browser-origin access;
- replay persistence/protection;
- production credential issuance;
- end-user bootstrap;
- resource dispatch or execution;
- resource-specific ownership/membership/lifecycle checks beyond the existing authorization boundary invoked here;
- durable audit;
- production deployment, routing, DNS, CORS, or cutover;
- Connect/Supabase authentication or session migration.

## Important boundary

The existing canAccessResource authorization function is the only resource-level admission decision introduced by this slice. Resource services remain responsible for operation-specific ownership, membership, lifecycle, and input checks where their existing contracts require them. This slice does not claim that role/resource admission alone completes authorization for every resource operation.

## Stop boundary

Construction stops after GHM authorization binding. The next separately gated slice may connect the authorized capability to resource dispatch/execution. No HTTP or production cutover is implied.
