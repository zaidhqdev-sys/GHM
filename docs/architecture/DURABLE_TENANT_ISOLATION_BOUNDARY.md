# Durable Tenant Isolation Boundary

Status: CONSTRUCTION — qualification pending

Tenant authority is derived from authenticated account identity plus active membership in an active GHM business. Caller-supplied business identifiers never establish authority.

This slice will establish the canonical tenant context and fail-closed cross-business and cross-account invariants. Existing resource repositories will adopt the boundary through separately qualified resource slices.
