import { validateResetPasswordInput } from '../authHelpers';

describe('validateResetPasswordInput', () => {
  it('requires a code', () => {
    expect(
      validateResetPasswordInput({ code: '', password: 'abcdef', confirmPassword: 'abcdef' })
    ).toBe('Enter the code we emailed you.');
  });

  it('requires a code that is not just whitespace', () => {
    expect(
      validateResetPasswordInput({ code: '   ', password: 'abcdef', confirmPassword: 'abcdef' })
    ).toBe('Enter the code we emailed you.');
  });

  it('requires a password of at least 6 characters', () => {
    expect(
      validateResetPasswordInput({ code: '123456', password: 'abc', confirmPassword: 'abc' })
    ).toBe('Password must be at least 6 characters.');
  });

  it('requires password and confirmPassword to match', () => {
    expect(
      validateResetPasswordInput({ code: '123456', password: 'abcdef', confirmPassword: 'abcdeg' })
    ).toBe("Passwords don't match.");
  });

  it('returns null when everything is valid', () => {
    expect(
      validateResetPasswordInput({ code: '123456', password: 'abcdef', confirmPassword: 'abcdef' })
    ).toBeNull();
  });
});
