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
const { SupportRequestServiceImpl } = await import('../dist/resources/support-request/service.js');
const { PostgresSupportRequestRepository } = await import('../dist/resources/support-request/repository.js');
const service = new SupportRequestServiceImpl(new PostgresSupportRequestRepository(runtimePool));
const marker = `support-request-qualification-${randomUUID()}`;
const accountIds = [];
const businessIds = [];
const requestIds = [];
const messageIds = [];

async function runtimeQuery(text, params = []) { return runtimePool.query(text, params); }
async function cleanupQuery(text, params = []) { return cleanupClient.query(text, params); }
async function expectReject(label, fn) {
  try { await fn(); } catch { console.log(`${label} PASS`); return; }
  throw new Error(`${label} unexpectedly succeeded`);
}
async function createAccount(name, role = 'customer') {
  const r = await cleanupQuery('INSERT INTO ghm.account_identity (full_name, role) VALUES ($1,$2) RETURNING id', [name, role]);
  const id = Number(r.rows[0].id); accountIds.push(id); return id;
}
async function createBusiness(name, ownerId) {
  const r = await cleanupQuery(`INSERT INTO ghm.business (name, owner_account_id) VALUES ($1,$2) RETURNING id`, [name, ownerId]);
  const id = Number(r.rows[0].id); businessIds.push(id);
  await cleanupQuery(`INSERT INTO ghm.business_membership (business_id, account_id, role, status) VALUES ($1,$2,'owner','active')`, [id, ownerId]);
  return id;
}
try {
  const identity = await runtimeQuery('SELECT current_database() AS database_name, current_user AS current_user');
  if (identity.rows[0].database_name !== 'ghm_db' || identity.rows[0].current_user !== 'ghm_runtime') throw new Error(`Unexpected runtime identity: ${JSON.stringify(identity.rows[0])}`);
  console.log('RUNTIME IDENTITY PASS: ghm_db/ghm_runtime');
  const cleanupIdentity = await cleanupQuery('SELECT current_database() AS database_name, current_user AS current_user');
  if (cleanupIdentity.rows[0].database_name !== 'ghm_db' || cleanupIdentity.rows[0].current_user !== 'ghm_migrator') throw new Error(`Unexpected cleanup identity: ${JSON.stringify(cleanupIdentity.rows[0])}`);
  console.log('CLEANUP AUTHORITY PASS: ghm_db/ghm_migrator');
  await cleanupQuery('SET ROLE ghm_schema_owner');

  const tables = await cleanupQuery(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ghm' AND c.relname IN ('support_request','support_request_message') AND c.relkind IN ('r','p') ORDER BY c.relname`);
  if (JSON.stringify(tables.rows.map(r => r.relname)) !== JSON.stringify(['support_request','support_request_message'])) throw new Error('Support Request tables missing');
  console.log('SUPPORT REQUEST SCHEMA PRESENCE PASS');

  const tablePrivs = await cleanupQuery(`SELECT c.relname, x.privilege_type FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE n.nspname='ghm' AND c.relname IN ('support_request','support_request_message') AND x.grantee=(SELECT oid FROM pg_roles WHERE rolname='ghm_runtime') ORDER BY c.relname,x.privilege_type`);
  const grouped = Object.groupBy(tablePrivs.rows, r => r.relname);
  if (JSON.stringify(grouped.support_request?.map(r=>r.privilege_type) ?? []) !== JSON.stringify(['SELECT']) || JSON.stringify(grouped.support_request_message?.map(r=>r.privilege_type) ?? []) !== JSON.stringify(['SELECT'])) throw new Error(`Unexpected table grants: ${JSON.stringify(tablePrivs.rows)}`);
  const columnPrivs = await cleanupQuery(`SELECT c.relname,a.attname,x.privilege_type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE n.nspname='ghm' AND c.relname IN ('support_request','support_request_message') AND a.attnum>0 AND NOT a.attisdropped AND x.grantee=(SELECT oid FROM pg_roles WHERE rolname='ghm_runtime') AND x.privilege_type IN ('INSERT','UPDATE') ORDER BY c.relname,x.privilege_type,a.attname`);
  const insReq = columnPrivs.rows.filter(r=>r.relname==='support_request'&&r.privilege_type==='INSERT').map(r=>r.attname);
  const updReq = columnPrivs.rows.filter(r=>r.relname==='support_request'&&r.privilege_type==='UPDATE').map(r=>r.attname);
  const insMsg = columnPrivs.rows.filter(r=>r.relname==='support_request_message'&&r.privilege_type==='INSERT').map(r=>r.attname);
  if (JSON.stringify(insReq)!==JSON.stringify(['account_id','business_id','category','description','subject'])) throw new Error(`Unexpected request INSERT columns: ${JSON.stringify(insReq)}`);
  if (JSON.stringify(updReq)!==JSON.stringify(['closed_at','resolved_at','resolution_summary','status','updated_at'])) throw new Error(`Unexpected request UPDATE columns: ${JSON.stringify(updReq)}`);
  if (JSON.stringify(insMsg)!==JSON.stringify(['account_id','body','sender_kind','support_request_id'])) throw new Error(`Unexpected message INSERT columns: ${JSON.stringify(insMsg)}`);
  const deletes = await cleanupQuery(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE n.nspname='ghm' AND c.relname IN ('support_request','support_request_message') AND x.grantee=(SELECT oid FROM pg_roles WHERE rolname='ghm_runtime') AND x.privilege_type='DELETE'`);
  if (deletes.rowCount !== 0) throw new Error('Unexpected runtime DELETE privilege');
  console.log('SUPPORT REQUEST RUNTIME PRIVILEGE BOUNDARY PASS');

  const customerId = await createAccount(`${marker}-customer`);
  const outsiderId = await createAccount(`${marker}-outsider`);
  const adminId = await createAccount(`${marker}-admin`, 'admin');
  const otherBusinessOwnerId = await createAccount(`${marker}-business-owner`);
  const customer = { userId: customerId, role: 'customer' };
  const outsider = { userId: outsiderId, role: 'customer' };
  const admin = { userId: adminId, role: 'admin' };
  const businessOwner = { userId: otherBusinessOwnerId, role: 'customer' };
  const businessId = await createBusiness(`${marker}-business`, customerId);
  const otherBusinessId = await createBusiness(`${marker}-other-business`, otherBusinessOwnerId);

  const created = await service.createSupportRequest(customer, { category:'technical', subject:'  Login issue  ', description:'  Unable to complete login from the workspace.  ', businessId });
  requestIds.push(created.id);
  if (created.accountId!==customerId || created.businessId!==businessId || created.subject!=='Login issue' || created.description!=='Unable to complete login from the workspace.' || created.status!=='open' || created.priority!=='normal') throw new Error(`Unexpected create result: ${JSON.stringify(created)}`);
  console.log(`SUPPORT REQUEST CREATE PASS: request=${created.id}`);
  const initialMessages = await service.getMessages(customer, created.id);
  if (initialMessages.length!==1 || initialMessages[0].senderKind!=='customer' || initialMessages[0].accountId!==customerId || initialMessages[0].body!=='Unable to complete login from the workspace.') throw new Error('Atomic initial message mismatch');
  messageIds.push(initialMessages[0].id);
  console.log('SUPPORT REQUEST ATOMIC INITIAL MESSAGE PASS');

  await expectReject('SUPPORT REQUEST CROSS-ACCOUNT CREATE DENIAL', () => service.createSupportRequest(outsider, { category:'technical', subject:'Unauthorized', description:'This request must not use another customer identity.' }));
  await expectReject('SUPPORT REQUEST UNAUTHORIZED BUSINESS ASSOCIATION DENIAL', () => service.createSupportRequest(customer, { category:'technical', subject:'Bad association', description:'This association is not authorized for this customer.', businessId:otherBusinessId }));
  await expectReject('SUPPORT REQUEST BUSINESS ROLE CREATE DENIAL', () => service.createSupportRequest({ userId:customerId, role:'business' }, { category:'technical', subject:'Business role', description:'Business actors are not customer request creators.' }));

  const ownRead = await service.getSupportRequest(customer, created.id);
  if (!ownRead || ownRead.id!==created.id) throw new Error('Customer own read failed');
  if (await service.getSupportRequest(outsider, created.id)!==null) throw new Error('Cross-account read leaked');
  const ownList = await service.listSupportRequests(customer);
  if (ownList.length!==1 || ownList[0].id!==created.id) throw new Error('Customer list isolation failed');
  if ((await service.listSupportRequests(outsider)).some(r=>r.id===created.id)) throw new Error('Cross-account list leaked');
  console.log('SUPPORT REQUEST CUSTOMER ISOLATION PASS');

  const adminRead = await service.getSupportRequest(admin, created.id);
  if (!adminRead || adminRead.id!==created.id) throw new Error('Admin read failed');
  console.log('SUPPORT REQUEST ADMIN READ PASS');
  await expectReject('SUPPORT REQUEST CUSTOMER STATUS DENIAL', () => service.updateSupportRequestStatus(customer, created.id, { status:'resolved', resolutionSummary:null }));
  await expectReject('SUPPORT REQUEST INVALID STATUS DENIAL', () => service.updateSupportRequestStatus(admin, created.id, { status:'bogus', resolutionSummary:null }));

  const resolved = await service.updateSupportRequestStatus(admin, created.id, { status:'resolved', resolutionSummary:null });
  if (resolved.status!=='resolved' || resolved.resolutionSummary!==null || !resolved.resolvedAt || resolved.closedAt!==null) throw new Error('Resolved/null-summary semantics failed');
  console.log('SUPPORT REQUEST RESOLVE NULL-SUMMARY PASS');

  await expectReject('SUPPORT REQUEST UNAUTHORIZED CUSTOMER REPLY DENIAL', () => service.replyAsCustomer(outsider, created.id, 'No access'));
  const customerReply = await service.replyAsCustomer(customer, created.id, '  More information  ');
  messageIds.push(customerReply.id);
  if (customerReply.senderKind!=='customer' || customerReply.accountId!==customerId || customerReply.body!=='More information') throw new Error('Customer reply integrity failed');
  const reopened = await service.getSupportRequest(customer, created.id);
  if (!reopened || reopened.status!=='open' || reopened.resolvedAt!==null || reopened.closedAt!==null || reopened.resolutionSummary!==null) throw new Error('Customer reopen semantics failed');
  console.log('SUPPORT REQUEST CUSTOMER REPLY AND REOPEN PASS');

  await expectReject('SUPPORT REQUEST CUSTOMER ADMIN-REPLY DENIAL', () => service.replyAsAdmin(customer, created.id, 'No admin authority'));
  const adminReply = await service.replyAsAdmin(admin, created.id, '  Support response  ');
  messageIds.push(adminReply.id);
  if (adminReply.senderKind!=='admin' || adminReply.accountId!==adminId || adminReply.body!=='Support response') throw new Error('Admin reply integrity failed');
  console.log('SUPPORT REQUEST ADMIN REPLY PASS');

  await service.updateSupportRequestStatus(admin, created.id, { status:'closed', resolutionSummary:null });
  const closed = await service.getSupportRequest(admin, created.id);
  if (!closed || closed.status!=='closed' || closed.resolutionSummary!==null || !closed.resolvedAt || !closed.closedAt) throw new Error('Closed/null-summary semantics failed');
  const reopenedByAdmin = await service.replyAsAdmin(admin, created.id, '  Reopening for follow-up  ');
  messageIds.push(reopenedByAdmin.id);
  const inProgress = await service.getSupportRequest(admin, created.id);
  if (!inProgress || inProgress.status!=='in_progress' || inProgress.resolvedAt!==null || inProgress.closedAt!==null || inProgress.resolutionSummary!==null) throw new Error('Admin reopen semantics failed');
  console.log('SUPPORT REQUEST CLOSE AND ADMIN REOPEN PASS');

  const messages = await service.getMessages(customer, created.id);
  if (messages.length!==4 || messages.some((m,i)=>m.id!==messageIds[i]) || messages[0].senderKind!=='customer' || messages[1].senderKind!=='customer' || messages[2].senderKind!=='admin' || messages[3].senderKind!=='admin') throw new Error('Message order/integrity failed');
  if ((await service.getMessages(outsider, created.id)).length!==0) throw new Error('Cross-account message read leaked');
  if ((await service.getMessages(admin, created.id)).length!==4) throw new Error('Admin message read failed');
  console.log('SUPPORT REQUEST MESSAGE ORDER AND ISOLATION PASS');

  await expectReject('SUPPORT REQUEST RUNTIME ARBITRARY UPDATE DENIAL', () => runtimeQuery(`UPDATE ghm.support_request SET account_id=$1 WHERE id=$2`, [outsiderId, created.id]));
  await expectReject('SUPPORT REQUEST RUNTIME DELETE DENIAL', () => runtimeQuery(`DELETE FROM ghm.support_request WHERE id=$1`, [created.id]));
  await expectReject('SUPPORT REQUEST MESSAGE RUNTIME UPDATE DENIAL', () => runtimeQuery(`UPDATE ghm.support_request_message SET body='tampered' WHERE id=$1`, [messageIds[0]]));
  await expectReject('SUPPORT REQUEST MESSAGE RUNTIME DELETE DENIAL', () => runtimeQuery(`DELETE FROM ghm.support_request_message WHERE id=$1`, [messageIds[0]]));

  const persisted = await cleanupQuery(`SELECT status,resolution_summary,resolved_at,closed_at FROM ghm.support_request WHERE id=$1`, [created.id]);
  if (persisted.rowCount!==1 || persisted.rows[0].status!=='in_progress' || persisted.rows[0].resolution_summary!==null || persisted.rows[0].resolved_at!==null || persisted.rows[0].closed_at!==null) throw new Error(`Persisted reconciliation failed: ${JSON.stringify(persisted.rows[0])}`);
  console.log('PERSISTED SUPPORT REQUEST RECONCILIATION PASS');
  console.log('SUPPORT REQUEST RUNTIME QUALIFICATION PASS');
} finally {
  if (messageIds.length) await cleanupQuery('DELETE FROM ghm.support_request_message WHERE id=ANY($1::bigint[])',[messageIds]);
  if (requestIds.length) await cleanupQuery('DELETE FROM ghm.support_request WHERE id=ANY($1::bigint[])',[requestIds]);
  if (businessIds.length) await cleanupQuery('DELETE FROM ghm.business WHERE id=ANY($1::bigint[])',[businessIds]);
  if (accountIds.length) await cleanupQuery('DELETE FROM ghm.account_identity WHERE id=ANY($1::bigint[])',[accountIds]);
  cleanupClient.release(); await runtimePool.end(); await cleanupPool.end();
}
