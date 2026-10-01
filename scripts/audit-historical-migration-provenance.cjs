const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PROVENANCE_PATH = path.resolve("config", "historical-migration-provenance-exceptions.json");
const EXPECTED = new Map(Object.entries(JSON.parse(fs.readFileSync(PROVENANCE_PATH, "utf8"))));

const migrationDir = path.resolve("database", "migrations");
const failures = [];

for (const [version, expected] of EXPECTED) {
  const file = fs.readdirSync(migrationDir)
    .find((name) => name.startsWith(version + "_") && name.endsWith(".sql"));

  if (!file) {
    failures.push(`${version}: repository migration file missing`);
    continue;
  }

  const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
  const repository = crypto.createHash("sha256").update(sql, "utf8").digest("hex");

  if (repository === expected) {
    failures.push(`${version}: unexpectedly matches historical checksum; reclassify provenance before changing this test`);
  }
}

if (failures.length) {
  console.error("FAIL: historical migration provenance assumptions changed.");
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`PASS: ${EXPECTED.size} historical migration provenance exceptions remain explicitly identified.`);
