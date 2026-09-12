import { Resource } from '../auth/authorization';

export type ResourceOperation =
  | 'read'
  | 'readPublic'
  | 'create'
  | 'update'
  | 'readOwn'
  | 'readPending'
  | 'approve'
  | 'reject'
  | 'delete';

export interface ResourceDefinition {
  readonly resource: Resource;
  readonly operations: readonly ResourceOperation[];
}

export const resourceRegistry: readonly ResourceDefinition[] = [
  { resource: 'profile', operations: ['read', 'update'] },
  { resource: 'business', operations: ['read', 'create', 'update'] },
  { resource: 'project', operations: ['read', 'readPublic', 'create', 'update'] },
  { resource: 'quote', operations: ['read', 'create', 'update'] },
  { resource: 'notification', operations: ['read', 'update'] },
  { resource: 'support_request', operations: ['read', 'create', 'update'] },
  { resource: 'enquiry', operations: ['read', 'create', 'update'] },
  { resource: 'review', operations: ['create', 'readOwn', 'readPublic', 'readPending', 'approve', 'reject'] },
];

export const isRegisteredOperation = (
  resource: Resource,
  operation: ResourceOperation,
): boolean =>
  resourceRegistry.some(
    (definition) =>
      definition.resource === resource &&
      definition.operations.includes(operation),
  );
