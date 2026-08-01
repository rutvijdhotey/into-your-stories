# Forgot Password Flow — Design

## Problem

There is no way for a user to recover their account if they forget their password. `LoginScreen` only supports email/password sign-in with no reset path, and no reset/forgot-password screen exists anywhere in `src/screens/auth/`.

## Approach

Use Supabase's OTP-based password recovery instead of an email magic link, since the app has no URL `scheme` configured in `app.json` and adding one would require a native rebuild. The OTP approach works entirely inside the app:

1. User requests a reset code by email.
2. Supabase emails a 6-digit code.
3. User enters the code plus a new password in-app.
4. `supabase.auth.verifyOtp({ email, token, type: 'recovery' })` validates the code and establishes a real session in the same step.
5. `supabase.auth.updateUser({ password })` sets the new password.

Because step 4 establishes a session, the existing `AuthContext` listener picks it up automatically and `AppNavigator` swaps to the Main stack — no navigation logic needed beyond the auth stack itself. The user is signed in immediately after reset (no separate "log in again" step).

## Screens

### `ForgotPasswordScreen`

- Single email input, styled identically to `LoginScreen`/`SignupScreen` (same `Colors`/`Spacing`/`BorderRadius` tokens, same input/button treatment).
- On submit: `supabase.auth.resetPasswordForEmail(email.trim())`.
- On success: navigate to `ResetPassword` with `{ email }` param.
- On error: show inline error text (reuses the existing `error` style pattern from `LoginScreen`).

### `ResetPasswordScreen`

- Route param: `{ email: string }`.
- Three inputs: 6-digit code, new password, confirm password.
- Client-side validation before submit: code non-empty, password non-empty, password === confirm, password meets Supabase's minimum length (6 chars) — surfaced as inline error text, not a blocking alert.
- On submit:
  1. `supabase.auth.verifyOtp({ email, token: code, type: 'recovery' })`. On error (bad/expired code), show inline error and let the user retry or go back to request a new code.
  2. On success, `supabase.auth.updateUser({ password: newPassword })`. On error, show inline error.
  3. On success, no explicit navigation is needed — the new session flows through `AuthContext` and `AppNavigator` renders `MainStack`.

## Navigation wiring

- `AuthStackParamList` (`src/navigation/types.ts`) gains:
  ```ts
  ForgotPassword: undefined;
  ResetPassword: { email: string };
  ```
- `AuthNavigator` in `src/navigation/AppNavigator.tsx` registers both new screens alongside `Login` and `Signup`.
- `LoginScreen` gets a "Forgot password?" link below the password input, navigating to `ForgotPassword`.

## Manual step (not code, out of this repo's control)

Supabase's default "Reset Password" email template must include `{{ .Token }}` (the 6-digit code), not just `{{ .ConfirmationURL }}`. This needs to be verified/edited in **Supabase Dashboard → Authentication → Email Templates → Reset Password**. This cannot be done from this session since Supabase MCP isn't authorized here — the user will handle it directly.

## Out of scope

- No deep linking / `app.json` `scheme` changes.
- No resend-cooldown UI or rate-limit handling beyond surfacing Supabase's own error message.
- No changes to `AppNavigator`'s top-level session-based routing logic.

## Testing

- Manual verification via the running app: request a code, check email delivery, enter code + new password, confirm auto sign-in into Main stack.
- Error paths to check manually: invalid email format, expired/wrong code, mismatched passwords, password too short.
