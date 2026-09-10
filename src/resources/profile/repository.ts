import { PoolClient } from 'pg';
import { AuthContext, assertOwnership, canAccessResource } from '../../auth/authorization';

export interface ProfileRecord {
  userId: number;
  fullName: string | null;
  email: string;
}

export interface ProfileRepository {
  getOwnProfile(client: PoolClient, context: AuthContext): Promise<ProfileRecord | null>;
}

/**
 * Contract-only profile repository.
 *
 * SQL is intentionally not implemented until the live GHM PostgreSQL catalog
 * has been captured and reconciled. This prevents schema invention during the
 * replacement build.
 */
export const profileRepository: ProfileRepository = {
  async getOwnProfile(_client: PoolClient, context: AuthContext): Promise<ProfileRecord | null> {
    if (!canAccessResource(context, 'profile')) {
      throw new Error('Resource access denied');
    }

    assertOwnership(context, context.userId);

    throw new Error('Profile repository SQL is blocked pending database reconciliation');
  },
};
