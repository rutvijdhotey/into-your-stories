export type ResetPasswordInput = {
  code: string;
  password: string;
  confirmPassword: string;
};

export function validateResetPasswordInput({
  code,
  password,
  confirmPassword,
}: ResetPasswordInput): string | null {
  if (!code.trim()) return 'Enter the code we emailed you.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (password !== confirmPassword) return "Passwords don't match.";
  return null;
}
