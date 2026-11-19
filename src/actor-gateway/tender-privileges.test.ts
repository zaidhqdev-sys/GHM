import assert from 'node:assert/strict';
import test from 'node:test';
import { assertActorGatewayDatabasePrivileges, type ActorGatewayDatabasePrivileges } from './database-privileges';

const BASE = 'ghm.assert_actor_gateway_capability(bigint, text, bigint, uuid, text, text)';
const TRACKING = [
  'ghm.gateway_create_tender_tracking(bigint, bigint, uuid, text, text, bigint, text, text, text, text, text, uuid, uuid)',
  'ghm.gateway_list_tender_tracking(bigint, bigint, uuid, text, text, bigint, text, integer, bigint)',
  'ghm.gateway_get_tender_tracking(bigint, bigint, uuid, text, text, bigint, bigint)',
  'ghm.gateway_update_tender_tracking(bigint, bigint, uuid, text, text, bigint, bigint, jsonb, uuid, uuid)',
  'ghm.gateway_archive_tender_tracking(bigint, bigint, uuid, text, text, bigint, bigint, uuid, uuid)',
  'ghm.gateway_delete_tender_tracking(bigint, bigint, uuid, text, text, bigint, bigint, uuid, uuid)',
];
const ANALYSIS = [
  'ghm.gateway_create_tender_analysis(bigint, bigint, uuid, text, text, bigint, bigint, text, text, text, jsonb, uuid, uuid)',
  'ghm.gateway_list_tender_analysis(bigint, bigint, uuid, text, text, bigint, integer, bigint)',
  'ghm.gateway_get_tender_analysis(bigint, bigint, uuid, text, text, bigint, bigint)',
  'ghm.gateway_delete_tender_analysis(bigint, bigint, uuid, text, text, bigint, bigint, uuid, uuid)',
];
const make = (executable: string[], expected: string[] = [BASE, ...TRACKING, ...ANALYSIS]): ActorGatewayDatabasePrivileges => ({
  database_connect_privilege: true, database_create_privilege: false, schema_usage: true, schema_create: false,
  direct_relation_privileges: false, executable_functions: executable, expected_functions: expected,
  public_executable_functions: [], runtime_executable_functions: [], unsafe_function_defaults: false,
  unsafe_security_definer_functions: [], public_executable_security_definer_functions: [], unsafe_function_grantees: [],
});
const ok = (p: ActorGatewayDatabasePrivileges): void => assert.doesNotThrow(() => assertActorGatewayDatabasePrivileges(p));
const refused = (p: ActorGatewayDatabasePrivileges): void =>
  assert.throws(() => assertActorGatewayDatabasePrivileges(p), /least-privilege verification/);

test('accepts a database with the tracking and analysis functions, with tracking only, or with neither', () => {
  ok(make([BASE, ...TRACKING, ...ANALYSIS]));
  ok(make([BASE, ...TRACKING]));
  ok(make([BASE]));
});

test('refuses analysis functions without tracking, and any partial set', () => {
  refused(make([BASE, ...ANALYSIS]));
  refused(make([BASE, ...TRACKING, ...ANALYSIS.slice(0, 3)]));
  refused(make([BASE, ...TRACKING.slice(0, 5)]));
  refused(make([BASE, ...TRACKING, ...ANALYSIS.slice(1)]));
});

test('refuses an unreviewed extra function next to the tender functions, and internal helpers', () => {
  refused(make([BASE, ...TRACKING, ...ANALYSIS, 'ghm.gateway_unreviewed()']));
  refused(make([BASE, ...TRACKING, ...ANALYSIS, 'ghm.record_tender_audit_event(uuid, uuid, bigint, bigint, text, text, bigint, jsonb)']));
  refused(make([BASE, ...TRACKING, ...ANALYSIS, 'ghm.verify_tender_gateway_assertion(bigint, bigint, uuid, text, text, text)']));
});
