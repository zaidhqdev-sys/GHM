import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRuntimeDatabaseFunctionPrivileges,
  RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL,
} from './runtime-database-privileges';

test('runtime startup accepts only the inventoried 43-function baseline or reviewed 40-function gateway cutover', () => {
  assert.equal(RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS.length, 43);
  assert.equal(RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS.length, 40);
  assert.doesNotThrow(() => assertRuntimeDatabaseFunctionPrivileges({
    executable_functions: [...RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS],
  }));
  assert.doesNotThrow(() => assertRuntimeDatabaseFunctionPrivileges({
    executable_functions: [...RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS],
  }));
});

test('runtime startup rejects added, missing or unexpected function EXECUTE grants', () => {
  assert.throws(
    () => assertRuntimeDatabaseFunctionPrivileges({
      executable_functions: [...RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS, 'ghm.unreviewed_sensitive_operation(bigint)'],
    }),
    /Runtime database function EXECUTE allow-list mismatch/,
  );
  assert.throws(
    () => assertRuntimeDatabaseFunctionPrivileges({
      executable_functions: RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS.filter(signature => !signature.startsWith('ghm.auth_create_account(')),
    }),
    /Runtime database function EXECUTE allow-list mismatch/,
  );
});

test('startup inventory measures only SECURITY DEFINER EXECUTE privileges', () => {
  assert.match(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /p\.prosecdef/);
  assert.match(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /has_function_privilege\(session_user, p\.oid, 'EXECUTE'\)/);
});

test('Campaign and directory-review legacy signatures are absent only from the post-cutover state', () => {
  for (const signature of [
    'ghm.create_campaign(bigint, bigint, text)',
    'ghm.update_campaign(bigint, bigint, text, text)',
    'ghm.get_business_directory_review_presentation(bigint, bigint)',
  ]) {
    assert.ok((RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS as readonly string[]).includes(signature));
    assert.ok(!(RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS as readonly string[]).includes(signature));
  }
});
