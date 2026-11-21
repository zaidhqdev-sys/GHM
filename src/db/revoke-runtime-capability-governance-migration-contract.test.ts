import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const cutover = readFileSync(
  'database/migrations/20261117020000_revoke_runtime_capability_governance.sql',
  'utf8',
);
const searchPathPin = readFileSync(
  'database/migrations/20261112090000_pin_security_definer_search_path.sql',
  'utf8',
);

test('capability cutover guard matches the repository-wide pinned SECURITY DEFINER search_path', () => {
  assert.match(searchPathPin, /ALTER FUNCTION %s SET search_path = pg_catalog, ghm, pg_temp/);
  assert.match(cutover, /p\.proconfig\s*@>\s*ARRAY\['search_path=pg_catalog, ghm, pg_temp'\]/);
  assert.doesNotMatch(cutover, /search_path=pg_catalog, ghm'\]/);
});

test('capability cutover continues to require schema-owner SECURITY DEFINER functions', () => {
  assert.match(cutover, /p\.prosecdef\s*=\s*true/);
  assert.match(cutover, /p\.proowner\s*=\s*v_schema_owner/);
  assert.match(cutover, /has_function_privilege\(v_gateway_role,\s*v_function,\s*'EXECUTE'\)/);
  assert.match(cutover, /has_function_privilege\(v_runtime_role,\s*v_function,\s*'EXECUTE'\)/);
});
