import type { AuthContext } from '../../auth/authorization';

export type SupportRequestId = number;
export type AccountId = number;
export type BusinessId = number;
export type SupportRequestCategory =
  | 'account'
  | 'business'
  | 'directory'
  | 'marketplace'
  | 'workspace'
  | 'trial_and_commercial'
  | 'technical'
  | 'other';
export type SupportRequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportRequestStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportRequestSenderKind = 'customer' | 'admin';

export interface SupportRequest {
  readonly id: SupportRequestId;
  readonly accountId: AccountId;
  readonly businessId: BusinessId | null;
  readonly category: SupportRequestCategory;
  readonly subject: string;
  readonly description: string;
  readonly priority: SupportRequestPriority;
  readonly status: SupportRequestStatus;
  readonly resolutionSummary: string | null;
  readonly resolvedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SupportRequestMessage {
  readonly id: number;
  readonly supportRequestId: SupportRequestId;
  readonly accountId: AccountId;
  readonly senderKind: SupportRequestSenderKind;
  readonly body: string;
  readonly createdAt: Date;
}

export interface CreateSupportRequestInput {
  readonly businessId?: BusinessId | null;
  readonly category: SupportRequestCategory;
  readonly subject: string;
  readonly description: string;
}

export interface ListSupportRequestsOptions {
  readonly status?: SupportRequestStatus;
  readonly limit?: number;
}

export interface UpdateSupportRequestStatusInput {
  readonly status: SupportRequestStatus;
  readonly resolutionSummary?: string | null;
}

export interface SupportRequestRepository {
  createSupportRequest(context: AuthContext, input: CreateSupportRequestInput): Promise<SupportRequest>;
  getSupportRequest(context: AuthContext, requestId: SupportRequestId): Promise<SupportRequest | null>;
  listSupportRequests(context: AuthContext, options?: ListSupportRequestsOptions): Promise<SupportRequest[]>;
  updateSupportRequestStatus(context: AuthContext, requestId: SupportRequestId, input: UpdateSupportRequestStatusInput): Promise<SupportRequest>;
  getMessages(context: AuthContext, requestId: SupportRequestId): Promise<SupportRequestMessage[]>;
  replyAsCustomer(context: AuthContext, requestId: SupportRequestId, body: string): Promise<SupportRequestMessage>;
  replyAsAdmin(context: AuthContext, requestId: SupportRequestId, body: string): Promise<SupportRequestMessage>;
}

export interface SupportRequestService extends SupportRequestRepository {}

export const SUPPORT_REQUEST_OPERATIONS = Object.freeze({
  read: 'support_request.read',
  create: 'support_request.create',
  updateStatus: 'support_request.updateStatus',
  readMessages: 'support_request.readMessages',
  replyAsCustomer: 'support_request.replyAsCustomer',
  replyAsAdmin: 'support_request.replyAsAdmin',
});
