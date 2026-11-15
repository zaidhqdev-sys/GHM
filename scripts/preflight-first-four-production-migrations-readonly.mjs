// Read-only production inspection for the first pending migration prefix.
// Requires verified TLS, ghm_db, ghm_migrator -> ghm_schema_owner,
// an explicit operator acknowledgement, and BEGIN READ ONLY. Never executes DDL/DML.
import { Pool } from 'pg';
import 'dotenv/config';

const databaseUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!databaseUrl) throw new Error('GHM_MIGRATOR_DATABASE_URL is required');
if (process.env.GHM_PRODUCTION_MIGRATION_PREFLIGHT_CONFIRM !== 'ghm_db:read-only') {
  throw new Error('Set GHM_PRODUCTION_MIGRATION_PREFLIGHT_CONFIRM=ghm_db:read-only to acknowledge a read-only production inspection');
}
if (process.env.DATABASE_SSL !== 'true') {
  throw new Error('Production preflight requires DATABASE_SSL=true');
}
const parsed = new URL(databaseUrl);
if (parsed.pathname !== '/ghm_db' || ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
  throw new Error('Refusing connection: expected non-local Render production database ghm_db');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000,
  query_timeout: 20_000,
});

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const identity = await client.query(`
      SELECT current_database() AS database_name,
             session_user,
             current_user,
             current_setting('transaction_read_only') AS transaction_read_only
    `);
    const who = identity.rows[0];
    if (who.database_name !== 'ghm_db' || who.session_user !== 'ghm_migrator' ||
        who.current_user !== 'ghm_schema_owner' || who.transaction_read_only !== 'on') {
      throw new Error(`Unexpected production inspection identity/session: ${JSON.stringify(who)}`);
    }

    const objects = await client.query(`
      WITH expected_objects(kind, schema_name, object_name, expected_operation) AS (
        VALUES
          ('table'::text, 'ghm'::text, 'account_onboarding_progress'::text, 'create'::text),
          ('table', 'ghm', 'relationship_type', 'create'),
          ('table', 'ghm', 'business_relationship', 'create'),
          ('table', 'ghm', 'outcome_type', 'create'),
          ('table', 'ghm', 'outcome', 'create'),
          ('function', 'ghm', 'update_business_supplier_classification', 'create'),
          ('function', 'ghm', 'storage_mark_deletion_pending', 'replace')
      ),
      actual_objects AS (
        SELECT e.*,
               CASE WHEN e.kind = 'table'
                 THEN to_regclass(format('%I.%I', e.schema_name, e.object_name)) IS NOT NULL
                 ELSE EXISTS (
                   SELECT 1 FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = e.schema_name AND p.proname = e.object_name
                 )
               END AS object_exists
          FROM expected_objects e
      )
      SELECT kind, schema_name, object_name, expected_operation, object_exists,
             CASE expected_operation
               WHEN 'create' THEN object_exists
               WHEN 'replace' THEN NOT object_exists
             END AS unexpected_collision
        FROM actual_objects
       ORDER BY kind, object_name
    `);

    const storage = await client.query(`
      SELECT status,
             count(*)::bigint AS row_count,
             count(*) FILTER (WHERE NOT (
               (status = 'pending' AND available_at IS NULL AND deleted_at IS NULL)
               OR (status = 'available' AND available_at IS NOT NULL AND deleted_at IS NULL)
               OR (status = 'deletion_pending' AND deleted_at IS NULL)
               OR (status = 'deleted' AND deleted_at IS NOT NULL)
             ))::bigint AS incompatible_with_proposed_constraint
        FROM ghm.storage_object
       GROUP BY status
       ORDER BY status
    `);

    const storageConstraint = await client.query(`
      SELECT c.conname, c.convalidated, pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
       WHERE c.conrelid = 'ghm.storage_object'::regclass
         AND c.conname = 'storage_object_lifecycle_check'
    `);
    const storageFunction = await client.query(`
      SELECT p.oid::regprocedure::text AS signature,
             pg_get_function_result(p.oid) AS return_type,
             pg_get_functiondef(p.oid) AS definition,
             p.proacl AS acl,
             p.prosecdef AS security_definer,
             pg_get_userbyid(p.proowner) AS owner,
             has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute,
             has_function_privilege('ghm_actor_gateway', p.oid, 'EXECUTE') AS gateway_execute,
             p.proconfig AS configuration
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='ghm' AND p.proname='storage_mark_deletion_pending'
    `);

    const supplierFunction = await client.query(`
      SELECT p.oid::regprocedure::text AS signature,
             p.prosecdef AS security_definer,
             pg_get_userbyid(p.proowner) AS owner,
             has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='ghm' AND p.proname='update_business_supplier_classification'
    `);

    const report = {
      verdict: 'READ_ONLY_PREFLIGHT_ONLY',
      identity: who,
      tls_enforced_by_client: true,
      object_name_checks: objects.rows,
      storage_status_distribution: storage.rows,
      storage_constraint: storageConstraint.rows,
      storage_mark_deletion_pending: storageFunction.rows,
      supplier_classification_function: supplierFunction.rows,
      warnings: [
        'This script does not authorize or execute any migration.',
        'Production currently reports the post-migration-4 storage constraint and a SECURITY DEFINER storage_mark_deletion_pending(bigint) function while the migration ledger still lists migration 4 as pending. Capture and reconcile the exact function definition/ACL and constraint provenance before any rerun; do not blindly reapply or repair the ledger.',
        'Migration 1 creates a SECURITY DEFINER supplier-classification function that accepts a caller-supplied account ID. It must revoke EXECUTE from PUBLIC, ghm_runtime and ghm_migrator; only the later signed gateway wrapper may call it as schema owner. Verify effective ACLs and exact-head disposable PostgreSQL qualification before execution.',
      ],
    };
    console.log(JSON.stringify(report, null, 2));
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
