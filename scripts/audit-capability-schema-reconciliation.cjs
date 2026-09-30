require("dotenv/config");
const fs = require("fs");
const { Pool } = require("pg");

(async () => {
  const pool = new Pool({
    connectionString: process.env.GHM_MIGRATOR_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  try {
    await client.query("SET ROLE ghm_schema_owner");

    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'ghm'
        AND table_name LIKE 'capability%'
      ORDER BY table_name;
    `);

    console.table(tables.rows);

    const columns = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'ghm'
        AND table_name LIKE 'capability%'
      ORDER BY table_name, ordinal_position;
    `);

    console.log("\n=== CAPABILITY COLUMNS ===");
    console.table(columns.rows);

    const constraints = await client.query(`
      SELECT
        c.conrelid::regclass AS table_name,
        c.conname AS constraint_name,
        pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      WHERE c.connamespace = 'ghm'::regnamespace
        AND c.conrelid::regclass::text LIKE 'ghm.capability%'
      ORDER BY c.conrelid::regclass::text, c.conname;
    `);

    console.log("\n=== CAPABILITY CONSTRAINTS ===");
    console.table(constraints.rows);

    const privileges = await client.query(`
      SELECT
        table_name,
        grantee,
        privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'ghm'
        AND table_name LIKE 'capability%'
        AND grantee IN ('ghm_runtime', 'ghm_migrator')
      ORDER BY table_name, grantee, privilege_type;
    `);

    console.log("\n=== CAPABILITY ROLE PRIVILEGES ===");
    console.table(privileges.rows);

    console.log("\n=== CURRENT MIGRATION ===");
    console.log(
      fs.readFileSync(
        "database/migrations/20260914150000_create_capability_catalogue.sql",
        "utf8"
      )
    );
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
