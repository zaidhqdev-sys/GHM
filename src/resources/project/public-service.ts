import type {
  PublicProject,
  PublicProjectRepository,
  PublicProjectService,
  PublicProjectSearchInput,
  PublicProjectPage,
} from './public-contracts';

export class PublicProjectServiceImpl implements PublicProjectService {
  constructor(
    private readonly repository: PublicProjectRepository,
  ) {}

  async listPublicProjects(input: PublicProjectSearchInput): Promise<PublicProjectPage> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error('Invalid Project page limit');
    if (!Number.isSafeInteger(input.offset) || input.offset < 0) throw new Error('Invalid Project page offset');
    for (const [field, value, max] of [['category', input.category, 80], ['province', input.province, 120], ['search', input.search, 200]] as const) {
      if (value !== undefined && (typeof value !== 'string' || value.trim().length > max)) throw new Error(`Invalid Project ${field} filter`);
    }
    if (input.urgency !== undefined && !['standard', 'urgent', 'emergency'].includes(input.urgency)) throw new Error('Invalid Project urgency filter');
    return this.repository.listPublicProjects({
      ...input,
      ...(input.category !== undefined ? { category: input.category.trim() || undefined } : {}),
      ...(input.province !== undefined ? { province: input.province.trim() || undefined } : {}),
      ...(input.search !== undefined ? { search: input.search.trim() || undefined } : {}),
    });
  }

  async getPublicProject(projectId: number): Promise<PublicProject | null> {
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      throw new Error('Invalid Project id');
    }

    return this.repository.getPublicProject(projectId);
  }
}
