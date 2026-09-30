import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.GHM_MIGRATOR_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const client = await pool.connect();

try {
  await client.query("SET ROLE ghm_schema_owner");

  const result = await client.query(`
    SELECT table_name
    FROM (
      VALUES ('country'), ('currency')
    ) AS t(table_name)
    WHERE to_regclass('ghm.' || table_name) IS NOT NULL
    ORDER BY table_name;
  `);

  console.log("\n=== CANONICAL REFERENCE TABLES ===");
  for (const table of ["country", "currency"]) {
    console.log(
      `${table}: ${result.rows.some(row => row.table_name === table) ? "EXISTS" : "MISSING"}`
    );
  }

  for (const table of ["country", "currency"]) {
    const rows = await client.query(`
      SELECT *
      FROM ghm.${table}
      ORDER BY id
      LIMIT 20;
    `);

    console.log(`\n=== ghm.${table} ROWS (MAX 20) ===`);
    console.table(rows.rows);
  }
} finally {
  client.release();
  await pool.end();
}
