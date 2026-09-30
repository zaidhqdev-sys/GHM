import type { AuthContext } from '../../auth/authorization';

export type ProjectId = number;
export type AccountId = number;

export type ProjectUrgency = 'standard' | 'urgent' | 'emergency';
export type ProjectStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface Project {
  readonly id: ProjectId;
  readonly accountId: AccountId;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly province: string;
  readonly city: string;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
  readonly urgency: ProjectUrgency;
  readonly status: ProjectStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProjectInput {
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly province: string;
  readonly city: string;
  readonly budgetMin?: number | null;
  readonly budgetMax?: number | null;
  readonly urgency?: ProjectUrgency;
}

export interface UpdateProjectInput {
  readonly title?: string;
  readonly description?: string;
  readonly category?: string;
  readonly province?: string;
  readonly city?: string;
  readonly budgetMin?: number | null;
  readonly budgetMax?: number | null;
  readonly urgency?: ProjectUrgency;
}

export interface ProjectRepository {
  createProject(
    context: AuthContext,
    input: CreateProjectInput,
  ): Promise<Project>;

  getOwnedProject(
    context: AuthContext,
    projectId: ProjectId,
  ): Promise<Project | null>;

  updateOwnedProject(
    context: AuthContext,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<Project>;
}

export interface ProjectService {
  createProject(
    context: AuthContext,
    input: CreateProjectInput,
  ): Promise<Project>;

  getOwnedProject(
    context: AuthContext,
    projectId: ProjectId,
  ): Promise<Project | null>;

  updateOwnedProject(
    context: AuthContext,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<Project>;
}

export const PROJECT_OPERATIONS = Object.freeze({
  read: 'project.read',
  create: 'project.create',
  update: 'project.update',
});
