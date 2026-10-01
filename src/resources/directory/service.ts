import type { DirectoryQuery, DirectoryRepository, DirectoryResult, DirectoryService } from './contracts.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const requirePositiveInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const normalizeQuery = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('q must be a string');
  const normalized = value.trim();
  return normalized || undefined;
};

const normalizeCategory = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('category must be a string');
  const normalized = value.trim().toLowerCase();
  if (!normalized) throw new Error('category must not be blank');
  if (!UUID_RE.test(normalized) && !CATEGORY_SLUG_RE.test(normalized)) {
    throw new Error('category must be a valid category id or slug');
  }
  return normalized;
};

const normalizePage = (value: unknown): number => {
  if (value === undefined) return DEFAULT_PAGE;
  return requirePositiveInteger(value, 'page');
};

const normalizePageSize = (value: unknown): number => {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  const pageSize = requirePositiveInteger(value, 'pageSize');
  if (pageSize > MAX_PAGE_SIZE) throw new Error(`pageSize must be at most ${MAX_PAGE_SIZE}`);
  return pageSize;
};

export class DirectoryServiceImpl implements DirectoryService {
  constructor(private readonly repository: DirectoryRepository) {}

  async search(query: DirectoryQuery): Promise<DirectoryResult> {
    if (!query || typeof query !== 'object') throw new Error('Directory query is required');

    const normalized: DirectoryQuery = {
      q: normalizeQuery(query.q),
      category: normalizeCategory(query.category),
      page: normalizePage(query.page),
      pageSize: normalizePageSize(query.pageSize),
    };

    return this.repository.search(normalized);
  }
}
