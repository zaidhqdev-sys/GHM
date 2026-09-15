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

    const result = await client.query(`
      SELECT
        x.object_name,
        to_regclass(x.object_name) IS NOT NULL AS exists
      FROM (
        VALUES
          ('ghm.business'::text),
          ('ghm.account_identity'::text),
          ('ghm.country'::text),
          ('ghm.currency'::text)
      ) AS x(object_name)
      ORDER BY x.object_name;
    `);

    console.log("\n=== COMMERCIAL DEPENDENCY OBJECTS ===");
    console.table(result.rows);

    const ledger = await client.query(`
      SELECT version, name
      FROM ghm.ghm_schema_migrations
      WHERE version IN (
        '20260909150000',
        '20260910190000',
        '20260914100000',
        '20260914220000'
      )
      ORDER BY version;
    `);

    console.log("\n=== RELEVANT LEDGER ENTRIES ===");
    console.table(ledger.rows);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
