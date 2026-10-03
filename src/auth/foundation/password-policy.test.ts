import assert from 'node:assert/strict';
import test from 'node:test';
import { PasswordPolicyError, validateRegistrationPassword } from './password-policy';

test('registration password policy accepts the founder-selected minimum', () => {
  assert.doesNotThrow(() => validateRegistrationPassword('CorrectHorse1'));
  assert.doesNotThrow(() => validateRegistrationPassword('CorrectHorse1!'));
});

test('registration password policy rejects missing required character classes', () => {
  assert.throws(() => validateRegistrationPassword('short'), PasswordPolicyError);
  assert.throws(() => validateRegistrationPassword('lowercase123'), PasswordPolicyError);
  assert.throws(() => validateRegistrationPassword('UPPERCASE123'), PasswordPolicyError);
  assert.throws(() => validateRegistrationPassword('NoNumberHere'), PasswordPolicyError);
});
