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

    console.log("\n=== MIGRATION LEDGER ===");
    console.log((await client.query(`
      SELECT *
      FROM ghm.ghm_schema_migrations
      ORDER BY version
    `)).rows);

    console.log("\n=== BUSINESS MIGRATION OBJECT STATE ===");
    console.log((await client.query(`
      SELECT
        table_schema,
        table_name,
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'ghm'
        AND table_name = 'business'
      ORDER BY ordinal_position
    `)).rows);

    console.log("\n=== BUSINESS MIGRATION CONSTRAINT STATE ===");
    console.log((await client.query(`
      SELECT
        conname,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'ghm.business'::regclass
      ORDER BY conname
    `)).rows);

    console.log("\n=== MIGRATION FILE TARGETS VS LEDGER ===");

    const versions = [
      '20260911210000',
      '20260911211000',
      '20260911211500'
    ];

    for (const version of versions) {
      const result = await client.query(`
        SELECT *
        FROM ghm.ghm_schema_migrations
        WHERE version = $1
      `, [version]);

      console.log(version, result.rows);
    }

  } finally {
    client.release();
    await pool.end();
  }
})().catch(err => {
  console.error("\nAUDIT FAILED:");
  console.error(err);
  process.exit(1);
});
