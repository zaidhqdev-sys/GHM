-- Disposable local-only PostgreSQL roles. These credentials are not for any
-- shared, sandbox, staging, or production database.
CREATE ROLE ghm_schema_owner NOLOGIN;
CREATE ROLE ghm_migrator LOGIN NOINHERIT PASSWORD 'local-migrator-only';
GRANT ghm_schema_owner TO ghm_migrator;
CREATE ROLE ghm_runtime LOGIN NOINHERIT PASSWORD 'local-runtime-only';
CREATE ROLE ghm_payment_provider LOGIN NOINHERIT PASSWORD 'local-provider-only';

GRANT CONNECT ON DATABASE ghm TO ghm_migrator, ghm_runtime, ghm_payment_provider;
GRANT CREATE ON DATABASE ghm TO ghm_schema_owner;
GRANT USAGE, CREATE ON SCHEMA public TO ghm_schema_owner;
