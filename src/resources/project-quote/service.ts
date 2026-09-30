import type { AuthContext } from '../../auth/authorization';
import type {
  CreateProjectQuoteInput,
  ProjectQuote,
  ProjectQuoteRepository,
  ProjectQuoteService,
  UpdateProjectQuoteInput,
} from './contracts';

const validateInput = <T>(input: T, message: string): T => {
  if (!input || typeof input !== 'object') {
    throw new Error(message);
  }

  return input;
};

export class ProjectQuoteServiceImpl implements ProjectQuoteService {
  constructor(private readonly repository: ProjectQuoteRepository) {}

  async readReceived(
    context: AuthContext,
    projectId: number,
  ): Promise<readonly ProjectQuote[]> {
    return this.repository.readReceived(context, projectId);
  }

  async readOwn(
    context: AuthContext,
    businessId: number,
  ): Promise<readonly ProjectQuote[]> {
    return this.repository.readOwn(context, businessId);
  }

  async create(
    context: AuthContext,
    input: CreateProjectQuoteInput,
  ): Promise<ProjectQuote> {
    return this.repository.create(
      context,
      validateInput(input, 'Project Quote input is required'),
    );
  }

  async update(
    context: AuthContext,
    quoteId: number,
    input: UpdateProjectQuoteInput,
  ): Promise<ProjectQuote> {
    return this.repository.update(
      context,
      quoteId,
      validateInput(input, 'Project Quote update input is required'),
    );
  }

  async accept(
    context: AuthContext,
    quoteId: number,
  ): Promise<ProjectQuote> {
    return this.repository.decide(context, quoteId, 'accepted');
  }

  async reject(
    context: AuthContext,
    quoteId: number,
  ): Promise<ProjectQuote> {
    return this.repository.decide(context, quoteId, 'rejected');
  }
}
