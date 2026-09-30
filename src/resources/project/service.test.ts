import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  CreateProjectInput,
  Project,
  ProjectRepository,
  UpdateProjectInput,
} from './contracts';
import { ProjectServiceImpl } from './service';

const project = (
  id: number,
  accountId: number,
  status: Project['status'] = 'open',
): Project => ({
  id,
  accountId,
  title: `Project ${id}`,
  description: 'This is a sufficiently long project description for testing.',
  category: 'Construction',
  province: 'KwaZulu-Natal',
  city: 'Durban',
  budgetMin: 1000,
  budgetMax: 5000,
  urgency: 'standard',
  status,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

class FakeRepository implements ProjectRepository {
  projects = new Map<number, Project>();
  nextId = 1;

  async createProject(
    context: AuthContext,
    input: CreateProjectInput,
  ): Promise<Project> {
    const created = {
      ...project(this.nextId++, context.userId),
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category.trim(),
      province: input.province.trim(),
      city: input.city.trim(),
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      urgency: input.urgency ?? 'standard',
      status: 'open' as const,
    };

    this.projects.set(created.id, created);
    return created;
  }

  async getOwnedProject(
    context: AuthContext,
    projectId: number,
  ): Promise<Project | null> {
    const value = this.projects.get(projectId);
    return value && value.accountId === context.userId ? value : null;
  }

  async updateOwnedProject(
    context: AuthContext,
    projectId: number,
    input: UpdateProjectInput,
  ): Promise<Project> {
    const existing = this.projects.get(projectId);

    if (!existing || existing.accountId !== context.userId) {
      throw new Error('Project not found or ownership required');
    }

    if (existing.status !== 'open') {
      throw new Error('Only open Projects may be updated');
    }

    const updated: Project = {
      ...existing,
      ...input,
      title: input.title?.trim() ?? existing.title,
      description: input.description?.trim() ?? existing.description,
      category: input.category?.trim() ?? existing.category,
      province: input.province?.trim() ?? existing.province,
      city: input.city?.trim() ?? existing.city,
      budgetMin: Object.hasOwn(input, 'budgetMin')
        ? input.budgetMin ?? null
        : existing.budgetMin,
      budgetMax: Object.hasOwn(input, 'budgetMax')
        ? input.budgetMax ?? null
        : existing.budgetMax,
      urgency: input.urgency ?? existing.urgency,
      updatedAt: new Date(1),
    };

    this.projects.set(projectId, updated);
    return updated;
  }
}

const serviceFor = (context: AuthContext) => {
  const repository = new FakeRepository();
  return {
    repository,
    service: new ProjectServiceImpl(repository),
  };
};

const validInput: CreateProjectInput = {
  title: 'New Construction Project',
  description: 'A sufficiently detailed project description for testing.',
  category: 'Construction',
  province: 'KwaZulu-Natal',
  city: 'Durban',
  budgetMin: 1000,
  budgetMax: 5000,
  urgency: 'standard',
};

test('Project creation binds ownership to authenticated account', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor(context);

  const created = await service.createProject(context, validInput);

  assert.equal(created.accountId, 10);
  assert.equal(created.status, 'open');
});

test('account may own multiple Projects', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service, repository } = serviceFor(context);

  const first = await service.createProject(context, validInput);
  const second = await service.createProject(context, {
    ...validInput,
    title: 'Second Construction Project',
  });

  assert.notEqual(first.id, second.id);
  assert.equal([...repository.projects.values()].filter(
    value => value.accountId === context.userId,
  ).length, 2);
});

test('owner can read owned Project', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service, repository } = serviceFor(context);

  repository.projects.set(1, project(1, 10));

  const result = await service.getOwnedProject(context, 1);

  assert.equal(result?.id, 1);
  assert.equal(result?.accountId, 10);
});

test('non-owner cannot read Project', async () => {
  const context: AuthContext = { userId: 20, role: 'customer' };
  const { service, repository } = serviceFor(context);

  repository.projects.set(1, project(1, 10));

  assert.equal(await service.getOwnedProject(context, 1), null);
});

test('owner can update an open Project', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service, repository } = serviceFor(context);

  repository.projects.set(1, project(1, 10));

  const updated = await service.updateOwnedProject(context, 1, {
    title: 'Updated Construction Project',
    urgency: 'urgent',
  });

  assert.equal(updated.title, 'Updated Construction Project');
  assert.equal(updated.urgency, 'urgent');
  assert.equal(updated.accountId, 10);
  assert.equal(updated.status, 'open');
});

test('non-owner cannot update Project', async () => {
  const context: AuthContext = { userId: 20, role: 'customer' };
  const { service, repository } = serviceFor(context);

  repository.projects.set(1, project(1, 10));

  await assert.rejects(
    () => service.updateOwnedProject(context, 1, { title: 'Unauthorized Update' }),
    /ownership required/,
  );
});

test('closed Project cannot be updated', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service, repository } = serviceFor(context);

  repository.projects.set(1, project(1, 10, 'completed'));

  await assert.rejects(
    () => service.updateOwnedProject(context, 1, { title: 'Too Late' }),
    /Only open Projects may be updated/,
  );
});

test('Project update does not expose owner or status mutation', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service, repository } = serviceFor(context);

  repository.projects.set(1, project(1, 10));

  const updated = await service.updateOwnedProject(context, 1, {
    title: 'Still Owned',
  });

  assert.equal(updated.accountId, 10);
  assert.equal(updated.status, 'open');
});

test('invalid Project title is rejected', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor(context);

  await assert.rejects(
    () => service.createProject(context, { ...validInput, title: 'No' }),
    /title must be between 5 and 160 characters/,
  );
});

test('invalid Project description is rejected', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor(context);

  await assert.rejects(
    () => service.createProject(context, { ...validInput, description: 'Too short' }),
    /description must be between 20 and 5000 characters/,
  );
});

test('negative budget is rejected', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor(context);

  await assert.rejects(
    () => service.createProject(context, { ...validInput, budgetMin: -1 }),
    /budgetMin must be null or a non-negative number/,
  );
});

test('budget range is rejected when maximum is below minimum', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor(context);

  await assert.rejects(
    () => service.createProject(context, {
      ...validInput,
      budgetMin: 5000,
      budgetMax: 1000,
    }),
    /budgetMax must be greater than or equal to budgetMin/,
  );
});

test('invalid urgency is rejected', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service } = serviceFor(context);

  await assert.rejects(
    () => service.createProject(context, {
      ...validInput,
      urgency: 'invalid' as never,
    }),
    /Invalid Project urgency/,
  );
});

test('empty Project update is rejected', async () => {
  const context: AuthContext = { userId: 10, role: 'customer' };
  const { service, repository } = serviceFor(context);

  repository.projects.set(1, project(1, 10));

  await assert.rejects(
    () => service.updateOwnedProject(context, 1, {}),
    /requires at least one field/,
  );
});
