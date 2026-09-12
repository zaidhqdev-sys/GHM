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

    console.log("\n=== IDENTITY ===");
    console.log((await client.query(`
      SELECT
        current_database() AS database_name,
        session_user,
        current_user,
        current_role
    `)).rows);

    console.log("\n=== VERIFICATION STATUS DEFAULT ===");
    console.log((await client.query(`
      SELECT
        column_name,
        column_default,
        is_nullable,
        data_type
      FROM information_schema.columns
      WHERE table_schema = 'ghm'
        AND table_name = 'business'
        AND column_name IN ('verification_status', 'is_verified', 'is_active')
      ORDER BY ordinal_position
    `)).rows);

    console.log("\n=== BUSINESS ROWS ===");
    console.log((await client.query(`
      SELECT
        id,
        name,
        slug,
        verification_status,
        is_verified,
        is_active,
        rating,
        review_count
      FROM ghm.business
      ORDER BY id
    `)).rows);

    console.log("\n=== BUSINESS CONSTRAINTS ===");
    console.log((await client.query(`
      SELECT
        conname,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'ghm.business'::regclass
      ORDER BY conname
    `)).rows);

    console.log("\n=== MIGRATION LEDGER ===");
    console.log((await client.query(`
      SELECT *
      FROM ghm.ghm_schema_migrations
      WHERE migration_name IN (
        '20260911210000_reconcile_business_verification_state',
        '20260911211000_establish_business_review_aggregates',
        '20260911211500_reconcile_business_verification_default'
      )
      ORDER BY migration_name
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
