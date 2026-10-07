import { Resource } from '../auth/authorization';

export type ResourceOperation =
  | 'read'
  | 'readPublic'
  | 'create'
  | 'update'
  | 'replace'
  | 'readOwn'
  | 'readReceived'
  | 'readPending'
  | 'approve'
  | 'reject'
  | 'transition'
  | 'updateStatus'
  | 'readMessages'
  | 'replyAsCustomer'
  | 'replyAsAdmin'
  | 'delete'
  | 'calculate'
  | 'accept'
  | 'applyPaymentResult';

export interface ResourceDefinition {
  readonly resource: Resource;
  readonly operations: readonly ResourceOperation[];
}

export const resourceRegistry: readonly ResourceDefinition[] = [
  { resource: 'profile', operations: ['read', 'update'] },
  { resource: 'business', operations: ['read', 'readPublic', 'create', 'update'] },
  { resource: 'directory', operations: ['read'] },
  { resource: 'business_capability', operations: ['read', 'create', 'transition'] },
  { resource: 'business_category', operations: ['read'] },
  { resource: 'business_category_assignment', operations: ['read', 'create', 'update'] },
  { resource: 'business_offering', operations: ['read', 'readPublic', 'create', 'update'] },
  { resource: 'business_hours', operations: ['read', 'readPublic', 'replace'] },
  { resource: 'project', operations: ['read', 'readPublic', 'create', 'update'] },
  { resource: 'project_quote', operations: ['readReceived', 'readOwn', 'create', 'update', 'accept', 'reject'] },
  { resource: 'opportunity_requirements', operations: ['read', 'replace'] },
  { resource: 'customer', operations: ['read', 'create', 'update'] },
  { resource: 'quote', operations: ['read', 'create', 'update'] },
  { resource: 'notification', operations: ['read', 'create', 'update'] },
  { resource: 'support_request', operations: ['read', 'create', 'updateStatus', 'readMessages', 'replyAsCustomer', 'replyAsAdmin'] },
  { resource: 'enquiry', operations: ['read', 'create', 'update'] },
  { resource: 'review', operations: ['create', 'readOwn', 'readPublic', 'readPending', 'approve', 'reject'] },
  { resource: 'opportunity', operations: ['read', 'create', 'update', 'transition'] },
  { resource: 'opportunity_participant', operations: ['read', 'create', 'update'] },
  { resource: 'saved_business', operations: ['read', 'create', 'delete'] },
  { resource: 'trust_score', operations: ['read', 'readPublic', 'calculate'] },
  { resource: 'campaign', operations: ['read', 'create', 'update'] },
];

export const isRegisteredOperation = (resource: Resource, operation: ResourceOperation): boolean =>
  resourceRegistry.some(definition => definition.resource === resource && definition.operations.includes(operation));
