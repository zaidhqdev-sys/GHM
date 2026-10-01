const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const EXPECTED = new Map([
  ["20260911030000", "7c154d42d5444ee976fb0bf0bf24c172783d7ff4f62ee89d2e9157d3f8333e401"],
  ["20260911210000", "70d0ef6c298264462916197fb26f72c2a75480300dfb21750225975958062a36"],
  ["20260911211500", "32db502ea3a79317a95a0e54b4c72269e717900e2c770d456276f091dd4685a3"],
  ["20260912030000", "6a8e49e62d8ce0c8f848ae6b90fb93ef724f3d1986c0736dd9a4962d6938500d"],
  ["20260914120000", "e9da5f34d0a1f0a330318102fd3ea2b2999c4aaa2e40a42604052fdddc4285ae"],
  ["20260914130000", "aaac327303f6f67c9742cfab2bcf39cde532854566afd1574fbebabefbad42a7"],
  ["20260914220000", "076fd7a54c1e671bd4c7d49535a0540e4d6ac6c50fa97a21c6e0f0a4621892dd"],
  ["20260915193000", "55694a2e0359691cc4c5d5c990927aa9b11a73a78147c3fa0d35402170d22c67"],
  ["20260915194500", "24e65f01e364c7dc4b89340b8412e5f05f837dacc832d21d27e230ff8ad434d2"],
]);

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
