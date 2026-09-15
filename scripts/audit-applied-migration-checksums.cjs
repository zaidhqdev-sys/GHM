require("dotenv/config");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

(async () => {
  const pool = new Pool({
    connectionString: process.env.GHM_MIGRATOR_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  try {
    await client.query("SET ROLE ghm_schema_owner");

    const ledger = await client.query(`
      SELECT version, name, checksum
      FROM ghm.ghm_schema_migrations
      ORDER BY version;
    `);

    const migrationDir = path.resolve("database", "migrations");
    const files = fs.readdirSync(migrationDir)
      .filter(name => /^\d{14}_[a-z0-9][a-z0-9_-]*\.sql$/.test(name));

    const byVersion = new Map();

    for (const file of files) {
      const version = file.slice(0, 14);
      const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
      const checksum = crypto.createHash("sha256").update(sql, "utf8").digest("hex");
      byVersion.set(version, { file, checksum });
    }

    const mismatches = [];
    const missingFiles = [];

    for (const row of ledger.rows) {
      const local = byVersion.get(row.version);

      if (!local) {
        missingFiles.push(row);
        continue;
      }

      if (local.checksum !== row.checksum) {
        mismatches.push({
          version: row.version,
          name: row.name,
          ledger: row.checksum,
          repository: local.checksum,
          file: local.file
        });
      }
    }

    console.log("\n=== APPLIED MIGRATION CHECKSUM RECONCILIATION ===");
    console.log(`Applied migrations: ${ledger.rows.length}`);
    console.log(`Checksum mismatches: ${mismatches.length}`);
    console.log(`Ledger entries missing from repository: ${missingFiles.length}`);

    if (mismatches.length) {
      console.table(mismatches);
    }

    if (missingFiles.length) {
      console.table(missingFiles);
    }

    if (!mismatches.length && !missingFiles.length) {
      console.log("PASS: all applied migration checksums match repository files.");
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
