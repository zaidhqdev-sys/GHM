import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !gatewayUrl || !migratorUrl || new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) {
  throw new Error('Dedicated runtime, actor gateway and migrator connections are required');
}

const { CapabilityServiceImpl } = await import('../dist/resources/capability/service.js');
const { PgCapabilityRepository } = await import('../dist/resources/capability/repository.js');

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const gatewayPool = new Pool({ connectionString: gatewayUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-capability-governance-${randomUUID()}`;
const accountIds = [];
const capabilityIds = [];

const expectReject = async (work, label, expectedText) => {
  try { await work(); }
  catch (error) {
    if (expectedText && !String(error?.message).includes(expectedText)) {
      throw new Error(`${label}: expected "${expectedText}", received "${error?.message}"`);
    }
    console.log(label);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const createAccount = async (role) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role)
       VALUES ($1, $2) RETURNING id`,
      [`${marker} ${role}`, role],
    );
    await client.query('COMMIT');
    const id = Number(result.rows[0].id);
    accountIds.push(id);
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
};

const cleanup = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    for (const id of [...capabilityIds].reverse()) {
      await client.query('DELETE FROM ghm.capability WHERE id = $1', [id]);
    }
    if (accountIds.length) {
      await client.query('DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])', [accountIds]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Capability governance cleanup failed: ${error?.message ?? error}`);
  } finally { client.release(); }
};

try {
  const adminId = await createAccount('admin');
  const businessId = await createAccount('business');
  const admin = { userId: adminId, role: 'admin' };
  const business = { userId: businessId, role: 'business' };
  const service = new CapabilityServiceImpl(new PgCapabilityRepository(runtimePool));

  await expectReject(() => service.listGoverned(business), 'SERVICE NON-ADMIN READ DENIAL PASS', 'Insufficient role');
  await expectReject(() => gatewayPool.query('SET ROLE ghm_runtime'), 'GATEWAY CANNOT ASSUME RUNTIME ROLE PASS', 'permission denied');
  await expectReject(() => runtimePool.query('SET ROLE ghm_actor_gateway'), 'RUNTIME CANNOT ASSUME GATEWAY ROLE PASS', 'permission denied');

  const gatewayList = await gatewayPool.query('SELECT * FROM ghm.gateway_list_capabilities($1)', [adminId]);
  if (!Array.isArray(gatewayList.rows)) throw new Error('Gateway capability listing did not return rows');
  console.log('GATEWAY ADMIN LIST POSITIVE PASS');
  await expectReject(
    () => gatewayPool.query('SELECT * FROM ghm.gateway_list_capabilities($1)', [businessId]),
    'GATEWAY NON-ADMIN LIST DENIAL PASS',
    'System administrator permission required',
  );

  const replacement = await service.createDraft(admin, {
    name: `${marker} Replacement`, slug: `${marker}-replacement`,
    sourceReference: 'runtime-qualification',
  });
  capabilityIds.push(replacement.id);
  if (replacement.lifecycleStatus !== 'draft' || replacement.isSelectable || replacement.sourceAuthority !== 'GHM System Administration') {
    throw new Error(`Capability draft authority/state mismatch: ${JSON.stringify(replacement)}`);
  }
  console.log('ADMIN DRAFT CREATE + SERVER AUTHORITY PASS');

  await expectReject(
    () => service.createDraft(business, { name: `${marker} Forbidden`, slug: `${marker}-forbidden` }),
    'SERVICE NON-ADMIN DRAFT DENIAL PASS',
    'Insufficient role',
  );

  await expectReject(
    () => runtimePool.query(
      'SELECT * FROM ghm.create_capability_draft($1,$2,$3,$4,$5,$6,$7,$8)',
      [businessId, `${marker} Direct`, `${marker}-direct`, null, null, 0, null, 1],
    ),
    'DATABASE FUNCTION NON-ADMIN DENIAL PASS',
    'System administrator permission required',
  );

  await expectReject(
    () => runtimePool.query(
      'SELECT * FROM ghm.create_capability_draft($1,$2,$3,$4,$5,$6,$7,$8)',
      [adminId, `${marker} Unsupported`, `${marker}-unsupported`, null, null, 0, null, 2],
    ),
    'DATABASE FUNCTION VERSION GUARD PASS',
    'Unsupported Capability taxonomy version',
  );

  const updated = await service.updateDraft(admin, replacement.id, {
    name: `${marker} Replacement Updated`, slug: `${marker}-replacement`,
    description: 'Updated through GHM governance API', sortOrder: 20,
    sourceReference: 'runtime-qualification-updated',
  });
  if (updated.name !== `${marker} Replacement Updated` || updated.sortOrder !== 20) {
    throw new Error(`Capability draft update did not persist: ${JSON.stringify(updated)}`);
  }
  console.log('ADMIN DRAFT UPDATE PASS');

  const parent = await service.createDraft(admin, {
    name: `${marker} Parent`, slug: `${marker}-parent`,
  });
  capabilityIds.push(parent.id);
  const child = await service.createDraft(admin, {
    name: `${marker} Child`, slug: `${marker}-child`, parentId: parent.id,
  });
  capabilityIds.push(child.id);

  const activeReplacement = await service.transition(admin, replacement.id, 'active');
  if (activeReplacement.lifecycleStatus !== 'active' || !activeReplacement.isSelectable) {
    throw new Error(`Draft activation failed: ${JSON.stringify(activeReplacement)}`);
  }
  await service.transition(admin, parent.id, 'active');
  await service.transition(admin, child.id, 'active');
  console.log('DRAFT TO ACTIVE LIFECYCLE PASS');

  await expectReject(async () => {
    const client = await cleanupPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      await client.query('UPDATE ghm.capability SET parent_id = $1 WHERE id = $2', [child.id, parent.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }, 'DATABASE DIRECT-SQL HIERARCHY CYCLE DENIAL PASS', 'Capability hierarchy cycle detected');

  await expectReject(async () => {
    const client = await cleanupPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      await client.query(
        'INSERT INTO ghm.capability (id,name,slug,lifecycle_status,taxonomy_version,source_authority) VALUES ($1,$2,$3,$4,$5,$6)',
        [randomUUID(), `${marker} duplicate`, `${marker}-replacement`, 'draft', 1, 'qualification'],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }, 'DATABASE DIRECT-SQL DUPLICATE SLUG DENIAL PASS', 'duplicate key');


  await expectReject(
    () => service.transition(admin, parent.id, 'retired', replacement.id),
    'PARENT RETIREMENT CHILD GUARD PASS',
    'non-retired children',
  );

  await service.transition(admin, child.id, 'retired', replacement.id);
  const deprecated = await service.transition(admin, parent.id, 'deprecated', replacement.id);
  if (deprecated.lifecycleStatus !== 'deprecated' || deprecated.replacedByCapabilityId !== replacement.id || deprecated.isSelectable) {
    throw new Error(`Capability deprecation/replacement mismatch: ${JSON.stringify(deprecated)}`);
  }
  const reactivated = await service.transition(admin, parent.id, 'active');
  if (reactivated.lifecycleStatus !== 'active' || reactivated.replacedByCapabilityId !== null || !reactivated.isSelectable) {
    throw new Error(`Capability reactivation mismatch: ${JSON.stringify(reactivated)}`);
  }
  const retired = await service.transition(admin, parent.id, 'retired', replacement.id);
  if (retired.lifecycleStatus !== 'retired' || retired.replacedByCapabilityId !== replacement.id || retired.isSelectable) {
    throw new Error(`Capability retirement mismatch: ${JSON.stringify(retired)}`);
  }
  console.log('DEPRECATE, REACTIVATE, RETIRE + REPLACEMENT PASS');

  await expectReject(async () => {
    const client = await cleanupPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      await client.query("UPDATE ghm.capability SET lifecycle_status = 'deprecated' WHERE id = $1", [replacement.id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }, 'DATABASE DIRECT-SQL REPLACEMENT TARGET RETENTION PASS', 'cannot leave active state or change taxonomy version');


  await expectReject(
    () => service.transition(admin, parent.id, 'active'),
    'RETIRED CAPABILITY TERMINAL STATE PASS',
    'Invalid Capability lifecycle transition',
  );

  await expectReject(
    () => runtimePool.query(`UPDATE ghm.capability SET name = 'unauthorized' WHERE id = $1`, [replacement.id]),
    'RUNTIME DIRECT UPDATE DENIAL PASS',
    'permission denied',
  );
  await expectReject(
    () => runtimePool.query('DELETE FROM ghm.capability WHERE id = $1', [replacement.id]),
    'RUNTIME DIRECT DELETE DENIAL PASS',
    'permission denied',
  );

  await expectReject(
    () => runtimePool.query(
      'SELECT * FROM ghm.gateway_create_capability_draft($1,$2,$3,$4,$5,$6,$7,$8)',
      [adminId, `${marker} Gateway Spoof`, `${marker}-gateway-spoof`, null, null, 0, null, 1],
    ),
    'RUNTIME GATEWAY PRINCIPAL FUNCTION DENIAL PASS',
    'permission denied',
  );

  const privilege = await runtimePool.query(
    `SELECT has_table_privilege(current_user, 'ghm.capability', 'INSERT') AS can_insert,
            has_table_privilege(current_user, 'ghm.capability', 'UPDATE') AS can_update,
            has_table_privilege(current_user, 'ghm.capability', 'DELETE') AS can_delete,
            has_function_privilege(current_user, 'ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)', 'EXECUTE') AS can_create,
            has_function_privilege(current_user, 'ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)', 'EXECUTE') AS can_update_draft,
            has_function_privilege(current_user, 'ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer)', 'EXECUTE') AS can_transition,
            has_function_privilege(current_user, 'ghm.gateway_list_capabilities(bigint)', 'EXECUTE') AS can_gateway_list,
            has_function_privilege(current_user, 'ghm.gateway_create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)', 'EXECUTE') AS can_gateway_create,
            has_function_privilege(current_user, 'ghm.gateway_update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)', 'EXECUTE') AS can_gateway_update,
            has_function_privilege(current_user, 'ghm.gateway_transition_capability_lifecycle(bigint,uuid,text,uuid,integer)', 'EXECUTE') AS can_gateway_transition`,
  );
  const p = privilege.rows[0];
  if (p.can_insert || p.can_update || p.can_delete || !p.can_create || !p.can_update_draft || !p.can_transition || p.can_gateway_list || p.can_gateway_create || p.can_gateway_update || p.can_gateway_transition) {
    throw new Error(`Unexpected capability catalogue runtime privileges: ${JSON.stringify(p)}`);
  }
  console.log('RUNTIME CAPABILITY GOVERNANCE PRIVILEGE BOUNDARY PASS');
  console.log('GHM CAPABILITY CATALOGUE GOVERNANCE RUNTIME QUALIFICATION: PASS');
} finally {
  await cleanup();
  await runtimePool.end();
  await gatewayPool.end();
  await cleanupPool.end();
}
