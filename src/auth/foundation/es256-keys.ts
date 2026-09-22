/**
 * ES256 signing / verification key loading.
 * Env names frozen by implementation parameter gate §7.
 * Does not generate keys. Does not hard-code material.
 */

export class Es256KeyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Es256KeyConfigError';
  }
}

export interface LoadedEs256Keys {
  active: {
    privateKeyPem: string;
    publicKeyPem: string;
    kid: string;
  };
  previous: { publicKeyPem: string; kid: string } | null;
}

/** Support single-line env PEMs that use literal \n escapes. */
const normalizePem = (value: string): string => value.replace(/\\n/g, '\n').trim();

const requireEnv = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) {
    throw new Es256KeyConfigError(`Missing required environment variable: ${name}`);
  }
  return normalizePem(value);
};

const optionalEnv = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const value = env[name]?.trim();
  return value && value.length > 0 ? normalizePem(value) : null;
};

const assertKid = (kid: string, label: string): void => {
  if (!/^[!-~]{1,64}$/.test(kid)) {
    throw new Es256KeyConfigError(`${label} must be non-empty printable ASCII ≤ 64 characters`);
  }
};

const assertPem = (pem: string, label: string, kind: 'PRIVATE' | 'PUBLIC'): void => {
  const expected =
    kind === 'PRIVATE'
      ? '-----BEGIN PRIVATE KEY-----'
      : '-----BEGIN PUBLIC KEY-----';
  if (!pem.includes(expected)) {
    throw new Es256KeyConfigError(`${label} must be a PKCS#8 PEM ${kind === 'PRIVATE' ? 'private' : 'public'} key`);
  }
};

/** Load active (+ optional previous public) ES256 material from env. */
export const loadEs256Keys = (env: NodeJS.ProcessEnv = process.env): LoadedEs256Keys => {
  const privateKeyPem = requireEnv(env, 'GHM_JWT_ES256_PRIVATE_KEY_PEM');
  const publicKeyPem = requireEnv(env, 'GHM_JWT_ES256_PUBLIC_KEY_PEM');
  const kid = requireEnv(env, 'GHM_JWT_ES256_KID');
  assertPem(privateKeyPem, 'GHM_JWT_ES256_PRIVATE_KEY_PEM', 'PRIVATE');
  assertPem(publicKeyPem, 'GHM_JWT_ES256_PUBLIC_KEY_PEM', 'PUBLIC');
  assertKid(kid, 'GHM_JWT_ES256_KID');

  const previousPublic = optionalEnv(env, 'GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM');
  const previousKid = optionalEnv(env, 'GHM_JWT_ES256_PREVIOUS_KID');

  let previous: LoadedEs256Keys['previous'] = null;
  if (previousPublic || previousKid) {
    if (!previousPublic || !previousKid) {
      throw new Es256KeyConfigError(
        'GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM and GHM_JWT_ES256_PREVIOUS_KID must both be set or both empty',
      );
    }
    assertPem(previousPublic, 'GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM', 'PUBLIC');
    assertKid(previousKid, 'GHM_JWT_ES256_PREVIOUS_KID');
    if (previousKid === kid) {
      throw new Es256KeyConfigError('Previous ES256 kid must differ from active kid');
    }
    previous = { publicKeyPem: previousPublic, kid: previousKid };
  }

  return {
    active: { privateKeyPem, publicKeyPem, kid },
    previous,
  };
};

export const verificationKeyMap = (keys: LoadedEs256Keys): Map<string, string> => {
  const map = new Map<string, string>();
  map.set(keys.active.kid, keys.active.publicKeyPem);
  if (keys.previous) {
    map.set(keys.previous.kid, keys.previous.publicKeyPem);
  }
  return map;
};
