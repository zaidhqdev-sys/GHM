/**
 * Opaque 32-byte CSPRNG tokens for refresh and recovery.
 * Wire = URL-safe base64 without padding.
 */

import { randomBytes } from 'node:crypto';
import type { OpaqueToken } from './types';

export const OPAQUE_TOKEN_BYTES = 32;

const toBase64Url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const fromBase64Url = (wire: string): Buffer => {
  const padded = wire.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLength), 'base64');
};

export const generateOpaqueToken = (): OpaqueToken => {
  const raw = randomBytes(OPAQUE_TOKEN_BYTES);
  return { raw, wire: toBase64Url(raw) };
};

export const decodeOpaqueTokenWire = (wire: string): Buffer => {
  if (typeof wire !== 'string' || wire.length === 0) {
    throw new Error('Opaque token wire form must be a non-empty string');
  }
  const raw = fromBase64Url(wire);
  if (raw.length !== OPAQUE_TOKEN_BYTES) {
    throw new Error('Opaque token must decode to exactly 32 bytes');
  }
  return raw;
};

export const encodeOpaqueTokenRaw = (raw: Buffer): string => {
  if (!Buffer.isBuffer(raw) || raw.length !== OPAQUE_TOKEN_BYTES) {
    throw new Error('Opaque token raw material must be a 32-byte Buffer');
  }
  return toBase64Url(raw);
};
