import type { AuthContext } from '../../auth/authorization';
import type { ProjectId } from '../project/contracts';

export type ProjectQuoteId = number;
export type BusinessId = number;

export type ProjectQuoteStatus =
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';

export interface ProjectQuote {
  readonly id: ProjectQuoteId;
  readonly projectId: ProjectId;
  readonly businessId: BusinessId;
  readonly amount: number;
  readonly labourMin: number | null;
  readonly labourMax: number | null;
  readonly materialsMin: number | null;
  readonly materialsMax: number | null;
  readonly totalMin: number | null;
  readonly totalMax: number | null;
  readonly durationDays: number | null;
  readonly description: string | null;
  readonly status: ProjectQuoteStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProjectQuoteInput {
  readonly projectId: ProjectId;
  readonly businessId: BusinessId;
  readonly amount: number;
  readonly labourMin?: number | null;
  readonly labourMax?: number | null;
  readonly materialsMin?: number | null;
  readonly materialsMax?: number | null;
  readonly totalMin?: number | null;
  readonly totalMax?: number | null;
  readonly durationDays?: number | null;
  readonly description?: string | null;
}

export interface UpdateProjectQuoteInput {
  readonly amount?: number;
  readonly labourMin?: number | null;
  readonly labourMax?: number | null;
  readonly materialsMin?: number | null;
  readonly materialsMax?: number | null;
  readonly totalMin?: number | null;
  readonly totalMax?: number | null;
  readonly durationDays?: number | null;
  readonly description?: string | null;
}

export type ProjectQuoteDecision = 'accepted' | 'rejected';

export interface ProjectQuoteRepository {
  readReceived(
    context: AuthContext,
    projectId: ProjectId,
  ): Promise<readonly ProjectQuote[]>;

  readOwn(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<readonly ProjectQuote[]>;

  create(
    context: AuthContext,
    input: CreateProjectQuoteInput,
  ): Promise<ProjectQuote>;

  update(
    context: AuthContext,
    quoteId: ProjectQuoteId,
    input: UpdateProjectQuoteInput,
  ): Promise<ProjectQuote>;

  decide(
    context: AuthContext,
    quoteId: ProjectQuoteId,
    decision: ProjectQuoteDecision,
  ): Promise<ProjectQuote>;
}

export interface ProjectQuoteService {
  readReceived(
    context: AuthContext,
    projectId: ProjectId,
  ): Promise<readonly ProjectQuote[]>;

  readOwn(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<readonly ProjectQuote[]>;

  create(
    context: AuthContext,
    input: CreateProjectQuoteInput,
  ): Promise<ProjectQuote>;

  update(
    context: AuthContext,
    quoteId: ProjectQuoteId,
    input: UpdateProjectQuoteInput,
  ): Promise<ProjectQuote>;

  accept(
    context: AuthContext,
    quoteId: ProjectQuoteId,
  ): Promise<ProjectQuote>;

  reject(
    context: AuthContext,
    quoteId: ProjectQuoteId,
  ): Promise<ProjectQuote>;
}

export const PROJECT_QUOTE_OPERATIONS = Object.freeze({
  readReceived: 'projectQuote.readReceived',
  readOwn: 'projectQuote.readOwn',
  create: 'projectQuote.create',
  update: 'projectQuote.update',
  accept: 'projectQuote.accept',
  reject: 'projectQuote.reject',
});

