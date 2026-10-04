import "dotenv/config";

import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.GHM_QUALIFICATION_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("missing GHM_QUALIFICATION_DATABASE_URL or DATABASE_URL");
  process.exit(2);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: ["true", "require"].includes((process.env.DATABASE_SSL ?? "").trim().toLowerCase())
    ? { rejectUnauthorized: false }
    : undefined,
});

let mutationObserved = false;
const evidence = [];

async function q(sql, params = []) {
  return client.query(sql, params);
}

async function expectFailure(label, fn) {
  try {
    await fn();
    evidence.push({ label, status: "FAIL", reason: "operation unexpectedly succeeded" });
    mutationObserved = true;
  } catch (error) {
    evidence.push({ label, status: "PASS", reason: String(error.message).slice(0, 240) });
  }
}

try {
  await client.connect();

  const identity = await q("select current_user, session_user, current_schema()");
  evidence.push({ label: "runtime identity", status: "OBSERVED", ...identity.rows[0] });

  await q("set search_path = ghm, public");

  await expectFailure("direct runtime INSERT is denied", async () => {
    await q(
      `insert into ghm.storage_object
       (tenant_business_id, resource_type, resource_id, object_class, provider_key, content_type, byte_size, visibility)
       values (1, 'qualification', 0, 'qualification_probe', 'qualification/probe', 'image/png', 1, 'private')`
    );
  });

  const tablePrivileges = await q(`
    select
      has_table_privilege(current_user, 'ghm.storage_object', 'INSERT') as insert_allowed,
      has_table_privilege(current_user, 'ghm.storage_object', 'UPDATE') as update_allowed,
      has_table_privilege(current_user, 'ghm.storage_object', 'DELETE') as delete_allowed
  `);
  evidence.push({ label: "direct table DML privileges", status: "OBSERVED", ...tablePrivileges.rows[0] });

  const probe = await q(`
    select ghm.storage_create_pending(
      1, 'qualification', 0, 'qualification_probe',
      'qualification/probe-' || gen_random_uuid()::text,
      'image/png', 1, 'private', 'probe.png'
    ) as row
  `);
  const objectId = probe.rows[0].row.id;
  evidence.push({ label: "create pending through canonical function", status: "PASS", object_id: objectId });

  await expectFailure("pending object cannot be marked deleted directly", async () => {
    await q("select ghm.storage_mark_deleted($1)", [objectId]);
  });

  await q("select ghm.storage_mark_available($1, $2)", [objectId, "qualification-checksum"]);
  evidence.push({ label: "pending -> available", status: "PASS" });

  await q("select ghm.storage_mark_deletion_pending($1)", [objectId]);
  evidence.push({ label: "available -> deletion_pending", status: "PASS" });

  await q("select ghm.storage_mark_deleted($1)", [objectId]);
  evidence.push({ label: "deletion_pending -> deleted", status: "PASS" });

  const final = await q("select id, status, checksum, deleted_at from ghm.storage_object where id = $1", [objectId]);
  evidence.push({ label: "final lifecycle state", status: final.rows[0].status === "deleted" ? "PASS" : "FAIL", row: final.rows[0] });

  await q("begin");
  await q("select set_config('statement_timeout', '5000', true)");
  await q("rollback");

  console.log(JSON.stringify({
    status: mutationObserved ? "FAIL" : "QUALIFIED",
    mutation_authorized: false,
    evidence,
  }, null, 2));

  if (mutationObserved) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: "BLOCKED", error: String(error.message) }, null, 2));
  process.exitCode = 2;
} finally {
  await client.end().catch(() => {});
}
