# QuoteFlow legal-document and acceptance capability

## Status

The GHM Core Engine now has a dedicated, authenticated API and append-only acceptance record model for QuoteFlow. This is infrastructure only: **no legal text is authored, approved, published, or implied by this change**. QuoteFlow remains fail-closed until the business owner/legal reviewer supplies the actual approved documents and version metadata and those versions are published through a reviewed GHM database migration.

## API

All routes require a valid GHM bearer session. Account identity is taken exclusively from the verified GHM request auth context; clients cannot submit an account ID or acceptance timestamp.

### Read current documents

`GET /api/v1/quoteflow/legal/documents/current`

Returns each active document's key, title, required flag, current effective version, Markdown content, SHA-256 digest, effective timestamp, and whether the authenticated account accepted that exact version.

If the account has no active published legal documents, the endpoint returns `503 legal_documents_unavailable`. An empty catalogue is never treated as consent.

### Record acceptance

`POST /api/v1/quoteflow/legal/acceptances`

Body:

```json
{
  "versionId": 123,
  "accepted": true,
  "channel": "quoteflow_android"
}
```

The server binds the record to the authenticated GHM account and verifies that the version is the current published/effective version. The database supplies the acceptance timestamp and copies the immutable document digest into the acceptance record. The operation is idempotent for the same account and version. Re-acceptance is required for a new version.

The server rejects client-supplied account IDs, timestamps, digest overrides, and unknown fields. The endpoint is rate-limited.

## Persistence and evidence

- Document identity and required/retired status live in `ghm.quoteflow_legal_document`.
- Each published text/version and its declared SHA-256 digest live in `ghm.quoteflow_legal_document_version`.
- Acceptance evidence lives in `ghm.quoteflow_legal_acceptance`: authenticated account ID, exact version ID, copied digest, server timestamp, and app channel.
- Runtime role has no direct table access. It can invoke only the narrowly scoped security-definer read/accept functions.
- Acceptance rows are unique per account/version. A later version creates a new acceptance obligation.
- IP addresses and device identifiers are deliberately not collected by this first implementation; collect additional personal data only after a documented necessity, privacy notice, and retention decision.

## Publishing approved documents

Do not insert placeholder, generated, or unreviewed legal wording. Before publishing, the QuoteFlow owner/legal reviewer must approve:
1. the exact document text and document title;
2. a stable document key (for example `terms_of_service` or `privacy_notice`);
3. a version label and effective date;
4. whether acceptance is mandatory;
5. the correct SHA-256 digest of the exact UTF-8 Markdown bytes.

Publish each approved version through a reviewed, immutable database migration. Keep prior versions and acceptance evidence. Do not edit a published version in place; publish a new version instead. The GHM database migration authority and production reconciliation/rollback gates remain mandatory. This feature branch does not execute migrations or change production.

## Cutover requirements

QuoteFlow must fetch all current required documents, display their exact contents and version labels, and submit explicit affirmative acceptance for each required version. It must unlock product data only after every required current version is accepted by the authenticated account. Network errors, an empty catalogue, stale versions, and failed writes all remain blocked states. No local-only checkbox or AsyncStorage flag is legal evidence.
