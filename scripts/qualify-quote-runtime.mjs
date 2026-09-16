import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) throw new Error('GHM_RUNTIME_DATABASE_URL or DATABASE_URL is required');
if (!migratorUrl) throw new Error('GHM_MIGRATOR_DATABASE_URL is required');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator URLs must differ');

const runtimePool = new Pool({ connectionString: runtimeUrl, ssl: { rejectUnauthorized: false } });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl: { rejectUnauthorized: false } });
const cleanupClient = await cleanupPool.connect();

const { DefaultQuoteService } = await import('../dist/resources/quote/service.js');
const { PostgresQuoteRepository } = await import('../dist/resources/quote/repository.js');
const { CustomerServiceImpl } = await import('../dist/resources/customer/service.js');
const { PostgresCustomerRepository } = await import('../dist/resources/customer/repository.js');

const runtimeQuoteService = new DefaultQuoteService(new PostgresQuoteRepository(runtimePool));
const runtimeCustomerService = new CustomerServiceImpl(new PostgresCustomerRepository(runtimePool));

const marker = `quote-qualification-${crypto.randomUUID()}`;
const accountIds = [];
const customerIds = [];
const quoteIds = [];

async function runtimeQuery(text, params = []) {
  return runtimePool.query(text, params);
}

async function cleanupAuthorityQuery(text, params = []) {
  return cleanupClient.query(text, params);
}

async function createAccount(slug) {
  const result = await cleanupAuthorityQuery(
    `INSERT INTO ghm.account_identity (external_subject, role)
     VALUES ($1, 'customer')
     RETURNING id`,
    [slug]
  );
  const id = Number(result.rows[0].id);
  accountIds.push(id);
  return id;
}

async function assertRejected(label, fn) {
  try {
    await fn();
  } catch {
    console.log(`${label} PASS`);
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

try {
  const identity = await runtimeQuery(`
    SELECT current_database() AS database_name, current_user AS current_user
  `);
  if (identity.rows[0].database_name !== 'ghm_db' || identity.rows[0].current_user !== 'ghm_runtime') {
    throw new Error(`Unexpected runtime identity: ${JSON.stringify(identity.rows[0])}`);
  }
  console.log('RUNTIME IDENTITY PASS: ghm_db/ghm_runtime');

  const cleanupIdentity = await cleanupAuthorityQuery(`
    SELECT current_database() AS database_name, current_user AS current_user
  `);
  if (cleanupIdentity.rows[0].database_name !== 'ghm_db' || cleanupIdentity.rows[0].current_user !== 'ghm_migrator') {
    throw new Error(`Unexpected cleanup identity: ${JSON.stringify(cleanupIdentity.rows[0])}`);
  }
  console.log('CLEANUP AUTHORITY PASS: ghm_db/ghm_migrator');

  await cleanupAuthorityQuery('SET ROLE ghm_schema_owner');
  const elevatedIdentity = await cleanupAuthorityQuery(`
    SELECT current_database() AS database_name,
           current_user AS current_user,
           session_user AS session_user
  `);
  if (
    elevatedIdentity.rows[0].database_name !== 'ghm_db' ||
    elevatedIdentity.rows[0].current_user !== 'ghm_schema_owner' ||
    elevatedIdentity.rows[0].session_user !== 'ghm_migrator'
  ) {
    throw new Error(`Unexpected fixture identity: ${JSON.stringify(elevatedIdentity.rows[0])}`);
  }
  console.log('FIXTURE SCHEMA-OWNER SESSION PASS: ghm_schema_owner/ghm_migrator');

  const schema = await cleanupAuthorityQuery(`
    SELECT c.relname AS table_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'ghm'
      AND c.relkind IN ('r', 'p')
      AND c.relname IN ('quote', 'quote_line_item')
    ORDER BY c.relname
  `);
  const schemaNames = schema.rows.map(row => row.table_name);
  if (JSON.stringify(schemaNames) !== JSON.stringify(['quote', 'quote_line_item'])) {
    throw new Error(`Unexpected Quote schema presence: ${JSON.stringify(schemaNames)}`);
  }
  console.log('QUOTE SCHEMA PRESENCE PASS');

  const tablePrivileges = await cleanupAuthorityQuery(`
    SELECT c.relname AS table_name, x.privilege_type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname IN ('quote', 'quote_line_item')
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
    ORDER BY c.relname, x.privilege_type
  `);
  const tableGrantSet = tablePrivileges.rows.map(row => `${row.table_name}:${row.privilege_type}`);
  const expectedTableGrantSet = [
    'quote:SELECT',
    'quote_line_item:SELECT',
  ];
  if (JSON.stringify(tableGrantSet) !== JSON.stringify(expectedTableGrantSet)) {
    throw new Error(`Unexpected Quote table grants: ${JSON.stringify(tableGrantSet)}`);
  }

  const columnPrivileges = await cleanupAuthorityQuery(`
    SELECT c.relname AS table_name, x.privilege_type, a.attname AS column_name
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname IN ('quote', 'quote_line_item')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type IN ('INSERT', 'UPDATE')
    ORDER BY c.relname, x.privilege_type, a.attname
  `);
  const expectedQuoteInsert = ['account_id', 'amount', 'customer_email', 'customer_id', 'customer_name', 'customer_phone', 'description', 'follow_up_date'];
  const expectedQuoteUpdate = ['notes', 'reminder_date', 'reminder_id', 'status', 'updated_at'];
  const expectedLineInsert = ['catalog_item_id', 'description', 'quantity', 'quote_id', 'unit_price'];

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
    SELECT c.relname AS table_name, x.privilege_type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname IN ('quote', 'quote_line_item')
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type = 'DELETE'
  `);
  if (unexpectedDelete.rowCount !== 0) throw new Error('Unexpected Quote DELETE privilege');
  console.log('QUOTE RUNTIME PRIVILEGE BOUNDARY PASS');

  const ownerAccountId = await createAccount(`${marker}-owner`);
  const outsiderAccountId = await createAccount(`${marker}-outsider`);
  const ownerContext = { userId: ownerAccountId, role: 'customer' };
  const outsiderContext = { userId: outsiderAccountId, role: 'customer' };

  const customer = await runtimeCustomerService.createCustomer(ownerContext, {
    name: 'Quote Qualification Customer',
    phone: '+27820000000',
    email: 'quote-qualification@example.com',
  });
  customerIds.push(customer.id);

  const quote = await runtimeQuoteService.createQuote(ownerContext, {
    customerId: customer.id,
    lineItems: [
      { description: 'Labour', quantity: 2, unitPrice: 125.55 },
      { description: 'Materials', quantity: 3, unitPrice: 10.25, catalogItemId: null },
    ],
    followUpDate: '2026-09-20',
  });
  quoteIds.push(quote.id);

  if (
    quote.customerId !== customer.id ||
    quote.customerName !== customer.name ||
    quote.customerPhone !== customer.phone ||
    quote.customerEmail !== customer.email ||
    quote.description !== 'Labour, Materials' ||
    quote.amount !== 282.15 ||
    quote.status !== 'active' ||
    quote.reminderId !== null ||
    quote.reminderDate !== null ||
    quote.notes !== '' ||
    quote.lineItems.length !== 2
  ) {
    throw new Error(`Unexpected Quote create result: ${JSON.stringify(quote)}`);
  }
  console.log(`QUOTE CREATE PASS: quote=${quote.id}`);

  const ownerRead = await runtimeQuoteService.getQuote(ownerContext, quote.id);
  if (!ownerRead || ownerRead.id !== quote.id) throw new Error('Owner Quote read failed');
  console.log('QUOTE OWNER READ PASS');

  const outsiderRead = await runtimeQuoteService.getQuote(outsiderContext, quote.id);
  if (outsiderRead !== null) throw new Error('Cross-account Quote read unexpectedly succeeded');
  console.log('QUOTE CROSS-ACCOUNT READ DENIAL PASS');

  const ownerList = await runtimeQuoteService.listQuotes(ownerContext);
  if (!ownerList.some(item => item.id === quote.id)) throw new Error('Owner Quote list missing Quote');
  const outsiderList = await runtimeQuoteService.listQuotes(outsiderContext);
  if (outsiderList.some(item => item.id === quote.id)) throw new Error('Cross-account Quote list leaked Quote');
  console.log('QUOTE OWNER-LIST SCOPE PASS');

  const won = await runtimeQuoteService.setQuoteStatus(ownerContext, quote.id, 'won');
  if (won.status !== 'won' || won.reminderId !== null || won.reminderDate !== null) throw new Error('Quote won transition mismatch');
  console.log('QUOTE STATUS WON PASS');

  const lost = await runtimeQuoteService.setQuoteStatus(ownerContext, quote.id, 'lost');
  if (lost.status !== 'lost') throw new Error('Quote lost transition mismatch');
  console.log('QUOTE STATUS LOST PASS');

  const reopened = await runtimeQuoteService.setQuoteStatus(ownerContext, quote.id, 'active');
  if (reopened.status !== 'active') throw new Error('Quote reopen transition mismatch');
  console.log('QUOTE REOPEN ACTIVE PASS');

  const sameStatus = await runtimeQuoteService.setQuoteStatus(ownerContext, quote.id, 'active');
  if (sameStatus.id !== quote.id || sameStatus.status !== 'active') throw new Error('Quote same-status idempotency mismatch');
  console.log('QUOTE SAME-STATUS IDEMPOTENCY PASS');

  const notes = await runtimeQuoteService.setQuoteNotes(ownerContext, quote.id, 'Call customer Friday.');
  if (notes.notes !== 'Call customer Friday.') throw new Error('Quote notes update mismatch');
  console.log('QUOTE NOTES UPDATE PASS');

  await assertRejected('QUOTE CROSS-ACCOUNT NOTES DENIAL', async () => {
    await runtimeQuoteService.setQuoteNotes(outsiderContext, quote.id, 'unauthorized');
  });

  await assertRejected('QUOTE CROSS-ACCOUNT CUSTOMER CREATE DENIAL', async () => {
    await runtimeQuoteService.createQuote(outsiderContext, {
      customerId: customer.id,
      lineItems: [{ description: 'Unauthorized', quantity: 1, unitPrice: 1 }],
      followUpDate: '2026-09-20',
    });
  });

  await runtimeCustomerService.archiveCustomer(ownerContext, customer.id);
  await assertRejected('QUOTE ARCHIVED CUSTOMER CREATE DENIAL', async () => {
    await runtimeQuoteService.createQuote(ownerContext, {
      customerId: customer.id,
      lineItems: [{ description: 'Archived customer', quantity: 1, unitPrice: 1 }],
      followUpDate: '2026-09-20',
    });
  });
  await runtimeCustomerService.restoreCustomer(ownerContext, customer.id);
  console.log('QUOTE CUSTOMER RESTORE PASS');

  await assertRejected('RUNTIME CONTACT-FIELD UPDATE DENIAL', async () => {
    await runtimeQuery(`UPDATE ghm.quote SET customer_name = 'tampered' WHERE id = $1`, [quote.id]);
  });

  await assertRejected('RUNTIME QUOTE DELETE DENIAL', async () => {
    await runtimeQuery(`DELETE FROM ghm.quote WHERE id = $1`, [quote.id]);
  });

  await assertRejected('RUNTIME QUOTE LINE-ITEM DELETE DENIAL', async () => {
    await runtimeQuery(`DELETE FROM ghm.quote_line_item WHERE quote_id = $1`, [quote.id]);
  });

  const beforeRollback = await cleanupAuthorityQuery(`
    SELECT count(*)::int AS quote_count
    FROM ghm.quote
    WHERE id = $1
  `, [quote.id]);
  if (beforeRollback.rows[0].quote_count !== 1) throw new Error('Quote missing before rollback test');

  await assertRejected('QUOTE ATOMIC ROLLBACK PASS', async () => {
    await runtimeQuoteService.createQuote(ownerContext, {
      customerId: customer.id,
      lineItems: [
        { description: 'Rollback first', quantity: 1, unitPrice: 1 },
        { description: 'Rollback overflow', quantity: 1, unitPrice: 10000000000000 },
      ],
      followUpDate: '2026-09-20',
    });
  });

  const persisted = await cleanupAuthorityQuery(`
    SELECT q.id, q.status, q.notes, q.amount,
           count(li.id)::int AS line_item_count
    FROM ghm.quote q
    LEFT JOIN ghm.quote_line_item li ON li.quote_id = q.id
    WHERE q.id = $1
    GROUP BY q.id
  `, [quote.id]);
  if (
    persisted.rowCount !== 1 ||
    persisted.rows[0].status !== 'active' ||
    persisted.rows[0].notes !== 'Call customer Friday.' ||
    Number(persisted.rows[0].amount) !== 282.15 ||
    persisted.rows[0].line_item_count !== 2
  ) {
    throw new Error(`Persisted Quote reconciliation failed: ${JSON.stringify(persisted.rows[0])}`);
  }
  console.log('PERSISTED QUOTE RECONCILIATION PASS');
  console.log('QUOTE RUNTIME QUALIFICATION PASS');
} finally {
  if (quoteIds.length > 0) {
    await cleanupAuthorityQuery(`DELETE FROM ghm.quote WHERE id = ANY($1::bigint[])`, [quoteIds]);
  }
  if (customerIds.length > 0) {
    await cleanupAuthorityQuery(`DELETE FROM ghm.customer WHERE id = ANY($1::bigint[])`, [customerIds]);
  }
  if (accountIds.length > 0) {
    await cleanupAuthorityQuery(`DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`, [accountIds]);
  }
  cleanupClient.release();
  await runtimePool.end();
  await cleanupPool.end();
}