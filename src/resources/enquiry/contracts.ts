import type { AuthContext } from '../../auth/authorization';

export type EnquiryId = number;
export type BusinessId = number;
export type AccountId = number;

export type EnquiryUrgency = 'standard' | 'urgent' | 'emergency';
export type EnquirySource = 'marketplace' | 'directory' | 'ai_quote' | 'direct';
export type EnquiryStatus = 'new' | 'contacted' | 'qualified' | 'quoted' | 'won' | 'lost' | 'archived';

export interface Enquiry {
  readonly id: EnquiryId;
  readonly businessId: BusinessId;
  readonly customerId: AccountId;
  readonly customerName: string;
  readonly customerPhone: string | null;
  readonly customerEmail: string | null;
  readonly project: string;
  readonly description: string;
  readonly city: string | null;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
  readonly urgency: EnquiryUrgency;
  readonly source: EnquirySource;
  readonly status: EnquiryStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateEnquiryInput {
  readonly businessId: BusinessId;
  readonly customerName: string;
  readonly customerPhone?: string | null;
  readonly customerEmail?: string | null;
  readonly project: string;
  readonly description: string;
  readonly city?: string | null;
  readonly budgetMin?: number | null;
  readonly budgetMax?: number | null;
  readonly urgency?: EnquiryUrgency;
  readonly source?: EnquirySource;
}

export interface UpdateEnquiryStatusInput {
  readonly status: EnquiryStatus;
}

export interface EnquiryRepository {
  createEnquiry(context: AuthContext, input: CreateEnquiryInput): Promise<Enquiry>;
  getOwnEnquiry(context: AuthContext, enquiryId: EnquiryId): Promise<Enquiry | null>;
  getReceivedEnquiry(context: AuthContext, enquiryId: EnquiryId): Promise<Enquiry | null>;
  updateReceivedEnquiryStatus(context: AuthContext, enquiryId: EnquiryId, input: UpdateEnquiryStatusInput): Promise<Enquiry>;
}

export interface EnquiryService {
  createEnquiry(context: AuthContext, input: CreateEnquiryInput): Promise<Enquiry>;
  getOwnEnquiry(context: AuthContext, enquiryId: EnquiryId): Promise<Enquiry | null>;
  getReceivedEnquiry(context: AuthContext, enquiryId: EnquiryId): Promise<Enquiry | null>;
  updateReceivedEnquiryStatus(context: AuthContext, enquiryId: EnquiryId, input: UpdateEnquiryStatusInput): Promise<Enquiry>;
}

export const ENQUIRY_OPERATIONS = Object.freeze({
  readOwn: 'enquiry.readOwn',
  readReceived: 'enquiry.readReceived',
  create: 'enquiry.create',
  updateStatus: 'enquiry.updateStatus',
});
