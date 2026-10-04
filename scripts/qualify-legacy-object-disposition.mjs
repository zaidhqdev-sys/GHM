import 'dotenv/config';
import { Client } from 'pg';

const sslMode = (process.env.DATABASE_SSL ?? 'require').toLowerCase();
const ssl = sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' ? true : false };

const url = process.env.GHM_LEGACY_AUDIT_DATABASE_URL;
if (!url) throw new Error('GHM_LEGACY_AUDIT_DATABASE_URL is required; no fallback to runtime/migrator credentials is permitted');

const client = new Client({ connectionString: url, ssl });
const legacy = ['users','profiles','todos','files','password_reset_tokens'];
const out = { audit:'GHM legacy object ownership and data preservation qualification', version:1, mutation:false, captured_at:new Date().toISOString(), decision:'BLOCKED', server:null, tables:[], ownership:[], dependencies:[], routines:[], views:[], triggers:[], constraints:[], disposition:[] };

await client.connect();
try {
  const q = async (text, values=[]) => (await client.query(text, values)).rows;
  out.server = (await q("select current_database() database_name, current_user, current_schema, current_setting('server_version_num') server_version_num"))[0];

  for (const t of legacy) {
    const cols = await q(`select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,[t]);
    const exists = cols.length > 0;
    let count = null;
    if (exists) count = Number((await q(`select count(*)::bigint count from public.${t}`))[0].count);
    const rls = exists ? (await q("select c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1",[t]))[0] : null;
    out.tables.push({table:`public.${t}`,exists,columns:cols,row_count:count,rls:rls||null});
  }

  out.ownership = await q(`
    select n.nspname schema_name, c.relname object_name, c.relkind,
           pg_get_userbyid(c.relowner) owner
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and (c.relname = any($1::text[]) or pg_get_userbyid(c.relowner) = any(array['ghm_app_user','ghm_db_user']))
    order by n.nspname,c.relname
  `,[legacy]);

  out.dependencies = await q(`
    select dependent_ns.nspname dependent_schema, dependent.relname dependent_object,
           dependent.relkind dependent_kind,
           referenced_ns.nspname referenced_schema, referenced.relname referenced_object,
           referenced.relkind referenced_kind,
           d.deptype
    from pg_depend d
    join pg_class dependent on dependent.oid=d.objid
    join pg_namespace dependent_ns on dependent_ns.oid=dependent.relnamespace
    join pg_class referenced on referenced.oid=d.refobjid
    join pg_namespace referenced_ns on referenced_ns.oid=referenced.relnamespace
    where (referenced_ns.nspname='public' and referenced.relname=any($1::text[]))
       or (dependent_ns.nspname='public' and dependent.relname=any($1::text[]))
    order by dependent_schema,dependent_object,referenced_schema,referenced_object
  `,[legacy]);

  out.routines = await q(`
    select n.nspname schema_name, p.proname routine_name, pg_get_functiondef(p.oid) definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where pg_get_functiondef(p.oid) ~ '(ghm_app_user|ghm_db_user|public\\.(users|profiles|todos|files|password_reset_tokens))'
      and p.prokind <> 'a'
    order by n.nspname,p.proname
  `);

  out.views = await q(`
    select schemaname schema_name, viewname,
           definition
    from pg_views
    where definition ~ '(public\\.(users|profiles|todos|files|password_reset_tokens)|ghm_app_user|ghm_db_user)'
    order by schemaname,viewname
  `);

  out.triggers = await q(`
    select n.nspname schema_name, c.relname table_name, t.tgname trigger_name,
           pg_get_triggerdef(t.oid) definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname='public' and c.relname=any($1::text[])
    order by c.relname,t.tgname
  `,[legacy]);

  out.constraints = await q(`
    select n.nspname schema_name, c.relname table_name, con.conname constraint_name,
           con.contype, pg_get_constraintdef(con.oid) definition
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any($1::text[])
    order by c.relname,con.conname
  `,[legacy]);

  const userCount = out.tables.find(x=>x.table==='public.users')?.row_count;
  const emptyExceptUsers = out.tables.filter(x=>x.exists && x.table!=='public.users').every(x=>x.row_count===0);
  const legacyOwned = out.ownership.filter(x=>['ghm_app_user','ghm_db_user'].includes(x.owner));
  const unresolvedOwner = legacyOwned.length > 0;
  out.disposition = [
    {dataset:'public.users',status:userCount===2?'PRESERVE_AND_RECONCILE':'REQUIRES_REVIEW',reason:'Two legacy identity rows are preserved pending authoritative provenance reconciliation.'},
    {dataset:'public.profiles',status:'PRESERVE_OR_ARCHIVE_AFTER_SUCCESSOR_CHECK',reason:'Legacy table is empty but ownership/dependency evidence must be retained before retirement.'},
    {dataset:'public.todos',status:'RETIRE_AFTER_PRESERVATION_CHECK',reason:'Legacy table is empty; no destructive action is authorized by this audit.'},
    {dataset:'public.files',status:'PRESERVE_OR_ARCHIVE_AFTER_SUCCESSOR_CHECK',reason:'Legacy table is empty; storage semantics must remain explicitly dispositioned.'},
    {dataset:'public.password_reset_tokens',status:'RETIRE_AFTER_PRESERVATION_CHECK',reason:'Legacy table is empty and lacks used_at; canonical recovery is elsewhere.'}
  ];
  const applicationDependencies = out.dependencies.filter(x => x.deptype !== 'i' && !(x.dependent_schema === 'public' && x.dependent_kind === 'S' && x.deptype === 'a'));
  out.dependency_classification = { structural_internal: out.dependencies.length - applicationDependencies.length, application_or_external: applicationDependencies.length, application_or_external_edges: applicationDependencies };
  const blocking = [];
  if (userCount !== 2) blocking.push('legacy users row count is not the previously reconciled value of 2');
  if (!emptyExceptUsers) blocking.push('one or more non-user legacy tables are not empty');
  if (unresolvedOwner) blocking.push('legacy-owned public objects remain and require explicit ownership disposition');
  if (applicationDependencies.length > 0) blocking.push('application or externally relevant legacy dependency edges require explicit review before object retirement');
  out.decision = blocking.length ? 'BLOCKED' : 'QUALIFIED_FOR_OWNERSHIP_DISPOSITION_DESIGN';
  out.blockers = blocking;
  console.log(JSON.stringify(out,null,2));
} finally { await client.end(); }
