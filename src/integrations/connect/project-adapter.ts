import type { ConnectAuthorizedOperation } from './authorization-binding';
import type {
  CreateProjectInput,
  Project,
  ProjectService,
  UpdateProjectInput,
} from '../../resources/project/contracts';

export type ConnectProjectCapability =
  | 'project.read'
  | 'project.create'
  | 'project.update';

export type ConnectProjectDispatchInput =
  | { readonly capability: 'project.read'; readonly projectId: number }
  | { readonly capability: 'project.create'; readonly input: CreateProjectInput }
  | { readonly capability: 'project.update'; readonly projectId: number; readonly input: UpdateProjectInput };

export type ConnectProjectDispatchResult = Project | null;

export interface ConnectProjectAdapterDependencies {
  readonly projects: ProjectService;
}

export class ConnectProjectAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectProjectAdapterError';
  }
}

const assertAuthorized = (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectProjectCapability,
): void => {
  if (!authorized || authorized.capability !== capability || authorized.resource !== 'project') {
    throw new ConnectProjectAdapterError('Authorized project capability does not match request');
  }
  if (authorized.operation !== capability.slice('project.'.length)) {
    throw new ConnectProjectAdapterError('Authorized operation does not match capability');
  }
};

const assertPositiveId = (value: unknown): asserts value is number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ConnectProjectAdapterError('Invalid project identifier');
  }
};

export const dispatchConnectProjectCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectProjectDispatchInput,
  dependencies: ConnectProjectAdapterDependencies,
): Promise<ConnectProjectDispatchResult> => {
  assertAuthorized(authorized, input.capability);

  switch (input.capability) {
    case 'project.read':
      assertPositiveId(input.projectId);
      return dependencies.projects.getOwnedProject(authorized.context, input.projectId);

    case 'project.create':
      if (authorized.context.role !== 'customer') {
        throw new ConnectProjectAdapterError('Project creation requires customer context');
      }
      return dependencies.projects.createProject(authorized.context, input.input);

    case 'project.update':
      if (authorized.context.role !== 'customer') {
        throw new ConnectProjectAdapterError('Project update requires customer context');
      }
      assertPositiveId(input.projectId);
      return dependencies.projects.updateOwnedProject(
        authorized.context,
        input.projectId,
        input.input,
      );

    default: {
      const unreachable: never = input;
      throw new ConnectProjectAdapterError(
        `Unsupported Connect project capability: ${String(unreachable)}`,
      );
    }
  }
};
