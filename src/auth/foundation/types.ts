/** GHM Auth foundation domain types. Not wired to HTTP or request-context. */

export type AccountStatus = 'active' | 'disabled';
export type SessionStatus = 'active' | 'revoked';
export type CredentialStatus = 'active' | 'disabled';

export type RevokeReason =
  | 'logout'
  | 'replay'
  | 'password_change'
  | 'password_recovery'
  | 'account_disabled';

export interface PasswordHashResult {
  /** Argon2id PHC encoded string — never plaintext */
  passwordHash: string;
  argon2MemoryKib: number;
  argon2TimeCost: number;
  argon2Parallelism: number;
}

export interface PasswordVerifyResult {
  verified: boolean;
  /** True when verified and stored params are weaker than current policy */
  needsRehash: boolean;
}

export interface OpaqueToken {
  /** URL-safe base64 (no padding) wire form */
  wire: string;
  /** Raw 32 bytes — caller must not persist */
  raw: Buffer;
}

export type TokenPurpose = 'refresh' | 'recovery';

export interface Es256SigningMaterial {
  privateKeyPem: string;
  publicKeyPem: string;
  kid: string;
}

export interface Es256VerificationKey {
  kid: string;
  publicKeyPem: string;
}

export interface AccessJwtClaims {
  sub: string;
  iss: 'ghm-auth';
  aud: 'ghm-api';
  iat: number;
  exp: number;
}

export interface AccessJwtVerifyResult {
  accountId: number;
  kid: string;
  claims: AccessJwtClaims;
}

export interface AuthenticationSessionRecord {
  id: number;
  accountId: number;
  sessionStatus: SessionStatus;
  createdAt: Date;
  lastSeenAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
}

export interface CreateSessionWithRefreshResult {
  session: AuthenticationSessionRecord;
  refreshCredentialId: number;
}

export interface RotateRefreshResult {
  session: AuthenticationSessionRecord;
  refreshCredentialId: number;
}

/** Frozen Supabase Auth provider vocabulary for person external subjects. */
export const EXTERNAL_IDENTITY_PROVIDER_SUPABASE = 'supabase' as const;

export type ExternalIdentityProvider = typeof EXTERNAL_IDENTITY_PROVIDER_SUPABASE | (string & {});

export interface ExternalIdentityMapping {
  id: number;
  provider: string;
  subject: string;
  accountId: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Outcomes from ghm.auth_link_external_identity — never raw PG errors. */
export type LinkExternalIdentityOutcome =
  | 'created'
  | 'already_linked'
  | 'conflict'
  | 'account_not_found';

export interface LinkExternalIdentityResult {
  outcome: LinkExternalIdentityOutcome;
  /** Present for created | already_linked | conflict; null for account_not_found. */
  mapping: ExternalIdentityMapping | null;
}

export interface BusinessExternalMapping {
  id: number;
  provider: string;
  externalBusinessId: string;
  businessId: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Outcomes from ghm.auth_link_business_external_mapping — never raw PG errors. */
export type LinkBusinessExternalMappingOutcome =
  | 'created'
  | 'already_linked'
  | 'conflict'
  | 'business_not_found';

export interface LinkBusinessExternalMappingResult {
  outcome: LinkBusinessExternalMappingOutcome;
  /** Present for created | already_linked | conflict; null for business_not_found. */
  mapping: BusinessExternalMapping | null;
}

export interface PasswordCredentialLookup {
  accountId: number;
  loginEmail: string;
  loginEmailNormalized: string;
  passwordHash: string;
  credentialStatus: CredentialStatus;
  argon2MemoryKib: number | null;
  argon2TimeCost: number | null;
  argon2Parallelism: number | null;
}
