import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'pg';

const expectedDatabase = 'ghm_disposable_test';
if (process.env.NODE_ENV !== 'test') {
  throw new Error('SECURITY DEFINER migration qualification is restricted to NODE_ENV=test');
}
const url = process.env.GHM_MIGRATOR_DATABASE_URL?.trim();
if (!url) throw new Error('GHM_MIGRATOR_DATABASE_URL is required');
const target = new URL(url);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.hostname)
  || target.pathname !== `/${expectedDatabase}`) {
  throw new Error('SECURITY DEFINER migration qualification requires localhost ghm_disposable_test');
}

const migrationPath = path.resolve('database/migrations/20261112090000_pin_security_definer_search_path.sql');
const migration = await fs.readFile(migrationPath, 'utf8');
const client = new Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  application_name: 'ghm-security-definer-search-path-migration-qualification',
});

const fixtureNames = [
  'qualification_security_definer_search_path_a',
  'qualification_security_definer_search_path_b',
  'qualification_security_definer_search_path_c',
  'qualification_security_definer_search_path_control',
  'qualification_security_definer_search_path_proc',
];
const expectedPath = 'search_path=pg_catalog, ghm, pg_temp';

async function snapshot() {
  const [server, routines, roles, memberships, databaseAcl, schemaAcl, relationAcl, columnAcl, defaultAcls] =
    await Promise.all([
      client.query(`
        SELECT current_database() AS database_name,
               session_user,
               current_user,
               current_setting('server_version_num') AS server_version_num
      `),
      client.query(`
        SELECT p.oid::regprocedure::text AS signature,
               p.prokind AS kind,
               pg_get_userbyid(p.proowner) AS owner,
               p.prolang AS language_oid,
               p.prosrc AS source,
               p.probin AS binary,
               p.proargtypes::text AS argument_types,
               p.proallargtypes::text AS all_argument_types,
               p.proargmodes::text AS argument_modes,
               p.proargnames AS argument_names,
               p.prorettype::regtype::text AS result_type,
               p.proisstrict AS strict,
               p.provolatile AS volatility,
               p.proparallel AS parallel_safety,
               p.proleakproof AS leakproof,
               p.prosecdef AS security_definer,
               p.proacl::text AS direct_acl,
               COALESCE((
                 SELECT array_agg(setting ORDER BY setting)
                   FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) setting
                  WHERE setting NOT LIKE 'search_path=%'
               ), ARRAY[]::text[]) AS other_settings,
               COALESCE((
                 SELECT setting
                   FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) setting
                  WHERE setting LIKE 'search_path=%'
                  LIMIT 1
               ), '[database/session default]') AS search_path
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'ghm'
           AND p.prosecdef
           AND p.prokind IN ('f', 'p')
         ORDER BY p.oid::regprocedure::text
      `),
      client.query(`
        SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
               rolreplication, rolbypassrls, rolcanlogin, rolconnlimit,
               rolvaliduntil::text AS rolvaliduntil
          FROM pg_roles
         ORDER BY rolname
      `),
      client.query(`
        SELECT member.rolname AS member,
               granted.rolname AS granted_role,
               grantor.rolname AS grantor,
               m.admin_option, m.inherit_option, m.set_option
          FROM pg_auth_members m
          JOIN pg_roles member ON member.oid = m.member
          JOIN pg_roles granted ON granted.oid = m.roleid
          JOIN pg_roles grantor ON grantor.oid = m.grantor
         ORDER BY member.rolname, granted.rolname, grantor.rolname
      `),
      client.query(`
        SELECT datname, pg_get_userbyid(datdba) AS owner, datacl::text AS acl
          FROM pg_database
         WHERE datname = current_database()
      `),
      client.query(`
        SELECT n.nspname AS schema_name, pg_get_userbyid(n.nspowner) AS owner,
               n.nspacl::text AS acl
          FROM pg_namespace n
         ORDER BY n.nspname
      `),
      client.query(`
        SELECT n.nspname AS schema_name, c.relname, c.relkind,
               pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname <> 'information_schema'
           AND n.nspname NOT LIKE 'pg_%'
         ORDER BY n.nspname, c.relname, c.relkind
      `),
      client.query(`
        SELECT n.nspname AS schema_name, c.relname, a.attnum, a.attname,
               a.attacl::text AS acl
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
         ORDER BY n.nspname, c.relname, a.attnum
      `),
      client.query(`
        SELECT pg_get_userbyid(d.defaclrole) AS owner,
               CASE WHEN d.defaclnamespace = 0 THEN '[global]'
                    ELSE n.nspname END AS schema_name,
               d.defaclobjtype, d.defaclacl::text AS acl
          FROM pg_default_acl d
          LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
         ORDER BY owner, schema_name, d.defaclobjtype
      `),
    ]);
  assert.equal(server.rows[0].database_name, expectedDatabase);
  return {
    server: server.rows[0],
    routines: routines.rows,
    roles: roles.rows,
    memberships: memberships.rows,
    databaseAcl: databaseAcl.rows,
    schemaAcl: schemaAcl.rows,
    relationAcl: relationAcl.rows,
    columnAcl: columnAcl.rows,
    defaultAcls: defaultAcls.rows,
  };
}

function stableRoutine(routine) {
  const { search_path: _searchPath, ...stable } = routine;
  return stable;
}

async function main() {
  await client.connect();
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
      CREATE FUNCTION ghm.qualification_security_definer_search_path_a()
      RETURNS integer LANGUAGE sql SECURITY DEFINER
      SET search_path = pg_catalog, ghm AS 'SELECT 1'
    `);
    await client.query(`
      CREATE FUNCTION ghm.qualification_security_definer_search_path_b()
      RETURNS integer LANGUAGE sql SECURITY DEFINER
      SET search_path = ghm, pg_temp AS 'SELECT 2'
    `);
    await client.query(`
      CREATE FUNCTION ghm.qualification_security_definer_search_path_c()
      RETURNS integer LANGUAGE sql SECURITY DEFINER
      SET search_path = ghm, pg_catalog AS 'SELECT 3'
    `);
    await client.query(`
      CREATE FUNCTION ghm.qualification_security_definer_search_path_control()
      RETURNS integer LANGUAGE sql SECURITY DEFINER
      SET search_path = pg_catalog, ghm, pg_temp AS 'SELECT 4'
    `);
    await client.query(`
      CREATE PROCEDURE ghm.qualification_security_definer_search_path_proc()
      LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = ghm, pg_catalog
      AS $procedure$ BEGIN NULL; END; $procedure$
    `);
    await client.query(`
      REVOKE ALL ON FUNCTION ghm.qualification_security_definer_search_path_a() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION ghm.qualification_security_definer_search_path_a() TO ghm_runtime;
      REVOKE ALL ON FUNCTION ghm.qualification_security_definer_search_path_b() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION ghm.qualification_security_definer_search_path_b() TO ghm_migrator;
      REVOKE ALL ON FUNCTION ghm.qualification_security_definer_search_path_c() FROM PUBLIC;
      REVOKE ALL ON FUNCTION ghm.qualification_security_definer_search_path_control() FROM PUBLIC;
      REVOKE ALL ON PROCEDURE ghm.qualification_security_definer_search_path_proc() FROM PUBLIC;
    `);
    await client.query('RESET ROLE');

    const before = await snapshot();
    assert.equal(before.server.database_name, expectedDatabase);
    const beforeByName = new Map(before.routines.map((routine) => [routine.signature, routine]));
    for (const name of fixtureNames) {
      const routine = [...beforeByName.values()].find((entry) => entry.signature.includes(name));
      assert.ok(routine, `missing disposable fixture ${name}`);
      assert.equal(routine.owner, 'ghm_schema_owner');
    }
    assert.ok([...beforeByName.values()].some((routine) => routine.search_path !== expectedPath),
      'fixture must include nonconforming search_path values before migration');

    await client.query('SET LOCAL ROLE ghm_schema_owner');
    await client.query(migration);
    await client.query('RESET ROLE');

    const after = await snapshot();
    assert.equal(after.server.database_name, expectedDatabase);
    assert.equal(after.server.server_version_num, before.server.server_version_num);
    assert.deepEqual(after.roles, before.roles, 'migration changed role attributes');
    assert.deepEqual(after.memberships, before.memberships, 'migration changed role memberships');
    assert.deepEqual(after.databaseAcl, before.databaseAcl, 'migration changed database ACLs');
    assert.deepEqual(after.schemaAcl, before.schemaAcl, 'migration changed schema ACLs');
    assert.deepEqual(after.relationAcl, before.relationAcl, 'migration changed relation ACLs');
    assert.deepEqual(after.columnAcl, before.columnAcl, 'migration changed column ACLs');
    assert.deepEqual(after.defaultAcls, before.defaultAcls, 'migration changed default ACLs');

    const beforeRoutines = new Map(before.routines.map((routine) => [routine.signature, routine]));
    const afterRoutines = new Map(after.routines.map((routine) => [routine.signature, routine]));
    assert.deepEqual([...afterRoutines.keys()].sort(), [...beforeRoutines.keys()].sort(),
      'migration added or removed SECURITY DEFINER routines');
    let changedPaths = 0;
    for (const [signature, oldRoutine] of beforeRoutines) {
      const newRoutine = afterRoutines.get(signature);
      assert.equal(newRoutine.owner, oldRoutine.owner, `owner changed for ${signature}`);
      assert.deepEqual(stableRoutine(newRoutine), stableRoutine(oldRoutine),
        `non-search_path routine metadata or ACL changed for ${signature}`);
      assert.equal(newRoutine.search_path, expectedPath,
        `routine did not receive the exact required search_path: ${signature}`);
      if (newRoutine.search_path !== oldRoutine.search_path) changedPaths += 1;
    }
    assert.ok(changedPaths >= 3, 'migration did not normalize the intentionally nonconforming fixtures');

    for (const name of fixtureNames) {
      const routine = [...afterRoutines.values()].find((entry) => entry.signature.includes(name));
      assert.equal(routine.search_path, expectedPath, `fixture path was not normalized: ${name}`);
    }

    await client.query('ROLLBACK');
    const cleanup = await client.query(`
      SELECT count(*)::integer AS remaining
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'ghm'
         AND p.proname = ANY($1::text[])
    `, [fixtureNames]);
    assert.equal(cleanup.rows[0].remaining, 0, 'qualification fixtures were not rolled back');

    process.stdout.write(JSON.stringify({
      qualification: 'SECURITY DEFINER SEARCH_PATH MIGRATION PRE/POST COMPARISON: PASS',
      database: expectedDatabase,
      postgresServerVersion: before.server.server_version_num,
      routinesCompared: before.routines.length,
      routinesWithPathNormalized: changedPaths,
      functionsAndProcedures: 'all exact search_path=pg_catalog, ghm, pg_temp',
      ownership: 'unchanged',
      routineDefinitionsAndAcl: 'unchanged except search_path',
      roleAttributesAndMemberships: 'unchanged',
      databaseSchemaRelationColumnAndDefaultAcls: 'unchanged',
      rollback: 'fixture objects and migration changes rolled back',
    }, null, 2) + '\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

try {
  await main();
} finally {
  await client.end().catch(() => undefined);
}
