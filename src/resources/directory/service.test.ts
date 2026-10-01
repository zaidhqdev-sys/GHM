import assert from 'node:assert/strict';
import test from 'node:test';
import { DirectoryServiceImpl } from './service.js';
import type { DirectoryRepository } from './contracts.js';

const repository = (result = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
}): DirectoryRepository => ({
  search: async query => {
    assert.equal(query.page, 1);
    assert.equal(query.pageSize, 20);
    return result;
  },
});

test('directory service applies default pagination and normalizes blank query', async () => {
  let received: unknown;
  const service = new DirectoryServiceImpl({
    search: async query => {
      received = query;
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
    },
  });

  const result = await service.search({ q: '   ', page: 1, pageSize: 20 });
  assert.deepEqual(received, { q: undefined, category: undefined, page: 1, pageSize: 20 });
  assert.equal(result.total, 0);
});

test('directory service accepts category UUID or slug', async () => {
  const received: string[] = [];
  const service = new DirectoryServiceImpl({
    search: async query => {
      received.push(query.category ?? '');
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
    },
  });

  await service.search({ category: 'Construction', page: 1, pageSize: 20 });
  await service.search({ category: '550e8400-e29b-41d4-a716-446655440000', page: 1, pageSize: 20 });
  assert.deepEqual(received, ['construction', '550e8400-e29b-41d4-a716-446655440000']);
});

test('directory service rejects invalid pagination and category values before repository execution', async () => {
  let called = false;
  const service = new DirectoryServiceImpl({
    search: async () => {
      called = true;
      return { items: [], page: 1, pageSize: 20, total: 0 };
    },
  });

  await assert.rejects(() => service.search({ page: 0, pageSize: 20 }), /page must be a positive integer/);
  await assert.rejects(() => service.search({ page: 1, pageSize: 51 }), /pageSize must be at most 50/);
  await assert.rejects(() => service.search({ page: 1, pageSize: 20, category: 'not a category' }), /category must be a valid category id or slug/);
  assert.equal(called, false);
});

test('directory service rejects non-string query values', async () => {
  const service = new DirectoryServiceImpl(repository());
  await assert.rejects(
    () => service.search({ q: 123 as unknown as string, page: 1, pageSize: 20 }),
    /q must be a string/,
  );
});
