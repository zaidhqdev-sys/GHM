import type { AuthPersistence } from '../../auth/foundation/persistence';
import type { ExternalIdentityMapping } from '../../auth/foundation/types';
import { EXTERNAL_IDENTITY_PROVIDER_SUPABASE } from '../../auth/foundation/types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ConnectIdentityResolution =
  | {
      readonly outcome: 'resolved';
      readonly mapping: ExternalIdentityMapping;
      readonly created: false;
    }
  | {
      readonly outcome: 'bootstrapped';
      readonly mapping: ExternalIdentityMapping;
      readonly created: true;
    }
  | {
      readonly outcome: 'unmapped';
      readonly mapping: null;
      readonly created: false;
    };

export interface ConnectIdentityBootstrapOptions {
  readonly allowBootstrap: boolean;
  readonly fullName?: string | null;
  readonly role?: 'customer' | 'business';
}

/**
 * Connect identity adapter.
 *
 * This is deliberately a domain/integration seam, not an HTTP endpoint.
 * The caller is expected to be an already-governed Connect integration boundary.
 * No Supabase JWT is accepted or verified here.
 */
export interface ConnectIdentityAdapter {
  resolve(
    subject: string,
    options?: ConnectIdentityBootstrapOptions,
  ): Promise<ConnectIdentityResolution>;
}

const validateSubject = (subject: string): string => {
  if (typeof subject !== 'string' || !UUID_PATTERN.test(subject.trim())) {
    throw new Error('Invalid Connect external identity subject');
  }
  return subject.trim().toLowerCase();
};

export class ConnectIdentityAdapterImpl implements ConnectIdentityAdapter {
  constructor(private readonly persistence: AuthPersistence) {}

  async resolve(
    subject: string,
    options: ConnectIdentityBootstrapOptions = { allowBootstrap: false },
  ): Promise<ConnectIdentityResolution> {
    const normalizedSubject = validateSubject(subject);
    const existing = await this.persistence.lookupExternalIdentity(
      EXTERNAL_IDENTITY_PROVIDER_SUPABASE,
      normalizedSubject,
    );

    if (existing) {
      return { outcome: 'resolved', mapping: existing, created: false };
    }

    if (!options.allowBootstrap) {
      return { outcome: 'unmapped', mapping: null, created: false };
    }

    const bootstrapped = await this.persistence.bootstrapExternalIdentity(
      EXTERNAL_IDENTITY_PROVIDER_SUPABASE,
      normalizedSubject,
      options.fullName ?? null,
      options.role ?? 'customer',
    );

    return bootstrapped.created
      ? { outcome: 'bootstrapped', mapping: bootstrapped, created: true }
      : { outcome: 'resolved', mapping: bootstrapped, created: false };
  }
}
