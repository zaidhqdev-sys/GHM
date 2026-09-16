import type { AuthContext } from '../../auth/authorization';
import { assertRole } from '../../auth/authorization';
import type {
  CreateSupportRequestInput,
  ListSupportRequestsOptions,
  SupportRequest,
  SupportRequestMessage,
  SupportRequestRepository,
  SupportRequestService,
  SupportRequestId,
  UpdateSupportRequestStatusInput,
} from './contracts';

const assertPositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`Invalid ${field}`);
  return value as number;
};

const assertText = (value: unknown, field: string, min: number, max: number): string => {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new Error(`${field} must be between ${min} and ${max} characters`);
  return normalized;
};

export class SupportRequestServiceImpl implements SupportRequestService {
  constructor(private readonly repository: SupportRequestRepository) {}

  async createSupportRequest(context: AuthContext, input: CreateSupportRequestInput): Promise<SupportRequest> {
    if (context.role !== 'customer') throw new Error('Customer role required');
    return this.repository.createSupportRequest(context, {
      ...input,
      subject: assertText(input?.subject, 'subject', 3, 160),
      description: assertText(input?.description, 'description', 10, 4000),
    });
  }

  async getSupportRequest(context: AuthContext, requestId: SupportRequestId): Promise<SupportRequest | null> {
    return this.repository.getSupportRequest(context, assertPositiveId(requestId, 'requestId'));
  }

  async listSupportRequests(context: AuthContext, options?: ListSupportRequestsOptions): Promise<SupportRequest[]> {
    return this.repository.listSupportRequests(context, options);
  }

  async updateSupportRequestStatus(context: AuthContext, requestId: SupportRequestId, input: UpdateSupportRequestStatusInput): Promise<SupportRequest> {
    assertRole(context, 'admin');
    return this.repository.updateSupportRequestStatus(context, assertPositiveId(requestId, 'requestId'), input);
  }

  async getMessages(context: AuthContext, requestId: SupportRequestId): Promise<SupportRequestMessage[]> {
    return this.repository.getMessages(context, assertPositiveId(requestId, 'requestId'));
  }

  async reply(context: AuthContext, requestId: SupportRequestId, body: string): Promise<SupportRequestMessage> {
    return this.repository.reply(context, assertPositiveId(requestId, 'requestId'), assertText(body, 'body', 1, 4000));
  }
}
