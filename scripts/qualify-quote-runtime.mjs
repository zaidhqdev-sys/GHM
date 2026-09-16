import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for Quote runtime qualification');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for Quote qualification cleanup');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { QuoteServiceImpl } = await import('../dist/resources/quote/service.js');
const { PostgresQuoteRepository } = await import('../dist/resources/quote/repository.js');
const { CustomerServiceImpl } = await import('../dist/resources/customer/service.js');
const { PostgresCustomerRepository } = await import('../dist/resources/customer/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-quote-${randomUUID()}`;
const accountIds = [];
const customerIds = [];
const quoteIds = [];

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query(`
    SELECT current_database() AS database_name, session_user, current_user, current_role
  `);
  const value = rows[0];
  if (
    value.database_name !== 'ghm_db' ||
    value.session_user !== expectedUser ||
    value.current_user !== expectedUser ||
    value.current_role !== expectedUser
  ) {
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
  const id = Number(result.rows[0].id);
  accountIds.push(id);
  return id;
};

const assertRejected = async (work, label) => {
  try {
    await work();
  } catch {
    console.log(`${label} PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const countMarkerQuotes = async () => {
  const result = await cleanupAuthorityQuery(
    `SELECT count(*)::int AS count FROM ghm.quote WHERE description LIKE $1`,
    [`${marker}%`],
  );
  return result.rows[0].count;
};

const cleanup = async () => {
  if (accountIds.length === 0) return;
  await cleanupAuthorityQuery(
    `DELETE FROM ghm.quote_line_item WHERE quote_id IN (SELECT id FROM ghm.quote WHERE description LIKE $1)`,
    [`${marker}%`],
  );
  await cleanupAuthorityQuery(`DELETE FROM ghm.quote WHERE description LIKE $1`, [`${marker}%`]);
  if (customerIds.length > 0) {
    await cleanupAuthorityQuery(`DELETE FROM ghm.customer WHERE id = ANY($1::bigint[])`, [customerIds]);
  }
  await cleanupAuthorityQuery(`DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`, [accountIds]);
};

try {
  const [runtime, cleanupAuthority] = await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'Runtime qualification'),
    identity(cleanupPool, 'ghm_migrator', 'Cleanup authority'),
  ]);
  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanupAuthority.database_name}/${cleanupAuthority.current_user}`);

  const schema = await runtimePool.query(`
    SELECT
      to_regclass('ghm.quote') AS quote_table,
      to_regclass('ghm.quote_line_item') AS line_item_table,
      to_regclass('ghm.customer') AS customer_table
  `);
  if (
    schema.rows[0].quote_table !== 'ghm.quote' ||
    schema.rows[0].line_item_table !== 'ghm.quote_line_item' ||
    schema.rows[0].customer_table !== 'ghm.customer'
  ) {
    throw new Error(`Quote dependency schema missing: ${JSON.stringify(schema.rows[0])}`);
  }
  console.log('QUOTE SCHEMA PRESENCE PASS');

  const tablePrivileges = await cleanupAuthorityQuery(`
    SELECT table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'ghm_runtime'
      AND table_schema = 'ghm'
      AND table_name IN ('quote', 'quote_line_item')
    ORDER BY table_name, privilege_type
  `);
  const actualTablePrivileges = tablePrivileges.rows.map(row => `${row.table_name}:${row.privilege_type}`);
  const expectedTablePrivileges = [
    'quote:SELECT',
    'quote_line_item:SELECT',
  ];
  if (JSON.stringify(actualTablePrivileges) !== JSON.stringify(expectedTablePrivileges)) {
    throw new Error(`Unexpected Quote table-level privileges: ${JSON.stringify(actualTablePrivileges)}`);
  }

  const columnPrivileges = await cleanupAuthorityQuery(`
    SELECT table_name, privilege_type, column_name
    FROM information_schema.column_privileges
    WHERE grantee = 'ghm_runtime'
      AND table_schema = 'ghm'
      AND table_name IN ('quote', 'quote_line_item')
    ORDER BY table_name, privilege_type, column_name
  `);
  const actualColumns = columnPrivileges.rows.map(row => `${row.table_name}:${row.privilege_type}:${row.column_name}`);
  const expectedColumns = [
    'quote:INSERT:account_id',
    'quote:INSERT:amount',
    'quote:INSERT:customer_email',
    'quote:INSERT:customer_id',
    'quote:INSERT:customer_name',
    'quote:INSERT:customer_phone',
    'quote:INSERT:description',
    'quote:INSERT:follow_up_date',
    'quote:INSERT:account_id',
  ];
  const expectedQuoteInsert = ['account_id', 'amount', 'customer_email', 'customer_id', 'customer_name', 'customer_phone', 'description', 'follow_up_date'];
  const expectedQuoteUpdate = ['notes', 'reminder_date', 'reminder_id', 'status', 'updated_at'];
  const expectedLineInsert = ['catalog_item_id', 'description', 'quote_id', 'quantity', 'unit_price'];

  const quoteInsert = columnPrivileges.rows
    .filter(row => row.table_name === 'quote' && row.privilege_type === 'INSERT')
    .map(row => row.column_name);
  const quoteUpdate = columnPrivileges.rows
    .filter(row => row.table_name === 'quote' && row.privilege_type === 'UPDATE')
    .map(row => row.column_name);
  const lineInsert = columnPrivileges.rows
    .filter(row => row.table_name === 'quote_line_item' && row.privilege_type === 'INSERT')
    .map(row => row.column_name);

  if (JSON.stringify(quoteInsert) !== JSON.stringify(expectedQuoteInsert)) {
    throw new Error(`Unexpected Quote INSERT columns: ${JSON.stringify(quoteInsert)}`);
  }
  if (JSON.stringify(quoteUpdate) !== JSON.stringify(expectedQuoteUpdate)) {
    throw new Error(`Unexpected Quote UPDATE columns: ${JSON.stringify(quoteUpdate)}`);
  }
  if (JSON.stringify(lineInsert) !== JSON.stringify(expectedLineInsert)) {
    throw new Error(`Unexpected Quote line-item INSERT columns: ${JSON.stringify(lineInsert)}`);
  }

  const unexpectedDelete = await cleanupAuthorityQuery(`
    SELECT table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'ghm_runtime'
      AND table_schema = 'ghm'
      AND table_name IN ('quote', 'quote_line_item')
      AND privilege_type = 'DELETE'
  `);
  if (unexpectedDelete.rowCount !== 0) throw new Error('Unexpected Quote DELETE privilege');
  console.log('QUOTE RUNTIME PRIVILEGE BOUNDARY PASS');

  const ownerAccountId = await createAccount(`${marker}-owner`);
  const outsiderAccountId = await createAccount(`${marker}-outsider`);
  const ownerContext = { userId: ownerAccountId, role: 'customer' };
  const outsiderContext = { userId: outsiderAccountId, role: 'customer' };

  const customerRepository = new PostgresCustomerRepository(runtimePool);
  const customerService = new CustomerServiceImpl(customerRepository);
  const customer = await customerService.createCustomer(ownerContext, {
    name: `${marker} customer`,
    phone: '0123456789',
    email: 'customer@example.com',
  });
  customerIds.push(customer.id);
  const outsiderCustomer = await customerService.createCustomer(outsiderContext, {
    name: `${marker} outsider customer`,
  });
  customerIds.push(outsiderCustomer.id);

  const quoteRepository = new PostgresQuoteRepository(runtimePool);
  const quoteService = new QuoteServiceImpl(quoteRepository);

  const created = await quoteService.createQuote(ownerContext, {
    customerId: customer.id,
    lineItems: [
      { description: `  ${marker} labour  `, quantity: 2, unitPrice: 125.55 },
      { description: `${marker} materials`, quantity: 3, unitPrice: 10.1, catalogItemId: null },
    ],
    followUpDate: '2026-09-20',
  });
  quoteIds.push(created.id);

  if (
    created.accountId !== ownerAccountId ||
    created.customerId !== customer.id ||
    created.customerName !== customer.name ||
    created.customerPhone !== customer.phone ||
    created.customerEmail !== customer.email ||
    created.description !== `${marker} labour, ${marker} materials` ||
    created.amount !== (2 * 125.55 + 3 * 10.1) ||
    created.status !== 'active' ||
    created.reminderId !== null ||
    created.reminderDate !== null ||
    created.notes !== '' ||
    created.lineItems.length !== 2 ||
    created.lineItems[0].description !== `${marker} labour` ||
    created.lineItems[0].unitPrice !== 125.55
  ) {
    throw new Error(`Quote create reconciliation failed: ${JSON.stringify(created)}`);
  }
  console.log(`QUOTE CREATE PASS: quote=${created.id}`);

  const read = await quoteService.getQuote(ownerContext, created.id);
  if (!read || read.id !== created.id || read.accountId !== ownerAccountId || read.lineItems.length !== 2) {
    throw new Error('Quote owner read failed');
  }
  console.log('QUOTE OWNER READ PASS');

  if (await quoteService.getQuote(outsiderContext, created.id) !== null) {
    throw new Error('Outsider Quote read unexpectedly succeeded');
  }
  console.log('QUOTE CROSS-ACCOUNT READ DENIAL PASS');

  const listed = await quoteService.listQuotes(ownerContext);
  if (!listed.some(row => row.id === created.id)) throw new Error('Created Quote missing from owner list');
  if ((await quoteService.listQuotes(outsiderContext)).some(row => row.id === created.id)) {
    throw new Error('Cross-account Quote leaked into outsider list');
  }
  console.log('QUOTE OWNER-LIST SCOPE PASS');

  const won = await quoteService.setQuoteStatus(ownerContext, created.id, 'won');
  if (won.status !== 'won' || won.reminderId !== null || won.reminderDate !== null) throw new Error('Quote won status update failed');
  console.log('QUOTE STATUS WON PASS');

  const lost = await quoteService.setQuoteStatus(ownerContext, created.id, 'lost');
  if (lost.status !== 'lost' || lost.lineItems.length !== 2) throw new Error('Quote lost status update failed');
  console.log('QUOTE STATUS LOST PASS');

  const reopened = await quoteService.setQuoteStatus(ownerContext, created.id, 'active');
  if (reopened.status !== 'active' || reopened.reminderId !== null || reopened.reminderDate !== null) throw new Error('Quote reopen status update failed');
  console.log('QUOTE STATUS REOPEN PASS');

  const sameStatus = await quoteService.setQuoteStatus(ownerContext, created.id, 'active');
  if (sameStatus.status !== 'active') throw new Error('Same-status Quote operation failed');
  console.log('QUOTE SAME-STATUS IDEMPOTENCY PASS');

  const noted = await quoteService.setQuoteNotes(ownerContext, created.id, 'Follow up after site discussion');
  if (noted.notes !== 'Follow up after site discussion') throw new Error('Quote notes update failed');
  console.log('QUOTE NOTES UPDATE PASS');

  await assertRejected(
    () => quoteService.setQuoteNotes(outsiderContext, created.id, 'unauthorized'),
    'QUOTE CROSS-ACCOUNT NOTES DENIAL',
  );

  await assertRejected(
    () => quoteService.createQuote(ownerContext, {
      customerId: outsiderCustomer.id,
      lineItems: [{ description: `${marker} wrong customer`, quantity: 1, unitPrice: 100 }],
      followUpDate: '2026-09-20',
    }),
    'QUOTE CROSS-ACCOUNT CUSTOMER CREATE DENIAL',
  );

  await customerService.archiveCustomer(ownerContext, customer.id);
  await assertRejected(
    () => quoteService.createQuote(ownerContext, {
      customerId: customer.id,
      lineItems: [{ description: `${marker} archived customer`, quantity: 1, unitPrice: 100 }],
      followUpDate: '2026-09-20',
    }),
    'QUOTE ARCHIVED CUSTOMER CREATE DENIAL',
  );
  await customerService.restoreCustomer(ownerContext, customer.id);

  await assertRejected(
    () => runtimePool.query(`UPDATE ghm.quote SET customer_name = 'unauthorized' WHERE id = $1`, [created.id]),
    'RUNTIME QUOTE CONTACT UPDATE DENIAL',
  );

  await assertRejected(
    () => runtimePool.query(`DELETE FROM ghm.quote WHERE id = $1`, [created.id]),
    'RUNTIME QUOTE DELETE DENIAL',
  );

  await assertRejected(
    () => runtimePool.query(`DELETE FROM ghm.quote_line_item WHERE quote_id = $1`, [created.id]),
    'RUNTIME QUOTE LINE-ITEM DELETE DENIAL',
  );

  const beforeRollback = await countMarkerQuotes();
  if (beforeRollback !== 1) throw new Error(`Unexpected marker Quote count before rollback test: ${beforeRollback}`);

  await assertRejected(
    () => quoteService.createQuote(ownerContext, {
      customerId: customer.id,
      lineItems: [
        { description: `${marker} rollback first`, quantity: 1, unitPrice: 100 },
        { description: `${marker} rollback overflow`, quantity: 1, unitPrice: 10000000000000 },
      ],
      followUpDate: '2026-09-21',
    }),
    'QUOTE ATOMIC ROLLBACK PASS',
  );

  const afterRollback = await countMarkerQuotes();
  if (afterRollback !== beforeRollback) throw new Error(`Quote transaction rollback failed: before=${beforeRollback}, after=${afterRollback}`);

  const persisted = await cleanupAuthorityQuery(`
    SELECT account_id, customer_id, customer_name, customer_phone, customer_email, description, amount, follow_up_date, status, reminder_id, reminder_date, notes
    FROM ghm.quote
    WHERE id = $1
  `, [created.id]);
  if (persisted.rowCount !== 1) throw new Error('Persisted Quote missing');
  const row = persisted.rows[0];
  if (
    Number(row.account_id) !== ownerAccountId ||
    Number(row.customer_id) !== customer.id ||
    row.customer_name !== customer.name ||
    row.customer_phone !== customer.phone ||
    row.customer_email !== customer.email ||
    row.status !== 'active' ||
    row.notes !== 'Follow up after site discussion' ||
    row.reminder_id !== null ||
    row.reminder_date !== null
  ) {
    throw new Error(`Persisted Quote reconciliation failed: ${JSON.stringify(row)}`);
  }
  console.log('PERSISTED QUOTE RECONCILIATION PASS');

  console.log('QUOTE RUNTIME QUALIFICATION PASS');
} finally {
  await cleanup().catch(error => console.error(`CLEANUP ERROR: ${error.message}`));
  await runtimePool.end();
  await cleanupPool.end();
}
