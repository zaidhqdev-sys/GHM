# Zaid Connect ↔ GHM Service Trust Boundary Contract

**Status:** FOUNDER-AUTHORIZED CONSTRUCTION CONTRACT — CRYPTOGRAPHIC SUB-SLICE FROZEN
**Canonical owner:** GHM platform governance
**Construction branch:** `construction/connect-service-trust-boundary`
**Baseline:** historical provenance reconciliation checkpoint `e954572`

## 1. Purpose

Define the minimum trusted service boundary through which Zaid Connect may call GHM without giving Connect database access, arbitrary SQL access, or authority to manufacture GHM authorization.

This contract exists because the qualified Connect identity adapter is intentionally a domain seam rather than a public endpoint. The adapter qualification explicitly leaves HTTP/service exposure gated behind a separate trust and credential contract.

## 2. Canonical topology

```text
Zaid Connect
    |
    | trusted service request
    v
GHM service boundary
    |
    | verify integration caller
    v
GHM AuthContext / integration principal
    |
    v
ConnectIdentityAdapter / governed resource service
    |
    v
GHM authorization
    |
    v
GHM transaction / persistence
```

The service boundary is not a second authorization system. It authenticates the calling product/service and establishes the trusted integration context required for GHM to evaluate the end-user identity and resource operation.

## 3. Required trust properties

The callable boundary MUST establish all of the following before invoking a governed GHM operation:

1. the request originated from an authorized Connect integration instance;
2. the integration credential is valid, current, and bound to the intended GHM service audience;
3. the credential is not an end-user Supabase JWT;
4. the credential does not itself grant business membership, ownership, or administrator authority;
5. the end-user identity is represented separately from the service credential;
6. GHM remains authoritative for resource authorization;
7. the product cannot select an arbitrary privileged `AuthContext`;
8. malformed, expired, revoked, or wrongly-audienced service credentials fail closed;
9. replay protection exists where the selected credential mechanism requires it;
10. service credentials are never exposed to browser/client code or persisted in Connect product data.

## 4. Credential model

The service credential is a **GHM-issued integration credential**, separate from both:

- Connect's Supabase user/session credential; and
- GHM end-user access JWTs.

The initial construction MUST use an asymmetric, short-lived service assertion model rather than a shared static bearer secret embedded in the Connect client.

Required semantic claims:

| Claim | Requirement |
|---|---|
| issuer | identifies the GHM integration issuer |
| audience | fixed to the GHM service boundary |
| subject | identifies the authorized Connect integration, not an end user |
| issued-at | required |
| expiry | required and short-lived |
| key id | required for rotation |
| nonce/request identifier | required where replay detection is part of the transport contract |

Exact wire header names, token serialization, signing-key storage, clock-skew allowance, and rotation procedure are transport implementation details and must be frozen before implementation is considered qualified.

## 5. End-user identity carriage

The Connect user identity MUST be carried as an explicit, non-credential identity reference:

```text
provider = "supabase"
subject  = Connect Supabase Auth UUID
```

GHM then resolves that external identity through the already-qualified identity adapter.

The following are prohibited:

- treating the Supabase JWT as the GHM service credential;
- treating the Supabase JWT as a GHM bearer credential;
- accepting email as the durable identity key;
- accepting a caller-supplied GHM bigint account ID without reconciliation against the external identity mapping;
- accepting caller-supplied role/admin claims as authorization truth.

## 6. Integration principal vs end-user principal

The request contains two distinct security concepts:

```text
Integration principal
  = "Is this an authorized Connect service?"

End-user external identity
  = "Which Connect user is this request about?"
```

GHM must not collapse these into one identity.

The integration principal authorizes use of the integration boundary. The resolved GHM account identity becomes the subject for normal GHM authentication/authorization semantics.

## 7. Bootstrap boundary

Identity bootstrap is permitted only when the selected product operation explicitly allows it.

A trusted Connect service request may request:

```text
resolve external identity
```

or, for an explicitly bootstrap-enabled operation:

```text
resolve-or-bootstrap external identity
```

Bootstrap MUST create only the minimum canonical identity/mapping state already defined by the identity adapter contract.

It MUST NOT:

- create Business membership;
- create Business ownership;
- create administrator/system-admin state;
- infer ownership from Connect data;
- migrate profile data;
- migrate sessions;
- change Connect authentication;
- create arbitrary resource records.

## 8. Resource calls

After trusted integration authentication and external identity resolution:

```text
integration authentication
    → external identity resolution
    → GHM canonical identity
    → resource authorization
    → explicit resource operation
```

The product requests a named GHM capability. It does not request a table, SQL statement, repository method, or arbitrary function.

Unsupported examples:

```text
POST /tables/anything
POST /sql
POST /functions/anything
POST /admin/impersonate
```

## 9. Authorization

GHM remains the sole authority for GHM resource authorization.

The integration request may supply business context where the resource contract requires it, but:

> Connect-selected business context is evidence to evaluate, not authorization itself.

GHM must independently enforce:

- account state;
- role;
- business membership;
- ownership;
- resource ACL;
- lifecycle state;
- cross-business isolation.

## 10. Transport boundary

HTTP/API is the selected callable product transport under the existing Product Integration Boundary Contract.

This slice does not authorize a generic public API. The intended surface is a **service-to-service protected boundary** inside the existing GHM HTTP application.

The boundary must remain unavailable to browser-originated Connect requests unless a later contract explicitly authorizes such a path.

## 11. HTTP security requirements

At minimum the implementation must enforce:

- TLS in any non-local deployment;
- explicit service audience;
- asymmetric signature verification;
- key-id based rotation;
- short credential lifetime;
- bounded request body;
- explicit integration identity;
- no CORS requirement for service-to-service calls;
- no browser authentication fallback;
- generic authentication failure semantics;
- no credential values in application logs;
- no raw Authorization header persistence;
- fail-closed behavior when trust configuration is absent or malformed.

## 12. Request semantics

The transport contract must eventually define a bounded envelope containing, at minimum:

```text
integration credential
operation identifier
external identity reference (when user-scoped)
operation input
correlation/request identifier
```

The operation identifier MUST resolve through the existing GHM resource registry or another explicitly governed registry. Unknown operations are denied.

## 13. Error semantics

The service boundary preserves the existing semantic taxonomy:

- `unauthenticated`
- `unauthorized`
- `not_found`
- `validation_failed`
- `conflict`
- `invalid_state`
- `dependency_failure`
- `internal_failure`

Service authentication failures must not disclose whether an end-user identity, account, business, or resource exists.

## 14. Replay / concurrency

The selected service assertion mechanism must define whether a captured valid request can be replayed.

For non-idempotent mutations, qualification must demonstrate that replay cannot silently create duplicate business state.

Where an assertion contains a nonce/request identifier, GHM must define its replay window and persistence/verification boundary before claiming replay protection.

Resource-specific idempotency remains governed by the resource operation contract.

## 15. Credential lifecycle

The integration credential system must support:

- issuance only by the GHM-controlled trust authority;
- explicit Connect integration identity;
- key rotation without simultaneous outage;
- revocation/disablement of the Connect integration;
- bounded overlap for rotated verification keys;
- fail-closed startup when required trust material is unavailable.

No credential may be committed to Git or placed in source-controlled configuration.

## 16. Secret and database boundary

Connect must never receive:

- `ghm_runtime` database credentials;
- `ghm_migrator` credentials;
- `ghm_schema_owner` credentials;
- database connection strings;
- signing private keys;
- arbitrary SECURITY DEFINER function access.

GHM remains responsible for transaction ownership and persistence.

## 17. Logging and observability

Logs may identify:

- integration identifier;
- operation identifier;
- request/correlation identifier;
- semantic outcome;
- timing information.

Logs MUST NOT contain:

- service credential material;
- Supabase JWTs;
- passwords;
- refresh credentials;
- signing private keys;
- unnecessary external identity secrets.

Durable audit remains separately gated.

## 18. Local development

The contract must support local-first development without weakening the production trust model.

A local Connect instance may call a local GHM instance only through the same semantic service boundary. Development credentials must be separately provisioned and must not become production credentials.

A local bypass such as:

```text
TRUST_ALL_CONNECT=true
```

is not an acceptable qualification mechanism.

## 19. Explicit non-goals

This slice does not authorize:

- Connect authentication migration;
- Supabase JWT verification by GHM;
- Connect session migration;
- business migration;
- membership migration;
- ownership migration;
- profile migration;
- storage adapter;
- realtime adapter;
- payment adapter;
- directory adapter;
- production routing/cutover;
- shadow traffic;
- provider cleanup;
- generic API exposure;
- arbitrary RPC/function exposure.

## 20. Qualification gate — cryptographic assertion sub-slice

Before the **cryptographic service-assertion sub-slice** is considered construction-qualified, evidence must demonstrate the assertion-specific controls below. The broader service trust boundary remains unqualified until its deferred controls are separately implemented and evidenced.

1. valid Connect integration credential is accepted;
2. wrong issuer is rejected;
3. wrong audience is rejected;
4. wrong algorithm is rejected;
5. unknown key id is rejected;
6. expired credential is rejected;
7. malformed credential is rejected;
8. disabled/revoked integration is rejected;
9. browser/client-originated misuse is rejected or unavailable by contract;
10. external Supabase identity resolves through the identity adapter;
11. bootstrap cannot grant membership, ownership, or admin authority;
12. caller cannot manufacture privileged AuthContext;
13. GHM resource authorization still decides the operation;
14. arbitrary operation/table/function access is rejected;
15. service credentials never appear in logs;
16. rotated verification keys behave according to the defined overlap window;
17. dependency/configuration failures fail closed;
18. existing GHM test suite remains green;
19. the cryptographic assertion implementation does not claim replay protection, integration revocation, HTTP exposure, identity carriage, or resource dispatch that it does not implement;
20. documentation records the qualified **cryptographic assertion sub-slice**, not the broader service trust boundary.

## 21. Construction stop boundary

Construction under this contract must stop before:

- Connect production deployment;
- production credentials;
- DNS/routing changes;
- shadow traffic;
- cutover;
- provider cleanup;
- session migration;
- broader product adapter expansion.

A successful local qualification means only that the **cryptographic service-assertion sub-slice** is qualified. It does not qualify HTTP exposure, integration lifecycle/revocation, replay persistence, end-user identity carriage, resource dispatch, or make Connect production-GHM backed.

## 22. Authority chain

This contract depends on and must remain consistent with:

- `PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md`
- `GHM_CONNECT_IDENTITY_ADAPTER_CONTRACT.md`
- `GHM_CONNECT_IDENTITY_ADAPTER_QUALIFICATION.md`
- `GHM_AUTHENTICATION_API_CONTRACT.md`
- `RESOURCE_API_BOUNDARY_CONTRACT.md`
- `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`

If a future transport implementation requires semantics outside this document, construction must stop and the contract must be amended before the new behavior is introduced.

**Final rule:**

> A valid Connect service credential proves that Connect is an authorized GHM consumer. It does not prove that the end user is authorized for any GHM resource. GHM must resolve the end-user identity and independently enforce authorization for every governed operation.
