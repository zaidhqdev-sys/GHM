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
  RUNTIME_MANUAL_CUTOVER_FUNCTION_GROUPS,
  RUNTIME_POST_ALL_MANUAL_CUTOVERS_FUNCTIONS,
  RUNTIME_DATABASE_FUNCTION_PRIVILEGES_SQL,
} from './runtime-database-privileges';

const CUTOVER_GROUPS = Object.values(RUNTIME_MANUAL_CUTOVER_FUNCTION_GROUPS);
const ALL_STAGES = Array.from({ length: 2 ** CUTOVER_GROUPS.length }, (_, mask) =>
  RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS.filter(signature =>
    !CUTOVER_GROUPS.some((group, index) =>
      (mask & (1 << index)) !== 0 && (group as readonly string[]).includes(signature),
    ),
  ),
);

const postgresSignature = (signature: string): string => signature.replace(/,\s+/g, ',');

test('runtime startup accepts all 512 reviewed combinations of the nine manual cutovers', () => {
  assert.equal(RUNTIME_PRE_CAMPAIGN_REVIEW_FUNCTIONS.length, 43);
  assert.equal(CUTOVER_GROUPS.length, 9);
  assert.deepEqual(CUTOVER_GROUPS.map(group => group.length), [3, 14, 2, 3, 3, 2, 1, 1, 1]);
  assert.equal(ALL_STAGES.length, 512);
  assert.equal(RUNTIME_POST_ALL_MANUAL_CUTOVERS_FUNCTIONS.length, 13);

  for (const functions of ALL_STAGES) {
    assert.doesNotThrow(() => assertRuntimeDatabaseFunctionPrivileges({
      executable_functions: [...functions],
    }));
    // PostgreSQL regprocedure::text renders argument lists without spaces after commas.
    assert.doesNotThrow(() => assertRuntimeDatabaseFunctionPrivileges({
      executable_functions: functions.map(postgresSignature),
    }));
  }
});

test('the fully cut-over runtime state retains only the thirteen explicitly reviewed read/lookup/storage legacy functions', () => {
  assert.deepEqual(
    [...RUNTIME_POST_ALL_MANUAL_CUTOVERS_FUNCTIONS].map(postgresSignature).sort(),
    [
      'ghm.auth_lookup_business_external_mapping(text,text)',
      'ghm.auth_lookup_external_identity(text,text)',
      'ghm.connect_service_assertion_consume(text,text,timestamp with time zone)',
      'ghm.get_public_business_hours(bigint)',
      'ghm.get_public_trust_score(bigint)',
      'ghm.is_business_capability_publicly_evidence_eligible(bigint)',
      'ghm.list_public_trust_scores(text)',
      'ghm.storage_create_pending(bigint,text,bigint,text,text,text,bigint,text,text)',
      'ghm.storage_get_object(bigint,bigint)',
      'ghm.storage_get_public_business_logo(bigint)',
      'ghm.storage_mark_available(bigint,text)',
      'ghm.storage_mark_deleted(bigint)',
      'ghm.storage_mark_deletion_pending(bigint)',
    ].sort(),
  );
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

test('runtime startup rejects added and missing grants in every reviewed cutover combination', () => {
  for (const functions of ALL_STAGES) {
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
