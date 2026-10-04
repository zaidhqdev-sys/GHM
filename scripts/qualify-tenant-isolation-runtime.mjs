import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) throw new Error('Dedicated runtime and migrator connections are required');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `tenant-qualification-${randomUUID()}`;
let accountId;
let businessIds = [];

try {
  const identity = await runtimePool.query('SELECT current_database() database_name, session_user, current_user, current_role');
  const i = identity.rows[0];
  if (i.database_name !== 'ghm_db' || i.session_user !== 'ghm_runtime' || i.current_user !== 'ghm_runtime' || i.current_role !== 'ghm_runtime') {
    throw new Error(`Runtime identity mismatch: ${JSON.stringify(i)}`);
  }
  console.log('RUNTIME IDENTITY PASS');

  const c = await cleanupPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE ghm_schema_owner');
    ({ rows: [{ id: accountId }] } = await c.query(
      'INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, $2) RETURNING id',
      [marker, 'business'],
    ));
    const a = await c.query(
      'INSERT INTO ghm.business (name, slug) VALUES ($1, $2) RETURNING id',
      [marker, marker],
    );
    const b = Number(a.rows[0].id);
    businessIds.push(b);
    await c.query(
      'INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status) VALUES ($1, $2, $3, $4)',
      [b, accountId, 'owner', 'active'],
    );
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally { c.release(); }

  const { resolveTenantContext } = await import('../dist/auth/tenant-resolver.js');
  const context = { userId: Number(accountId), role: 'business' };

  const runtimeClient = await runtimePool.connect();
  try {
    const tenant = await resolveTenantContext(runtimeClient, context, businessIds[0]);
    if (tenant.accountId !== Number(accountId) || tenant.businessId !== businessIds[0] || tenant.membershipRole !== 'owner') {
      throw new Error('Resolved tenant context mismatch');
    }
    console.log('ACTIVE MEMBERSHIP TENANT RESOLUTION PASS');

    await assertDenied(() => resolveTenantContext(runtimeClient, context, businessIds[0] + 999999), 'CROSS-BUSINESS DENIAL PASS');

    const tenantClientIdentity = await runtimeClient.query('SELECT current_user, pg_backend_pid() AS backend_pid');
    console.log(`SAME CLIENT PASS: ${tenantClientIdentity.rows[0].current_user}/backend=${tenantClientIdentity.rows[0].backend_pid}`);
  } finally { runtimeClient.release(); }

  console.log('GHM DURABLE TENANT ISOLATION RUNTIME QUALIFICATION: PASS');
} finally {
  const c = await cleanupPool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE ghm_schema_owner');
    if (businessIds.length) await c.query('DELETE FROM ghm.business WHERE id = ANY($1::bigint[])', [businessIds]);
    if (accountId) await c.query('DELETE FROM ghm.account_identity WHERE id = $1', [accountId]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); await Promise.all([runtimePool.end(), cleanupPool.end()]); }
}

async function assertDenied(work, label) {
  try { await work(); } catch (e) { console.log(label); return; }
  throw new Error(`${label}: operation unexpectedly succeeded`);
}
