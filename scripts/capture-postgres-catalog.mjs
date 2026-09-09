import 'dotenv/config';
import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

const outputPath = process.argv[2] ?? 'docs/evidence/ghm-postgres-catalog.json';

const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const query = async (text, values = []) => {
  const result = await client.query(text, values);
  return result.rows;
};

try {
  await client.connect();

  const server = await query(`
    SELECT
      current_database() AS database_name,
      current_user AS connected_role,
      version() AS server_version,
      current_schema() AS current_schema,
      current_setting('server_version_num') AS server_version_num
  `);

  const schemas = await query(`
    SELECT
      n.nspname AS schema_name,
      pg_get_userbyid(n.nspowner) AS owner
    FROM pg_namespace n
    WHERE n.nspname NOT LIKE 'pg_%'
      AND n.nspname <> 'information_schema'
    ORDER BY n.nspname
  `);

  const tables = await query(`
    SELECT
      c.table_schema AS schema_name,
      c.table_name,
      c.table_type
    FROM information_schema.tables c
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY c.table_schema, c.table_name
  `);

  const columns = await query(`
    SELECT
      table_schema AS schema_name,
      table_name,
      ordinal_position,
      column_name,
      data_type,
      udt_schema,
      udt_name,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name, ordinal_position
  `);

  const constraints = await query(`
    SELECT
      tc.constraint_schema AS schema_name,
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type,
      tc.is_deferrable,
      tc.initially_deferred
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY tc.constraint_schema, tc.table_name, tc.constraint_name
  `);

  const constraintColumns = await query(`
    SELECT
      constraint_schema AS schema_name,
      table_name,
      constraint_name,
      column_name,
      ordinal_position
    FROM information_schema.key_column_usage
    WHERE constraint_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY constraint_schema, table_name, constraint_name, ordinal_position
  `);

  const foreignKeys = await query(`
    SELECT
      tc.constraint_schema AS schema_name,
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_schema AS referenced_schema_name,
      ccu.table_name AS referenced_table_name,
      ccu.column_name AS referenced_column_name,
      rc.update_rule,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name = tc.constraint_name
     AND kcu.table_name = tc.table_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = tc.constraint_schema
     AND ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_schema = tc.constraint_schema
     AND rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY tc.constraint_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position
  `);

  const indexes = await query(`
    SELECT
      n.nspname AS schema_name,
      t.relname AS table_name,
      i.relname AS index_name,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_primary,
      pg_get_indexdef(ix.indexrelid) AS definition
    FROM pg_index ix
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, t.relname, i.relname
  `);

  const sequences = await query(`
    SELECT
      sequence_schema AS schema_name,
      sequence_name,
      data_type,
      start_value,
      minimum_value,
      maximum_value,
      increment
    FROM information_schema.sequences
    WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY sequence_schema, sequence_name
  `);

  const views = await query(`
    SELECT
      table_schema AS schema_name,
      table_name AS view_name,
      view_definition
    FROM information_schema.views
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);

  const routines = await query(`
    SELECT
      routine_schema AS schema_name,
      routine_name,
      routine_type,
      data_type AS return_data_type,
      specific_name
    FROM information_schema.routines
    WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY routine_schema, routine_name, specific_name
  `);

  const triggers = await query(`
    SELECT
      trigger_schema AS schema_name,
      event_object_table AS table_name,
      trigger_name,
      event_manipulation,
      action_timing,
      action_statement
    FROM information_schema.triggers
    WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY trigger_schema, event_object_table, trigger_name, event_manipulation
  `);

  const policies = await query(`
    SELECT
      schemaname AS schema_name,
      tablename AS table_name,
      policyname AS policy_name,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY schemaname, tablename, policyname
  `);

  const rls = await query(`
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      c.relrowsecurity AS row_security_enabled,
      c.relforcerowsecurity AS force_row_security
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, c.relname
  `);

  const grants = await query(`
    SELECT
      table_schema AS schema_name,
      table_name,
      grantee,
      privilege_type,
      is_grantable
    FROM information_schema.role_table_grants
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name, grantee, privilege_type
  `);

  const rowCounts = await query(`
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      c.reltuples::bigint AS estimated_row_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, c.relname
  `);

  const evidence = {
    captured_at: new Date().toISOString(),
    source: 'GHM PostgreSQL catalog capture',
    note: 'Metadata only. No row contents, passwords, tokens, DATABASE_URL, or secrets are captured.',
    server,
    schemas,
    tables,
    columns,
    constraints,
    constraint_columns: constraintColumns,
    foreign_keys: foreignKeys,
    indexes,
    sequences,
    views,
    routines,
    triggers,
    row_level_security: rls,
    policies,
    grants,
    estimated_row_counts: rowCounts,
  };

  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`PostgreSQL catalog captured to ${outputPath}`);
} finally {
  await client.end().catch(() => undefined);
}
