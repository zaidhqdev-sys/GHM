/**
 * Founder-selected registration password policy.
 * Minimum 8 characters; uppercase, lowercase and number required;
 * special characters optional. No forced periodic rotation.
 */

export class PasswordPolicyError extends Error {
  constructor(readonly violations: string[]) {
    super('Password does not satisfy the password policy');
    this.name = 'PasswordPolicyError';
  }
}

export const validateRegistrationPassword = (password: string): void => {
  const violations: string[] = [];
  if (typeof password !== 'string' || password.length < 8) violations.push('minimum_length');
  if (typeof password === 'string' && !/[A-Z]/.test(password)) violations.push('uppercase_required');
  if (typeof password === 'string' && !/[a-z]/.test(password)) violations.push('lowercase_required');
  if (typeof password === 'string' && !/[0-9]/.test(password)) violations.push('number_required');
  if (violations.length > 0) throw new PasswordPolicyError(violations);
};
