import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRuntimeDatabaseFunctionPrivileges,
  RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_POST_AUTH_ISSUER_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS,
  RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL,
} from './runtime-database-privileges';

test('runtime startup accepts only the four reviewed pre/post gateway and issuer ACL states', () => {
  assert.equal(RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS.length, 41);
  assert.equal(RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS.length, 38);
  assert.equal(RUNTIME_POST_AUTH_ISSUER_FUNCTIONS.length, 27);
  assert.equal(RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS.length, 24);
  for (const functions of [
    RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS,
    RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS,
    RUNTIME_POST_AUTH_ISSUER_FUNCTIONS,
    RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS,
  ]) {
    assert.doesNotThrow(() => assertRuntimeDatabaseFunctionPrivileges({
      executable_functions: [...functions],
    }));
  }
});

test('issuer cutover removes exactly fourteen lifecycle functions and retains only the two reviewed runtime lookups', () => {
  const removed = RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS.filter(
    signature => !(RUNTIME_POST_AUTH_ISSUER_FUNCTIONS as readonly string[]).includes(signature),
  );
  assert.equal(removed.length, 14);
  assert.deepEqual(
    RUNTIME_POST_AUTH_ISSUER_FUNCTIONS.filter(signature => signature.startsWith('ghm.auth_')),
    [
      'ghm.auth_lookup_business_external_mapping(text, text)',
      'ghm.auth_lookup_external_identity(text, text)',
    ],
  );
  assert.deepEqual(
    RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS.filter(signature => signature.startsWith('ghm.auth_')),
    [
      'ghm.auth_lookup_business_external_mapping(text, text)',
      'ghm.auth_lookup_external_identity(text, text)',
    ],
  );
});

test('runtime startup rejects added, missing or unexpected function EXECUTE grants in every stage', () => {
  for (const functions of [
    RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS,
    RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS,
    RUNTIME_POST_AUTH_ISSUER_FUNCTIONS,
    RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS,
  ]) {
    assert.throws(
      () => assertRuntimeDatabaseFunctionPrivileges({
        executable_functions: [...functions, 'ghm.unreviewed_sensitive_operation(bigint)'],
      }),
      /Runtime database function EXECUTE allow-list mismatch/,
    );
    assert.throws(
      () => assertRuntimeDatabaseFunctionPrivileges({
        executable_functions: functions.slice(1),
      }),
      /Runtime database function EXECUTE allow-list mismatch/,
    );
  }
});

test('registration identity functions are never granted to the Resource API runtime after their gateway migrations', () => {
  for (const signature of [
    'ghm.read_business_registration_identity(bigint, bigint)',
    'ghm.update_business_registration_identity(bigint, bigint, text, text, text)',
  ]) {
    for (const functions of [
      RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS,
      RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS,
      RUNTIME_POST_AUTH_ISSUER_FUNCTIONS,
      RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS,
    ]) {
      assert.ok(!(functions as readonly string[]).includes(signature), signature);
    }
  }
});

test('startup inventory measures only SECURITY DEFINER EXECUTE privileges and resolves all staged states', () => {
  assert.match(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /p\.prosecdef/);
  assert.match(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /has_function_privilege\(session_user, p\.oid, 'EXECUTE'\)/);
  assert.match(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /expected_post_issuer/);
  assert.match(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /expected_post_campaign_and_issuer/);
});

test('Campaign and directory-review legacy signatures are absent only from states where their manual cutover is applied', () => {
  for (const signature of [
    'ghm.create_campaign(bigint, bigint, text)',
    'ghm.update_campaign(bigint, bigint, text, text)',
    'ghm.get_business_directory_review_presentation(bigint, bigint)',
  ]) {
    assert.ok((RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS as readonly string[]).includes(signature));
    assert.ok(!(RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS as readonly string[]).includes(signature));
    assert.ok((RUNTIME_POST_AUTH_ISSUER_FUNCTIONS as readonly string[]).includes(signature));
    assert.ok(!(RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS as readonly string[]).includes(signature));
  }
});
