import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Pool } from 'pg';

if (process.env.NODE_ENV !== 'test') throw new Error('Business Analytics qualification is restricted to NODE_ENV=test');
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) throw new Error('Distinct runtime and migrator database URLs are required');

const require = createRequire(import.meta.url);
const { PostgresBusinessEngagementRepository } = require('../dist/resources/business-engagement/repository.js');
const { PostgresBusinessAnalyticsRepository } = require('../dist/resources/business-analytics/repository.js');
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const marker = `business-analytics-${randomUUID()}`;
let ownerId;
let viewerId;
let businessId;

try {
  const identity = await runtimePool.query('SELECT current_database() AS database_name, session_user, current_user');
  assert.equal(identity.rows[0].session_user, 'ghm_runtime');
  assert.equal(identity.rows[0].current_user, 'ghm_runtime');
  assert.equal(identity.rows[0].database_name, process.env.GHM_QUALIFICATION_DATABASE_NAME);

  const migrator = await migratorPool.connect();
  try {
    await migrator.query('SET ROLE ghm_schema_owner');
    await migrator.query('BEGIN');
    const owner = await migrator.query("INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id", [marker + '-owner']);
    ownerId = Number(owner.rows[0].id);
    const viewer = await migrator.query("INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'customer') RETURNING id", [marker + '-viewer']);
    viewerId = Number(viewer.rows[0].id);
    const business = await migrator.query(
      "INSERT INTO ghm.business (name, slug, verification_status, is_active, is_verified) VALUES ($1, $2, 'approved', true, true) RETURNING id",
      [marker, marker],
    );
    businessId = Number(business.rows[0].id);
    await migrator.query(
      "INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by) VALUES ($1, $2, 'owner', 'active', $2)",
      [businessId, ownerId],
    );
    await migrator.query('COMMIT');
  } catch (error) {
    await migrator.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    migrator.release();
  }

  const engagement = new PostgresBusinessEngagementRepository(runtimePool);
  const viewerContext = { userId: viewerId, role: 'customer' };
  const event = await engagement.record(viewerContext, { businessId, eventType: 'profile_view' });
  assert.equal(event.businessId, businessId);
  assert.equal(event.accountId, viewerId);
  console.log('GHM AUTHENTICATED ENGAGEMENT WRITE PASS');

  await assert.rejects(
    () => engagement.record({ userId: ownerId, role: 'business' }, { businessId, eventType: 'profile_view' }),
    /Business not found/,
  );
  console.log('GHM SELF-ENGAGEMENT EXCLUSION PASS');

  for (let index = 1; index < 60; index += 1) {
    await engagement.record(viewerContext, { businessId, eventType: 'profile_view' });
  }
  await assert.rejects(
    () => engagement.record(viewerContext, { businessId, eventType: 'profile_view' }),
    /Engagement rate limit exceeded/,
  );
  console.log('GHM 60-PER-MINUTE ENGAGEMENT RATE LIMIT PASS');

  const analytics = new PostgresBusinessAnalyticsRepository(runtimePool);
  await assert.rejects(
    () => analytics.getDashboard({ userId: ownerId, role: 'business' }, businessId, 30),
    /Business analytics access required/,
  );
  console.log('GHM ANALYTICS ENTITLEMENT FAIL-CLOSED PASS');
  console.log('GHM BUSINESS ANALYTICS AND ENGAGEMENT POSTGRES QUALIFICATION: PASS');
} finally {
  if (ownerId && viewerId && businessId) {
    const cleanup = await migratorPool.connect();
    try {
      await cleanup.query('SET ROLE ghm_schema_owner');
      await cleanup.query('BEGIN');
      await cleanup.query('DELETE FROM ghm.business_engagement_event WHERE business_id = $1', [businessId]);
      await cleanup.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [businessId]);
      await cleanup.query('DELETE FROM ghm.business WHERE id = $1', [businessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id IN ($1, $2)', [ownerId, viewerId]);
      await cleanup.query('COMMIT');
      console.log('GHM BUSINESS ANALYTICS FIXTURE CLEANUP PASS');
    } catch (error) {
      await cleanup.query('ROLLBACK').catch(() => {});
      console.error(`GHM BUSINESS ANALYTICS FIXTURE CLEANUP FAILED: ${error.message}`);
      process.exitCode = 1;
    } finally {
      cleanup.release();
    }
  }
  await Promise.all([runtimePool.end(), migratorPool.end()]);
}
