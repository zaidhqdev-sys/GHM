require("dotenv/config");
const { Pool } = require("pg");

(async () => {
  const pool = new Pool({
    connectionString: process.env.GHM_MIGRATOR_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  try {
    await client.query("SET ROLE ghm_schema_owner");

    console.log("\n=== MIGRATION LEDGER COLUMNS ===");
    console.log((await client.query(`
      SELECT
        ordinal_position,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'ghm'
        AND table_name = 'ghm_schema_migrations'
      ORDER BY ordinal_position
    `)).rows);

    console.log("\n=== MIGRATION LEDGER CONSTRAINTS ===");
    console.log((await client.query(`
      SELECT
        conname,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'ghm.ghm_schema_migrations'::regclass
      ORDER BY conname
    `)).rows);

    console.log("\n=== RECENT MIGRATION LEDGER ROWS ===");
    console.log((await client.query(`
      SELECT *
      FROM ghm.ghm_schema_migrations
      ORDER BY 1 DESC
      LIMIT 20
    `)).rows);

  } finally {
    client.release();
    await pool.end();
  }
})().catch(err => {
  console.error("\nAUDIT FAILED:");
  console.error(err);
  process.exit(1);
});
