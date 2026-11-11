import assert from 'node:assert/strict';
import test from 'node:test';
import { assertActorGatewayDatabaseIdentity, type ActorGatewayDatabaseIdentity } from './database-principal';

const leastPrivilegeGateway: ActorGatewayDatabaseIdentity = {
  session_user: 'ghm_actor_gateway',
  current_user: 'ghm_actor_gateway',
  rolcanlogin: true,
  rolinherit: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false,
  no_role_memberships: true,
};

test('accepts only the isolated least-privilege Actor Gateway principal', () => {
  assert.doesNotThrow(() => assertActorGatewayDatabaseIdentity(leastPrivilegeGateway));
});

test('rejects an unexpected login or effective role', () => {
  assert.throws(
    () => assertActorGatewayDatabaseIdentity({
      ...leastPrivilegeGateway,
      session_user: 'ghm_app_user',
      current_user: 'ghm_db_user',
    }),
    /Actor Gateway database principal failed least-privilege verification/,
  );
});

test('rejects elevated role attributes and any membership', () => {
  for (const override of [
    { rolinherit: true },
    { rolsuper: true },
    { rolcreatedb: true },
    { rolcreaterole: true },
    { rolreplication: true },
    { rolbypassrls: true },
    { no_role_memberships: false },
  ]) {
    assert.throws(
      () => assertActorGatewayDatabaseIdentity({ ...leastPrivilegeGateway, ...override }),
      /Actor Gateway database principal failed least-privilege verification/,
    );
  }
});
