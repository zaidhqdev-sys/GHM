import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAuthIssuerDatabaseIdentity, type AuthIssuerDatabaseIdentity } from './database-principal';

const leastPrivilegeIssuer: AuthIssuerDatabaseIdentity = {
  session_user: 'ghm_auth_issuer',
  current_user: 'ghm_auth_issuer',
  rolcanlogin: true,
  rolinherit: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false,
  no_role_memberships: true,
};

test('accepts only the isolated least-privilege Authentication Issuer principal', () => {
  assert.doesNotThrow(() => assertAuthIssuerDatabaseIdentity(leastPrivilegeIssuer));
});

test('rejects an unexpected login or effective role', () => {
  assert.throws(
    () => assertAuthIssuerDatabaseIdentity({
      ...leastPrivilegeIssuer,
      session_user: 'ghm_runtime',
      current_user: 'ghm_schema_owner',
    }),
    /Authentication Issuer database principal failed least-privilege verification/,
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
      () => assertAuthIssuerDatabaseIdentity({ ...leastPrivilegeIssuer, ...override }),
      /Authentication Issuer database principal failed least-privilege verification/,
    );
  }
});
