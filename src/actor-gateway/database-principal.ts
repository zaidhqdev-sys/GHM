export interface ActorGatewayDatabaseIdentity {
  session_user: string;
  current_user: string;
  rolcanlogin: boolean;
  rolinherit: boolean;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  no_role_memberships: boolean;
}

export const assertActorGatewayDatabaseIdentity = (
  identity: ActorGatewayDatabaseIdentity,
): void => {
  const expectedFlags = {
    rolcanlogin: true,
    rolinherit: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
    no_role_memberships: true,
  };
  const invalidFlags = Object.entries(expectedFlags)
    .filter(([key, expected]) => identity[key as keyof ActorGatewayDatabaseIdentity] !== expected)
    .map(([key]) => key);

  if (
    identity.session_user !== 'ghm_actor_gateway' ||
    identity.current_user !== 'ghm_actor_gateway' ||
    invalidFlags.length > 0
  ) {
    throw new Error(
      `Actor Gateway database principal failed least-privilege verification: session_user=${identity.session_user}, current_user=${identity.current_user}, invalid_flags=${invalidFlags.join(',') || 'none'}`,
    );
  }
};
