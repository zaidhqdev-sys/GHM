import 'dotenv/config';
import crypto from 'node:crypto';
import { Client } from 'pg';

const auditUrl=process.env.GHM_LEGACY_AUDIT_DATABASE_URL?.trim()||null;
const targets=['users','profiles','todos','files','password_reset_tokens'];

if(!auditUrl){
  console.log(JSON.stringify({
    audit:'GHM legacy data preservation and disposition audit',
    version:1,
    captured_at:new Date().toISOString(),
    mutation:false,
    status:'BLOCKED_AUDIT_CONNECTION_REQUIRED',
    required_environment:'GHM_LEGACY_AUDIT_DATABASE_URL',
    purpose:'One-off read-only legacy data inspection. This connection must be separately authorized for legacy-owner/audit access and must not be a runtime or migrator credential.',
    decision:'DISPOSITION_PENDING'
  },null,2));
  process.exit(0);
}

const c=new Client({connectionString:auditUrl,ssl:{rejectUnauthorized:false}});
const q=sql=>c.query(sql).then(r=>r.rows);

const hash= s => crypto.createHash('sha256').update(s,'utf8').digest('hex');

try{
  await c.connect();
  const server=await q("SELECT current_database() AS database_name,current_user,current_schema(),current_setting('server_version_num') AS server_version_num");

  const columns=await q(`
    SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name = ANY($1::text[])
    ORDER BY table_name,ordinal_position
  `,[targets]);

  const counts=await q(`
    SELECT 'users' AS object_name,count(*)::bigint AS exact_row_count FROM public.users
    UNION ALL SELECT 'profiles',count(*)::bigint FROM public.profiles
    UNION ALL SELECT 'todos',count(*)::bigint FROM public.todos
    UNION ALL SELECT 'files',count(*)::bigint FROM public.files
    UNION ALL SELECT 'password_reset_tokens',count(*)::bigint FROM public.password_reset_tokens
    ORDER BY object_name
  `);

  const relationshipCounts=await q(`
    SELECT
      (SELECT count(*) FROM public.profiles p LEFT JOIN public.users u ON u.id=p.user_id WHERE u.id IS NULL)::bigint AS orphan_profiles,
      (SELECT count(*) FROM public.todos t LEFT JOIN public.users u ON u.id=t.user_id WHERE u.id IS NULL)::bigint AS orphan_todos,
      (SELECT count(*) FROM public.files f LEFT JOIN public.users u ON u.id=f.user_id WHERE u.id IS NULL)::bigint AS orphan_files,
      (SELECT count(*) FROM public.password_reset_tokens r LEFT JOIN public.users u ON u.id=r.user_id WHERE u.id IS NULL)::bigint AS orphan_password_reset_tokens,
      (SELECT count(*) FROM public.profiles p WHERE p.user_id IS NULL)::bigint AS profiles_without_user_id,
      (SELECT count(*) FROM public.todos t WHERE t.user_id IS NULL)::bigint AS todos_without_user_id,
      (SELECT count(*) FROM public.files f WHERE f.user_id IS NULL)::bigint AS files_without_user_id,
      (SELECT count(*) FROM public.password_reset_tokens r WHERE r.user_id IS NULL)::bigint AS password_reset_tokens_without_user_id
  `);

  const userData=await q(`
    SELECT
      count(*)::bigint AS user_rows,
      count(*) FILTER (WHERE email IS NOT NULL)::bigint AS users_with_email,
      count(DISTINCT lower(trim(email))) FILTER (WHERE email IS NOT NULL)::bigint AS distinct_normalized_emails,
      count(*) FILTER (WHERE password_hash IS NOT NULL)::bigint AS users_with_password_hash
    FROM public.users
  `);

  const profileData=await q(`
    SELECT
      count(*)::bigint AS profile_rows,
      count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::bigint AS distinct_profile_user_ids
    FROM public.profiles
  `);

  const todoData=await q(`
    SELECT
      count(*)::bigint AS todo_rows,
      count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::bigint AS distinct_todo_user_ids
    FROM public.todos
  `);

  const fileData=await q(`
    SELECT
      count(*)::bigint AS file_rows,
      count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::bigint AS distinct_file_user_ids,
      count(DISTINCT storage_key) FILTER (WHERE storage_key IS NOT NULL)::bigint AS distinct_storage_keys
    FROM public.files
  `);

  const resetData=await q(`
    SELECT
      count(*)::bigint AS reset_token_rows,
      count(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP)::bigint AS expired_tokens,
      count(*) FILTER (WHERE used_at IS NOT NULL)::bigint AS used_tokens,
      count(*) FILTER (WHERE expires_at >= CURRENT_TIMESTAMP AND used_at IS NULL)::bigint AS active_unused_tokens
    FROM public.password_reset_tokens
  `);

  const knownEmailHash=process.env.GHM_LEGACY_AUDIT_EMAIL_SHA256?.trim().toLowerCase()||null;
  let knownAccountMatch=null;
  if(knownEmailHash){
    const rows=await q("SELECT count(*)::bigint AS matches FROM public.users WHERE encode(digest(lower(trim(email)),'sha256'),'hex')=$1",[knownEmailHash]);
    knownAccountMatch={provided_email_sha256:hash(knownEmailHash),matches:rows[0]?.matches??0};
  }

  const disposition=[
    {object_name:'users',candidate_disposition:'MIGRATE_OR_PRESERVE_ARCHIVE',basis:'Legacy identity/account records require reconciliation with canonical GHM identity and QuoteFlow migration provenance.'},
    {object_name:'profiles',candidate_disposition:'MIGRATE_OR_PRESERVE_ARCHIVE',basis:'Profile data may carry identity/business presentation data; preserve until mapped to canonical GHM resources.'},
    {object_name:'files',candidate_disposition:'PRESERVE_ARCHIVE_OR_MIGRATE',basis:'File metadata may reference stored objects; deletion is blocked until storage preservation is verified.'},
    {object_name:'password_reset_tokens',candidate_disposition:'RETIRE_AFTER_PRESERVATION_CHECK',basis:'Historical recovery artifacts should not become a live authentication dependency.'},
    {object_name:'todos',candidate_disposition:'RETIRE_AFTER_PRESERVATION_CHECK',basis:'Legacy application data appears unrelated to canonical GHM resources, but exact contents must be established before disposal.'}
  ];

  console.log(JSON.stringify({
    audit:'GHM legacy data preservation and disposition audit',
    version:1,
    captured_at:new Date().toISOString(),
    mutation:false,
    status:'COMPLETE_READ_ONLY',
    server,
    inspected_tables:targets,
    columns,
    exact_row_counts:counts,
    relationship_integrity:relationshipCounts[0],
    users:userData[0],
    profiles:profileData[0],
    todos:todoData[0],
    files:fileData[0],
    password_reset_tokens:resetData[0],
    known_account_match:knownAccountMatch,
    disposition_matrix:disposition,
    decision:'DISPOSITION_PENDING',
    decision_reason:'Exact live data shape and relationship evidence are now available; each legacy dataset must be reconciled to a canonical successor or preservation boundary before mutation.'
  },null,2));
}finally{
  await c.end().catch(()=>{});
}
