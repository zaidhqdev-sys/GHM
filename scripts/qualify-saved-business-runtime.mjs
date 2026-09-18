import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { SavedBusinessServiceImpl } = await import('../dist/resources/saved-business/service.js');
const { PostgresSavedBusinessRepository } = await import('../dist/resources/saved-business/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const cleanupClient = await cleanupPool.connect();
const marker = `ghm-saved-business-${randomUUID()}`;
let fixture = null;
const savedBusinessIds = [];

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query(
    'SELECT current_database() AS database_name, session_user, current_user, current_role',
  );
  const row = rows[0];
  if (
    row.database_name !== 'ghm_db'
    || row.session_user !== expectedUser
    || row.current_user !== expectedUser
    || row.current_role !== expectedUser
  ) {
    throw new Error(`${label} identity mismatch: ${JSON.stringify(row)}`);
  }
  console.log(`${label} PASS: ${row.database_name}/${row.current_user}`);
};

const cleanupQuery = async (text, params = []) => cleanupClient.query(text, params);

const expectReject = async (work, label) => {
  try {
    await work();
  } catch {
    console.log(`${label} PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const track = (savedBusiness) => {
  savedBusinessIds.push(savedBusiness.id);
  return savedBusiness;
};

try {
  await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'RUNTIME IDENTITY'),
    identity(cleanupPool, 'ghm_migrator', 'CLEANUP AUTHORITY'),
  ]);

  await cleanupQuery('SET ROLE ghm_schema_owner');
  const elevated = await cleanupQuery(`
    SELECT current_database() AS database_name,
           current_user AS current_user,
           session_user AS session_user
  `);
  if (
    elevated.rows[0].database_name !== 'ghm_db'
    || elevated.rows[0].current_user !== 'ghm_schema_owner'
    || elevated.rows[0].session_user !== 'ghm_migrator'
  ) {
    throw new Error(`Unexpected fixture identity: ${JSON.stringify(elevated.rows[0])}`);
  }
  console.log('FIXTURE SCHEMA-OWNER SESSION PASS: ghm_schema_owner/ghm_migrator');

  const schemaPresence = await cleanupQuery(`
    SELECT c.relname AS table_name, pg_catalog.pg_get_userbyid(c.relowner) AS owner_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'ghm'
      AND c.relkind IN ('r', 'p')
      AND c.relname = 'saved_business'
  `);
  if (schemaPresence.rowCount !== 1) throw new Error('Saved Business table is missing');
  if (schemaPresence.rows[0].owner_name !== 'ghm_schema_owner') {
    throw new Error(`Unexpected Saved Business owner: ${schemaPresence.rows[0].owner_name}`);
  }
  console.log('SAVED BUSINESS SCHEMA PRESENCE PASS');

  const columns = await cleanupQuery(`
    SELECT a.attname AS column_name,
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
           a.attnotnull AS not_null,
           pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
           a.attidentity AS identity
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = 'ghm'
      AND c.relname = 'saved_business'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `);
  const expectedColumns = [
    { column_name: 'id', data_type: 'bigint', not_null: true, identity: 'd' },
    { column_name: 'account_id', data_type: 'bigint', not_null: true, identity: '' },
    { column_name: 'business_id', data_type: 'bigint', not_null: true, identity: '' },
    { column_name: 'created_at', data_type: 'timestamp with time zone', not_null: true, identity: '' },
  ];
  if (columns.rowCount !== expectedColumns.length) {
    throw new Error(`Unexpected Saved Business column count: ${JSON.stringify(columns.rows)}`);
  }
  for (let i = 0; i < expectedColumns.length; i += 1) {
    const actual = columns.rows[i];
    const expected = expectedColumns[i];
    if (
      actual.column_name !== expected.column_name
      || actual.data_type !== expected.data_type
      || actual.not_null !== expected.not_null
      || actual.identity !== expected.identity
    ) {
      throw new Error(`Unexpected Saved Business column: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    }
  }
  if (!columns.rows[3].column_default || !String(columns.rows[3].column_default).includes('now()')) {
    throw new Error(`Unexpected created_at default: ${columns.rows[3].column_default}`);
  }
  console.log('SAVED BUSINESS EXACT SCHEMA PASS');

  const uniqueConstraint = await cleanupQuery(`
    SELECT c.conname,
           pg_catalog.pg_get_constraintdef(c.oid) AS definition
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'ghm'
      AND rel.relname = 'saved_business'
      AND c.contype = 'u'
  `);
  if (
    uniqueConstraint.rowCount !== 1
    || uniqueConstraint.rows[0].conname !== 'saved_business_account_business_unique'
    || !String(uniqueConstraint.rows[0].definition).includes('(account_id, business_id)')
  ) {
    throw new Error(`Unexpected Saved Business unique constraint: ${JSON.stringify(uniqueConstraint.rows)}`);
  }

  const foreignKeys = await cleanupQuery(`
    SELECT c.conname,
           pg_catalog.pg_get_constraintdef(c.oid) AS definition
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'ghm'
      AND rel.relname = 'saved_business'
      AND c.contype = 'f'
    ORDER BY c.conname
  `);
  const fkDefs = foreignKeys.rows.map(row => row.definition);
  if (
    foreignKeys.rowCount !== 2
    || !fkDefs.some(def => def.includes('account_id') && def.includes('account_identity') && def.includes('ON DELETE CASCADE'))
    || !fkDefs.some(def => def.includes('business_id') && def.includes('business(id)') && def.includes('ON DELETE CASCADE'))
  ) {
    throw new Error(`Unexpected Saved Business foreign keys: ${JSON.stringify(foreignKeys.rows)}`);
  }

  const indexes = await cleanupQuery(`
    SELECT i.relname AS index_name,
           pg_catalog.pg_get_indexdef(i.oid) AS definition
    FROM pg_catalog.pg_index x
    JOIN pg_catalog.pg_class t ON t.oid = x.indrelid
    JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'ghm'
      AND t.relname = 'saved_business'
      AND NOT x.indisprimary
    ORDER BY i.relname
  `);
  const indexDefs = indexes.rows.map(row => ({ name: row.index_name, definition: row.definition }));
  if (
    !indexDefs.some(row => row.name === 'saved_business_account_created_idx'
      && row.definition.includes('account_id')
      && row.definition.includes('created_at DESC'))
    || !indexDefs.some(row => row.name === 'saved_business_business_idx'
      && row.definition.includes('business_id'))
  ) {
    throw new Error(`Unexpected Saved Business indexes: ${JSON.stringify(indexDefs)}`);
  }
  console.log('SAVED BUSINESS INTEGRITY BOUNDARY PASS');

  const tablePrivileges = await cleanupQuery(`
    SELECT x.privilege_type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'saved_business'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
    ORDER BY x.privilege_type
  `);
  const tableGrantSet = tablePrivileges.rows.map(row => row.privilege_type);
  if (JSON.stringify(tableGrantSet) !== JSON.stringify(['SELECT'])) {
    throw new Error(`Unexpected Saved Business table grants: ${JSON.stringify(tableGrantSet)}`);
  }

  const columnPrivileges = await cleanupQuery(`
    SELECT x.privilege_type, a.attname AS column_name
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'saved_business'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type IN ('INSERT', 'UPDATE')
    ORDER BY x.privilege_type, a.attname
  `);
  if (columnPrivileges.rowCount !== 0) {
    throw new Error(`Unexpected Saved Business column DML grants: ${JSON.stringify(columnPrivileges.rows)}`);
  }

  const unexpectedDelete = await cleanupQuery(`
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'saved_business'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type = 'DELETE'
  `);
  if (unexpectedDelete.rowCount !== 0) throw new Error('Unexpected Saved Business DELETE privilege');

  const sequencePrivileges = await cleanupQuery(`
    SELECT x.privilege_type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'saved_business_id_seq'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type = 'USAGE'
  `);
  if (sequencePrivileges.rowCount !== 1) {
    throw new Error('Saved Business sequence USAGE grant missing for runtime');
  }

  const functionPrivileges = await cleanupQuery(`
    SELECT p.proname,
           has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS execute_ok
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ghm'
      AND p.proname IN ('create_saved_business', 'delete_saved_business')
    ORDER BY p.proname
  `);
  if (
    functionPrivileges.rowCount !== 2
    || functionPrivileges.rows.some(row => row.execute_ok !== true)
  ) {
    throw new Error(`Unexpected Saved Business function EXECUTE grants: ${JSON.stringify(functionPrivileges.rows)}`);
  }
  console.log('SAVED BUSINESS RUNTIME PRIVILEGE BOUNDARY PASS: SELECT=yes INSERT=no UPDATE=no DELETE=no SEQUENCE_USAGE=yes CREATE/DELETE=execute-only');

  const owner = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'customer') RETURNING id`,
    [`${marker} owner`],
  );
  const outsider = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'customer') RETURNING id`,
    [`${marker} outsider`],
  );
  const ownerId = Number(owner.rows[0].id);
  const outsiderId = Number(outsider.rows[0].id);
  const eligible = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
     VALUES ($1, $2, 'approved', true, true) RETURNING id`,
    [`${marker} eligible`, `${marker}-eligible`],
  );
  const eligibleBusinessId = Number(eligible.rows[0].id);
  const inactive = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
     VALUES ($1, $2, 'approved', true, false) RETURNING id`,
    [`${marker} inactive`, `${marker}-inactive`],
  );
  const inactiveBusinessId = Number(inactive.rows[0].id);
  const unverified = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
     VALUES ($1, $2, 'under_review', false, true) RETURNING id`,
    [`${marker} unverified`, `${marker}-unverified`],
  );
  const unverifiedBusinessId = Number(unverified.rows[0].id);
  fixture = { ownerId, outsiderId, eligibleBusinessId, inactiveBusinessId, unverifiedBusinessId };

  const repository = new PostgresSavedBusinessRepository(runtimePool);
  const service = new SavedBusinessServiceImpl(repository);
  const ownerContext = { userId: fixture.ownerId, role: 'customer' };
  const outsiderContext = { userId: fixture.outsiderId, role: 'customer' };
  const anonymousContext = { userId: 0, role: 'customer' };

  await expectReject(
    () => service.createSavedBusiness(anonymousContext, { businessId: fixture.eligibleBusinessId }),
    'ANONYMOUS CREATE DENIAL',
  );
  await expectReject(
    () => service.listSavedBusinesses(anonymousContext),
    'ANONYMOUS LIST DENIAL',
  );
  await expectReject(
    () => service.getSavedBusiness(anonymousContext, 1),
    'ANONYMOUS ITEM READ DENIAL',
  );
  await expectReject(
    () => service.deleteSavedBusiness(anonymousContext, 1),
    'ANONYMOUS DELETE DENIAL',
  );

  const created = track(await service.createSavedBusiness(ownerContext, { businessId: fixture.eligibleBusinessId }));
  if (created.accountId !== fixture.ownerId || created.businessId !== fixture.eligibleBusinessId || !created.createdAt) {
    throw new Error(`Unexpected Saved Business create result: ${JSON.stringify(created)}`);
  }
  console.log('CREATE + OWNER PROVENANCE / AUTHENTICATED ACCOUNT BINDING PASS');

  const persistedAfterCreate = await cleanupQuery(
    `SELECT id, account_id, business_id, created_at
     FROM ghm.saved_business
     WHERE id = $1`,
    [created.id],
  );
  if (
    persistedAfterCreate.rowCount !== 1
    || Number(persistedAfterCreate.rows[0].account_id) !== fixture.ownerId
    || Number(persistedAfterCreate.rows[0].business_id) !== fixture.eligibleBusinessId
    || !persistedAfterCreate.rows[0].created_at
  ) {
    throw new Error(`Persisted Saved Business reconciliation failed: ${JSON.stringify(persistedAfterCreate.rows[0])}`);
  }
  console.log('PERSISTED SAVED BUSINESS RECONCILIATION PASS');

  const listed = await service.listSavedBusinesses(ownerContext);
  if (listed.length !== 1 || listed[0].id !== created.id) throw new Error('Owner list failed');
  console.log('OWNER READ/LIST PASS');

  const ownRead = await service.getSavedBusiness(ownerContext, created.id);
  if (!ownRead || ownRead.accountId !== fixture.ownerId) throw new Error('Owner item read failed');
  console.log('OWNER ITEM READ PASS');

  const outsiderRead = await service.getSavedBusiness(outsiderContext, created.id);
  if (outsiderRead !== null) throw new Error('Cross-account read returned another account\'s Saved Business');
  const outsiderList = await service.listSavedBusinesses(outsiderContext);
  if (outsiderList.some(item => item.id === created.id)) {
    throw new Error('Cross-account list leaked another account\'s Saved Business');
  }
  console.log('CROSS-ACCOUNT READ ISOLATION PASS');

  await expectReject(
    () => service.deleteSavedBusiness(outsiderContext, created.id),
    'CROSS-ACCOUNT DELETE DENIAL',
  );
  await expectReject(
    () => service.createSavedBusiness(ownerContext, { businessId: fixture.inactiveBusinessId }),
    'INACTIVE BUSINESS REJECTION',
  );
  await expectReject(
    () => service.createSavedBusiness(ownerContext, { businessId: fixture.unverifiedBusinessId }),
    'UNVERIFIED BUSINESS REJECTION',
  );
  await expectReject(
    () => service.createSavedBusiness(ownerContext, { businessId: fixture.eligibleBusinessId }),
    'DUPLICATE CREATE REJECTION',
  );

  const nonexistentBusiness = await runtimePool.query(
    `SELECT COALESCE(MAX(id), 0)::bigint + 1000000 AS id FROM ghm.business`,
  );
  const nonexistentBusinessId = Number(nonexistentBusiness.rows[0].id);
  await expectReject(
    () => service.createSavedBusiness(ownerContext, { businessId: nonexistentBusinessId }),
    'NONEXISTENT BUSINESS REJECTION',
  );

  const before = await runtimePool.query(
    'SELECT count(*)::int AS count FROM ghm.saved_business WHERE account_id = $1 AND business_id = $2',
    [fixture.ownerId, fixture.eligibleBusinessId],
  );
  if (before.rows[0].count !== 1) throw new Error('Unexpected Saved Business row count before delete');

  await service.deleteSavedBusiness(ownerContext, created.id);
  const after = await service.listSavedBusinesses(ownerContext);
  if (after.length !== 0) throw new Error('Owner delete failed');
  const persistedAfterDelete = await cleanupQuery(
    `SELECT id FROM ghm.saved_business WHERE id = $1`,
    [created.id],
  );
  if (persistedAfterDelete.rowCount !== 0) throw new Error('Owner delete left a persisted Saved Business row');
  console.log('OWNER DELETE PASS');

  const concurrentResults = await Promise.allSettled(
    Array.from({ length: 20 }, () => service.createSavedBusiness(ownerContext, { businessId: fixture.eligibleBusinessId })),
  );
  const concurrentSuccesses = concurrentResults.filter(result => result.status === 'fulfilled');
  const concurrentFailures = concurrentResults.filter(result => result.status === 'rejected');
  if (concurrentSuccesses.length !== 1 || concurrentFailures.length !== 19) {
    throw new Error(
      `Concurrent duplicate create expected 1 success / 19 failures; received ${concurrentSuccesses.length}/${concurrentFailures.length}`,
    );
  }
  const concurrentCreated = track(concurrentSuccesses[0].value);
  if (concurrentCreated.accountId !== fixture.ownerId || concurrentCreated.businessId !== fixture.eligibleBusinessId) {
    throw new Error('Concurrent Saved Business create returned unexpected ownership');
  }
  console.log(`CONCURRENT DUPLICATE CREATE PASS: success=${concurrentSuccesses.length} failures=${concurrentFailures.length}`);

  const concurrentRows = await cleanupQuery(
    'SELECT count(*)::int AS count FROM ghm.saved_business WHERE account_id = $1 AND business_id = $2',
    [fixture.ownerId, fixture.eligibleBusinessId],
  );
  if (concurrentRows.rows[0].count !== 1) {
    throw new Error(`Concurrent duplicate create left ${concurrentRows.rows[0].count} rows`);
  }

  await service.deleteSavedBusiness(ownerContext, concurrentCreated.id);
  console.log('CONCURRENT CREATE CLEANUP PASS');

  await expectReject(
    () => runtimePool.query(
      `INSERT INTO ghm.saved_business (account_id, business_id) VALUES ($1, $2)`,
      [fixture.ownerId, fixture.eligibleBusinessId],
    ),
    'RUNTIME DIRECT INSERT DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.saved_business SET account_id = $1 WHERE id = $2`,
      [fixture.outsiderId, created.id],
    ),
    'RUNTIME ARBITRARY UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `DELETE FROM ghm.saved_business WHERE account_id = $1`,
      [fixture.ownerId],
    ),
    'RUNTIME DIRECT DELETE DENIAL',
  );

  const grants = await runtimePool.query(`
    SELECT has_table_privilege(current_user, 'ghm.saved_business', 'SELECT') AS select_ok,
           has_table_privilege(current_user, 'ghm.saved_business', 'INSERT') AS insert_ok,
           has_table_privilege(current_user, 'ghm.saved_business', 'UPDATE') AS update_ok,
           has_table_privilege(current_user, 'ghm.saved_business', 'DELETE') AS delete_ok,
           has_function_privilege(current_user, 'ghm.create_saved_business(bigint,bigint)', 'EXECUTE') AS create_fn_ok,
           has_function_privilege(current_user, 'ghm.delete_saved_business(bigint,bigint)', 'EXECUTE') AS delete_fn_ok
  `);
  const grant = grants.rows[0];
  if (!grant.select_ok || grant.insert_ok || grant.update_ok || grant.delete_ok || !grant.create_fn_ok || !grant.delete_fn_ok) {
    throw new Error(`Unexpected Saved Business effective ACL: ${JSON.stringify(grant)}`);
  }
  console.log('RUNTIME EFFECTIVE PRIVILEGE PASS: SELECT=yes INSERT=no UPDATE=no DELETE=no CREATE/DELETE=execute-only');

  console.log('GHM SAVED BUSINESS RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupQuery('SET ROLE ghm_schema_owner');
    if (savedBusinessIds.length > 0) {
      await cleanupQuery('DELETE FROM ghm.saved_business WHERE id = ANY($1::bigint[])', [savedBusinessIds]);
    }
    if (fixture) {
      await cleanupQuery('DELETE FROM ghm.saved_business WHERE account_id = ANY($1::bigint[])', [[fixture.ownerId, fixture.outsiderId]]);
      await cleanupQuery(
        'DELETE FROM ghm.business WHERE id = ANY($1::bigint[])',
        [[fixture.eligibleBusinessId, fixture.inactiveBusinessId, fixture.unverifiedBusinessId]],
      );
      await cleanupQuery(
        'DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])',
        [[fixture.ownerId, fixture.outsiderId]],
      );
    }
    console.log('GOVERNED CLEANUP PASS');
  } catch (error) {
    console.error(`Qualification cleanup failed: ${error.message}`);
    process.exitCode = 1;
  }
  cleanupClient.release();
  await Promise.all([runtimePool.end(), cleanupPool.end()]);
}
