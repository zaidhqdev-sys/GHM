# GHM Storage Capability Boundary

## Status

**CONSTRUCTION — ARCHITECTURE / CONTRACT ONLY**

## Purpose

Define GHM-owned object storage as a first-class backend capability for ZAID Connect and QuoteFlow without making Supabase Storage a runtime dependency.

This document does not provision buckets, move objects, add provider credentials, or change production data.

## Evidence from current products

The Connect repository demonstrates an existing governed business-logo storage contract:

- bucket concept: `media`;
- public read for approved logo objects;
- governed write/update/delete;
- path shape: `logos/{business_id}/logo.{jpg|jpeg|png|webp}`;
- maximum logo size: 2 MiB;
- allowed image types: JPEG, PNG, WebP;
- business-management authorization is required for mutation;
- business logo metadata is bound through a governed command rather than unrestricted profile-column update.

Connect also contains historical/future references to additional media concepts, including avatars and project images, but those must not be promoted into the GHM contract until individually reconciled against current product requirements.

## Canonical ownership

GHM owns:

1. object authorization;
2. object metadata;
3. object naming/key policy;
4. upload/download/delete lifecycle;
5. content-type and size validation;
6. tenant/resource ownership checks;
7. public/private visibility policy;
8. signed-access policy where required;
9. retention/deletion semantics;
10. storage-provider abstraction;
11. storage recovery contract.

A storage provider may hold the object bytes, but it is **not** the canonical product authority.

## Provider boundary

GHM must expose a provider-neutral storage service.

The initial implementation target is an S3-compatible adapter because the repository already carries S3 SDK dependencies and an `S3_ENDPOINT` configuration boundary.

The product must not depend directly on provider-specific SDK calls.

Canonical flow:

`product -> GHM storage service -> storage adapter -> object provider`

Database metadata flow:

`product -> GHM storage service -> PostgreSQL`

The object provider and PostgreSQL metadata must never be treated as independently authoritative.

## Object identity

Every stored object must have a GHM-owned logical identity and metadata record.

Minimum metadata contract:

- object ID;
- tenant/business owner;
- resource owner/type;
- canonical object key;
- original filename where appropriate;
- normalized media type;
- byte size;
- content checksum;
- visibility class;
- lifecycle status;
- created timestamp;
- deleted timestamp when applicable.

The physical provider key must not be derived from untrusted filenames alone.

## Visibility classes

GHM should support explicit visibility classes rather than implicit public/private behavior:

### Public

Suitable for intentionally public business media such as an approved business logo.

### Authenticated

Accessible only after GHM authorization.

### Private

Accessible only through an authorized GHM operation, normally using short-lived signed access or a server-mediated stream.

### Internal

Operational/provider objects not exposed to product users.

No object becomes public merely because its provider bucket is configured as public.

## Upload contract

Upload must be governed before persistence:

1. authenticate caller;
2. resolve tenant/business context;
3. authorize resource mutation;
4. validate declared media type;
5. validate size;
6. allocate GHM object identity/key;
7. create controlled upload authorization;
8. receive/store object;
9. verify persisted object metadata/checksum;
10. commit canonical metadata state.

Failed or abandoned uploads must not create indefinitely orphaned canonical records.

## Download contract

Downloads must resolve through GHM authorization.

For public objects, GHM may expose a stable public representation where the product contract explicitly permits it.

For authenticated/private objects, GHM should issue short-lived access or mediate the transfer.

Provider URLs must not become the product's authorization mechanism.

## Deletion contract

Deletion is a lifecycle operation, not merely a provider DELETE.

GHM must define:

- who may request deletion;
- whether deletion is immediate or tombstoned;
- whether references are preserved;
- provider deletion/retry behavior;
- orphan cleanup;
- audit evidence.

Business/product records must not silently lose ownership semantics because an object was deleted.

## Storage/data consistency

PostgreSQL metadata and provider objects are different systems and cannot share a normal database transaction.

Therefore GHM must use an explicit state machine for object lifecycle.

At minimum:

`pending -> available -> deletion_pending -> deleted`

Provider failures must be recoverable without falsely reporting an object as available.

## Security requirements

The storage capability must enforce:

- no arbitrary provider-key injection;
- no path traversal semantics;
- bounded object size;
- allowlisted media types per object class;
- tenant/resource authorization;
- no credential exposure to clients;
- short-lived signed access where applicable;
- checksum verification;
- safe filename handling;
- audit events for security-sensitive operations;
- rate/abuse controls appropriate to upload endpoints.

## Product object classes

Initial candidate classes:

| Object class | Product | Visibility | Status |
|---|---|---|---|
| Business logo | Connect | Public | READY FOR CONTRACT |
| Business profile media | Connect | Public/authenticated | REQUIRE PRODUCT RECONCILIATION |
| Product/sale-item media | Connect | Public/authenticated | REQUIRE PRODUCT RECONCILIATION |
| Before/after work media | Connect | Public/authenticated | REQUIRE PRODUCT RECONCILIATION |
| Review attachments | Connect | Authenticated/public by contract | REQUIRE PRODUCT RECONCILIATION |
| Quote PDFs | Connect / QuoteFlow | Private | REQUIRE PRODUCT RECONCILIATION |
| Verification documents | Connect | Private | NOT CURRENT 4A REQUIREMENT |
| User avatars | Connect | Product-dependent | REQUIRE PRODUCT RECONCILIATION |

Historical/orphan verification-document infrastructure must not be revived merely because storage now exists.

## Recovery

Storage is incomplete without recovery.

The implementation must eventually define:

- provider durability assumptions;
- object versioning where justified;
- backup/export strategy;
- metadata/object reconciliation;
- orphan detection;
- restore procedure;
- retention;
- RPO/RTO expectations.

## Implementation gates

Before implementation:

1. approve this capability boundary;
2. reconcile current Connect object classes against product requirements;
3. define GHM storage metadata schema;
4. define storage HTTP/service contracts;
5. define provider adapter interface;
6. define object lifecycle qualification;
7. define recovery qualification.

Only after those gates should bucket/provider provisioning or production object migration occur.

## Non-goals

- Supabase Storage as a hidden runtime dependency.
- Provider-specific storage logic in Connect or QuoteFlow.
- Immediate migration of historical Supabase objects.
- Recreating every historical Supabase storage bucket.
- Treating URLs as authorization.
- Building unused media classes before product need is confirmed.

## Documentation reconciliation

This document must remain reconciled with:

- GHM database authority;
- GHM authorization/tenant-isolation contracts;
- GHM backend capability parity matrix;
- Connect product requirements;
- object-storage implementation and recovery qualifications.

No production mutation is authorized by this document.
