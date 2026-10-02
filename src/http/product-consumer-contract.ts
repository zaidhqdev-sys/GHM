import type { Resource, ResourceOperation } from '../auth/authorization';

export type ProductConsumerErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_request'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'invalid_state'
  | 'dependency_failure'
  | 'internal_error';

export interface ProductConsumerRequest {
  readonly operation: { readonly resource: Resource; readonly operation: ResourceOperation };
  readonly externalIdentity: { readonly provider: string; readonly subject: string };
  readonly input?: unknown;
}

export interface ProductConsumerResponse { readonly result: unknown }
export interface ProductConsumerErrorResponse { readonly error: ProductConsumerErrorCode }

export class ProductConsumerRequestError extends Error {
  constructor(message = 'Invalid request') { super(message); this.name = 'ProductConsumerRequestError'; }
}

export const parseProductConsumerRequest = (body: unknown): ProductConsumerRequest => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ProductConsumerRequestError();
  const candidate = body as Record<string, unknown>;
  const operation = candidate.operation;
  const identity = candidate.externalIdentity;
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new ProductConsumerRequestError();
  const op = operation as Record<string, unknown>;
  if (typeof op.resource !== 'string' || typeof op.operation !== 'string') throw new ProductConsumerRequestError();
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) throw new ProductConsumerRequestError();
  const ext = identity as Record<string, unknown>;
  if (typeof ext.provider !== 'string' || !ext.provider || typeof ext.subject !== 'string' || !ext.subject) throw new ProductConsumerRequestError();
  return {
    operation: { resource: op.resource as Resource, operation: op.operation as ResourceOperation },
    externalIdentity: { provider: ext.provider, subject: ext.subject },
    input: candidate.input,
  };
};
