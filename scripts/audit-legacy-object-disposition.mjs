import 'dotenv/config';
import { Client } from 'pg';

const url=process.env.GHM_MIGRATOR_DATABASE_URL?.trim()||process.env.DATABASE_URL?.trim();
if(!url) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL or DATABASE_URL');
const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
const q=sql=>c.query(sql).then(r=>r.rows);

try {
  await c.connect();

  const server=await q("SELECT current_database() AS database_name,current_user,current_schema(),current_setting('server_version_num') AS server_version_num");

  const legacyObjects=await q(`
    SELECT n.nspname AS schema_name,c.relname AS object_name,c.relkind,
           r.rolname AS owner,
           CASE WHEN c.relkind IN ('r','p') THEN c.reltuples::bigint ELSE NULL END AS estimated_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_roles r ON r.oid=c.relowner
    WHERE r.rolname IN ('ghm_app_user','ghm_db_user')
    ORDER BY n.nspname,c.relname
  `);

  const dependencies=await q(`
    SELECT pn.nspname AS dependent_schema,
           pc.relname AS dependent_object,
           pc.relkind AS dependent_kind,
           pg_get_userbyid(pc.relowner) AS dependent_owner,
           rn.nspname AS referenced_schema,
           rc.relname AS referenced_object,
           rc.relkind AS referenced_kind
    FROM pg_depend d
    JOIN pg_class pc ON pc.oid=d.objid
    JOIN pg_namespace pn ON pn.oid=pc.relnamespace
    JOIN pg_class rc ON rc.oid=d.refobjid
    JOIN pg_namespace rn ON rn.oid=rc.relnamespace
    WHERE rc.relname IN ('users','profiles','todos','files','password_reset_tokens')
      AND rn.nspname='public'
    ORDER BY rn.nspname,rc.relname,pn.nspname,pc.relname
  `);

  const routines=await q(`
    SELECT n.nspname AS schema_name,p.proname AS routine_name,
           pg_get_function_identity_arguments(p.oid) AS arguments,
           pg_get_userbyid(p.proowner) AS owner,
           p.prokind,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE pg_get_functiondef(p.oid) ILIKE ANY(ARRAY[
      '%public.users%','%public.profiles%','%public.todos%',
      '%public.files%','%public.password_reset_tokens%',
      '%ghm_app_user%','%ghm_db_user%'
    ])
    ORDER BY n.nspname,p.proname
  `);

  const views=await q(`
    SELECT schemaname AS schema_name,viewname AS object_name,definition
    FROM pg_views
    WHERE definition ILIKE ANY(ARRAY[
      '%public.users%','%public.profiles%','%public.todos%',
      '%public.files%','%public.password_reset_tokens%'
    ])
    ORDER BY schemaname,viewname
  `);

  const triggers=await q(`
    SELECT n.nspname AS schema_name,c.relname AS table_name,
           t.tgname AS trigger_name,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal
      AND (
        c.relname IN ('users','profiles','todos','files','password_reset_tokens')
        OR pg_get_triggerdef(t.oid) ILIKE ANY(ARRAY[
          '%public.users%','%public.profiles%','%public.todos%',
          '%public.files%','%public.password_reset_tokens%'
        ])
      )
    ORDER BY n.nspname,c.relname,t.tgname
  `);

  const constraints=await q(`
    SELECT n.nspname AS schema_name,c.relname AS table_name,
           con.conname AS constraint_name,con.contype,
           pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relname IN ('users','profiles','todos','files','password_reset_tokens')
       OR pg_get_constraintdef(con.oid) ILIKE ANY(ARRAY[
          '%public.users%','%public.profiles%','%public.todos%',
          '%public.files%','%public.password_reset_tokens%'
       ])
    ORDER BY n.nspname,c.relname,con.conname
  `);

  const counts=[];
  for(const name of ['users','profiles','todos','files','password_reset_tokens']){
    try{
      const rows=await q(`SELECT $1::text AS object_name,(SELECT count(*) FROM public.${name})::bigint AS row_count`);
      counts.push(rows[0]);
    }catch(err){
      counts.push({object_name:name,error:err.code||err.message});
    }
  }

  const ghmNameOverlap=await q(`
    SELECT c.relname AS object_name,c.relkind,pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='ghm'
      AND c.relname IN ('users','profiles','todos','files','password_reset_tokens')
    ORDER BY c.relname
  `);

  const legacyRoleRefs=await q(`
    SELECT n.nspname AS schema_name,p.proname AS routine_name,
           pg_get_function_identity_arguments(p.oid) AS arguments,
           pg_get_userbyid(p.proowner) AS owner,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE pg_get_functiondef(p.oid) ILIKE ANY(ARRAY['%ghm_app_user%','%ghm_db_user%'])
    ORDER BY n.nspname,p.proname
  `);

  console.log(JSON.stringify({
    audit:'GHM legacy object and data disposition audit',
    version:1,
    captured_at:new Date().toISOString(),
    mutation:false,
    server,
    legacy_objects:legacyObjects,
    object_row_counts:counts,
    dependencies,
    routines,
    views,
    triggers,
    constraints,
    ghm_name_overlap:ghmNameOverlap,
    legacy_role_references:legacyRoleRefs,
    decision:'DISPOSITION_PENDING',
    decision_reason:'Live ownership and data existence are established here; retirement or migration requires dependency and preservation reconciliation before any mutation.'
  },null,2));
} finally {
  await c.end().catch(()=>{});
}