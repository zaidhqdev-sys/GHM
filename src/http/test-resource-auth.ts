import { generateKeyPairSync } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { createRequireResourceAuth } from '../auth/resource-auth';
import { createGhmBearerAuthenticatorWithKeys, type AccountAuthStateStore } from '../auth/ghm-bearer';
import { loadEs256Keys } from '../auth/foundation/es256-keys';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const keys = loadEs256Keys({
  GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  GHM_JWT_ES256_KID: 'ghm-http-test-1',
});

const store: AccountAuthStateStore = {
  async getAccountAuthState(accountId) {
    return {
      accountId,
      accountStatus: 'active',
      role: 'customer',
      isSystemAdmin: false,
    };
  },
};

const authenticator = createGhmBearerAuthenticatorWithKeys(keys, store);
export const httpTestAuth: RequestHandler = createRequireResourceAuth({ ghmAuthenticator: authenticator });

export const tokenFor = (context: AuthContext): string => {
  const payload = authenticator;
  void payload;
  // The shared ES256 access-JWT primitive is used by the governed resource authenticator.
  const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
  return jwt.sign(
    { sub: String(context.userId), iss: 'ghm-auth', aud: 'ghm-api', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    keys.active.privateKeyPem,
    { algorithm: 'ES256', keyid: keys.active.kid, noTimestamp: true },
  );
};
