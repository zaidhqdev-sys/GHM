import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};

const canonical = (value) => JSON.stringify(stable(value));

const isIssuerFunction = (fn) =>
  fn?.schema_name === 'ghm' && typeof fn.function_name === 'string' && fn.function_name.startsWith('auth_');

export function compareInventories(pre, post) {
  assert.equal(pre?.audit, 'GHM SECURITY DEFINER whole-database catalog inventory');
  assert.equal(post?.audit, pre.audit);
  assert.equal(pre?.version, 1);
  assert.equal(post?.version, 1);
  assert.equal(pre?.mutation, false, 'pre-cutover inventory must be read-only');
  assert.equal(post?.mutation, false, 'post-cutover inventory must be read-only');
  assert.equal(pre?.server?.database_name, 'ghm_disposable_test');
  assert.equal(post?.server?.database_name, pre.server.database_name);
  assert.equal(pre?.server?.server_version_num, post?.server?.server_version_num,
    'pre/post inventories must use the same PostgreSQL server version');
  assert.equal(pre?.routine_count, post?.routine_count,
    'issuer cutover must not add or remove SECURITY DEFINER routines');

  const index = (report) => {
    const entries = report.functions ?? [];
    const map = new Map(entries.map((fn) => [fn.identity_signature, fn]));
    assert.equal(map.size, entries.length, 'inventory contains duplicate function identities');
    return map;
  };
  const before = index(pre);
  const after = index(post);
  assert.deepEqual([...before.keys()].sort(), [...after.keys()].sort(),
    'pre/post SECURITY DEFINER routine identity sets must be identical');

  const changedIssuerAclSignatures = [];
  for (const signature of [...before.keys()].sort()) {
    const oldFn = before.get(signature);
    const newFn = after.get(signature);
    if (isIssuerFunction(oldFn)) {
      const oldStable = { ...oldFn };
      const newStable = { ...newFn };
      delete oldStable.direct_acl;
      delete oldStable.effective_execute_roles;
      delete newStable.direct_acl;
      delete newStable.effective_execute_roles;
      assert.equal(canonical(oldStable), canonical(newStable),
        `issuer cutover changed non-ACL definition/ownership metadata for ${signature}`);
      if (canonical(oldFn.direct_acl ?? []) !== canonical(newFn.direct_acl ?? [])
        || canonical(oldFn.effective_execute_roles ?? []) !== canonical(newFn.effective_execute_roles ?? [])) {
        changedIssuerAclSignatures.push(signature);
      }
    } else {
      assert.equal(canonical(oldFn), canonical(newFn),
        `non-issuer SECURITY DEFINER function changed during issuer cutover: ${signature}`);
    }
  }

  assert.ok(changedIssuerAclSignatures.length > 0,
    'pre/post inventories show no Authentication Issuer ACL changes; expected cutover evidence is absent');

  const stableSections = [
    'role_memberships',
    'role_attributes',
    'schema_privileges',
    'database_privileges',
    'column_privileges',
    'function_default_acls',
  ];
  for (const section of stableSections) {
    assert.equal(canonical(pre[section] ?? []), canonical(post[section] ?? []),
      `issuer cutover unexpectedly changed ${section}`);
  }

  const nonIssuerFindings = (report) => (report.preliminary_findings ?? [])
    .filter((finding) => !String(finding.signature ?? '').startsWith('ghm.auth_'));
  assert.equal(canonical(nonIssuerFindings(pre)), canonical(nonIssuerFindings(post)),
    'non-issuer SECURITY DEFINER findings changed during issuer cutover');

  return {
    comparison: 'GHM SECURITY DEFINER pre/post Authentication Issuer cutover',
    database: pre.server.database_name,
    postgresServerVersion: pre.server.server_version,
    preRoutineCount: pre.routine_count,
    postRoutineCount: post.routine_count,
    routineIdentitySet: 'unchanged',
    issuerAclChangesObserved: changedIssuerAclSignatures.length,
    changedIssuerFunctions: changedIssuerAclSignatures,
    nonIssuerFunctionDefinitionsAndAcls: 'unchanged',
    roleMemberships: 'unchanged',
    roleAttributes: 'unchanged',
    schemaPrivileges: 'unchanged',
    databasePrivileges: 'unchanged',
    columnPrivileges: 'unchanged',
    functionDefaultAcls: 'unchanged',
    nonIssuerPreliminaryFindings: 'unchanged',
    unexplainedNonIssuerChanges: 0,
    decision: 'STRUCTURAL_COMPARISON_PASSED; AUTH ISSUER ACLS REQUIRE DEDICATED CUTOVER QUALIFICATION',
  };
}

async function main() {
  const prePath = process.env.GHM_SECURITY_DEFINER_PRE_AUDIT_INPUT?.trim()
    || path.resolve('tmp/security-definer-authority-audit.json');
  const postPath = process.env.GHM_SECURITY_DEFINER_POST_AUDIT_INPUT?.trim()
    || path.resolve('tmp/security-definer-authority-audit-post-issuer-cutover.json');
  const outputPath = process.env.GHM_SECURITY_DEFINER_COMPARISON_OUTPUT?.trim()
    || path.resolve('tmp/security-definer-authority-inventory-comparison.json');

  const [preText, postText] = await Promise.all([
    fs.readFile(prePath, 'utf8'),
    fs.readFile(postPath, 'utf8'),
  ]);
  const report = compareInventories(JSON.parse(preText), JSON.parse(postText));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\\n', 'utf8');
  process.stdout.write(JSON.stringify({ ...report, output_file: outputPath }, null, 2) + '\\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`SECURITY DEFINER INVENTORY COMPARISON FAILED: ${error instanceof Error ? error.message : String(error)}\\n`);
    process.exitCode = 1;
  });
}
