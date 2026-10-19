import type { PublicBusiness } from '../business-identity/public-contracts.js';

export interface DirectoryQuery {
  readonly q?: string;
  readonly category?: string;
  readonly province?: string;
  readonly city?: string;
  readonly sort?: 'rating' | 'reviews' | 'views' | 'newest';
  readonly businessType?: 'contractors' | 'suppliers';
  readonly page: number;
  readonly pageSize: number;
}

export interface PublicDirectoryBusiness extends PublicBusiness {}

export interface PublicDirectoryCategory {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface DirectoryResult {
  readonly items: PublicDirectoryBusiness[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface DirectoryRepository {
  search(query: DirectoryQuery): Promise<DirectoryResult>;
  listPublicCategories(): Promise<PublicDirectoryCategory[]>;
}

export interface DirectoryService {
  search(query: DirectoryQuery): Promise<DirectoryResult>;
  listPublicCategories(): Promise<PublicDirectoryCategory[]>;
}

export const DIRECTORY_OPERATIONS = Object.freeze({
  READ: 'directory.read',
} as const);
