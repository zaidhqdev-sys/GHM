const includes = (value, pattern) => pattern.test(String(value ?? ''));

export const classifyStorageMigrationFourState = ({
  constraintDefinition,
  functionDefinition,
  securityDefiner,
  owner,
  configuration,
  acl,
  runtimeExecute,
  gatewayExecute,
}) => {
  if (!constraintDefinition || !functionDefinition) return 'UNKNOWN_DRIFT';

  const constraint = String(constraintDefinition).replaceAll('"', '').replace(/\s+/g, ' ').toLowerCase();
  const fn = String(functionDefinition).replaceAll('"', '').replace(/\s+/g, ' ').toLowerCase();
  const config = Array.isArray(configuration) ? configuration.join(';') : String(configuration ?? '');
  const aclText = String(acl ?? '').toLowerCase();

  const hasLifecycle = includes(constraint, /status\s*=\s*'deletion_pending'/);
  const deletionRequiresAvailable = includes(constraint, /status\s*=\s*'deletion_pending'[\s\S]{0,160}available_at\s+is\s+not\s+null/);
  const functionAvailableOnly = includes(fn, /and status\s*=\s*'available'/);
  const functionPendingAndAvailable = includes(fn, /and status\s+in\s*\('pending'(?:\s*::\s*text)?,\s*'available'(?:\s*::\s*text)?\)/);
  const expectedOwner = owner === 'ghm_schema_owner';
  const expectedSearchPath = includes(config, /search_path=pg_catalog,\s*ghm/);
  const hasRuntime = runtimeExecute === true && /ghm_runtime=x/.test(aclText);
  const hasGateway = gatewayExecute === true || /ghm_actor_gateway=x/.test(aclText);
  const hasPublic = /(^|[,{])=x\//.test(aclText);
  const hasMigrator = /ghm_migrator=x/.test(aclText);

  const preMigration = hasLifecycle && deletionRequiresAvailable &&
    functionAvailableOnly && securityDefiner === false && hasRuntime && !hasGateway;
  if (preMigration) return 'PRE_MIGRATION';

  const postMigration = hasLifecycle && !deletionRequiresAvailable &&
    functionPendingAndAvailable && securityDefiner === true && expectedOwner &&
    expectedSearchPath && hasRuntime && !hasGateway && !hasPublic && !hasMigrator;
  if (postMigration) return 'POST_MIGRATION';

  if (hasLifecycle && (functionAvailableOnly || functionPendingAndAvailable || securityDefiner === true)) {
    return 'PARTIAL_DRIFT';
  }
  return 'UNKNOWN_DRIFT';
};
