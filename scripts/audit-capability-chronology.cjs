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
      SELECT version, name, applied_at
      FROM ghm.ghm_schema_migrations
      WHERE version IN (
        '20260914150000',
        '20260914220000'
      )
      ORDER BY version;
    `);

    console.table(result.rows);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
