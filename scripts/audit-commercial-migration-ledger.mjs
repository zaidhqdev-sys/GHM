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
    SELECT *
    FROM ghm.schema_migration_ledger
    WHERE migration_name = '20260915150000_create_commercial_schema.sql'
       OR migration_name LIKE '%commercial%'
    ORDER BY migration_name;
  `);

  console.log("\n=== COMMERCIAL LEDGER ENTRIES ===");
  console.table(result.rows);
} finally {
  client.release();
  await pool.end();
}
