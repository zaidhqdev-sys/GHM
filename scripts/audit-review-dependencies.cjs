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

    console.log("\n=== REVIEW DEPENDENCY TABLES ===");
    console.log((await client.query(`
      SELECT
        table_schema,
        table_name
      FROM information_schema.tables
      WHERE table_schema = 'ghm'
        AND table_name IN ('account_identity', 'business', 'review')
      ORDER BY table_name
    `)).rows);

    for (const table of ['account_identity', 'business']) {
      console.log(`\n=== ${table.toUpperCase()} COLUMNS ===`);
      console.log((await client.query(`
        SELECT
          ordinal_position,
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'ghm'
          AND table_name = $1
        ORDER BY ordinal_position
      `, [table])).rows);

      console.log(`\n=== ${table.toUpperCase()} CONSTRAINTS ===`);
      console.log((await client.query(`
        SELECT
          conname,
          pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = $1::regclass
        ORDER BY conname
      `, [`ghm.${table}`])).rows);

      console.log(`\n=== ${table.toUpperCase()} INDEXES ===`);
      console.log((await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'ghm'
          AND tablename = $1
        ORDER BY indexname
      `, [table])).rows);
    }

    console.log("\n=== BUSINESS ELIGIBILITY SAMPLE ===");
    console.log((await client.query(`
      SELECT
        id,
        name,
        verification_status,
        is_verified,
        is_active,
        rating,
        review_count
      FROM ghm.business
      ORDER BY id
      LIMIT 20
    `)).rows);

    console.log("\n=== ACCOUNT IDENTITY ROLE / STATUS SHAPE ===");
    console.log((await client.query(`
      SELECT *
      FROM ghm.account_identity
      ORDER BY id
      LIMIT 20
    `)).rows);

    console.log("\n=== REVIEW OBJECTS CURRENTLY PRESENT ===");
    console.log((await client.query(`
      SELECT
        n.nspname AS schema_name,
        c.relname AS object_name,
        c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'ghm'
        AND (
          c.relname ILIKE '%review%'
          OR c.relname ILIKE '%rating%'
        )
      ORDER BY c.relname
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
