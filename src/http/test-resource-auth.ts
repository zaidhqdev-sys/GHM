import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthContext } from '../auth/authorization';
import { loadEs256Keys } from '../auth/foundation/es256-keys';
import { ACCESS_JWT_AUD, ACCESS_JWT_ISS } from '../auth/foundation/access-jwt';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const keys = loadEs256Keys({
  GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKeyPem,
  GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKeyPem,
  GHM_JWT_ES256_KID: 'ghm-http-test-1',
});

export const tokenFor = (context: AuthContext): string =>
  jwt.sign(
    { sub: String(context.userId), role: context.role, iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD },
    privateKeyPem,
    { algorithm: 'ES256', keyid: keys.active.kid, expiresIn: 900 },
  );

export const httpTestAuth: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const token = header.slice('Bearer '.length).trim();
    const payload = jwt.verify(token, publicKeyPem, {
      algorithms: ['ES256'],
      issuer: ACCESS_JWT_ISS,
      audience: ACCESS_JWT_AUD,
    }) as jwt.JwtPayload & { role?: AuthContext['role'] };
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !['admin', 'customer', 'business'].includes(payload.role ?? '')) {
      throw new Error('invalid test auth');
    }
    req.authContext = { userId, role: payload.role as AuthContext['role'] };
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
};
