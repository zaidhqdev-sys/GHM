import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

test('identity-authority permission hardening revokes runtime execution', async () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'database',
    'migrations',
    '20261031100000_restrict_identity_authority_reader.sql',
  );
  const sql = await fs.readFile(migrationPath, 'utf8');
  assert.match(
    sql,
    /REVOKE EXECUTE ON FUNCTION ghm\.auth_read_connect_identity_authority\(bigint\) FROM ghm_runtime/i,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION ghm\.auth_read_connect_identity_authority\(bigint\) TO ghm_runtime/i,
  );
});
