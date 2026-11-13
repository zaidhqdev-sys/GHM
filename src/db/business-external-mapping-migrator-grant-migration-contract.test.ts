import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const originalGrant = readFileSync('database/migrations/20261012000000_auth_lookup_business_external_mapping.sql', 'utf8');
const forwardRevoke = readFileSync('database/migrations/20261112170000_revoke_redundant_migrator_business_mapping_lookup.sql', 'utf8');
const route = readFileSync('src/http/commercial-internal-router.ts', 'utf8');

test('Connect payment preparation retains runtime lookup and removes redundant migrator EXECUTE', () => {
  assert.match(originalGrant, /GRANT EXECUTE ON FUNCTION ghm\.auth_lookup_business_external_mapping\(text, text\)\s+TO ghm_runtime, ghm_migrator/);
  assert.match(forwardRevoke, /REVOKE EXECUTE ON FUNCTION ghm\.auth_lookup_business_external_mapping\(text, text\)\s+FROM ghm_migrator/);
  assert.doesNotMatch(forwardRevoke, /FROM ghm_runtime/);
});

test('the only application call site resolves Connect Business mappings through Resource API runtime', () => {
  assert.match(route, /SELECT \* FROM ghm\.auth_lookup_business_external_mapping\(\$1, \$2\)/);
  assert.match(route, /resolveConnectBusinessId\([\s\S]*?\(sql, values\) => pool\.query\(sql, values\)/);
  assert.doesNotMatch(route, /GHM_MIGRATOR_DATABASE_URL|ghm_migrator/);
});
