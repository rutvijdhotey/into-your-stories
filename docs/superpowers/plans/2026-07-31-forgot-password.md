# Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user who forgot their password recover their account entirely inside the app, using an emailed 6-digit OTP code instead of a magic link.

**Architecture:** Two new auth-stack screens (`ForgotPasswordScreen`, `ResetPasswordScreen`) added alongside the existing `LoginScreen`/`SignupScreen`, wired into the existing `AuthNavigator`. `ResetPasswordScreen` uses `supabase.auth.verifyOtp({ type: 'recovery' })` to both validate the code and establish a session in one call, then `supabase.auth.updateUser({ password })` to set the new password. The existing `AuthContext` session listener + `AppNavigator`'s session check handle the post-reset transition into the Main stack automatically — no changes needed there.

**Tech Stack:** React Native (Expo), `@supabase/supabase-js`, `@react-navigation/native-stack`, Jest (for the one pure-logic unit under test).

Design doc: `docs/superpowers/specs/2026-07-31-forgot-password-design.md`

---

### Task 1: Reset-password validation helper (TDD)

Pure validation logic, following this codebase's convention of testing logic in `src/services/*Helpers.ts` files (see `src/services/tripHelpers.ts` + `src/services/__tests__/tripHelpers.test.ts`) rather than testing screens directly (no existing screen in `src/screens/auth/` has a test).

**Files:**
- Create: `src/services/authHelpers.ts`
- Test: `src/services/__tests__/authHelpers.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/services/__tests__/authHelpers.test.ts`:

```ts
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/authHelpers.test.ts`
Expected: FAIL — `Cannot find module '../authHelpers'`

- [x] **Step 3: Write minimal implementation**

Create `src/services/authHelpers.ts`:

```ts
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/authHelpers.test.ts`
Expected: PASS (5 tests)

- [x] **Step 5: Commit**

```bash
git add src/services/authHelpers.ts src/services/__tests__/authHelpers.test.ts
git commit -m "feat: add reset-password input validation helper"
```

---

### Task 2: Auth navigation types

**Files:**
- Modify: `src/navigation/types.ts:3-6`

- [x] **Step 1: Add the two new routes to `AuthStackParamList`**

Replace:

```ts
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};
```

With:

```ts
export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};
```

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (Tasks 3–4 create the screens these types reference; this step will show "unused" nothing since types alone don't break anything — just confirm the file itself has no syntax errors)

- [x] **Step 3: Commit**

```bash
git add src/navigation/types.ts
git commit -m "feat: add ForgotPassword/ResetPassword routes to auth stack types"
```

---

### Task 3: `ForgotPasswordScreen`

**Files:**
- Create: `src/screens/auth/ForgotPasswordScreen.tsx`

- [x] **Step 1: Create the screen**

```tsx
import { useState } from 'react';
import {
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, BorderRadius } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    const trimmedEmail = email.trim();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    navigation.navigate('ResetPassword', { email: trimmedEmail });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.eyebrow}>NOTEBOUND</Text>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.tagline}>We'll email you a code to get back in.</Text>

        <TextInput
          style={[styles.input, focused && styles.inputFocused]}
          placeholder="Email"
          placeholderTextColor="#555555"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (loading || !email) && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={loading || !email}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : (
            <Text style={styles.buttonText}>Send code</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={styles.linkWrap}>
          <Text style={styles.linkText}>
            Remembered it? <Text style={styles.linkAccent}>Sign in →</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.accent,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  tagline: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: Colors.textPrimary,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.md,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputFocused: { borderColor: Colors.accent },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.button,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  error: { color: Colors.error, marginBottom: Spacing.sm, fontSize: 14 },
  linkWrap: { alignItems: 'center', marginTop: Spacing.lg },
  linkText: { fontSize: 14, color: '#555555' },
  linkAccent: { color: Colors.accent, fontWeight: '600' },
});
```

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from this file (it will still show an error that `'ForgotPassword'` isn't a registered screen anywhere yet — that's expected and resolved in Task 5)

- [x] **Step 3: Commit**

```bash
git add src/screens/auth/ForgotPasswordScreen.tsx
git commit -m "feat: add ForgotPasswordScreen"
```

---

### Task 4: `ResetPasswordScreen`

**Files:**
- Create: `src/screens/auth/ResetPasswordScreen.tsx`

- [x] **Step 1: Create the screen**

```tsx
import { useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { validateResetPasswordInput } from '../../services/authHelpers';
import { Colors, Spacing, BorderRadius } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);

    const validationError = validateResetPasswordInput({ code, password, confirmPassword });
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'recovery',
    });
    if (verifyError) {
      setLoading(false);
      setError(verifyError.message);
      return;
    }

    // verifyOtp already established a session, which AuthContext picks up and
    // may navigate away from this screen before updateUser resolves. If the
    // password update then fails, the user would otherwise land in the app
    // believing their password changed when it didn't. Sign back out and use
    // a blocking alert (works even if this screen has already unmounted)
    // instead of inline error state, which could go unseen.
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      await supabase.auth.signOut();
      Alert.alert(
        'Password reset failed',
        `${updateError.message} Please request a new code and try again.`
      );
    }
  };

  const canSubmit = !!code && !!password && !!confirmPassword && !loading;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.eyebrow}>NOTEBOUND</Text>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.tagline}>Enter the code we sent to {email} and choose a new password.</Text>

        <TextInput
          style={[styles.input, focusedField === 'code' && styles.inputFocused]}
          placeholder="6-digit code"
          placeholderTextColor="#555555"
          autoCapitalize="none"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
          onFocus={() => setFocusedField('code')}
          onBlur={() => setFocusedField(null)}
        />
        <TextInput
          style={[styles.input, focusedField === 'password' && styles.inputFocused]}
          placeholder="New password"
          placeholderTextColor="#555555"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
        />
        <TextInput
          style={[styles.input, focusedField === 'confirm' && styles.inputFocused]}
          placeholder="Confirm new password"
          placeholderTextColor="#555555"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          onFocus={() => setFocusedField('confirm')}
          onBlur={() => setFocusedField(null)}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : (
            <Text style={styles.buttonText}>Reset password</Text>
          )}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={styles.linkWrap}>
          <Text style={styles.linkText}>
            Didn't get a code? <Text style={styles.linkAccent}>Try again →</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: Spacing.lg, justifyContent: 'center' },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.accent,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  tagline: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: Colors.textPrimary,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.md,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputFocused: { borderColor: Colors.accent },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.button,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  error: { color: Colors.error, marginBottom: Spacing.sm, fontSize: 14 },
  linkWrap: { alignItems: 'center', marginTop: Spacing.lg },
  linkText: { fontSize: 14, color: '#555555' },
  linkAccent: { color: Colors.accent, fontWeight: '600' },
});
```

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from this file

- [x] **Step 3: Commit**

```bash
git add src/screens/auth/ResetPasswordScreen.tsx
git commit -m "feat: add ResetPasswordScreen"
```

---

### Task 5: Wire the new screens into `AuthNavigator`

**Files:**
- Modify: `src/navigation/AppNavigator.tsx:1-19`

- [x] **Step 1: Register the two new screens**

Replace:

```tsx
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import MainStack from './MainStack';
import type { AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}
```

With:

```tsx
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import MainStack from './MainStack';
import type { AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </AuthStack.Navigator>
  );
}
```

- [x] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the auth stack (this resolves the "unregistered screen" errors from Tasks 3–4)

- [x] **Step 3: Commit**

```bash
git add src/navigation/AppNavigator.tsx
git commit -m "feat: register ForgotPassword/ResetPassword screens in auth stack"
```

---

### Task 6: Add "Forgot password?" link to `LoginScreen`

**Files:**
- Modify: `src/screens/auth/LoginScreen.tsx:60-69` (add link after the password input)
- Modify: `src/screens/auth/LoginScreen.tsx` styles (add two new style entries)

- [x] **Step 1: Add the link after the password `TextInput`**

Replace:

```tsx
        <TextInput
          style={[styles.input, focusedField === 'password' && styles.inputFocused]}
          placeholder="Password"
          placeholderTextColor="#555555"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
        />

        {error && <Text style={styles.error}>{error}</Text>}
```

With:

```tsx
        <TextInput
          style={[styles.input, focusedField === 'password' && styles.inputFocused]}
          placeholder="Password"
          placeholderTextColor="#555555"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
        />

        <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotWrap}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}
```

- [x] **Step 2: Add the two new styles**

Replace:

```tsx
  inputFocused: { borderColor: Colors.accent },
  button: {
```

With:

```tsx
  inputFocused: { borderColor: Colors.accent },
  forgotWrap: { alignItems: 'flex-end', marginBottom: Spacing.sm },
  forgotText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  button: {
```

- [x] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [x] **Step 4: Commit**

```bash
git add src/screens/auth/LoginScreen.tsx
git commit -m "feat: link to forgot-password flow from LoginScreen"
```

---

### Task 7: Manual end-to-end verification

Not a code change — confirms the flow actually works against the real Supabase project. Requires the local dev build (`npm run ios`, per project convention — not `npm start`).

- [ ] **Step 1: Fix the Supabase email template — CONFIRMED BLOCKING (2026-08-07)**

Checked 2026-08-07: the live template contains **only `{{ .ConfirmationURL }}`, no `{{ .Token }}`**, so the 6-digit code never reaches the user and `verifyOtp` has nothing to verify. The flow cannot work until this is changed. This is a dashboard change outside this repo — see the design doc's "Manual step" section.

In Supabase Dashboard → Authentication → Email Templates → Reset Password, replace the body with:

```html
<h2 style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Reset your password</h2>

<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;">
  Enter this code in Notebound to set a new password:
</p>

<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:32px;font-weight:700;letter-spacing:6px;color:#C8703A;margin:24px 0;">
  {{ .Token }}
</p>

<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.5;color:#666666;">
  This code expires in 1 hour. If you didn't request a password reset, you can ignore this email — your password won't change.
</p>
```

**Why the link is removed rather than kept alongside the code:** the link and the code are the same one-time token. `ConfirmationURL` points at Supabase's `/auth/v1/verify` endpoint, which consumes the token on visit — so a user who taps the link first then gets "Token has expired or is invalid" when they type the code, with no clue why. The link is also a dead end: the app has no URL `scheme` (that's why this flow is OTP-based at all), so it redirects to the Site URL in a mobile browser.

Also confirm while in the dashboard:
- **Authentication → Email OTP Expiration** matches the "expires in 1 hour" copy above.
- **Site URL** is not still the `localhost:3000` default — it doesn't affect this flow, but the signup confirmation email (`SignupScreen.tsx:45`) redirects there, so testers land on a dead page and assume signup failed.

- [ ] **Step 2: Run the app**

```bash
npm run ios
```

- [ ] **Step 3: Walk the happy path**

From the Login screen, tap "Forgot password?" → enter a real test account's email → submit → confirm the email arrives with a 6-digit code → enter the code plus a new password on the Reset screen → submit → confirm the app transitions straight into the Main stack (auto sign-in).

- [ ] **Step 4: Walk the error paths**

- Submit an invalid/malformed email on `ForgotPasswordScreen` → confirm Supabase's error surfaces inline.
- On `ResetPasswordScreen`, submit with an empty code → confirm "Enter the code we emailed you." shows without hitting the network.
- Submit mismatched passwords → confirm "Passwords don't match." shows without hitting the network.
- Submit a wrong/expired code → confirm Supabase's error surfaces inline and the screen stays usable (can retry or go back via "Try again").

- [ ] **Step 5: Confirm sign in still works normally**

Sign out, then sign in with the new password on `LoginScreen` to confirm the reset actually took effect server-side.
