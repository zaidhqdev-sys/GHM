import assert from 'node:assert/strict';
import { Pool } from 'pg';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('SECURITY DEFINER search_path qualification is restricted to NODE_ENV=test');
}
const expectedDatabase = 'ghm_disposable_test';
if (process.env.GHM_QUALIFICATION_DATABASE_NAME !== expectedDatabase) {
  throw new Error('SECURITY DEFINER search_path qualification is restricted to ghm_disposable_test');
}
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!migratorUrl) throw new Error('GHM_MIGRATOR_DATABASE_URL is required');
const parsedUrl = new URL(migratorUrl);
if (!['localhost', '127.0.0.1'].includes(parsedUrl.hostname) || parsedUrl.pathname !== `/${expectedDatabase}`) {
  throw new Error('SECURITY DEFINER search_path qualification requires localhost ghm_disposable_test');
}

const pool = new Pool({
  connectionString: migratorUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
const client = await pool.connect();
try {
  const identity = await client.query(
    'SELECT current_database() AS database_name, session_user, current_user',
  );
  assert.equal(identity.rows[0].database_name, expectedDatabase);
  assert.equal(identity.rows[0].session_user, 'ghm_migrator');
  assert.equal(identity.rows[0].current_user, 'ghm_migrator');

  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    await client.query(`
      CREATE TABLE ghm.security_definer_path_probe (
        value text NOT NULL
      )
    `);
    await client.query(
      "INSERT INTO ghm.security_definer_path_probe(value) VALUES ('ghm-schema-object')",
    );
    await client.query(`
      CREATE FUNCTION ghm.security_definer_path_probe()
      RETURNS text
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, ghm, pg_temp
      AS $function$
      DECLARE v_value text;
      BEGIN
        SELECT value INTO v_value
          FROM security_definer_path_probe
         LIMIT 1;
        RETURN v_value;
      END;
      $function$
    `);
    await client.query(
      'REVOKE ALL ON FUNCTION ghm.security_definer_path_probe() FROM PUBLIC',
    );
    await client.query(
      'GRANT EXECUTE ON FUNCTION ghm.security_definer_path_probe() TO ghm_migrator',
    );
    await client.query('RESET ROLE');

    // The caller's temporary object deliberately has the same unqualified
    // name as the GHM table. pg_temp must be searched after ghm.
    await client.query(`
      CREATE TEMP TABLE security_definer_path_probe (
        value text NOT NULL
      ) ON COMMIT DROP
    `);
    await client.query(
      "INSERT INTO pg_temp.security_definer_path_probe(value) VALUES ('pg-temp-shadow-object')",
    );

    const result = await client.query(
      'SELECT ghm.security_definer_path_probe() AS value',
    );
    assert.equal(
      result.rows[0].value,
      'ghm-schema-object',
      'SECURITY DEFINER search_path must resolve ghm before caller-controlled pg_temp objects',
    );

    const catalogue = await client.query(`
      SELECT pg_get_userbyid(p.proowner) AS owner,
             p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'ghm'
         AND p.proname = 'security_definer_path_probe'
    `);
    assert.equal(catalogue.rows[0].owner, 'ghm_schema_owner');
    assert.ok(catalogue.rows[0].proconfig.includes('search_path=pg_catalog, ghm, pg_temp'));

    await client.query('DROP TABLE pg_temp.security_definer_path_probe');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    await client.query('DROP FUNCTION ghm.security_definer_path_probe()');
    await client.query('DROP TABLE ghm.security_definer_path_probe');
    await client.query('COMMIT');
    console.log('SECURITY DEFINER TEMP-OBJECT SHADOWING QUALIFICATION: PASS');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
} finally {
  client.release();
  await pool.end();
}
