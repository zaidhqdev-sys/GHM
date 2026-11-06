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

export interface PublicProjectSearchInput {
  readonly category?: string;
  readonly province?: string;
  readonly urgency?: 'standard' | 'urgent' | 'emergency';
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface PublicProjectPage {
  readonly projects: readonly PublicProject[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface PublicProjectRepository {
  listPublicProjects(input: PublicProjectSearchInput): Promise<PublicProjectPage>;
  getPublicProject(projectId: number): Promise<PublicProject | null>;
}

export interface PublicProjectService {
  listPublicProjects(input: PublicProjectSearchInput): Promise<PublicProjectPage>;
  getPublicProject(projectId: number): Promise<PublicProject | null>;
}

export const PROJECT_PUBLIC_OPERATION = 'readPublic' as const;
