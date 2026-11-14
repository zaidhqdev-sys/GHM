import assert from 'node:assert/strict';
import test from 'node:test';
import { assertActorGatewayDatabaseIdentity, type ActorGatewayDatabaseIdentity } from './database-principal';

const leastPrivilegeGateway: ActorGatewayDatabaseIdentity = {
  session_user: 'ghm_actor_gateway',
  current_user: 'ghm_actor_gateway',
  database_connect_privilege: true,
  database_create_privilege: false,
  schema_usage: true,
  schema_create: false,
  rolcanlogin: true,
  rolinherit: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false,
  no_untrusted_role_memberships: true,
};

test('accepts the dedicated Actor Gateway login with only the trusted administrator membership', () => {
  assert.doesNotThrow(() => assertActorGatewayDatabaseIdentity(leastPrivilegeGateway));
});

test('rejects Dashboard-managed application and effective administrator identities', () => {
  assert.throws(
    () => assertActorGatewayDatabaseIdentity({
      ...leastPrivilegeGateway,
      session_user: 'ghm_app_user',
      current_user: 'ghm_db_user',
    }),
    /least-privilege verification/,
  );
});

test('rejects role substitution after connecting as the gateway login', () => {
  assert.throws(
    () => assertActorGatewayDatabaseIdentity({
      ...leastPrivilegeGateway,
      current_user: 'ghm_schema_owner',
    }),
    /least-privilege verification/,
  );
});

test('rejects database or schema creation and missing required access', () => {
  for (const override of [
    { database_create_privilege: true },
    { schema_create: true },
    { database_connect_privilege: false },
    { schema_usage: false },
  ]) {
    assert.throws(
      () => assertActorGatewayDatabaseIdentity({ ...leastPrivilegeGateway, ...override }),
      /least-privilege verification/,
    );
  }
});

test('rejects elevated login attributes and untrusted role memberships', () => {
  const overrides: Partial<ActorGatewayDatabaseIdentity>[] = [
    { rolinherit: true },
    { rolsuper: true },
    { rolcreatedb: true },
    { rolcreaterole: true },
    { rolreplication: true },
    { rolbypassrls: true },
    { no_untrusted_role_memberships: false },
    { rolcanlogin: false },
  ];
  for (const override of overrides) {
    assert.throws(
      () => assertActorGatewayDatabaseIdentity({ ...leastPrivilegeGateway, ...override }),
      /least-privilege verification/,
    );
  }
});
