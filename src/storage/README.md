# GHM Storage Provider Adapter

The `StorageProvider` interface is the only provider-facing contract permitted to cross into the GHM storage service.

Provider SDKs, bucket identifiers, credentials, URLs and provider-specific error types must remain inside concrete adapter implementations.

A concrete Cloudflare R2 provider adapter exists and its bounded live-provider data path was qualified and requalified on 2026-10-26. On 2026-11-12, the Resource API ↔ signed Storage Metadata Actor Gateway source integration and database actor/tenant/provider dual-proof boundary passed disposable PostgreSQL 18 adversarial qualification. This does not establish a deployed end-to-end provider workflow: the existing live test used `zaid-ghm-production`, which is not proven to be a dedicated non-production bucket. Keep further live mutations off that bucket until a dedicated non-production target exists. Recovery/orphan reconciliation, backup/recovery, production configuration, legacy grant revocation, and production cutover remain open.

The service owns authorization, object identity, lifecycle and PostgreSQL metadata. The adapter owns only byte-object operations and controlled access grants. Provider credentials, bucket names, and SDK details remain inside the provider adapter and deployment configuration, not in product-facing contracts.
