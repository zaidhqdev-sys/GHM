import type {
  PublicProject,
  PublicProjectRepository,
  PublicProjectService,
} from './public-contracts';

export class PublicProjectServiceImpl implements PublicProjectService {
  constructor(
    private readonly repository: PublicProjectRepository,
  ) {}

  async getPublicProject(projectId: number): Promise<PublicProject | null> {
    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      throw new Error('Invalid Project id');
    }

    return this.repository.getPublicProject(projectId);
  }
}
