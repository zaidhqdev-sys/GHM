import { randomUUID } from 'node:crypto';
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

const { QuoteService } = await import('../dist/resources/quote/service.js');
const { QuoteRepository } = await import('../dist/resources/quote/repository.js');
const { CustomerService } = await import('../dist/resources/customer/service.js');
const { CustomerRepository } = await import('../dist/resources/customer/repository.js');

const runtimeQuoteService = new QuoteService(new QuoteRepository(runtimePool));
const runtimeCustomerService = new CustomerService(new CustomerRepository(runtimePool));

const marker = `quote-qualification-${randomUUID()}`;
const accountIds = [];
const customerIds = [];
const quoteIds = [];

async function runtimeQuery(text, params = []) {
  return runtimePool.query(text, params);
}

async function cleanupAuthorityQuery(text, params = []) {
  return cleanupPool.query(text, params);
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

  const schema = await cleanupAuthorityQuery(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'ghm'
      AND table_name IN ('quote', 'quote_line_item')
    ORDER BY table_name
  `);
  const schemaNames = schema.rows.map(row => row.table_name);
  if (JSON.stringify(schemaNames) !== JSON.stringify(['quote', 'quote_line_item'])) {
    throw new Error(`Unexpected Quote schema presence: ${JSON.stringify(schemaNames)}`);
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
  const tableGrantSet = tablePrivileges.rows.map(row => `${row.table_name}:${row.privilege_type}`);
  const expectedTableGrantSet = [
    'quote:INSERT',
    'quote:SELECT',
    'quote:UPDATE',
    'quote_line_item:INSERT',
    'quote_line_item:SELECT',
  ];
  if (JSON.stringify(tableGrantSet) !== JSON.stringify(expectedTableGrantSet)) {
    throw new Error(`Unexpected Quote table grants: ${JSON.stringify(tableGrantSet)}`);
  }

  const columnPrivileges = await cleanupAuthorityQuery(`
    SELECT table_name, privilege_type, column_name
    FROM information_schema.column_privileges
    WHERE grantee = 'ghm_runtime'
      AND table_schema = 'ghm'
      AND table_name IN ('quote', 'quote_line_item')
      AND privilege_type IN ('INSERT', 'UPDATE')
    ORDER BY table_name, privilege_type, column_name
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

  const customer = await runtimeCustomerService.create(ownerContext, {
    name: 'Quote Qualification Customer',
    phone: '+27820000000',
    email: 'quote-qualification@example.com',
  });
  customerIds.push(customer.id);

  const quote = await runtimeQuoteService.create(ownerContext, {
    customerId: customer.id,
    lineItems: [
      { description: 'Labour', quantity: 2, unitPrice: 125.55 },
      { description: 'Materials', quantity: 3, unitPrice: 10.25, itemId: null },
    ],
    followUpDate: '2026-09-20',
  });
  quoteIds.push(quote.id);

  if (
    quote.customerId !== customer.id ||
    quote.customerName !== customer.name ||
    quote.phone !== customer.phone ||
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

  const ownerRead = await runtimeQuoteService.get(ownerContext, quote.id);
  if (!ownerRead || ownerRead.id !== quote.id) throw new Error('Owner Quote read failed');
  console.log('QUOTE OWNER READ PASS');

  const outsiderRead = await runtimeQuoteService.get(outsiderContext, quote.id);
  if (outsiderRead !== null) throw new Error('Cross-account Quote read unexpectedly succeeded');
  console.log('QUOTE CROSS-ACCOUNT READ DENIAL PASS');

  const ownerList = await runtimeQuoteService.list(ownerContext);
  if (!ownerList.some(item => item.id === quote.id)) throw new Error('Owner Quote list missing Quote');
  const outsiderList = await runtimeQuoteService.list(outsiderContext);
  if (outsiderList.some(item => item.id === quote.id)) throw new Error('Cross-account Quote list leaked Quote');
  console.log('QUOTE OWNER-LIST SCOPE PASS');

  const won = await runtimeQuoteService.setStatus(ownerContext, quote.id, 'won');
  if (won.status !== 'won' || won.reminderId !== null || won.reminderDate !== null) throw new Error('Quote won transition mismatch');
  console.log('QUOTE STATUS WON PASS');

  const lost = await runtimeQuoteService.setStatus(ownerContext, quote.id, 'lost');
  if (lost.status !== 'lost') throw new Error('Quote lost transition mismatch');
  console.log('QUOTE STATUS LOST PASS');

  const reopened = await runtimeQuoteService.setStatus(ownerContext, quote.id, 'active');
  if (reopened.status !== 'active') throw new Error('Quote reopen transition mismatch');
  console.log('QUOTE REOPEN ACTIVE PASS');

  const sameStatus = await runtimeQuoteService.setStatus(ownerContext, quote.id, 'active');
  if (sameStatus.id !== quote.id || sameStatus.status !== 'active') throw new Error('Quote same-status idempotency mismatch');
  console.log('QUOTE SAME-STATUS IDEMPOTENCY PASS');

  const notes = await runtimeQuoteService.setNotes(ownerContext, quote.id, 'Call customer Friday.');
  if (notes.notes !== 'Call customer Friday.') throw new Error('Quote notes update mismatch');
  console.log('QUOTE NOTES UPDATE PASS');

  await assertRejected('QUOTE CROSS-ACCOUNT NOTES DENIAL', async () => {
    await runtimeQuoteService.setNotes(outsiderContext, quote.id, 'unauthorized');
  });

  await assertRejected('QUOTE CROSS-ACCOUNT CUSTOMER CREATE DENIAL', async () => {
    await runtimeQuoteService.create(outsiderContext, {
      customerId: customer.id,
      lineItems: [{ description: 'Unauthorized', quantity: 1, unitPrice: 1 }],
      followUpDate: '2026-09-20',
    });
  });

  await runtimeCustomerService.archive(ownerContext, customer.id);
  await assertRejected('QUOTE ARCHIVED CUSTOMER CREATE DENIAL', async () => {
    await runtimeQuoteService.create(ownerContext, {
      customerId: customer.id,
      lineItems: [{ description: 'Archived customer', quantity: 1, unitPrice: 1 }],
      followUpDate: '2026-09-20',
    });
  });
  await runtimeCustomerService.restore(ownerContext, customer.id);
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
    await runtimeQuoteService.create(ownerContext, {
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
  await runtimePool.end();
  await cleanupPool.end();
}
