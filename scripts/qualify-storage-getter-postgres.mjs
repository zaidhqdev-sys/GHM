import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.GHM_RUNTIME_DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("Missing GHM_RUNTIME_DATABASE_URL; storage PostgreSQL qualification requires an explicit runtime-role connection");
}

const ssl = process.env.DATABASE_SSL === "true"
  ? { rejectUnauthorized: false }
  : false;
const client = new Client({ connectionString: databaseUrl, ssl });

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const expectSqlState = async (label, sql, params, expectedCode) => {
  try {
    await client.query(sql, params);
  } catch (error) {
    assert(error?.code === expectedCode, `${label}: expected SQLSTATE ${expectedCode}, received ${error?.code ?? "unknown"}`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

try {
  await client.connect();

  const identity = await client.query(`
    SELECT current_database() AS database_name,
           current_user AS current_user,
           session_user AS session_user
  `);
  const who = identity.rows[0];
  assert(who?.database_name === "ghm", `Refusing qualification against unexpected database: ${who?.database_name}`);
  assert(who?.current_user === "ghm_runtime" && who?.session_user === "ghm_runtime",
    `Expected direct ghm_runtime identity, got current_user=${who?.current_user}, session_user=${who?.session_user}`);

  const catalog = await client.query(`
    SELECT
      to_regprocedure('ghm.storage_get_object(bigint,bigint)') IS NOT NULL AS scoped_exists,
      to_regprocedure('ghm.storage_get_object(bigint)') IS NULL AS legacy_absent,
      pg_get_userbyid(p.proowner) AS function_owner,
      p.prosecdef AS security_definer,
      p.proconfig AS function_config,
      has_function_privilege(current_user, p.oid, 'EXECUTE') AS runtime_execute,
      EXISTS (
        SELECT 1
          FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS public_execute,
      has_table_privilege(current_user, 'ghm.storage_object', 'INSERT') AS table_insert,
      has_table_privilege(current_user, 'ghm.storage_object', 'UPDATE') AS table_update,
      has_table_privilege(current_user, 'ghm.storage_object', 'DELETE') AS table_delete
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('ghm.storage_get_object(bigint,bigint)')
  `);
  assert(catalog.rowCount === 1, "Scoped getter is missing from PostgreSQL catalog");
  const fn = catalog.rows[0];
  assert(fn.scoped_exists === true && fn.legacy_absent === true, "Expected scoped getter and no legacy unscoped overload");
  assert(fn.function_owner === "ghm_schema_owner", `Unexpected getter owner: ${fn.function_owner}`);
  assert(fn.security_definer === true, "Scoped getter must remain SECURITY DEFINER");
  assert(Array.isArray(fn.function_config) && fn.function_config.includes("search_path=pg_catalog, ghm"),
    `Unexpected scoped getter search_path: ${JSON.stringify(fn.function_config)}`);
  assert(fn.runtime_execute === true, "ghm_runtime lacks EXECUTE on the scoped getter");
  assert(fn.public_execute === false, "PUBLIC unexpectedly has EXECUTE on the scoped getter");
  assert(fn.table_insert === false && fn.table_update === false && fn.table_delete === false,
    "Runtime role unexpectedly has direct DML on ghm.storage_object");

  await expectSqlState(
    "scoped getter rejects null object/account IDs",
    "SELECT * FROM ghm.storage_get_object($1::bigint, $2::bigint)",
    [null, 1],
    "P0001",
  );
  await expectSqlState(
    "scoped getter rejects non-positive account IDs",
    "SELECT * FROM ghm.storage_get_object($1::bigint, $2::bigint)",
    [1, 0],
    "P0001",
  );
  await expectSqlState(
    "scoped getter hides nonexistent object IDs",
    "SELECT * FROM ghm.storage_get_object($1::bigint, $2::bigint)",
    [0, 1],
    "P0001",
  );

  console.log(JSON.stringify({
    status: "PASS",
    database: who.database_name,
    runtime_role: who.current_user,
    checks: [
      "scoped signature exists and legacy unscoped overload is absent",
      "function owner, SECURITY DEFINER, and fixed search_path verified",
      "runtime EXECUTE allowed; PUBLIC EXECUTE denied",
      "direct runtime INSERT/UPDATE/DELETE denied",
      "invalid and nonexistent lookup inputs rejected without disclosing object existence",
    ],
    mutations_performed: false,
    note: "This is read-only catalog/input validation; active membership, cross-tenant, and public-logo behavior require the separate fixture-backed lifecycle qualification.",
  }, null, 2));
} finally {
  await client.end().catch(() => {});
}
