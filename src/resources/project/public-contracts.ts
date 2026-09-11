import type { ProjectStatus, ProjectUrgency } from './contracts';

export interface PublicProject {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly province: string;
  readonly city: string;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
  readonly urgency: ProjectUrgency;
  readonly status: Extract<ProjectStatus, 'open'>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicProjectRepository {
  getPublicProject(projectId: number): Promise<PublicProject | null>;
}

export interface PublicProjectService {
  getPublicProject(projectId: number): Promise<PublicProject | null>;
}

export const PROJECT_PUBLIC_OPERATION = 'readPublic' as const;
