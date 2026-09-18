import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

process.env.CORS_ORIGINS ??= 'http://localhost';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { CampaignServiceImpl } = await import('../dist/resources/campaign/service.js');
const { PostgresCampaignRepository } = await import('../dist/resources/campaign/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const cleanupClient = await cleanupPool.connect();
const marker = `ghm-campaign-${randomUUID()}`;

const fixture = {
  ownerId: 0,
  adminId: 0,
  memberId: 0,
  outsiderId: 0,
  businessId: 0,
  otherBusinessId: 0,
  inactiveBusinessId: 0,
  campaignIds: [],
};

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

const track = (campaign) => {
  fixture.campaignIds.push(campaign.id);
  return campaign;
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
      AND c.relname = 'campaign'
  `);
  if (schemaPresence.rowCount !== 1) throw new Error('Campaign table is missing');
  if (schemaPresence.rows[0].owner_name !== 'ghm_schema_owner') {
    throw new Error(`Unexpected Campaign owner: ${schemaPresence.rows[0].owner_name}`);
  }
  console.log('CAMPAIGN SCHEMA PRESENCE PASS');

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
      AND c.relname = 'campaign'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `);
  const expectedColumns = [
    { column_name: 'id', data_type: 'bigint', not_null: true, identity: 'd' },
    { column_name: 'business_id', data_type: 'bigint', not_null: true, identity: '' },
    { column_name: 'created_by_account_id', data_type: 'bigint', not_null: true, identity: '' },
    { column_name: 'title', data_type: 'text', not_null: true, identity: '' },
    { column_name: 'status', data_type: 'text', not_null: true, identity: '' },
    { column_name: 'created_at', data_type: 'timestamp with time zone', not_null: true, identity: '' },
    { column_name: 'updated_at', data_type: 'timestamp with time zone', not_null: true, identity: '' },
  ];
  if (columns.rowCount !== expectedColumns.length) {
    throw new Error(`Unexpected Campaign column count: ${JSON.stringify(columns.rows)}`);
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
      throw new Error(`Unexpected Campaign column: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    }
  }
  if (!String(columns.rows[4].column_default || '').includes('draft')) {
    throw new Error(`Unexpected status default: ${columns.rows[4].column_default}`);
  }
  console.log('CAMPAIGN EXACT SCHEMA PASS');

  const foreignKeys = await cleanupQuery(`
    SELECT pg_catalog.pg_get_constraintdef(c.oid) AS definition
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'ghm'
      AND rel.relname = 'campaign'
      AND c.contype = 'f'
    ORDER BY c.conname
  `);
  const fkDefs = foreignKeys.rows.map(row => row.definition);
  if (
    foreignKeys.rowCount !== 2
    || !fkDefs.some(def => def.includes('business_id') && def.includes('business(id)') && def.includes('ON DELETE RESTRICT'))
    || !fkDefs.some(def => def.includes('created_by_account_id') && def.includes('account_identity') && def.includes('ON DELETE RESTRICT'))
  ) {
    throw new Error(`Unexpected Campaign foreign keys: ${JSON.stringify(foreignKeys.rows)}`);
  }

  const indexes = await cleanupQuery(`
    SELECT i.relname AS index_name,
           pg_catalog.pg_get_indexdef(i.oid) AS definition
    FROM pg_catalog.pg_index x
    JOIN pg_catalog.pg_class t ON t.oid = x.indrelid
    JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'ghm'
      AND t.relname = 'campaign'
      AND NOT x.indisprimary
    ORDER BY i.relname
  `);
  const indexDefs = indexes.rows.map(row => ({ name: row.index_name, definition: row.definition }));
  if (
    !indexDefs.some(row => row.name === 'campaign_business_created_idx'
      && row.definition.includes('business_id')
      && row.definition.includes('created_at DESC'))
    || !indexDefs.some(row => row.name === 'campaign_business_status_created_idx'
      && row.definition.includes('status')
      && row.definition.includes('created_at DESC'))
    || !indexDefs.some(row => row.name === 'campaign_creator_created_idx'
      && row.definition.includes('created_by_account_id')
      && row.definition.includes('created_at DESC'))
  ) {
    throw new Error(`Unexpected Campaign indexes: ${JSON.stringify(indexDefs)}`);
  }
  console.log('CAMPAIGN INTEGRITY BOUNDARY PASS');

  const tablePrivileges = await cleanupQuery(`
    SELECT x.privilege_type
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'campaign'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
    ORDER BY x.privilege_type
  `);
  const tableGrantSet = tablePrivileges.rows.map(row => row.privilege_type);
  if (JSON.stringify(tableGrantSet) !== JSON.stringify(['SELECT'])) {
    throw new Error(`Unexpected Campaign table grants: ${JSON.stringify(tableGrantSet)}`);
  }

  const unexpectedDelete = await cleanupQuery(`
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
    WHERE n.nspname = 'ghm'
      AND c.relname = 'campaign'
      AND x.grantee = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'ghm_runtime')
      AND x.privilege_type = 'DELETE'
  `);
  if (unexpectedDelete.rowCount !== 0) throw new Error('Unexpected Campaign DELETE privilege');

  const functionPrivileges = await cleanupQuery(`
    SELECT p.proname,
           has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS execute_ok
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ghm'
      AND p.proname IN ('create_campaign', 'update_campaign')
    ORDER BY p.proname
  `);
  if (
    functionPrivileges.rowCount !== 2
    || functionPrivileges.rows.some(row => row.execute_ok !== true)
  ) {
    throw new Error(`Unexpected Campaign function EXECUTE grants: ${JSON.stringify(functionPrivileges.rows)}`);
  }
  console.log('CAMPAIGN RUNTIME PRIVILEGE BOUNDARY PASS: SELECT=yes INSERT=no UPDATE=no DELETE=no CREATE/UPDATE=execute-only');

  const owner = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
    [`${marker} owner`],
  );
  const admin = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
    [`${marker} admin`],
  );
  const member = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
    [`${marker} member`],
  );
  const outsider = await cleanupQuery(
    `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
    [`${marker} outsider`],
  );
  fixture.ownerId = Number(owner.rows[0].id);
  fixture.adminId = Number(admin.rows[0].id);
  fixture.memberId = Number(member.rows[0].id);
  fixture.outsiderId = Number(outsider.rows[0].id);

  const business = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
     VALUES ($1, $2, 'under_review', false, true) RETURNING id`,
    [`${marker} business`, `${marker}-business`],
  );
  const otherBusiness = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
     VALUES ($1, $2, 'under_review', false, true) RETURNING id`,
    [`${marker} other`, `${marker}-other`],
  );
  const inactiveBusiness = await cleanupQuery(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
     VALUES ($1, $2, 'under_review', false, false) RETURNING id`,
    [`${marker} inactive`, `${marker}-inactive`],
  );
  fixture.businessId = Number(business.rows[0].id);
  fixture.otherBusinessId = Number(otherBusiness.rows[0].id);
  fixture.inactiveBusinessId = Number(inactiveBusiness.rows[0].id);

  await cleanupQuery(
    `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
     VALUES
       ($1, $2, 'owner', 'active', $2),
       ($1, $3, 'administrator', 'active', $2),
       ($1, $4, 'member', 'active', $2),
       ($5, $6, 'owner', 'active', $6)`,
    [fixture.businessId, fixture.ownerId, fixture.adminId, fixture.memberId, fixture.otherBusinessId, fixture.outsiderId],
  );

  // Owner membership on inactive business so eligibility fails on is_active, not membership.
  await cleanupQuery(
    `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
     VALUES ($1, $2, 'owner', 'active', $2)`,
    [fixture.inactiveBusinessId, fixture.ownerId],
  );

  const repository = new PostgresCampaignRepository(runtimePool);
  const service = new CampaignServiceImpl(repository);
  const ownerContext = { userId: fixture.ownerId, role: 'business' };
  const adminContext = { userId: fixture.adminId, role: 'business' };
  const memberContext = { userId: fixture.memberId, role: 'business' };
  const outsiderContext = { userId: fixture.outsiderId, role: 'business' };
  const anonymousContext = { userId: 0, role: 'business' };

  await expectReject(
    () => service.createCampaign(anonymousContext, { businessId: fixture.businessId, title: 'Anon' }),
    'ANONYMOUS CREATE DENIAL',
  );

  const createdByOwner = track(await service.createCampaign(ownerContext, {
    businessId: fixture.businessId,
    title: '  Owner Campaign  ',
  }));
  if (
    createdByOwner.createdByAccountId !== fixture.ownerId
    || createdByOwner.businessId !== fixture.businessId
    || createdByOwner.title !== 'Owner Campaign'
    || createdByOwner.status !== 'draft'
  ) {
    throw new Error(`Unexpected owner create result: ${JSON.stringify(createdByOwner)}`);
  }
  console.log('OWNER CREATE + TITLE TRIM + DEFAULT DRAFT + CREATOR BINDING PASS');

  const createdByAdmin = track(await service.createCampaign(adminContext, {
    businessId: fixture.businessId,
    title: 'Admin Campaign',
  }));
  if (createdByAdmin.createdByAccountId !== fixture.adminId) {
    throw new Error('Administrator create did not bind AuthContext.userId');
  }
  console.log('ADMINISTRATOR CREATE PASS');

  await expectReject(
    () => service.createCampaign(memberContext, { businessId: fixture.businessId, title: 'Member Campaign' }),
    'MEMBER CREATE DENIAL',
  );
  await expectReject(
    () => service.createCampaign(outsiderContext, { businessId: fixture.businessId, title: 'Cross create' }),
    'CROSS-BUSINESS CREATE DENIAL',
  );
  await expectReject(
    () => service.createCampaign(ownerContext, { businessId: fixture.inactiveBusinessId, title: 'Inactive' }),
    'INACTIVE BUSINESS CREATE DENIAL',
  );

  const nonexistentBusiness = await runtimePool.query(
    `SELECT COALESCE(MAX(id), 0)::bigint + 1000000 AS id FROM ghm.business`,
  );
  await expectReject(
    () => service.createCampaign(ownerContext, {
      businessId: Number(nonexistentBusiness.rows[0].id),
      title: 'Missing business',
    }),
    'NONEXISTENT BUSINESS CREATE DENIAL',
  );

  await expectReject(
    () => service.createCampaign(ownerContext, { businessId: fixture.businessId, title: '   ' }),
    'EMPTY TITLE DENIAL',
  );
  await expectReject(
    () => service.createCampaign(ownerContext, { businessId: fixture.businessId, title: 'x'.repeat(201) }),
    'OVERLONG TITLE DENIAL',
  );

  const ownerRead = await service.getCampaign(ownerContext, createdByOwner.id);
  const adminRead = await service.getCampaign(adminContext, createdByOwner.id);
  const memberRead = await service.getCampaign(memberContext, createdByOwner.id);
  if (!ownerRead || !adminRead || !memberRead) throw new Error('Authorized membership read failed');
  console.log('OWNER/ADMINISTRATOR/MEMBER READ PASS');

  const outsiderRead = await service.getCampaign(outsiderContext, createdByOwner.id);
  if (outsiderRead !== null) throw new Error('Cross-business read leaked campaign');
  const outsiderList = await service.listCampaigns(outsiderContext, fixture.businessId);
  if (outsiderList.length !== 0) throw new Error('Cross-business list leaked campaigns');
  const ownerList = await service.listCampaigns(ownerContext, fixture.businessId);
  if (!ownerList.some(item => item.id === createdByOwner.id)) throw new Error('Owner list missing campaign');
  console.log('CROSS-BUSINESS READ ISOLATION PASS');

  const updatedByOwner = await service.updateCampaign(ownerContext, createdByOwner.id, { title: 'Renamed' });
  if (updatedByOwner.title !== 'Renamed' || updatedByOwner.status !== 'draft') {
    throw new Error(`Unexpected owner title update: ${JSON.stringify(updatedByOwner)}`);
  }
  const activated = await service.updateCampaign(adminContext, createdByOwner.id, { status: 'active' });
  if (activated.status !== 'active') throw new Error('draft -> active failed');
  console.log('OWNER/ADMINISTRATOR UPDATE PASS');

  await expectReject(
    () => service.updateCampaign(memberContext, createdByOwner.id, { title: 'Member rename' }),
    'MEMBER UPDATE DENIAL',
  );
  await expectReject(
    () => service.updateCampaign(outsiderContext, createdByOwner.id, { title: 'Outsider rename' }),
    'CROSS-BUSINESS UPDATE DENIAL',
  );

  await expectReject(
    () => service.updateCampaign(ownerContext, createdByOwner.id, { status: 'draft' }),
    'ACTIVE TO DRAFT DENIAL',
  );

  const archivedFromActive = await service.updateCampaign(ownerContext, createdByOwner.id, { status: 'archived' });
  if (archivedFromActive.status !== 'archived') throw new Error('active -> archived failed');

  await expectReject(
    () => service.updateCampaign(ownerContext, createdByOwner.id, { title: 'After archive' }),
    'ARCHIVED TITLE UPDATE DENIAL',
  );
  await expectReject(
    () => service.updateCampaign(ownerContext, createdByOwner.id, { status: 'active' }),
    'ARCHIVED TO ACTIVE DENIAL',
  );
  await expectReject(
    () => service.updateCampaign(ownerContext, createdByOwner.id, { status: 'draft' }),
    'ARCHIVED TO DRAFT DENIAL',
  );
  await expectReject(
    () => service.updateCampaign(ownerContext, createdByOwner.id, { status: 'open' }),
    'INVALID STATUS DENIAL',
  );

  const draftForArchive = track(await service.createCampaign(ownerContext, {
    businessId: fixture.businessId,
    title: 'Draft archive path',
  }));
  const archivedFromDraft = await service.updateCampaign(ownerContext, draftForArchive.id, { status: 'archived' });
  if (archivedFromDraft.status !== 'archived') throw new Error('draft -> archived failed');
  console.log('STATUS LIFECYCLE PASS');

  // Lost membership: creator provenance must not preserve access.
  const lostMembershipCampaign = track(await service.createCampaign(ownerContext, {
    businessId: fixture.businessId,
    title: 'Lost membership campaign',
  }));
  await cleanupQuery(
    `UPDATE ghm.business_membership
        SET membership_status = 'revoked', updated_at = now()
      WHERE business_id = $1 AND account_id = $2`,
    [fixture.businessId, fixture.ownerId],
  );
  const lostRead = await service.getCampaign(ownerContext, lostMembershipCampaign.id);
  if (lostRead !== null) throw new Error('Revoked membership still allowed campaign read');
  await expectReject(
    () => service.updateCampaign(ownerContext, lostMembershipCampaign.id, { title: 'Still mine' }),
    'REVOKED MEMBERSHIP UPDATE DENIAL',
  );
  // Restore owner for remaining checks / cleanup clarity
  await cleanupQuery(
    `UPDATE ghm.business_membership
        SET membership_status = 'active', updated_at = now()
      WHERE business_id = $1 AND account_id = $2`,
    [fixture.businessId, fixture.ownerId],
  );
  console.log('REVOKED MEMBERSHIP ACCESS DENIAL PASS');

  await expectReject(
    () => runtimePool.query(
      `INSERT INTO ghm.campaign (business_id, created_by_account_id, title)
       VALUES ($1, $2, 'direct')`,
      [fixture.businessId, fixture.ownerId],
    ),
    'RUNTIME DIRECT INSERT DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.campaign SET business_id = $1 WHERE id = $2`,
      [fixture.otherBusinessId, createdByAdmin.id],
    ),
    'RUNTIME OWNERSHIP business_id UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.campaign SET created_by_account_id = $1 WHERE id = $2`,
      [fixture.outsiderId, createdByAdmin.id],
    ),
    'RUNTIME OWNERSHIP created_by_account_id UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `UPDATE ghm.campaign SET id = $1 WHERE id = $2`,
      [createdByAdmin.id + 999999, createdByAdmin.id],
    ),
    'RUNTIME OWNERSHIP id UPDATE DENIAL',
  );
  await expectReject(
    () => runtimePool.query(
      `DELETE FROM ghm.campaign WHERE id = $1`,
      [createdByAdmin.id],
    ),
    'RUNTIME DIRECT DELETE DENIAL',
  );

  // update_campaign must not accept ownership rewrites through its signature
  await expectReject(
    () => runtimePool.query(
      `SELECT * FROM ghm.update_campaign($1, $2, $3, $4)`,
      [fixture.adminId, createdByAdmin.id, null, null],
    ),
    'EMPTY UPDATE DENIAL',
  );

  const grants = await runtimePool.query(`
    SELECT has_table_privilege(current_user, 'ghm.campaign', 'SELECT') AS select_ok,
           has_table_privilege(current_user, 'ghm.campaign', 'INSERT') AS insert_ok,
           has_table_privilege(current_user, 'ghm.campaign', 'UPDATE') AS update_ok,
           has_table_privilege(current_user, 'ghm.campaign', 'DELETE') AS delete_ok,
           has_function_privilege(current_user, 'ghm.create_campaign(bigint,bigint,text)', 'EXECUTE') AS create_fn_ok,
           has_function_privilege(current_user, 'ghm.update_campaign(bigint,bigint,text,text)', 'EXECUTE') AS update_fn_ok
  `);
  const grant = grants.rows[0];
  if (!grant.select_ok || grant.insert_ok || grant.update_ok || grant.delete_ok || !grant.create_fn_ok || !grant.update_fn_ok) {
    throw new Error(`Unexpected Campaign effective ACL: ${JSON.stringify(grant)}`);
  }
  console.log('RUNTIME EFFECTIVE PRIVILEGE PASS: SELECT=yes INSERT=no UPDATE=no DELETE=no CREATE/UPDATE=execute-only');

  const persisted = await cleanupQuery(
    `SELECT id, business_id, created_by_account_id, title, status
     FROM ghm.campaign WHERE id = $1`,
    [createdByAdmin.id],
  );
  if (
    persisted.rowCount !== 1
    || Number(persisted.rows[0].business_id) !== fixture.businessId
    || Number(persisted.rows[0].created_by_account_id) !== fixture.adminId
  ) {
    throw new Error(`Persisted campaign reconciliation failed: ${JSON.stringify(persisted.rows[0])}`);
  }
  console.log('PERSISTED CAMPAIGN RECONCILIATION PASS');

  console.log('GHM CAMPAIGN RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupQuery('SET ROLE ghm_schema_owner');
    if (fixture.campaignIds.length > 0) {
      await cleanupQuery('DELETE FROM ghm.campaign WHERE id = ANY($1::bigint[])', [fixture.campaignIds]);
    }
    await cleanupQuery(
      'DELETE FROM ghm.business_membership WHERE business_id = ANY($1::bigint[])',
      [[fixture.businessId, fixture.otherBusinessId, fixture.inactiveBusinessId].filter(Boolean)],
    );
    await cleanupQuery(
      'DELETE FROM ghm.business WHERE id = ANY($1::bigint[])',
      [[fixture.businessId, fixture.otherBusinessId, fixture.inactiveBusinessId].filter(Boolean)],
    );
    await cleanupQuery(
      'DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])',
      [[fixture.ownerId, fixture.adminId, fixture.memberId, fixture.outsiderId].filter(Boolean)],
    );
    console.log('GOVERNED CLEANUP PASS');
  } catch (error) {
    console.error(`Qualification cleanup failed: ${error.message}`);
    process.exitCode = 1;
  }
  cleanupClient.release();
  await Promise.all([runtimePool.end(), cleanupPool.end()]);
}
