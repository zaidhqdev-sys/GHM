# GHM Authentication Cryptographic Contract

**Canonical owner:** GHM platform governance
**Status:** AUTHENTICATION GATE 2A — CRYPTOGRAPHIC/TOKEN CONTRACT — **PARTIAL FOUNDER DECISION** (claims/TTL/`kid`/secret-managed key class SELECTED; exact encoding/schedule UNSELECTED)
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `239ef5d5065826ddbaae03a2b05c175bee9bce1d`
**Depends on:**
- [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md)
- [GHM_AUTHENTICATION_CONTRACT_GATE.md](./GHM_AUTHENTICATION_CONTRACT_GATE.md)

```text
IMPLEMENTATION AUTHORIZATION: NOT GRANTED
DOCUMENTATION-ONLY GATE
NO KEYS GENERATED
NO JWT BEHAVIOR CHANGED
```

This document resolves the **cryptographic / access-token contract space** left open by Authentication Contract Gate 1. It evaluates options and records Founder decision checkpoints. It does **not** select unresolved cryptographic parameters on behalf of the Founder and does **not** authorize implementation.

---

## 1. Current state

Inspected evidence (HEAD `239ef5d`):

| Item | Evidence |
|---|---|
| Verifier | `src/auth/request-context.ts` — `jwt.verify(token, config.jwtSecret)` |
| Config | `src/config.ts` / `.env.example` — `JWT_SECRET` required (HS shared secret) |
| Library | `package.json` / lock — `jsonwebtoken@^9.0.3` (installed `9.0.3`); Node `engines` `>=18` |
| Claims (current) | numeric `userId` + `role` (`admin` \| `customer` \| `business`) |
| `sub` / `iss` / `aud` | **Not** used by current verifier (`sub` ignored; `iss`/`aud` not checked) |
| Issuance | Absent in application `src/` (tests only sign HS tokens) |
| Auth endpoints | Absent |

```text
CURRENT IMPLEMENTATION ≠ TARGET CRYPTOGRAPHIC CONTRACT.
```

The current HS / `JWT_SECRET` verifier **must remain unchanged during this gate**. Target asymmetric architecture is documentation-only until Founder decisions below are recorded and a later implementation gate is authorized.

---

## 2. Founder-selected baseline

Already selected (Issuance Decision Record + Contract Gate 1):

| Item | Status |
|---|---|
| GHM is the authentication issuer | SELECTED |
| GHM owns credential lifecycle | SELECTED |
| GHM issues bearer credentials via GHM authentication API | SELECTED |
| Asymmetric JWT signing | SELECTED |
| Private signing material inside GHM issuer boundary | SELECTED |
| Consumers verify with trusted public key material | SELECTED |
| Issuer validation mandatory | SELECTED |
| Audience validation mandatory | SELECTED |
| Algorithm validation mandatory | SELECTED |
| Expiration validation mandatory | SELECTED |
| Key rotation supported | SELECTED |
| `sub` = canonical GHM identity (`ghm.account_identity.id`) | SELECTED |
| Roles/membership NOT JWT authorization source of truth | SELECTED |
| Access tokens short-lived | SELECTED |
| Signing algorithm = **ES256** | **SELECTED** (Founder) |
| Issuer (`iss`) = **`ghm-auth`** | **SELECTED** (Founder) |
| Audience (`aud`) = **`ghm-api`** | **SELECTED** (Founder) |
| Access-token lifetime = **15 minutes** | **SELECTED** (Founder) |
| JWT header **`kid` required** | **SELECTED** (Founder) |
| ES256 private key **secret-managed inside GHM issuer boundary** | **SELECTED** (Founder) |
| One active signing key; prior public key trusted for ≥ access TTL + skew during rotation | **SELECTED** (Founder) |

**Credential architecture (separate Founder selections; see Credential Contract):** email login identifier; password + Argon2id; password policy; email recovery.

**Not yet Founder-selected** (remain open in this cryptographic gate):

- exact key representation / encoding
- exact env/secret **names** or storage paths (not invented)
- public-key distribution mechanism details
- rotation interval / calendar
- exact `kid` string values (not invented)

Durable credential/session/refresh/recovery/mapping persistence concepts: see [GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md](./GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md).

---

## 3. Algorithm decision (Gate 2A slice)

### 3.0 Current implementation evidence (not target)

| Fact | Evidence |
|---|---|
| Current verify | `src/auth/request-context.ts` — `jwt.verify(token, config.jwtSecret)` (HS shared secret) |
| Current claims | numeric `userId` + `role`; no asymmetric algorithm allow-list |
| Current dependency | `jsonwebtoken@9.0.3` (via `package.json`) |
| Runtime | Node.js `>=18` (`package.json` engines) |

```text
CURRENT HS VERIFIER ≠ TARGET ASYMMETRIC ALGORITHM.
Founder-selected target algorithm: ES256 (see §3.5 / §2).
```

### 3.1 Repository / runtime compatibility evidence

Inspected installed JWT algorithm layer (`jwa` via `jsonwebtoken@9.0.3`):

| Algorithm | Constructible via installed `jwa`? |
|---|---|
| RS256 | **Yes** |
| ES256 | **Yes** |
| EdDSA | **No** — installed `jwa` rejects `"EdDSA"` (supported list includes HS*, RS*, PS*, ES*, `none`; not EdDSA) |

This is **factual dependency evidence**, not a Founder decision. EdDSA remains evaluable if GHM later adopts a different JWT library (e.g. `jose`) under a separate implementation authorization — it is **not** available through the current `jsonwebtoken`/`jwa` stack without an additional dependency.

### 3.2 RS256 (RSA PKCS#1 v1.5 + SHA-256)

| Aspect | Notes |
|---|---|
| Ecosystem / library support | Full support in current `jsonwebtoken`/`jwa`; most common JWT asymmetric choice |
| Key characteristics | RSA key pair; typically ≥2048-bit modulus; larger than EC/Ed keys |
| Operational implications | Familiar PEM/ops tooling; larger secrets to store/protect |
| Verification / deployment | Straightforward public-key verify in Node; widely interoperable |
| Rotation implications | Multiple public keys common; often paired with `kid` (kid policy still UNSELECTED) |
| Caveats | PKCS#1 v1.5 is older than PSS; weak key sizes if misconfigured; larger tokens |

### 3.3 ES256 (ECDSA P-256 + SHA-256)

| Aspect | Notes |
|---|---|
| Ecosystem / library support | Full support in current `jsonwebtoken`/`jwa` |
| Key characteristics | P-256 elliptic-curve key pair; compact vs RSA |
| Operational implications | Smaller key material; still standard PEM/JWK workflows |
| Verification / deployment | Native fit for Node verifiers already using `jsonwebtoken` |
| Rotation implications | Same multi-key / `kid` pattern as RS256 (kid still UNSELECTED) |
| Caveats | ECDSA requires correct curve/key handling via maintained libraries; less “default” muscle memory than RSA in some ops teams |

### 3.4 EdDSA / Ed25519

| Aspect | Notes |
|---|---|
| Ecosystem / library support | **Not supported** by the installed `jsonwebtoken`/`jwa` stack (see §3.1). Node `crypto` can do Ed25519, but GHM’s current JWT dependency cannot mint/verify EdDSA JWTs without a library change |
| Key characteristics | Ed25519; small, modern signatures |
| Operational implications | Attractive crypto profile, but requires new JWT dependency/`jose`-class path |
| Verification / deployment | Fine for ZAID-controlled verifiers **after** library support is authorized |
| Rotation implications | Compatible with JWKS/`kid` models once library support exists |
| Caveats | Choosing EdDSA **now** implies an authorized JWT-library change, not a drop-in on `jsonwebtoken@9.0.3` |

### 3.5 Technical recommendation — not a Founder decision

> **Technical recommendation — not a Founder decision.**

For GHM’s **current** repository/runtime (`jsonwebtoken@9.0.3`, Node ≥18, private ZAID-controlled issuer and verifiers), **ES256** is the preferred technical recommendation:

- asymmetric as Founder-required;
- fully supported by the installed JWT stack without a new dependency;
- smaller keys/signatures than RS256;
- adequate interoperability for GHM-owned API verifiers.

**RS256** remains a conservative alternative if maximum JWT-ecosystem familiarity is preferred.

**EdDSA/Ed25519** is cryptographically attractive but is **not** a drop-in on the current `jsonwebtoken`/`jwa` evidence; it should only be considered together with an explicit library/implementation authorization.

```text
FOUNDER DECISION:
Signing algorithm = ES256 (SELECTED)

(Prior technical recommendation matched this selection; key storage, KMS/HSM,
key formats, kid policy, token lifetimes, and rotation intervals
remain separate decisions and are not invented here.)
```

---

## 4. Issuer contract (`iss`) — decision slice

### 4.1 Requirements

The issuer (`iss`) must:

- identify **GHM** as the credential issuer
- be **stable** across deployments of the same logical issuer
- be **explicitly validated** on every verify
- **not** depend on a user's identity
- **not** be silently inferred from request Host/Origin
- be supplied via **controlled runtime configuration** (not hard-coded product guesses)

### 4.2 Repository evidence (no production value invented)

| Evidence | Finding |
|---|---|
| Runtime config | `src/config.ts` / `.env.example` — `JWT_SECRET`, `PORT`, `CORS_ORIGINS`, `DATABASE_URL`, `INVITE_CODE`, `TRUST_PROXY`; **no** `JWT_ISS` / issuer string |
| Package identity | `package.json` — `name: "ghm-core"`, description “Private Backend as a Service” — npm identity, **not** a JWT `iss` |
| HTTP surface | Resource routes under `/api/v1/...` (`src/http/app.ts`, routers); **path ≠ issuer** |
| CORS | `CORS_ORIGINS` = trusted **frontend** origins (e.g. example `http://localhost:3000`) — **not** an issuer identifier |
| Host / deployment | No frozen canonical production hostname or public issuer URL established in repo config or architecture docs for JWT `iss` |
| Current verifier | `src/auth/request-context.ts` — does **not** check `iss` |
| Auth API | SELECTED target (Issuance ADR) but **not implemented** — no live auth-service hostname to promote |
| Charter | Platform charter explicitly does **not** select a JWT issuer string |

```text
NO EXISTING JWT iss VALUE IN REPOSITORY CONFIG OR VERIFIER.
Do not assume localhost, CORS origins, or any deployment hostname is iss.
```

### 4.3 Approach comparison

| Approach | Meaning | Pros | Cons / risks |
|---|---|---|---|
| **A. GHM authentication authority / service identity** | Logical identifier of the GHM issuer (auth authority), independent of a single HTTP host | Matches Founder “GHM is the issuer”; stable across host/port/proxy changes; clear verify binding | Exact string still requires Founder selection + config |
| **B. Canonical GHM public URL** | `iss` = a chosen HTTPS origin of GHM | Familiar OIDC-style pattern; readable | Repo has **no** established canonical URL; hostnames change with deploy; easy to confuse with `CORS_ORIGINS` or request Host |
| **C. Other stable service identifier** | e.g. URN / package-derived name (`ghm-core`) | Compact; host-independent | `ghm-core` is an npm name, not a vetted issuer URI; inventing a URN without Founder selection is out of scope |

### 4.4 Technical recommendation — not a Founder decision

> **Technical recommendation — not a Founder decision.**

Prefer **Approach A**: `iss` should represent the **GHM authentication authority/service** as a **stable configured logical identifier**, not the request Host and not an assumed production hostname.

- Prefer a **URI or URN form** once Founder selects the exact string (shape only — **no value invented here**).
- Supply via controlled runtime configuration at implementation time.
- Do **not** derive `iss` from `CORS_ORIGINS`, `PORT`, or inbound Host headers.

```text
FOUNDER DECISION:
iss = ghm-auth (SELECTED)
```

---

## 5. Audience contract (`aud`) — decision slice

### 5.1 Requirements

The audience (`aud`) must identify the intended **GHM API / resource verifier boundary**.

It must be:

- explicitly validated
- stable
- documented
- distinct from arbitrary product-supplied claims
- configurable through controlled runtime configuration

### 5.2 Repository evidence (no production value invented)

| Evidence | Finding |
|---|---|
| Resource API path | Product HTTP surface uses `/api/v1/...` — **versioned path prefix**, not a JWT audience claim |
| Config | No `JWT_AUD` / audience string in `src/config.ts` or `.env.example` |
| Current verifier | Does **not** check `aud` |
| Product verifiers | Target: Connect / QuoteFlow obtain GHM credentials and call GHM Resource API; products must **not** invent AuthContext; GHM Resource API is the primary bearer-token verifier today |
| Auth vs Resource | Issuance ADR selects a future **GHM authentication API** separate from today’s Resource API routes — multi-`aud` remains optional |
| Unrelated “audience” | `ghm` commercial plan `audience` field / Campaign Brief “audience” are **domain marketing concepts**, not JWT `aud` |

```text
NO EXISTING JWT aud VALUE IN REPOSITORY.
/api/v1 IS NOT AUTOMATICALLY aud.
```

### 5.3 Approach comparison

| Approach | Meaning | Pros | Cons / risks |
|---|---|---|---|
| **A. GHM API (logical Resource API audience)** | One stable audience for tokens accepted by GHM Resource API verifiers | Matches current verifier boundary; simple product config; aligns with single HS verifier surface today | Exact string still Founder-selected; must not equal a path |
| **B. Specific API/service boundary** | Distinct audiences (e.g. Resource API vs future Auth API vs future services) | Fine-grained accept lists; supports split services later | Premature complexity before Auth API exists; no second verifier boundary in repo yet |
| **C. Other stable verifier audience** | Product-named audiences (`connect`, `quoteflow`) as `aud` | Product-scoped tokens | Conflicts with GHM as the API boundary; products are **clients**, not the Resource API audience; harder shared GHM verify |

### 5.4 Technical recommendation — not a Founder decision

> **Technical recommendation — not a Founder decision.**

Prefer **Approach A**: `aud` should represent the **GHM Resource API / GHM API verifier boundary** as a **stable configured logical identifier**.

- Do **not** use `/api/v1` (or any route path) as `aud`.
- Do **not** use product names (Connect / QuoteFlow) as the primary Resource API audience.
- Multi-audience (Approach B) may be revisited when a separate Auth API or additional GHM services need distinct accept lists — **not required** by current repository evidence.
- Exact string remains Founder-selected; **no production value invented here**.

```text
FOUNDER DECISION:
aud = ghm-api (SELECTED)
```

---

## 6. Token claim contract

Target **access-token** required claims:

| Claim | Purpose |
|---|---|
| `sub` | Subject — canonical GHM identity reference |
| `iss` | Issuer — which GHM issuer minted the token |
| `aud` | Audience — which GHM API boundary may accept it |
| `iat` | Issued-at timestamp |
| `exp` | Expiration timestamp (mandatory) |

### Semantics

**`sub`**

- Canonical GHM identity reference: **`ghm.account_identity.id`**.
- Must resolve to a valid GHM identity (`ghm.account_identity.id` binding per AuthContext mapping contracts).
- Must **not** be an external Supabase UUID once GHM identity issuance is authoritative.
- Exact string encoding of the bigint id remains an implementation/follow-on detail (see Contract Gate open decisions); cryptographic contract requires that `sub` be GHM-canonical.

**`iss`**

- Validated against configured value **`ghm-auth`** (Founder-selected).

**`aud`**

- Validated against configured value **`ghm-api`** (Founder-selected).

**`iat`**

- Issuance time; supports freshness/diagnostics; not a substitute for `exp`.

**`exp`**

- Mandatory expiration.
- Access token must be **rejected** after expiration.

### Authorization claims

Roles, business membership, and privileged authorization are **NOT** trusted solely from JWT claims. GHM authorization (membership SQL / service rules / explicit admin grants) remains authoritative.

### Optional / future claims (not required)

Examples that must **not** be added to the required contract without Founder approval:

- `jti` (token id)
- `nbf` (not-before)
- coarse `role` (legacy HS shape — not target authz source of truth)
- product client id / tenant hints

---

## 7. Access token lifetime — decision slice

### 7.1 Requirements (Founder-selected architecture)

- Access tokens must be **short-lived**.
- Expiration (`exp`) is mandatory and enforced on verify.
- Refresh credentials are **separate**, server-controlled, revocable, and rotated (Session Gate — exact refresh TTLs **not** invented here).
- Access-token revocation is **not** the primary revocation mechanism; refresh/session revocation is authoritative; stolen or post-logout access JWTs expire naturally via `exp`.
- Account/session revocation must prevent **future refresh**.

### 7.2 Context for Connect / QuoteFlow

| Product | Implication for access TTL |
|---|---|
| **Zaid Connect** (web SPA) | Steady API calls; silent refresh is normal; very short TTL increases refresh chatter and brief-outage pain |
| **QuoteFlow** (mobile-capable) | Backgrounding / flaky networks; depends on reliable refresh — access JWT should stay short but not thrash every few minutes under mild clock skew |
| **Both** | No GHM-issued access tokens in production product code yet; current product sessions are Supabase Auth — this slice is **target GHM** only |

### 7.3 Candidate comparison

| Lifetime | Security exposure window | Web/mobile usability | Refresh frequency | Operational complexity | Connect / QuoteFlow fit | Interaction with refresh rotation/revocation |
|---|---|---|---|---|---|---|
| **5 min** | Very small stolen-token window | Harsh: frequent silent refresh; visible failures if refresh delayed | Highest | Highest clock-skew / brief-outage sensitivity | Possible but aggressive for SPA + mobile | Revocation still via refresh; access dies fast — good security, more refresh load |
| **10 min** | Small | Better than 5; still chatty | High | Elevated skew/outage sensitivity | Acceptable if refresh is very reliable | Same model; slightly less refresh pressure |
| **15 min** | Modest; still clearly short-lived | Comfortable silent-refresh cadence for SPA/mobile | Moderate | Manageable with normal NTP and refresh retries | Strong fit for private ZAID products | Aligns with “expire naturally after logout”; refresh remains authoritative |
| **30 min** | Larger compromise window | Fewer refresh interruptions | Lower | Lower day-to-day ops friction | Usable; weaker on stolen-token bound | Post-revoke residual access lasts longer before `exp` |
| **60 min** | Largest among candidates; edge of “short-lived” | Fewest refreshes | Lowest | Lowest refresh ops load | Usable for low-sensitivity browsing; weaker for private backend token risk | Residual post-logout/`revoke` access window up to ~1h — least aligned with short-lived intent |

Multi-hour access JWTs without refresh coupling remain **out of band** for this architecture (not short-lived).

### 7.4 Technical recommendation — not a Founder decision

> **Technical recommendation — not a Founder decision.**

Prefer **15 minutes** as the access-token lifetime:

- clearly **short-lived** under Founder policy;
- balances stolen-token exposure against Connect SPA and QuoteFlow mobile UX;
- keeps refresh frequency moderate without inventing refresh/session TTLs;
- matches the architecture where **refresh/session revocation is authoritative** and access JWTs expire naturally — 15 minutes bounds residual exposure without requiring an access-token blacklist.

**10 minutes** is a reasonable tighter alternative if Founder prefers a smaller compromise window and accepts higher refresh chatter.
**30 minutes** is a reasonable looser alternative if UX/ops simplicity is prioritized over minimizing residual access after revoke.
**5 minutes** and **60 minutes** are extremes (ops thrash vs weaker short-lived posture) for this private GHM backend.

```text
FOUNDER DECISION:
Access-token lifetime = 15 minutes (SELECTED)

Refresh-token / session inactivity / absolute lifetimes:
  Session Gate (not invented here)
```

Exact clock-skew tolerance remains an implementation detail. Refresh/session durations are Session Gate items.

---

## 8. Key storage — decision slice

### 8.1 Repository / deployment evidence

| Evidence | Finding |
|---|---|
| Current JWT secret | `JWT_SECRET` via env (`src/config.ts`, `.env.example`) — HS shared secret pattern; **no** asymmetric private-key config |
| Source control | Secrets must not be committed (Issuance ADR / handovers); `.env.example` leaves secret values empty |
| Cloud SDKs in repo | `@aws-sdk/client-s3` + presigner only — **object storage**, not JWT signing, Secrets Manager, or KMS evidence |
| KMS / HSM / Vault | **No** repository config, docs, or runtime wiring establishing a JWT signing KMS/HSM or named secret product |
| Deploy topology | No deploy manifests in-repo freezing a host secret facility for JWT keys |
| Issuer boundary | Private signing material must remain inside GHM issuer process/host boundary (Founder-selected) |

```text
CURRENT EVIDENCE = env-delivered JWT_SECRET (HS).
NO ASYMMETRIC KEY STORE, KMS, OR NAMED SECRET PRODUCT SELECTED IN REPO.
Do not invent cloud product names, key names, paths, or key values.
```

### 8.2 Storage options

#### 1. Environment / secret-managed private key

Operator (or host “env/secrets” injection) supplies ES256 private key material to the GHM issuer process as configuration — same **class** of delivery as today’s `JWT_SECRET` (exact env var names **not invented**).

| Aspect | Assessment |
|---|---|
| Security boundary | Private key in issuer process memory/config; must not leave issuer boundary; public key separately distributed to verifiers |
| Operational complexity | Low — matches existing GHM secret-via-env practice |
| Local development | Straightforward; developers use non-production keys outside git |
| Production | Fits private ZAID-controlled hosts that already inject env secrets |
| Rotation | Replace active signing material; retain prior **public** keys for verify overlap (see §9) |
| Paid infrastructure | **No** additional paid product required beyond the existing host |
| Fit | **Strong** for lean private GHM |

#### 2. Managed secret store / platform secret facility

Host platform’s secret store mounts or injects key material at runtime (when the deployment already has such a facility).

| Aspect | Assessment |
|---|---|
| Security boundary | Stronger control/audit than ad-hoc env files if platform provides it |
| Operational complexity | Medium — depends on host; not evidenced as JWT-specific in repo |
| Local development | Usually falls back to env/files for local |
| Production | Good when platform already used for `DATABASE_URL` / `JWT_SECRET` class secrets |
| Rotation | Native versioning sometimes available — **not** assumed without evidence |
| Paid infrastructure | Only if the platform charges for a secret product GHM does not already use |
| Fit | Acceptable **upgrade path** when deployment evidence exists; **do not invent** a vendor product name here |

#### 3. KMS / HSM-backed signing

Private key never exportable; issuer calls KMS/HSM to sign.

| Aspect | Assessment |
|---|---|
| Security boundary | Strongest non-exportable key custody |
| Operational complexity | High — new signing path, IAM, latency, failure modes |
| Local development | Painful without local mocks / separate dev keys |
| Production | Requires choosing and operating a KMS/HSM |
| Rotation | KMS-native rotation possible; heavier ops |
| Paid infrastructure | **Yes** — typically ongoing cost |
| Fit | **Not required** for lean cost-conscious private GHM first gate; theoretically stronger ≠ mandatory |

#### 4. Other (repo-relevant only)

| Candidate | Relevance |
|---|---|
| Bake private key into container image / git | **Rejected** — violates secret hygiene and issuer-boundary discipline |
| S3-hosted private key via existing AWS S3 SDK | **Not recommended** — S3 dependency is for blobs; storing signing keys in buckets adds attack surface without repo evidence of that pattern |
| Public JWKS URL for private key | **N/A** — private keys are never published; JWKS (if any) is **public** verify material only |

### 8.3 Technical recommendation — storage (not a Founder decision)

> **Technical recommendation — not a Founder decision.**

Prefer **Option 1: environment / secret-managed private key** delivered only into the GHM issuer boundary — same operational class as current `JWT_SECRET`, without requiring new paid KMS/HSM infrastructure.

Treat **Option 2** as an optional hardening path **only when** the existing deployment already provides a managed secret facility (no vendor invented here).
Do **not** require **Option 3 (KMS/HSM)** for the first authentication implementation gate.

```text
FOUNDER DECISION:
Key storage approach = SELECTED — secret-managed private key inside GHM issuer boundary
  (env/host secret injection class; no mandatory KMS/HSM for first gate)
Key representation / exact secret names / paths = UNSELECTED (not invented)
```

**Do not generate keys in this gate.**

### 8.4 Invariants (apply regardless of storage selection)

**Private key**

- Accessible **only** inside the GHM issuer boundary.
- Never returned to products; never committed; never embedded in frontend/mobile; never exposed in API responses.
- Used solely to sign GHM-issued access tokens.

**Public key**

- Distributed only to trusted GHM API verification consumers.
- Safe for verification use.
- Must be selectable unambiguously during rotation (see `kid` / §9).

---

## 9. Key rotation and `kid` — decision slice

### 9.1 Selected architecture constraints

- Key rotation is **supported** (Founder-selected).
- Access tokens live **15 minutes** — residual verify window after signing-key change is short.
- Refresh credentials are separately rotated/revoked (Session Gate) — JWT signing-key rotation is **not** refresh rotation.

### 9.2 Rotation semantics (evaluate; do not invent schedules)

| Element | Meaning |
|---|---|
| **Active signing key** | Sole private key used to mint new access JWTs at a given time |
| **`kid` identification** | JWT header key id selecting which trusted public key verifies the signature |
| **Public-key publication/trust** | Verifiers hold a **trusted set** of public keys (config/mount/JWKS-class distribution — exact mechanism UNSELECTED; no URLs invented) |
| **Overlap during rotation** | After cutover to key B for signing, public key A remains trusted until tokens signed by A can no longer be valid |
| **Retiring old keys** | Remove private key A from signing use immediately on cutover; remove public key A from trust after overlap; never publish private keys |

### 9.3 Interaction with 15-minute access-token lifetime

```text
t0: activate signing key B; stop signing with A
t0 .. t0+15m (+ small clock-skew tolerance):
      verifiers still accept signatures from A and B
after overlap: drop public A from trust set
```

Because access JWTs are short-lived, **signing-key rotation overlap is naturally short**. No need for multi-day dual-sign windows for access tokens. Refresh/session continuity does **not** depend on keeping old JWT signing private keys.

### 9.4 Should `kid` be part of the JWT contract?

| Approach | Pros | Cons |
|---|---|---|
| **Require `kid` in JWT header** | Deterministic public-key selection; safe multi-key verify during rotation | Slightly more issuer/verifier config |
| Infer single trusted key / try all keys | Works with one key | Ambiguous with two keys; weaker rotation hygiene |
| Omit `kid` forever | Simplest while single-key | Breaks clean rotation once a second key appears |

### 9.5 Technical recommendation — rotation / `kid` (not a Founder decision)

> **Technical recommendation — not a Founder decision.**

1. Maintain exactly one **active signing** private key inside the issuer boundary.
2. Include **`kid` in the JWT header** and require verifiers to resolve `kid` against a trusted public-key set (exact `kid` string values **not invented**).
3. On rotation: start signing with key B; keep public A trusted for at least **access-token lifetime (15 minutes) + skew**; then retire public A.
4. Retire private A from the issuer as soon as B is active (A must not mint new tokens).
5. Do **not** invent a calendar rotation interval here — Founder/ops may set cadence later; capability matters more than a frozen schedule for this gate.
6. Do not conflate JWT signing-key rotation with refresh-credential rotation.

```text
FOUNDER DECISION:
kid requirement = SELECTED — required in JWT header
Rotation interval / schedule = UNSELECTED
Public-key distribution mechanism = UNSELECTED
Exact kid string values = UNSELECTED (not invented)

Overlap rule (SELECTED):
  prior public key remains trusted for at least access-token lifetime (15m) + clock skew
```

Do not implement rotation in this gate.

---

## 10. Verification contract

A GHM API verifying an access token **must** validate:

| Check | Requirement |
|---|---|
| Signature | Valid under trusted public key material |
| Algorithm | Explicit allow-list; reject `none` / unexpected algs |
| Issuer | Matches configured `iss` |
| Audience | Matches configured `aud` |
| Expiration | `exp` present and not expired |
| Structure | Well-formed JWT |
| `sub` | Present; canonical GHM identity reference |
| Identity validity | Identity exists/valid as required by authorization boundary (follow-on AuthContext mapping) |

### Must reject

- unsigned tokens
- unexpected algorithms
- expired tokens
- wrong issuer
- wrong audience
- malformed tokens
- tokens missing required claims
- arbitrary product-created identity tokens
- **Supabase JWTs presented directly as GHM credentials**
- HS/`JWT_SECRET` product tokens once the target verifier is active (cutover mechanics are an implementation gate — current HS verifier remains live until then)

Do **not** implement the verifier in this gate.

---

## 11. Security boundary

```text
GHM is the issuer.
Products are credential consumers.
```

Products do **not**:

- sign GHM JWTs
- manufacture GHM identity claims
- manufacture privileged `AuthContext`
- choose authorization roles as security truth
- bypass GHM authentication

GHM APIs do **not** trust a product merely because the product claims an identity.

Private signing keys never leave the issuer boundary. Public keys are verification material only.

---

## 12. Open decisions

| Decision | Current status |
|---|---|
| asymmetric JWT | **SELECTED** |
| signing algorithm | **SELECTED: ES256** |
| issuer (`iss`) | **SELECTED: `ghm-auth`** |
| audience (`aud`) | **SELECTED: `ghm-api`** |
| access-token lifetime | **SELECTED: 15 minutes** |
| refresh-token / session durations | Session Gate: inactivity **30d** + absolute **90d** **SELECTED** |
| refresh rotation / replay policy | Session Gate: rotate every success + single-use + session-family replay revoke **SELECTED** (see Session Contract) |
| key representation | **UNSELECTED** (encoding/names not invented) |
| key storage | **SELECTED:** secret-managed inside issuer boundary (no mandatory KMS/HSM) |
| `kid` requirement | **SELECTED: required** |
| rotation interval | **UNSELECTED** (overlap ≥ 15m + skew SELECTED) |
| public-key distribution mechanism | **UNSELECTED** |
| exact verification library configuration | implementation gate |

Do not resolve deferred Session Gate items here.

---

## 13. Founder decision checkpoint

```text
AUTHENTICATION GATE 2A:
CRYPTOGRAPHIC/TOKEN CONTRACT — PARTIAL FOUNDER DECISION
(algorithm + iss/aud + access TTL + kid + secret-managed key class SELECTED;
 exact encoding/schedule/distribution UNSELECTED)

FOUNDER DECISIONS:

1. Signing algorithm:
   SELECTED = ES256

2. iss:
   SELECTED = ghm-auth

3. aud:
   SELECTED = ghm-api

4. Access-token lifetime:
   SELECTED = 15 minutes

5. Key storage class:
   SELECTED = secret-managed private key inside GHM issuer boundary
   (exact representation/names/paths UNSELECTED; no mandatory KMS/HSM)

6. kid:
   SELECTED = required in JWT header
   (exact kid string values UNSELECTED)

7. Rotation schedule:
   UNSELECTED
   (overlap: prior public key trusted ≥ 15m + skew — SELECTED)

IMPLEMENTATION AUTHORIZATION:
NOT GRANTED.
```

---

## 14. Validation / final gate

```text
AUTHENTICATION GATE 2A DOCUMENTATION COMPLETE.
CURRENT HS / JWT_SECRET IMPLEMENTATION UNCHANGED.
TARGET CRYPTOGRAPHIC CONTRACT DOCUMENTED; JWT PARAMETERS PENDING FOUNDER DECISION.
CREDENTIAL SELECTIONS (EMAIL / PASSWORD / ARGON2ID) ARE DOCUMENTED IN THE CREDENTIAL CONTRACT AND DO NOT SELECT JWT ALGORITHM / ISS / AUD / KEY STORAGE.
NO KEYS GENERATED.
NO ENDPOINTS ADDED.
NO SRC / MIGRATION / TEST / CONFIG CHANGES AUTHORIZED BY THIS GATE.
FOLLOW-ON: FOUNDER CRYPTO SELECTIONS → THEN LATER IMPLEMENTATION GATE.
```
