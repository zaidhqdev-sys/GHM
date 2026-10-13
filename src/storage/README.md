# GHM Storage Provider Adapter

The `StorageProvider` interface is the only provider-facing contract permitted to cross into the GHM storage service.

Provider SDKs, bucket identifiers, credentials, URLs and provider-specific error types must remain inside concrete adapter implementations.

A concrete Cloudflare R2 provider adapter exists and the bounded live-provider storage path was qualified on 2026-10-05. This does not imply that every product workflow is wired to storage or that production exposure, complete tenant/resource authorization, recovery, backups, or cutover is qualified.

The service owns authorization, object identity, lifecycle and PostgreSQL metadata. The adapter owns only byte-object operations and controlled access grants. Provider credentials, bucket names, and SDK details remain inside the provider adapter and deployment configuration, not in product-facing contracts.
