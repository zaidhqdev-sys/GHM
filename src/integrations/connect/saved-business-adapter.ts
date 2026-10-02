import type { AccountAuthStateStore } from '../../auth/ghm-bearer';
import type { AuthContext } from '../../auth/authorization';
import type { ExternalIdentityMapping } from '../../auth/foundation/types';
import type { SavedBusiness, SavedBusinessService } from '../../resources/saved-business/contracts';
import type { ConnectIdentityAdapter } from './identity-adapter';

export interface ConnectSavedBusinessAdapter {
  list(subject: string): Promise<SavedBusiness[]>;
  get(subject: string, savedBusinessId: number): Promise<SavedBusiness | null>;
  create(subject: string, businessId: number): Promise<SavedBusiness>;
  delete(subject: string, savedBusinessId: number): Promise<void>;
}

export interface ConnectSavedBusinessDependencies {
  readonly identity: ConnectIdentityAdapter;
  readonly accounts: AccountAuthStateStore;
  readonly savedBusinesses: SavedBusinessService;
}

const toAuthContext = async (
  mapping: ExternalIdentityMapping,
  accounts: AccountAuthStateStore,
): Promise<AuthContext> => {
  const state = await accounts.getAccountAuthState(mapping.accountId);
  if (!state || state.accountStatus !== 'active') {
    throw new Error('Connect identity is not active');
  }

  const role = state.isSystemAdmin ? 'admin' : state.role;
  return Object.freeze({ userId: state.accountId, role });
};

const resolveContext = async (
  subject: string,
  dependencies: ConnectSavedBusinessDependencies,
): Promise<AuthContext> => {
  const resolution = await dependencies.identity.resolve(subject);
  if (resolution.outcome !== 'resolved') {
    throw new Error('Connect identity is not mapped');
  }
  return toAuthContext(resolution.mapping, dependencies.accounts);
};

export class ConnectSavedBusinessAdapterImpl implements ConnectSavedBusinessAdapter {
  constructor(private readonly dependencies: ConnectSavedBusinessDependencies) {}

  async list(subject: string): Promise<SavedBusiness[]> {
    const context = await resolveContext(subject, this.dependencies);
    return this.dependencies.savedBusinesses.listSavedBusinesses(context);
  }

  async get(subject: string, savedBusinessId: number): Promise<SavedBusiness | null> {
    const context = await resolveContext(subject, this.dependencies);
    return this.dependencies.savedBusinesses.getSavedBusiness(context, savedBusinessId);
  }

  async create(subject: string, businessId: number): Promise<SavedBusiness> {
    const context = await resolveContext(subject, this.dependencies);
    return this.dependencies.savedBusinesses.createSavedBusiness(context, { businessId });
  }

  async delete(subject: string, savedBusinessId: number): Promise<void> {
    const context = await resolveContext(subject, this.dependencies);
    return this.dependencies.savedBusinesses.deleteSavedBusiness(context, savedBusinessId);
  }
}
