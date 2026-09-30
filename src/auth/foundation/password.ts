/**
 * Argon2id password hashing isolated from the rest of Auth.
 * Parameters: 64 MiB / time 3 / parallelism 1 (implementation parameter gate).
 */

import argon2 from 'argon2';
import type { PasswordHashResult, PasswordVerifyResult } from './types';

export const ARGON2_MEMORY_KIB = 65536;
export const ARGON2_TIME_COST = 3;
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LENGTH = 32;
export const ARGON2_SALT_LENGTH = 16;

const hashOptions = {
  type: argon2.argon2id,
  memoryCost: ARGON2_MEMORY_KIB,
  timeCost: ARGON2_TIME_COST,
  parallelism: ARGON2_PARALLELISM,
  hashLength: ARGON2_HASH_LENGTH,
} as const;

export interface PasswordHasher {
  hash(password: string): Promise<PasswordHashResult>;
  verify(passwordHash: string, password: string): Promise<PasswordVerifyResult>;
}

const assertPasswordInput = (password: string): void => {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
};

export const createArgon2idPasswordHasher = (): PasswordHasher => ({
  async hash(password: string): Promise<PasswordHashResult> {
    assertPasswordInput(password);
    const passwordHash = await argon2.hash(password, hashOptions);
    return {
      passwordHash,
      argon2MemoryKib: ARGON2_MEMORY_KIB,
      argon2TimeCost: ARGON2_TIME_COST,
      argon2Parallelism: ARGON2_PARALLELISM,
    };
  },

  async verify(passwordHash: string, password: string): Promise<PasswordVerifyResult> {
    assertPasswordInput(password);
    if (typeof passwordHash !== 'string' || passwordHash.trim().length === 0) {
      return { verified: false, needsRehash: false };
    }

    let verified = false;
    try {
      verified = await argon2.verify(passwordHash, password);
    } catch {
      return { verified: false, needsRehash: false };
    }

    if (!verified) {
      return { verified: false, needsRehash: false };
    }

    let needsRehash = false;
    try {
      needsRehash = argon2.needsRehash(passwordHash, hashOptions);
    } catch {
      needsRehash = true;
    }

    return { verified: true, needsRehash };
  },
});

export const defaultPasswordHasher = createArgon2idPasswordHasher();
