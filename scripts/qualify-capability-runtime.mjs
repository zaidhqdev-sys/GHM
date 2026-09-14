import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";

const { Pool } = pg;

const runtimeUrl =
  process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) {
  throw new Error("GHM_RUNTIME_DATABASE_URL/DATABASE_URL is required");
}
if (!migratorUrl) {
  throw new Error("GHM_MIGRATOR_DATABASE_URL is required");
}
if (runtimeUrl === migratorUrl) {
  throw new Error("Runtime and migrator database URLs must be distinct");
}

const runtimePool = new Pool({
  connectionString: runtimeUrl,
  ssl: { rejectUnauthorized: false },
});

const migratorPool = new Pool({
  connectionString: migratorUrl,
  ssl: { rejectUnauthorized: false },
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const expectFailure = async (label, fn) => {
  try {
    await fn();
  } catch {
    console.log(`${label} PASS`);
    return;
  }

  throw new Error(`${label} expected failure`);
};

const expectQueryFailure = async (label, client, sql, params = []) => {
  await expectFailure(label, () => client.query(sql, params));
};

async function main() {
  const runtime = await runtimePool.connect();
  const migrator = await migratorPool.connect();

  const ids = {
    root: randomUUID(),
    child: randomUUID(),
    inactive: randomUUID(),
    replacement: randomUUID(),
    deprecated: randomUUID(),
    cycleA: randomUUID(),
    cycleB: randomUUID(),
    inactiveReplacement: randomUUID(),
  };

  let fixturesCreated = false;

  try {
    const runtimeIdentity = await runtime.query(
      `SELECT current_user, current_database()`,
    );

    assert(
      runtimeIdentity.rows[0].current_user === "ghm_runtime",
      `Unexpected runtime user: ${runtimeIdentity.rows[0].current_user}`,
    );
    assert(
      runtimeIdentity.rows[0].current_database === "ghm_db",
      `Unexpected runtime database: ${runtimeIdentity.rows[0].current_database}`,
    );

    console.log("RUNTIME IDENTITY PASS");

    const migratorIdentity = await migrator.query(
      `SELECT current_user, session_user, current_database()`,
    );

    assert(
      migratorIdentity.rows[0].session_user === "ghm_migrator",
      `Unexpected migrator session user: ${migratorIdentity.rows[0].session_user}`,
    );
    assert(
      migratorIdentity.rows[0].current_database === "ghm_db",
      `Unexpected migrator database: ${migratorIdentity.rows[0].current_database}`,
    );

    await migrator.query(`SET ROLE ghm_schema_owner`);

    const ownerIdentity = await migrator.query(
      `SELECT current_user, session_user, current_database()`,
    );

    assert(
      ownerIdentity.rows[0].current_user === "ghm_schema_owner",
      `SET ROLE failed: ${ownerIdentity.rows[0].current_user}`,
    );
    assert(
      ownerIdentity.rows[0].session_user === "ghm_migrator",
      `Unexpected session user after SET ROLE: ${ownerIdentity.rows[0].session_user}`,
    );

    console.log("MIGRATOR AUTHORITY BOUNDARY PASS");

    await migrator.query("BEGIN");

    try {
      await migrator.query(
        `INSERT INTO ghm.capability
          (id, name, slug, lifecycle_status, taxonomy_version,
           source_authority, is_selectable)
         VALUES
          ($1, 'Qualification Root', 'qualification-root',
           'active', 1, 'GHM Qualification', false),
          ($2, 'Qualification Child', 'qualification-child',
           'active', 1, 'GHM Qualification', true),
          ($3, 'Qualification Inactive', 'qualification-inactive',
           'draft', 1, 'GHM Qualification', false),
          ($4, 'Qualification Replacement', 'qualification-replacement',
           'active', 1, 'GHM Qualification', true),
          ($5, 'Qualification Deprecated', 'qualification-deprecated',
           'deprecated', 1, 'GHM Qualification', false),
          ($6, 'Governance Cycle A', 'governance-cycle-a',
           'active', 1, 'GHM Qualification', false),
          ($7, 'Governance Cycle B', 'governance-cycle-b',
           'active', 1, 'GHM Qualification', false),
          ($8, 'Governance Inactive Replacement',
           'governance-inactive-replacement',
           'draft', 1, 'GHM Qualification', false)`,
        [
          ids.root,
          ids.child,
          ids.inactive,
          ids.replacement,
          ids.deprecated,
          ids.cycleA,
          ids.cycleB,
          ids.inactiveReplacement,
        ],
      );

      await migrator.query(
        `UPDATE ghm.capability
         SET parent_id = $1
         WHERE id = $2`,
        [ids.root, ids.child],
      );

      await migrator.query(
        `UPDATE ghm.capability
         SET replaced_by_capability_id = $1
         WHERE id = $2`,
        [ids.replacement, ids.deprecated],
      );

      await migrator.query("COMMIT");
      fixturesCreated = true;
    } catch (error) {
      await migrator.query("ROLLBACK");
      throw error;
    }

    console.log("QUALIFICATION FIXTURES CREATED PASS");

    const schema = await runtime.query(`
      SELECT
        c.column_name,
        c.data_type,
        c.is_nullable
      FROM information_schema.columns c
      WHERE c.table_schema = 'ghm'
        AND c.table_name = 'capability'
      ORDER BY c.ordinal_position
    `);

    const expectedColumns = [
      "id",
      "parent_id",
      "name",
      "slug",
      "description",
      "sort_order",
      "lifecycle_status",
      "taxonomy_version",
      "effective_from",
      "effective_to",
      "source_authority",
      "source_reference",
      "replaced_by_capability_id",
      "is_selectable",
      "created_at",
      "updated_at",
    ];

    assert(
      schema.rows.map((row) => row.column_name).join(",") ===
        expectedColumns.join(","),
      "Capability column contract mismatch",
    );

    assert(
      schema.rows.find((row) => row.column_name === "id").data_type ===
        "uuid",
      "Capability id must be uuid",
    );

    console.log("CAPABILITY SCHEMA PRESENCE PASS");

    const hierarchy = await runtime.query(
      `SELECT parent_id
       FROM ghm.capability
       WHERE id = $1`,
      [ids.child],
    );

    assert(hierarchy.rows.length === 1, "Capability child missing");
    assert(
      hierarchy.rows[0].parent_id === ids.root,
      "Capability hierarchy parent mismatch",
    );

    console.log("CAPABILITY HIERARCHY PASS");

    const active = await runtime.query(
      `SELECT id
       FROM ghm.capability
       WHERE lifecycle_status = 'active'
       ORDER BY sort_order, name, id`,
    );

    assert(
      active.rows.some((row) => row.id === ids.child),
      "Active capability missing",
    );
    assert(
      !active.rows.some((row) => row.id === ids.inactive),
      "Inactive capability leaked into active catalogue",
    );

    console.log("ACTIVE CAPABILITY FILTER PASS");

    const selectable = await runtime.query(
      `SELECT id
       FROM ghm.capability
       WHERE lifecycle_status = 'active'
         AND is_selectable = true
       ORDER BY sort_order, name, id`,
    );

    assert(
      selectable.rows.some((row) => row.id === ids.child),
      "Selectable capability missing",
    );
    assert(
      !selectable.rows.some((row) => row.id === ids.root),
      "Non-selectable capability leaked",
    );

    console.log("SELECTABLE CAPABILITY FILTER PASS");

    const explicit = await runtime.query(
      `SELECT
         id,
         parent_id,
         name,
         slug,
         lifecycle_status,
         taxonomy_version,
         source_authority,
         replaced_by_capability_id,
         is_selectable
       FROM ghm.capability
       WHERE id = $1`,
      [ids.child],
    );

    assert(explicit.rows.length === 1, "Explicit capability read failed");
    assert(explicit.rows[0].id === ids.child, "Explicit ID mismatch");
    assert(explicit.rows[0].name === "Qualification Child", "Name mismatch");
    assert(explicit.rows[0].slug === "qualification-child", "Slug mismatch");
    assert(
      explicit.rows[0].lifecycle_status === "active",
      "Lifecycle mismatch",
    );
    assert(
      explicit.rows[0].is_selectable === true,
      "Selectable mapping mismatch",
    );

    console.log("EXPLICIT CAPABILITY READ PASS");

    const integrity = await runtime.query(
      `SELECT
         d.lifecycle_status AS deprecated_status,
         d.replaced_by_capability_id,
         r.lifecycle_status AS replacement_status
       FROM ghm.capability d
       LEFT JOIN ghm.capability r
         ON r.id = d.replaced_by_capability_id
       WHERE d.id = $1`,
      [ids.deprecated],
    );

    assert(integrity.rows.length === 1, "Deprecated capability missing");
    assert(
      integrity.rows[0].deprecated_status === "deprecated",
      "Deprecated lifecycle mismatch",
    );
    assert(
      integrity.rows[0].replaced_by_capability_id === ids.replacement,
      "Replacement mapping mismatch",
    );
    assert(
      integrity.rows[0].replacement_status === "active",
      "Replacement must be active",
    );

    console.log("SOURCE AND REPLACEMENT INTEGRITY PASS");

    await expectQueryFailure(
      "INVALID LIFECYCLE DENIAL",
      migrator,
      `INSERT INTO ghm.capability
        (id, name, slug, lifecycle_status, source_authority)
       VALUES ($1, 'Invalid Lifecycle', 'invalid-lifecycle',
               'invalid', 'GHM Qualification')`,
      [randomUUID()],
    );

    await expectQueryFailure(
      "SELF-PARENT DENIAL",
      migrator,
      `UPDATE ghm.capability
       SET parent_id = id
       WHERE id = $1`,
      [ids.child],
    );

    try {
      await migrator.query("BEGIN");

      await migrator.query(
        `UPDATE ghm.capability
         SET parent_id = $1
         WHERE id = $2`,
        [ids.cycleB, ids.cycleA],
      );

      let cycleRejected = false;

      try {
        await migrator.query(
          `UPDATE ghm.capability
           SET parent_id = $1
           WHERE id = $2`,
          [ids.cycleA, ids.cycleB],
        );
      } catch {
        cycleRejected = true;
      }

      await migrator.query("ROLLBACK");

      assert(cycleRejected, "Hierarchy cycle was not rejected");
      console.log("HIERARCHY CYCLE DENIAL PASS");
    } catch (error) {
      try {
        await migrator.query("ROLLBACK");
      } catch {}
      throw error;
    }

    try {
      await migrator.query("BEGIN");

      await migrator.query(
        `UPDATE ghm.capability
         SET lifecycle_status = 'deprecated',
             replaced_by_capability_id = $1
         WHERE id = $2`,
        [ids.replacement, ids.child],
      );

      const replacement = await migrator.query(
        `SELECT lifecycle_status, replaced_by_capability_id
         FROM ghm.capability
         WHERE id = $1`,
        [ids.child],
      );

      assert(
        replacement.rows[0].lifecycle_status === "deprecated",
        "Deprecated replacement source was not accepted",
      );
      assert(
        replacement.rows[0].replaced_by_capability_id === ids.replacement,
        "Active replacement was not accepted for deprecated Capability",
      );

      await migrator.query("ROLLBACK");
      console.log("DEPRECATED ACTIVE-REPLACEMENT ACCEPTANCE PASS");
    } catch (error) {
      try {
        await migrator.query("ROLLBACK");
      } catch {}
      throw error;
    }

    await expectQueryFailure(
      "INACTIVE REPLACEMENT DENIAL",
      migrator,
      `UPDATE ghm.capability
       SET lifecycle_status = 'deprecated',
           replaced_by_capability_id = $1
       WHERE id = $2`,
      [ids.inactiveReplacement, ids.child],
    );

    await expectQueryFailure(
      "SELF-REPLACEMENT DENIAL",
      migrator,
      `UPDATE ghm.capability
       SET lifecycle_status = 'deprecated',
           replaced_by_capability_id = id
       WHERE id = $1`,
      [ids.child],
    );

    await expectQueryFailure(
      "PUBLISHED SLUG IMMUTABILITY DENIAL",
      migrator,
      `UPDATE ghm.capability
       SET slug = 'changed-published-slug'
       WHERE id = $1`,
      [ids.child],
    );

    await expectQueryFailure(
      "RETIREMENT CHILD PROTECTION DENIAL",
      migrator,
      `UPDATE ghm.capability
       SET lifecycle_status = 'retired'
       WHERE id = $1`,
      [ids.root],
    );

    console.log("CAPABILITY GOVERNANCE INTEGRITY PASS");

    await expectQueryFailure(
      "RUNTIME INSERT DENIAL",
      runtime,
      `INSERT INTO ghm.capability
        (id, name, slug, lifecycle_status, source_authority)
       VALUES ($1, 'Runtime Insert', 'runtime-insert',
               'draft', 'GHM Qualification')`,
      [randomUUID()],
    );

    await expectQueryFailure(
      "RUNTIME UPDATE DENIAL",
      runtime,
      `UPDATE ghm.capability
       SET name = 'Runtime Mutation'
       WHERE id = $1`,
      [ids.child],
    );

    await expectQueryFailure(
      "RUNTIME DELETE DENIAL",
      runtime,
      `DELETE FROM ghm.capability
       WHERE id = $1`,
      [ids.child],
    );

    console.log("LEAST PRIVILEGE PROBES PASS");

    const privilegeChecks = await Promise.all([
      runtime.query(`
        SELECT has_schema_privilege(current_user, 'ghm', 'USAGE') AS allowed
      `),
      runtime.query(`
        SELECT has_table_privilege(current_user, 'ghm.capability', 'SELECT') AS allowed
      `),
      runtime.query(`
        SELECT has_table_privilege(current_user, 'ghm.capability', 'INSERT') AS allowed
      `),
      runtime.query(`
        SELECT has_table_privilege(current_user, 'ghm.capability', 'UPDATE') AS allowed
      `),
      runtime.query(`
        SELECT has_table_privilege(current_user, 'ghm.capability', 'DELETE') AS allowed
      `),
    ]);

    assert(privilegeChecks[0].rows[0].allowed === true, "Schema USAGE missing");
    assert(privilegeChecks[1].rows[0].allowed === true, "SELECT privilege missing");
    assert(privilegeChecks[2].rows[0].allowed === false, "INSERT privilege leaked");
    assert(privilegeChecks[3].rows[0].allowed === false, "UPDATE privilege leaked");
    assert(privilegeChecks[4].rows[0].allowed === false, "DELETE privilege leaked");

    console.log("PRIVILEGE BOUNDARY PASS");

    const readonlyBefore = await runtime.query(
      `SELECT id, name, slug, lifecycle_status
       FROM ghm.capability
       WHERE id IN ($1, $2, $3, $4, $5)
       ORDER BY id`,
      [
        ids.root,
        ids.child,
        ids.inactive,
        ids.replacement,
        ids.deprecated,
      ],
    );

    assert(readonlyBefore.rows.length === 5, "Read-only baseline incomplete");

    console.log("READ-ONLY PRESERVATION PASS");

    const rollbackClient = await migratorPool.connect();

    try {
      await rollbackClient.query(`SET ROLE ghm_schema_owner`);
      await rollbackClient.query("BEGIN");

      await rollbackClient.query(
        `UPDATE ghm.capability
         SET name = 'Rollback Mutation'
         WHERE id = $1`,
        [ids.child],
      );

      await rollbackClient.query("ROLLBACK");

      const restored = await rollbackClient.query(
        `SELECT name
         FROM ghm.capability
         WHERE id = $1`,
        [ids.child],
      );

      assert(
        restored.rows[0].name === "Qualification Child",
        "Rollback did not restore Capability",
      );

      console.log("QUALIFICATION ROLLBACK PRESERVATION PASS");
    } finally {
      rollbackClient.release();
    }

    await migrator.query("BEGIN");

    try {
      await migrator.query(
        `DELETE FROM ghm.capability
         WHERE id IN ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          ids.child,
          ids.root,
          ids.inactive,
          ids.deprecated,
          ids.replacement,
          ids.cycleA,
          ids.cycleB,
          ids.inactiveReplacement,
        ],
      );

      await migrator.query("COMMIT");
      fixturesCreated = false;
    } catch (error) {
      await migrator.query("ROLLBACK");
      throw error;
    }

    console.log("QUALIFICATION FIXTURES CLEANED PASS");
    console.log("CAPABILITY RUNTIME QUALIFICATION: PASS");
  } finally {
    if (fixturesCreated) {
      try {
        await migrator.query("ROLLBACK");
      } catch {}

      try {
        await migrator.query(`SET ROLE ghm_schema_owner`);
        await migrator.query(
          `DELETE FROM ghm.capability
           WHERE id IN ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            ids.child,
            ids.root,
            ids.inactive,
            ids.deprecated,
            ids.replacement,
            ids.cycleA,
            ids.cycleB,
            ids.inactiveReplacement,
          ],
        );
      } catch (cleanupError) {
        console.error("QUALIFICATION CLEANUP WARNING:", cleanupError);
      }
    }

    runtime.release();
    migrator.release();

    await runtimePool.end();
    await migratorPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
