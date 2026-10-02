import type { VerifiedConnectServiceAssertion } from './service-assertion';
import { requireActiveConnectIntegration, type ConnectIntegration, type ConnectIntegrationLifecycleRepository } from './integration-lifecycle';
import { isRegisteredOperation, type ResourceOperation } from '../../resources/registry';
import type { Resource } from '../../auth/authorization';

export interface ConnectIntegrationPrincipal {
  readonly type: 'connect_integration';
  readonly integrationId: string;
  readonly displayName: string;
  readonly status: 'active';
}

export interface ConnectTrustedRequestEnvelope {
  readonly integration: ConnectIntegrationPrincipal;
  readonly requestId: string;
  readonly operation: { readonly resource: Resource; readonly operation: ResourceOperation };
  readonly externalIdentity: { readonly provider: 'supabase'; readonly subject: string } | null;
  readonly input: unknown;
}

export class ConnectTrustedRequestContextError extends Error {
  constructor(message: string) { super(message); this.name = 'ConnectTrustedRequestContextError'; }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_PATTERN = /^[!-~]{1,128}$/;

const assertOpaque = (value: unknown, label: string): asserts value is string => {
  if (typeof value !== 'string' || !OPAQUE_PATTERN.test(value)) {
    throw new ConnectTrustedRequestContextError(\`\${label} must be printable ASCII ≤ 128 characters\`);
  }
};

const assertExternalIdentity = (value: unknown): asserts value is { provider: 'supabase'; subject: string } | null => {
  if (value === null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConnectTrustedRequestContextError('External identity reference is invalid');
  const candidate = value as Record<string, unknown>;
  if (candidate.provider !== 'supabase' || typeof candidate.subject !== 'string' || !UUID_PATTERN.test(candidate.subject.trim())) {
    throw new ConnectTrustedRequestContextError('External identity reference is invalid');
  }
};

const assertOperation = (resource: unknown, operation: unknown): void => {
  if (typeof resource !== 'string' || typeof operation !== 'string' || !isRegisteredOperation(resource as Resource, operation as ResourceOperation)) {
    throw new ConnectTrustedRequestContextError('Requested operation is not registered');
  }
};

const canonicalPrincipal = (integration: ConnectIntegration): ConnectIntegrationPrincipal =>
  Object.freeze({ type: 'connect_integration', integrationId: integration.id, displayName: integration.displayName, status: 'active' });

export interface ConnectTrustedRequestContext {
  readonly principal: ConnectIntegrationPrincipal;
  readonly request: ConnectTrustedRequestEnvelope;
  readonly assertion: Readonly<VerifiedConnectServiceAssertion['claims']>;
}

export const establishConnectTrustedRequestContext = async (
  assertion: VerifiedConnectServiceAssertion,
  input: {
    readonly operation: { readonly resource: Resource; readonly operation: ResourceOperation };
    readonly externalIdentity?: { readonly provider: 'supabase'; readonly subject: string } | null;
    readonly input?: unknown;
  },
  lifecycle: ConnectIntegrationLifecycleRepository,
): Promise<ConnectTrustedRequestContext> => {
  if (!assertion || typeof assertion !== 'object') throw new ConnectTrustedRequestContextError('Verified Connect service assertion is required');
  assertOpaque(assertion.integrationId, 'Integration id');
  assertOpaque(assertion.requestId, 'Request id');
  if (assertion.claims.sub !== assertion.integrationId || assertion.claims.jti !== assertion.requestId) {
    throw new ConnectTrustedRequestContextError('Verified assertion identity is inconsistent');
  }

  const integration = await requireActiveConnectIntegration(lifecycle, assertion.integrationId);
  const externalIdentity = input.externalIdentity ?? null;
  assertExternalIdentity(externalIdentity);
  assertOperation(input.operation.resource, input.operation.operation);

  const request: ConnectTrustedRequestEnvelope = Object.freeze({
    integration: canonicalPrincipal(integration),
    requestId: assertion.requestId,
    operation: Object.freeze({ resource: input.operation.resource, operation: input.operation.operation }),
    externalIdentity: externalIdentity === null ? null : Object.freeze({
      provider: 'supabase',
      subject: externalIdentity.subject.trim().toLowerCase(),
    }),
    input: input.input,
  });

  return Object.freeze({
    principal: request.integration,
    request,
    assertion: Object.freeze({ ...assertion.claims }),
  });
};
