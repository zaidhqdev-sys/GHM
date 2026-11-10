import type { PublicBusiness } from '../business-identity/public-contracts.js';

export interface DirectoryQuery {
  readonly q?: string;
  readonly category?: string;
  readonly province?: string;
  readonly city?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly radiusKm?: number;
  readonly businessType?: 'suppliers' | 'contractors';
  readonly sort?: 'rating' | 'reviews' | 'newest' | 'distance';
  readonly page: number;
  readonly pageSize: number;
}

export interface PublicDirectoryBusiness extends PublicBusiness {
  readonly distanceKm?: number;
  readonly category?: string | null;
}

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
