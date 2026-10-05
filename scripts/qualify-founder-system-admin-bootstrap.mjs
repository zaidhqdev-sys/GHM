import assert from 'node:assert/strict';
import { Client } from 'pg';
import 'dotenv/config';
const url = process.env.GHM_MIGRATOR_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('GHM_MIGRATOR_DATABASE_URL or DATABASE_URL is required');
const client = new Client({ connectionString: url });
await client.connect();
try {
  const result = await client.query("SELECT p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner, has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ghm' AND p.proname = 'auth_bootstrap_founder_system_admin'");
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].security_definer, true);
  assert.equal(result.rows[0].owner, 'ghm_schema_owner');
  assert.equal(result.rows[0].runtime_execute, false);
  console.log(JSON.stringify({ audit: 'GHM founder system-admin bootstrap qualification', status: 'PASS', mutation: false }, null, 2));
} finally { await client.end(); }
