import type { PublicBusiness } from '../business-identity/public-contracts.js';

export interface DirectoryQuery {
  readonly q?: string;
  readonly category?: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface PublicDirectoryBusiness extends PublicBusiness {}

export interface DirectoryResult {
  readonly items: PublicDirectoryBusiness[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface DirectoryRepository {
  search(query: DirectoryQuery): Promise<DirectoryResult>;
}

export interface DirectoryService {
  search(query: DirectoryQuery): Promise<DirectoryResult>;
}

export const DIRECTORY_OPERATIONS = Object.freeze({
  READ: 'directory.read',
} as const);
