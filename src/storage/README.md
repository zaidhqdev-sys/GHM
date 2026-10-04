# GHM Storage Provider Adapter

The `StorageProvider` interface is the only provider-facing contract permitted to cross into the GHM storage service.

Provider SDKs, bucket identifiers, credentials, URLs and provider-specific error types must remain inside concrete adapter implementations.

No concrete provider adapter is included in this slice.

The service owns authorization, object identity, lifecycle and PostgreSQL metadata. The adapter owns only byte-object operations and controlled access grants.
