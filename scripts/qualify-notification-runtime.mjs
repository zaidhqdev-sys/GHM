import pg from 'pg';
import dotenv from 'dotenv';

import { randomUUID } from 'node:crypto';

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

const { NotificationServiceImpl } = await import('../dist/resources/notification/service.js');
const { PostgresNotificationRepository } = await import('../dist/resources/notification/repository.js');

const runtimeNotificationService = new NotificationServiceImpl(new PostgresNotificationRepository(runtimePool));
const marker = `notification-qualification-${randomUUID()}`;
const accountIds = [];
const notificationIds = [];

async function runtimeQuery(text, params = []) {
  return runtimePool.query(text, params);
}

async function cleanupAuthorityQuery(text, params = []) {
  return cleanupClient.query(text, params);
}

async function createAccount(fullName, role = 'customer') {
  const result = await cleanupAuthorityQuery(
    `INSERT INTO ghm.account_identity (full_name, role)
     VALUES ($1, $2)
     RETURNING id`,
    [fullName, role],
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

function trackNotification(notification) {
  notificationIds.push(notification.id);
  return notification;
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
      AND c.relname = 'notification'
  `);
  if (schema.rowCount !== 1) throw new Error('Notification table is missing');
  console.log('NOTIFICATION SCHEMA PRESENCE PASS');

  const tablePrivileges = await cleanupAuthorityQuery(`
    SELECT x.privilege_type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'notification'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
    ORDER BY x.privilege_type
  `);
  const tableGrantSet = tablePrivileges.rows.map(row => row.privilege_type);
  if (JSON.stringify(tableGrantSet) !== JSON.stringify(['SELECT'])) {
    throw new Error(`Unexpected Notification table grants: ${JSON.stringify(tableGrantSet)}`);
  }

  const columnPrivileges = await cleanupAuthorityQuery(`
    SELECT x.privilege_type, a.attname AS column_name
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'notification'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type IN ('INSERT', 'UPDATE')
    ORDER BY x.privilege_type, a.attname
  `);
  const insertColumns = columnPrivileges.rows
    .filter(row => row.privilege_type === 'INSERT')
    .map(row => row.column_name);
  const updateColumns = columnPrivileges.rows
    .filter(row => row.privilege_type === 'UPDATE')
    .map(row => row.column_name);
  const expectedInsertColumns = ['body', 'metadata', 'title', 'type', 'user_id'];
  const expectedUpdateColumns = ['is_read', 'read_at'];
  if (JSON.stringify(insertColumns) !== JSON.stringify(expectedInsertColumns)) {
    throw new Error(`Unexpected Notification INSERT columns: ${JSON.stringify(insertColumns)}`);
  }
  if (JSON.stringify(updateColumns) !== JSON.stringify(expectedUpdateColumns)) {
    throw new Error(`Unexpected Notification UPDATE columns: ${JSON.stringify(updateColumns)}`);
  }

  const sequencePrivileges = await cleanupAuthorityQuery(`
    SELECT x.privilege_type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'notification_id_seq'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type = 'USAGE'
  `);
  if (sequencePrivileges.rowCount !== 1) throw new Error('Notification sequence USAGE grant missing');

  const unexpectedDelete = await cleanupAuthorityQuery(`
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'notification'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type = 'DELETE'
  `);
  if (unexpectedDelete.rowCount !== 0) throw new Error('Unexpected Notification DELETE privilege');
  console.log('NOTIFICATION RUNTIME PRIVILEGE BOUNDARY PASS');

  const ownerId = await createAccount(`${marker}-owner`);
  const outsiderId = await createAccount(`${marker}-outsider`);
  const adminId = await createAccount(`${marker}-admin`, 'admin');
  const ownerContext = { userId: ownerId, role: 'customer' };
  const outsiderContext = { userId: outsiderId, role: 'customer' };
  const adminContext = { userId: adminId, role: 'admin' };

  const created = trackNotification(await runtimeNotificationService.createNotification(ownerContext, {
    userId: ownerId,
    type: 'system',
    title: '  System notice  ',
    body: '  Notification qualification body  ',
    metadata: { source: 'qualification', marker },
  }));
  if (
    created.userId !== ownerId ||
    created.type !== 'system' ||
    created.title !== 'System notice' ||
    created.body !== 'Notification qualification body' ||
    created.isRead !== false ||
    created.readAt !== null ||
    created.metadata.source !== 'qualification' ||
    created.metadata.marker !== marker ||
    !created.createdAt
  ) {
    throw new Error(`Unexpected Notification create result: ${JSON.stringify(created)}`);
  }
  console.log(`NOTIFICATION SELF CREATE PASS: notification=${created.id}`);

  const adminCreated = trackNotification(await runtimeNotificationService.createNotification(adminContext, {
    userId: ownerId,
    type: 'verification',
    title: 'Admin notice',
    body: 'Administrative notification',
    metadata: { source: 'admin-test' },
  }));
  if (adminCreated.userId !== ownerId || adminCreated.type !== 'verification') {
    throw new Error('Admin Notification create mismatch');
  }
  console.log('NOTIFICATION ADMIN CREATE PASS');

  await assertRejected('NOTIFICATION CROSS-ACCOUNT CREATE DENIAL', async () => {
    await runtimeNotificationService.createNotification(outsiderContext, {
      userId: ownerId,
      type: 'system',
      title: 'Unauthorized',
      body: 'Unauthorized recipient write',
      metadata: {},
    });
  });

  await assertRejected('NOTIFICATION LEAD CREATE DEFERRED AUTHORITY', async () => {
    await runtimeNotificationService.createNotification(outsiderContext, {
      userId: ownerId,
      type: 'lead',
      title: 'Lead notice',
      body: 'Lead identity mapping must be source-backed',
      metadata: { lead_id: 'not-mapped' },
    });
  });

  await assertRejected('NOTIFICATION UNSUPPORTED TYPE DENIAL', async () => {
    await runtimeNotificationService.createNotification(ownerContext, {
      userId: ownerId,
      type: 'payment',
      title: 'Unsupported',
      body: 'Unsupported Notification type',
      metadata: {},
    });
  });

  await assertRejected('NOTIFICATION ARRAY METADATA DENIAL', async () => {
    await runtimeNotificationService.createNotification(ownerContext, {
      userId: ownerId,
      type: 'system',
      title: 'Invalid metadata',
      body: 'Array metadata is not allowed',
      metadata: [],
    });
  });

  await assertRejected('NOTIFICATION INVALID TITLE DENIAL', async () => {
    await runtimeNotificationService.createNotification(ownerContext, {
      userId: ownerId,
      type: 'system',
      title: '   ',
      body: 'Valid body',
      metadata: {},
    });
  });

  await assertRejected('NOTIFICATION INVALID BODY DENIAL', async () => {
    await runtimeNotificationService.createNotification(ownerContext, {
      userId: ownerId,
      type: 'system',
      title: 'Valid title',
      body: '   ',
      metadata: {},
    });
  });

  await assertRejected('NOTIFICATION MISSING RECIPIENT DENIAL', async () => {
    await runtimeNotificationService.createNotification(ownerContext, {
      userId: 999999999,
      type: 'system',
      title: 'Missing recipient',
      body: 'Recipient must exist',
      metadata: {},
    });
  });

  const ownerRead = await runtimeNotificationService.getNotification(ownerContext, created.id);
  if (!ownerRead || ownerRead.id !== created.id) throw new Error('Owner Notification read failed');
  console.log('NOTIFICATION OWNER READ PASS');

  const outsiderRead = await runtimeNotificationService.getNotification(outsiderContext, created.id);
  if (outsiderRead !== null) throw new Error('Cross-account Notification read unexpectedly succeeded');
  console.log('NOTIFICATION CROSS-ACCOUNT READ DENIAL PASS');

  const ownerList = await runtimeNotificationService.listNotifications(ownerContext, { limit: 1 });
  if (ownerList.length !== 1 || ownerList[0].id !== adminCreated.id) {
    throw new Error(`Unexpected newest-first Notification list: ${JSON.stringify(ownerList)}`);
  }
  console.log('NOTIFICATION OWNER-LIST LIMIT AND ORDER PASS');

  const outsiderList = await runtimeNotificationService.listNotifications(outsiderContext);
  if (outsiderList.some(item => item.id === created.id || item.id === adminCreated.id)) {
    throw new Error('Cross-account Notification list leaked records');
  }
  console.log('NOTIFICATION CROSS-ACCOUNT LIST DENIAL PASS');

  const marked = await runtimeNotificationService.markNotificationRead(ownerContext, created.id);
  if (!marked.isRead || !marked.readAt) throw new Error('Notification mark-read result mismatch');
  const firstReadAt = marked.readAt;
  console.log('NOTIFICATION MARK-READ PASS');

  const markedAgain = await runtimeNotificationService.markNotificationRead(ownerContext, created.id);
  if (!markedAgain.isRead || !markedAgain.readAt || markedAgain.readAt.getTime?.() !== firstReadAt.getTime?.()) {
    throw new Error('Notification mark-read idempotency mismatch');
  }
  console.log('NOTIFICATION MARK-READ IDEMPOTENCY PASS');

  await assertRejected('NOTIFICATION CROSS-ACCOUNT MARK-READ DENIAL', async () => {
    await runtimeNotificationService.markNotificationRead(outsiderContext, created.id);
  });

  const markAllCount = await runtimeNotificationService.markAllNotificationsRead(ownerContext);
  if (markAllCount !== 1) throw new Error(`Expected one unread Notification, got ${markAllCount}`);
  console.log('NOTIFICATION MARK-ALL COUNT AND SCOPE PASS');

  const afterMarkAll = await runtimeNotificationService.listNotifications(ownerContext);
  if (afterMarkAll.some(item => !item.isRead || !item.readAt)) {
    throw new Error('Mark-all left an unread or invariant-breaking Notification');
  }
  console.log('NOTIFICATION READ-STATE INVARIANT PASS');

  await assertRejected('RUNTIME NOTIFICATION TITLE UPDATE DENIAL', async () => {
    await runtimeQuery(`UPDATE ghm.notification SET title = 'tampered' WHERE id = $1`, [created.id]);
  });

  await assertRejected('RUNTIME NOTIFICATION DELETE DENIAL', async () => {
    await runtimeQuery(`DELETE FROM ghm.notification WHERE id = $1`, [created.id]);
  });

  const persisted = await cleanupAuthorityQuery(`
    SELECT id, user_id, type, title, body, metadata, is_read, read_at
    FROM ghm.notification
    WHERE id = $1
  `, [created.id]);
  if (
    persisted.rowCount !== 1 ||
    Number(persisted.rows[0].user_id) !== ownerId ||
    persisted.rows[0].type !== 'system' ||
    persisted.rows[0].title !== 'System notice' ||
    persisted.rows[0].body !== 'Notification qualification body' ||
    persisted.rows[0].metadata?.source !== 'qualification' ||
    persisted.rows[0].is_read !== true ||
    !persisted.rows[0].read_at
  ) {
    throw new Error(`Persisted Notification reconciliation failed: ${JSON.stringify(persisted.rows[0])}`);
  }
  console.log('PERSISTED NOTIFICATION RECONCILIATION PASS');
  console.log('NOTIFICATION RUNTIME QUALIFICATION PASS');
} finally {
  if (notificationIds.length > 0) {
    await cleanupAuthorityQuery(`DELETE FROM ghm.notification WHERE id = ANY($1::bigint[])`, [notificationIds]);
  }
  if (accountIds.length > 0) {
    await cleanupAuthorityQuery(`DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`, [accountIds]);
  }
  cleanupClient.release();
  await runtimePool.end();
  await cleanupPool.end();
}
