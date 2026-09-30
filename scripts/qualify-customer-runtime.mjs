import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Customer runtime qualification');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for construction cleanup authority');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { CustomerServiceImpl } = await import('../dist/resources/customer/service.js');
const { PostgresCustomerRepository } = await import('../dist/resources/customer/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-customer-${randomUUID()}`;

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query(`SELECT current_database() AS database_name, session_user, current_user, current_role`);
  const value = rows[0];
  if (value.database_name !== 'ghm_db' || value.session_user !== expectedUser || value.current_user !== expectedUser || value.current_role !== expectedUser) {
    throw new Error(`${label} refused: expected ghm_db/${expectedUser}, received ${JSON.stringify(value)}`);
  }
  return value;
};

const cleanupAuthorityQuery = async (sql, values = []) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await client.query(sql, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const createAccount = async (fullName) => {
  const result = await cleanupAuthorityQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'customer') RETURNING id`,
    [fullName],
  );
  return Number(result.rows[0].id);
};

const assertRejected = async (work, label) => {
  try {
    await work();
  } catch {
    console.log(label);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const cleanup = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('SET ROLE ghm_schema_owner');
    await client.query(`DELETE FROM ghm.customer WHERE name LIKE $1`, [`${marker}%`]);
    await client.query(`DELETE FROM ghm.account_identity WHERE full_name LIKE $1`, [`${marker}%`]);
  } finally {
    client.release();
  }
};

try {
  const [runtime, cleanupAuthority] = await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'Runtime qualification'),
    identity(cleanupPool, 'ghm_migrator', 'Cleanup authority'),
  ]);
  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanupAuthority.database_name}/${cleanupAuthority.current_user}`);

  const schema = await runtimePool.query(`SELECT to_regclass('ghm.customer') AS customer_table`);
  if (schema.rows[0].customer_table !== 'ghm.customer') throw new Error('Customer table is not present');
  console.log('CUSTOMER SCHEMA PRESENCE PASS');

  const privileges = await cleanupAuthorityQuery(`
    SELECT privilege_type FROM information_schema.role_table_grants
    WHERE grantee = 'ghm_runtime' AND table_schema = 'ghm' AND table_name = 'customer'
    ORDER BY privilege_type
  `);
  const tablePrivileges = privileges.rows.map(row => row.privilege_type);
  if (JSON.stringify(tablePrivileges) !== JSON.stringify(['SELECT'])) {
    throw new Error(`Unexpected Customer table-level privileges: ${JSON.stringify(tablePrivileges)}`);
  }

  const insertPrivileges = await cleanupAuthorityQuery(`
    SELECT column_name FROM information_schema.column_privileges
    WHERE grantee = 'ghm_runtime' AND table_schema = 'ghm' AND table_name = 'customer' AND privilege_type = 'INSERT'
    ORDER BY column_name
  `);
  const expectedInsert = ['account_id', 'email', 'name', 'phone'];
  const actualInsert = insertPrivileges.rows.map(row => row.column_name);
  if (JSON.stringify(actualInsert) !== JSON.stringify(expectedInsert)) throw new Error(`Unexpected Customer INSERT columns: ${JSON.stringify(actualInsert)}`);

  const updatePrivileges = await cleanupAuthorityQuery(`
    SELECT column_name FROM information_schema.column_privileges
    WHERE grantee = 'ghm_runtime' AND table_schema = 'ghm' AND table_name = 'customer' AND privilege_type = 'UPDATE'
    ORDER BY column_name
  `);
  const expectedUpdate = ['status', 'updated_at'];
  const actualUpdate = updatePrivileges.rows.map(row => row.column_name);
  if (JSON.stringify(actualUpdate) !== JSON.stringify(expectedUpdate)) throw new Error(`Unexpected Customer UPDATE columns: ${JSON.stringify(actualUpdate)}`);

  const deletePrivileges = await cleanupAuthorityQuery(`
    SELECT privilege_type FROM information_schema.role_table_grants
    WHERE grantee = 'ghm_runtime' AND table_schema = 'ghm' AND table_name = 'customer' AND privilege_type = 'DELETE'
  `);
  if (deletePrivileges.rowCount !== 0) throw new Error('Unexpected Customer DELETE privilege');
  console.log('CUSTOMER RUNTIME PRIVILEGE BOUNDARY PASS');

  const ownerAccountId = await createAccount(`${marker}-owner`);
  const outsiderAccountId = await createAccount(`${marker}-outsider`);
  const ownerContext = { userId: ownerAccountId, role: 'customer' };
  const outsiderContext = { userId: outsiderAccountId, role: 'customer' };

  const repository = new PostgresCustomerRepository(runtimePool);
  const service = new CustomerServiceImpl(repository);

  const created = await service.createCustomer(ownerContext, {
    name: `  ${marker} customer  `,
    phone: ' 0123456789 ',
    email: ' customer@example.com ',
  });
  if (created.accountId !== ownerAccountId || created.name !== `${marker} customer` || created.phone !== '0123456789' || created.email !== 'customer@example.com' || created.status !== 'active') {
    throw new Error('Customer creation binding failed');
  }
  console.log(`CUSTOMER CREATE PASS: customer=${created.id}`);

  const read = await service.getCustomer(ownerContext, created.id);
  if (!read || read.id !== created.id || read.accountId !== ownerAccountId) throw new Error('Customer owner read failed');
  console.log('CUSTOMER OWNER READ PASS');

  if (await service.getCustomer(outsiderContext, created.id) !== null) throw new Error('Outsider Customer read unexpectedly succeeded');
  console.log('CUSTOMER CROSS-ACCOUNT READ DENIAL PASS');

  const listed = await service.listCustomers(ownerContext, 'active');
  if (!listed.some(row => row.id === created.id)) throw new Error('Active Customer missing from owner list');
  console.log('CUSTOMER ACTIVE-LIST PASS');

  const archived = await service.archiveCustomer(ownerContext, created.id);
  if (archived.status !== 'archived') throw new Error('Customer archive failed');
  if ((await service.listCustomers(ownerContext, 'active')).some(row => row.id === created.id)) throw new Error('Archived Customer remained in active list');
  if (!(await service.listCustomers(ownerContext, 'archived')).some(row => row.id === created.id)) throw new Error('Archived Customer missing from archived list');
  console.log('CUSTOMER ARCHIVE PASS');

  const restored = await service.restoreCustomer(ownerContext, created.id);
  if (restored.status !== 'active') throw new Error('Customer restore failed');
  console.log('CUSTOMER RESTORE PASS');

  await assertRejected(
    () => service.createCustomer(ownerContext, { name: '   ' }),
    'BLANK CUSTOMER NAME VALIDATION PASS',
  );

  await assertRejected(
    () => runtimePool.query(`UPDATE ghm.customer SET name = 'unauthorized' WHERE id = $1`, [created.id]),
    'RUNTIME CONTACT-FIELD UPDATE DENIAL PASS',
  );

  await assertRejected(
    () => runtimePool.query(`DELETE FROM ghm.customer WHERE id = $1`, [created.id]),
    'RUNTIME DELETE DENIAL PASS',
  );

  const persisted = await cleanupAuthorityQuery(`
    SELECT account_id, name, phone, email, status
    FROM ghm.customer
    WHERE id = $1
  `, [created.id]);
  const persistedAccountId = persisted.rowCount === 1 ? Number(persisted.rows[0].account_id) : null;
  if (persisted.rowCount !== 1 || persistedAccountId !== ownerAccountId || persisted.rows[0].status !== 'active') throw new Error('Persisted Customer reconciliation failed');
  console.log('PERSISTED CUSTOMER RECONCILIATION PASS');

  console.log('CUSTOMER RUNTIME QUALIFICATION PASS');
} finally {
  await cleanup().catch(error => console.error(`CLEANUP ERROR: ${error.message}`));
  await runtimePool.end();
  await cleanupPool.end();
}
