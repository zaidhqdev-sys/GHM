import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl) throw new Error('Runtime and migrator database URLs are required');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-profile-contract-${randomUUID()}`;
let accountId;
let businessId;

try {
  const runtimeIdentity = await runtimePool.query(
    'SELECT current_database() AS database_name, session_user, current_user',
  );
  assert.equal(runtimeIdentity.rows[0].session_user, 'ghm_runtime');
  assert.equal(runtimeIdentity.rows[0].current_user, 'ghm_runtime');
  console.log('PROFILE CONTRACT RUNTIME IDENTITY PASS');

  const migrator = await migratorPool.connect();
  try {
    await migrator.query('SET ROLE ghm_schema_owner');
    const migrationIdentity = await migrator.query(
      'SELECT current_database() AS database_name, session_user, current_user',
    );
    assert.equal(migrationIdentity.rows[0].session_user, 'ghm_migrator');
    assert.equal(migrationIdentity.rows[0].current_user, 'ghm_schema_owner');
    await migrator.query('BEGIN');
    const account = await migrator.query(
      "INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id",
      [marker],
    );
    accountId = Number(account.rows[0].id);
    const business = await migrator.query(
      "INSERT INTO ghm.business (name, slug, verification_status, is_active) VALUES ($1, $2, 'unverified', true) RETURNING id",
      [marker, marker],
    );
    businessId = Number(business.rows[0].id);
    await migrator.query(
      "INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by) VALUES ($1, $2, 'owner', 'active', $2)",
      [businessId, accountId],
    );
    await migrator.query('COMMIT');
  } catch (error) {
    await migrator.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    migrator.release();
  }
  console.log('PROFILE CONTRACT FIXTURE CREATED');

  const optionalLegacyColumns = await runtimePool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'ghm' AND table_name = 'business'
        AND column_name IN ('category', 'is_supplier')`,
  );
  const legacyColumnNames = new Set(optionalLegacyColumns.rows.map(row => row.column_name));
  const snakePatch = {
    physical_address: '10 Current Repository Road',
    avatar_letter: 'GH',
    avatar_color: '#12AbEF',
    years_in_business: 8,
    latitude: -29.8587,
    longitude: 31.0218,
  };
  if (legacyColumnNames.has('category')) snakePatch.category = 'construction';
  if (legacyColumnNames.has('is_supplier')) snakePatch.isSupplier = true;

  const snake = await runtimePool.query(
    'SELECT * FROM ghm.update_business_profile($1, $2, $3::jsonb)',
    [accountId, businessId, JSON.stringify(snakePatch)],
  );
  assert.equal(snake.rowCount, 1);
  assert.equal(snake.rows[0].physical_address, '10 Current Repository Road');
  assert.equal(snake.rows[0].avatar_letter, 'GH');
  assert.equal(snake.rows[0].avatar_color, '#12AbEF');
  assert.equal(Number(snake.rows[0].years_in_business), 8);
  assert.equal(Number(snake.rows[0].latitude), -29.8587);
  assert.equal(Number(snake.rows[0].longitude), 31.0218);
  if (legacyColumnNames.has('category')) assert.equal(snake.rows[0].category, 'construction');
  if (legacyColumnNames.has('is_supplier')) assert.equal(snake.rows[0].is_supplier, true);
  console.log('CURRENT REPOSITORY SNAKE_CASE PROFILE UPDATE PASS');

  const camel = await runtimePool.query(
    'SELECT * FROM ghm.update_business_profile($1, $2, $3::jsonb)',
    [accountId, businessId, JSON.stringify({
      physicalAddress: '11 Historical API Avenue',
      avatarLetter: 'API',
      avatarColor: '#ABCDEF',
      yearsInBusiness: 9,
      latitude: -30.0,
      longitude: 30.0,
    })],
  );
  assert.equal(camel.rows[0].physical_address, '11 Historical API Avenue');
  assert.equal(camel.rows[0].avatar_letter, 'API');
  assert.equal(camel.rows[0].avatar_color, '#ABCDEF');
  assert.equal(Number(camel.rows[0].years_in_business), 9);
  assert.equal(Number(camel.rows[0].latitude), -30);
  assert.equal(Number(camel.rows[0].longitude), 30);
  if (legacyColumnNames.has('category')) assert.equal(camel.rows[0].category, 'construction');
  if (legacyColumnNames.has('is_supplier')) assert.equal(camel.rows[0].is_supplier, true);
  console.log('HISTORICAL CAMELCASE PROFILE UPDATE PASS');

  await assert.rejects(
    () => runtimePool.query(
      'SELECT * FROM ghm.update_business_profile($1, $2, $3::jsonb)',
      [accountId, businessId, JSON.stringify({
        physical_address: 'Conflict A',
        physicalAddress: 'Conflict B',
      })],
    ),
    /Conflicting Business profile aliases/,
  );
  console.log('CONFLICTING ALIAS REJECTION PASS');

  await assert.rejects(
    () => runtimePool.query(
      'SELECT * FROM ghm.update_business_profile($1, $2, $3::jsonb)',
      [accountId, businessId, JSON.stringify({ latitude: -29.0 })],
    ),
    /Latitude and longitude must be supplied together/,
  );
  console.log('COORDINATE PAIR VALIDATION PASS');

  await assert.rejects(
    () => runtimePool.query(
      'SELECT * FROM ghm.update_business_profile($1, $2, $3::jsonb)',
      [accountId + 999999, businessId, JSON.stringify({ description: 'Unauthorized' })],
    ),
    /Business management permission required/,
  );
  console.log('OWNER AUTHORIZATION ENFORCEMENT PASS');

  console.log('GHM BUSINESS PROFILE CONTRACT POSTGRES QUALIFICATION: PASS');
} finally {
  if (accountId && businessId) {
    const cleanup = await migratorPool.connect();
    try {
      await cleanup.query('SET ROLE ghm_schema_owner');
      await cleanup.query('BEGIN');
      await cleanup.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [businessId]);
      await cleanup.query('DELETE FROM ghm.business WHERE id = $1', [businessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id = $1', [accountId]);
      await cleanup.query('COMMIT');
      console.log('PROFILE CONTRACT FIXTURE CLEANUP PASS');
    } catch (error) {
      await cleanup.query('ROLLBACK').catch(() => {});
      console.error(`PROFILE CONTRACT FIXTURE CLEANUP FAILED: ${error.message}`);
      process.exitCode = 1;
    } finally {
      cleanup.release();
    }
  }
  await Promise.all([runtimePool.end(), migratorPool.end()]);
}
