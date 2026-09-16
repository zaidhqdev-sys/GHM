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
  | 'transition'
  | 'updateStatus'
  | 'readMessages'
  | 'replyAsCustomer'
  | 'replyAsAdmin'
  | 'delete';

export interface ResourceDefinition {
  readonly resource: Resource;
  readonly operations: readonly ResourceOperation[];
}

export const resourceRegistry: readonly ResourceDefinition[] = [
  { resource: 'profile', operations: ['read', 'update'] },
  { resource: 'business', operations: ['read', 'create', 'update'] },
  { resource: 'project', operations: ['read', 'readPublic', 'create', 'update'] },
  { resource: 'customer', operations: ['read', 'create', 'update'] },
  { resource: 'quote', operations: ['read', 'create', 'update'] },
  { resource: 'notification', operations: ['read', 'create', 'update'] },
  { resource: 'support_request', operations: ['read', 'create', 'updateStatus', 'readMessages', 'replyAsCustomer', 'replyAsAdmin'] },
  { resource: 'enquiry', operations: ['read', 'create', 'update'] },
  { resource: 'review', operations: ['create', 'readOwn', 'readPublic', 'readPending', 'approve', 'reject'] },
  { resource: 'opportunity', operations: ['read', 'create', 'update', 'transition'] },
  { resource: 'opportunity_participant', operations: ['read', 'create', 'update'] },
  { resource: 'saved_business', operations: ['read', 'create', 'delete'] },
];

export const isRegisteredOperation = (resource: Resource, operation: ResourceOperation): boolean =>
  resourceRegistry.some(definition => definition.resource === resource && definition.operations.includes(operation));