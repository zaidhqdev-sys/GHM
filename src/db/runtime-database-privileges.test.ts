import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRuntimeDatabaseFunctionPrivileges,
  RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_POST_AUTH_ISSUER_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS,
  RUNTIME_POST_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AND_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_POST_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL,
} from './runtime-database-privileges';

const STAGES = [
  RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS,
  RUNTIME_POST_AUTH_ISSUER_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS,
  RUNTIME_POST_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AND_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_POST_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS,
  RUNTIME_POST_CAMPAIGN_REVIEW_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS,
] as const;

const postgresSignature = (signature: string): string => signature.replace(/,\s+/g, ',');

test('runtime startup accepts only the eight explicitly reviewed Campaign, issuer and registration cutover states', () => {
  assert.deepEqual(STAGES.map(functions => functions.length), [43, 40, 29, 26, 41, 38, 27, 24]);
  for (const functions of STAGES) {
    assert.doesNotThrow(() => assertRuntimeDatabaseFunctionPrivileges({
      executable_functions: [...functions],
    }));
    // PostgreSQL regprocedure::text renders argument lists without spaces after commas.
    assert.doesNotThrow(() => assertRuntimeDatabaseFunctionPrivileges({
      executable_functions: functions.map(postgresSignature),
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

test('runtime startup rejects added, missing or unexpected function EXECUTE grants in every reviewed stage', () => {
  for (const functions of STAGES) {
    assert.throws(
      () => assertRuntimeDatabaseFunctionPrivileges({
        executable_functions: [...functions.map(postgresSignature), 'ghm.unreviewed_sensitive_operation(bigint)'],
      }),
      /Runtime database function EXECUTE allow-list mismatch/,
    );
    assert.throws(
      () => assertRuntimeDatabaseFunctionPrivileges({
        executable_functions: functions.slice(1).map(postgresSignature),
      }),
      /Runtime database function EXECUTE allow-list mismatch/,
    );
  }
});

test('registration identity functions are accepted only before their explicit manual gateway cutover', () => {
  const registration = [
    'ghm.read_business_registration_identity(bigint, bigint)',
    'ghm.update_business_registration_identity(bigint, bigint, text, text, text)',
  ];
  for (const signature of registration) {
    assert.ok((RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS as readonly string[]).includes(signature));
    assert.ok((RUNTIME_POST_CAMPAIGN_REVIEW_FUNCTIONS as readonly string[]).includes(signature));
    assert.ok((RUNTIME_POST_AUTH_ISSUER_FUNCTIONS as readonly string[]).includes(signature));
    assert.ok((RUNTIME_POST_CAMPAIGN_REVIEW_AND_AUTH_ISSUER_FUNCTIONS as readonly string[]).includes(signature));
    for (const functions of [
      RUNTIME_POST_REGISTRATION_IDENTITY_FUNCTIONS,
      RUNTIME_POST_CAMPAIGN_REVIEW_AND_REGISTRATION_IDENTITY_FUNCTIONS,
      RUNTIME_POST_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS,
      RUNTIME_POST_CAMPAIGN_REVIEW_AUTH_ISSUER_AND_REGISTRATION_IDENTITY_FUNCTIONS,
    ]) {
      assert.ok(!(functions as readonly string[]).includes(signature), signature);
    }
  }
});

test('startup inventory measures only SECURITY DEFINER EXECUTE privileges', () => {
  assert.match(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /p\.prosecdef/);
  assert.match(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /has_function_privilege\(session_user, p\.oid, 'EXECUTE'\)/);
  assert.match(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /n\.nspname = 'ghm'/);
  assert.doesNotMatch(RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL, /expected_post/);
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
    assert.ok((RUNTIME_POST_REGISTRATION_IDENTITY_FUNCTIONS as readonly string[]).includes(signature));
    assert.ok(!(RUNTIME_POST_CAMPAIGN_REVIEW_AND_REGISTRATION_IDENTITY_FUNCTIONS as readonly string[]).includes(signature));
  }
});
