import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const repoRoot = process.cwd();
const REQUIRED = ['DATABASE_URL', 'GHM_MIGRATOR_DATABASE_URL'];
const LEGACY_ROLES = ['ghm_app_user', 'ghm_db_user'];
const CANONICAL_ROLES = ['ghm_runtime', 'ghm_migrator', 'ghm_schema_owner'];
const LEGACY_OBJECTS = ['public.users', 'public.profiles', 'public.todos', 'public.files', 'public.password_reset_tokens'];
const TEXT_EXTENSIONS = new Set(['.ts', '.mjs', '.json', '.md', '.yml', '.yaml', '.toml']);

const failures = [];
const findings = [];
const files = [];

const walk = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
};

await walk(repoRoot);

const read = async (file) => ({ file: path.relative(repoRoot, file).replaceAll('\\\\', '/'), text: await readFile(file, 'utf8') });

for (const file of files) {
  const { file: relative, text } = await read(file);
  for (const role of LEGACY_ROLES) {
    if (text.includes(role)) findings.push({ type: 'legacy_role_reference', role, file: relative });
  }
  for (const object of LEGACY_OBJECTS) {
    if (text.includes(object)) findings.push({ type: 'legacy_object_reference', object, file: relative });
  }
}

const configSource = await readFile(path.join(repoRoot, 'src', 'config.ts'), 'utf8');
const poolSource = await readFile(path.join(repoRoot, 'src', 'db', 'pool.ts'), 'utf8');
const migrateSource = await readFile(path.join(repoRoot, 'src', 'db', 'migrate.ts'), 'utf8');
const recoverySource = await readFile(path.join(repoRoot, 'src', 'auth', 'password-recovery.ts'), 'utf8');
const migrationResetSource = await readFile(path.join(repoRoot, 'src', 'migrations', 'quoteflow-migration-reset-recovery.ts'), 'utf8');

if (!/required\('DATABASE_URL'\)/.test(configSource)) failures.push('runtime configuration does not require DATABASE_URL');
if (!/connectionString:\s*config\.databaseUrl/.test(poolSource)) failures.push('canonical runtime pool does not use config.databaseUrl');
if (!/process\.env\.GHM_MIGRATOR_DATABASE_URL\?\.trim\(\)/.test(migrateSource)) failures.push('migration runner does not require GHM_MIGRATOR_DATABASE_URL');
if (!/SET ROLE \$\{MIGRATION_OWNER_ROLE\}/.test(migrateSource) || !/MIGRATION_OWNER_ROLE = 'ghm_schema_owner'/.test(migrateSource)) failures.push('migration runner does not explicitly enter ghm_schema_owner');
if (!/new PostgresAuthPersistence\(\)/.test((await readFile(path.join(repoRoot, 'src', 'auth', 'ghm-auth-service.ts'), 'utf8')))) failures.push('auth service does not use canonical PostgresAuthPersistence by default');
if (!/persistence\.issueRecovery/.test(recoverySource)) failures.push('password recovery does not use canonical persistence boundary');
if (!/persistence\.lookupQuoteFlowMigrationResetEnrollment/.test(migrationResetSource)) failures.push('QuoteFlow migration reset does not use canonical persistence boundary');

for (const name of REQUIRED) if (!process.env[name]?.trim()) failures.push(`missing required environment variable: ${name}`);

const safeIdentity = async (label, url) => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const identity = (await client.query(`SELECT current_database() AS database_name, current_user, session_user`)).rows[0];
    const rolePaths = (await client.query(`
      WITH RECURSIVE paths(member_oid, granted_oid, depth, path) AS (
        SELECT m.member, m.roleid, 1, ARRAY[m.member,m.roleid]::oid[] FROM pg_auth_members m
        UNION ALL
        SELECT p.member_oid, m.roleid, p.depth + 1, p.path || m.roleid
        FROM paths p JOIN pg_auth_members m ON m.member=p.granted_oid
        WHERE p.depth < 8 AND NOT m.roleid=ANY(p.path)
      )
      SELECT member.rolname AS source_role, granted.rolname AS reachable_role, p.depth
      FROM paths p
      JOIN pg_roles member ON member.oid=p.member_oid
      JOIN pg_roles granted ON granted.oid=p.granted_oid
      WHERE member.rolname IN ('ghm_runtime','ghm_migrator','ghm_app_user','ghm_db_user')
      ORDER BY source_role, depth, reachable_role
    `)).rows;
    return { label, database_name: identity.database_name, current_user: identity.current_user, session_user: identity.session_user, role_paths: rolePaths };
  } finally {
    await client.end().catch(() => {});
  }
};

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL?.trim();
const identities = [];
if (runtimeUrl) identities.push(await safeIdentity('runtime', runtimeUrl));
if (migratorUrl) identities.push(await safeIdentity('migrator', migratorUrl));

const runtime = identities.find((x) => x.label === 'runtime');
const migrator = identities.find((x) => x.label === 'migrator');

if (!runtime) failures.push('runtime database identity could not be qualified');
else {
  if (runtime.current_user !== 'ghm_runtime') failures.push(`runtime credential resolves to unexpected database role: ${runtime.current_user}`);
  if (runtime.session_user !== 'ghm_runtime') failures.push(`runtime session identity is not ghm_runtime: ${runtime.session_user}`);
  if (runtime.role_paths.some((x) => x.source_role === 'ghm_runtime' && ['ghm_migrator','ghm_schema_owner'].includes(x.reachable_role))) {
    failures.push('ghm_runtime has a reachable migrator/schema-owner role path');
  }
}
if (!migrator) failures.push('migrator database identity could not be qualified');
else {
  if (migrator.current_user !== 'ghm_migrator') failures.push(`migrator credential resolves to unexpected database role: ${migrator.current_user}`);
  if (migrator.session_user !== 'ghm_migrator') failures.push(`migrator session identity is not ghm_migrator: ${migrator.session_user}`);
  if (!migrator.role_paths.some((x) => x.source_role === 'ghm_migrator' && x.reachable_role === 'ghm_schema_owner')) {
    failures.push('ghm_migrator lacks the qualified schema-owner membership path');
  }
}
if (runtimeUrl && migratorUrl) {
  const runtimeIdentity = runtime?.current_user;
  const migratorIdentity = migrator?.current_user;
  if (runtimeIdentity === migratorIdentity) failures.push('runtime and migrator credentials resolve to the same PostgreSQL role');
}

const legacyReferenceFiles = findings.filter((x) => x.type === 'legacy_role_reference').map((x) => x.file.split(path.sep).join('/'));
const executableLegacyReferences = [...new Set(legacyReferenceFiles.filter((file) => !file.startsWith('docs/') && file !== 'scripts/qualify-legacy-role-dependency.mjs' && file !== 'scripts/audit-legacy-role-remediation.mjs'))];
if (executableLegacyReferences.length) failures.push(`unexpected executable/config reference to legacy roles: ${executableLegacyReferences.join(', ')}`);

const decision = failures.length ? 'BLOCKED' : 'QUALIFIED';
console.log(JSON.stringify({
  audit: 'GHM dependency and role end-state qualification',
  version: 1,
  captured_at: new Date().toISOString(),
  mutation: false,
  static_findings: findings,
  identities,
  canonical_end_state: {
    runtime: 'ghm_runtime LOGIN NOINHERIT; product runtime only',
    migrator: 'ghm_migrator LOGIN NOINHERIT; migration process only; explicit SET ROLE ghm_schema_owner',
    schema_owner: 'ghm_schema_owner NOLOGIN; canonical GHM schema/object owner',
    legacy_roles: 'ghm_app_user and ghm_db_user have no application/runtime authority; retire only after legacy data/object disposition and independent provider authority are resolved'
  },
  dependency_boundary: {
    runtime_application_credential: 'DATABASE_URL -> ghm_runtime',
    migration_credential: 'GHM_MIGRATOR_DATABASE_URL -> ghm_migrator',
    recovery_and_migration_reset: 'canonical GHM Postgres auth persistence boundary',
    legacy_audit_credential: 'GHM_LEGACY_AUDIT_DATABASE_URL is one-off audit input only; not a runtime or migration dependency'
  },
  decision
}, null, 2));
if (failures.length) {
  console.error('DEPENDENCY AND ROLE END-STATE QUALIFICATION FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('DEPENDENCY AND ROLE END-STATE QUALIFICATION PASSED');
