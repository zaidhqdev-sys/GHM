# QuoteFlow ↔ GHM Identity Link — Attestation Key Registration & Rotation Contract

**Status:** CONTRACT DRAFT — NO KEY PROVISIONING OR RUNTIME TRUST-STORE MUTATION AUTHORIZED

## Authority

QuoteFlow owns the attestation signing key.

GHM owns the trust decision for which QuoteFlow attestation public keys are accepted.

This creates an explicit trust registration boundary: QuoteFlow cannot make GHM trust an arbitrary key merely by presenting an assertion.

## Registration

A QuoteFlow attestation public key MUST be registered through a separately governed GHM administrative/bootstrap process.

Registration MUST bind:

- immutable issuer;
- key identifier (`kid`);
- public key;
- intended audience;
- activation state;
- registration provenance;
- registration timestamp.

The registration process MUST NOT accept private key material.

No mobile client may register, replace, activate, or retire a key.

## Rotation

Rotation is additive-then-cutover:

1. register the new public key;
2. qualify its exact issuer/audience binding;
3. begin issuing assertions with the new `kid`;
4. retain the previous public key only for the explicitly bounded verification window;
5. retire the previous key;
6. reject new assertions using retired keys.

Historical identity-link records remain valid and auditable after key retirement.

## Trust narrowing

GHM MUST reject:

- unregistered keys;
- wrong issuer/audience;
- duplicate `kid` registrations;
- arbitrary caller-supplied trust roots;
- keys registered outside the governed process;
- retired keys for new confirmations.

Public keys are trust configuration, not user-provided data.

## Key material handling

Private key material remains only with the QuoteFlow attestation authority.

GHM stores public verification material only.

Private keys MUST NOT appear in:

- source control;
- mobile bundles;
- logs;
- identity-link database rows;
- API responses.

## Recovery and compromise

Compromised keys require explicit retirement through the governed GHM trust-management process.

Emergency retirement MUST prevent acceptance of new confirmations from the compromised key while preserving historical provenance.

Re-keying MUST NOT rewrite historical confirmation provenance.

## Qualification requirement

Qualification MUST prove registration isolation, issuer/audience binding, duplicate-key rejection, active/retired behavior, rotation overlap, compromise retirement, historical provenance preservation, and fail-closed verification.

## Explicit non-goals

This contract does not authorize:

- actual key provisioning;
- environment variable changes;
- production secret rotation;
- identity-link schema/runtime;
- HTTP routes;
- QuoteFlow production changes;
- shadow traffic;
- cutover.

**Fail closed:** an assertion signed by an unregistered or retired key is never accepted.
