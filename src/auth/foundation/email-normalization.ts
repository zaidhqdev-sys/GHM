/**
 * First-gate login-key normalization.
 * trim → NFKC → case normalization (en-US).
 * Does not claim full IDNA / internationalized-email support.
 */

const MAX_INPUT_LENGTH = 320;

export class EmailNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailNormalizationError';
  }
}

export interface NormalizedLoginEmail {
  /** Trimmed accepted form for display / storage as login_email */
  loginEmail: string;
  /** Canonical unique login key */
  loginEmailNormalized: string;
}

export const normalizeLoginEmail = (input: string): NormalizedLoginEmail => {
  if (typeof input !== 'string') {
    throw new EmailNormalizationError('Login email must be a string');
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new EmailNormalizationError('Login email exceeds maximum length');
  }

  const loginEmail = input.trim();
  if (loginEmail.length === 0) {
    throw new EmailNormalizationError('Login email must not be empty');
  }

  const loginEmailNormalized = loginEmail.normalize('NFKC').toLocaleLowerCase('en-US');
  if (loginEmailNormalized.length === 0) {
    throw new EmailNormalizationError('Login email must not be empty after normalization');
  }

  return { loginEmail, loginEmailNormalized };
};
