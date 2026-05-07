# Phase 1: Project Scaffold + Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Expo (React Native, iOS) app with bottom-tab navigation, login and signup screens backed by Supabase Auth, and placeholder screens for all four main tabs.

**Architecture:** Expo managed workflow with TypeScript. Supabase handles auth (email + password). React Navigation v6 provides tab + stack routing. `AuthContext` wraps the entire app and gates the main tab navigator behind an active session.

**Tech Stack:** Expo SDK 52, TypeScript, React Navigation v6, @supabase/supabase-js v2, @react-native-async-storage/async-storage, react-native-url-polyfill

---

## File Map

Files created in this phase (all paths relative to repo root):

| File | Purpose |
|---|---|
| `App.tsx` | Root — wraps AuthProvider + AppNavigator |
| `src/theme/index.ts` | Color, typography, spacing constants |
| `src/lib/supabase.ts` | Supabase client singleton |
| `src/contexts/AuthContext.tsx` | Session state + signOut |
| `src/navigation/types.ts` | Navigation param list types |
| `src/navigation/AppNavigator.tsx` | Root navigator (auth stack vs tab) |
| `src/navigation/TabNavigator.tsx` | Bottom tab navigator (4 tabs) |
| `src/screens/auth/LoginScreen.tsx` | Email + password login |
| `src/screens/auth/SignupScreen.tsx` | Email + password signup |
| `src/screens/HomeScreen.tsx` | Placeholder — Phase 2 fills this in |
| `src/screens/DestinationsScreen.tsx` | Placeholder — Phase 6 fills this in |
| `src/screens/SearchScreen.tsx` | Placeholder — Phase 7 fills this in |
| `src/screens/BlogScreen.tsx` | Placeholder — Phase 8 fills this in |
| `__tests__/AuthContext.test.tsx` | Unit test for AuthContext |
| `.env` | EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY (gitignored) |
| `.env.example` | Template for .env, committed to repo |

---

## Task 1: Initialize Expo project

**Files:**
- Create: `App.tsx`, `app.json`, `babel.config.js`, `tsconfig.json`, `package.json`

- [ ] **Step 1: Scaffold the Expo project in the repo root**

From inside the `Into Your Stories` directory (the repo root — which already has `docs/` and `.git/`):

```bash
npx create-expo-app@latest . --template blank-typescript
```

When prompted about the existing directory, choose to continue. This overwrites `App.tsx` and creates the standard Expo files. The `docs/` folder is untouched.

- [ ] **Step 2: Verify the project starts**

```bash
npx expo start --ios
```

Expected: Metro bundler starts, Expo Go or simulator opens to a white screen with "Open up App.tsx to start working on your app!"

- [ ] **Step 3: Commit**

```bash
git add App.tsx app.json babel.config.js tsconfig.json package.json package-lock.json .gitignore
git commit -m "feat: initialize Expo project with TypeScript template"
```

---

## Task 2: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install all Phase 1 dependencies**

```bash
npx expo install \
  @react-navigation/native \
  @react-navigation/bottom-tabs \
  @react-navigation/native-stack \
  react-native-screens \
  react-native-safe-area-context \
  @supabase/supabase-js \
  @react-native-async-storage/async-storage \
  react-native-url-polyfill \
  @testing-library/react-native \
  @testing-library/jest-native
```

- [ ] **Step 2: Verify no install errors**

```bash
npx expo start --ios
```

Expected: App still opens with no red screen.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install navigation, supabase, and testing dependencies"
```

---

## Task 3: Create theme constants

**Files:**
- Create: `src/theme/index.ts`

- [ ] **Step 1: Create the theme file**

```bash
mkdir -p src/theme
```

Create `src/theme/index.ts`:

```typescript
export const Colors = {
  background: '#111111',
  surface: '#1C1C1E',
  accent: '#C8703A',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
  border: '#2C2C2E',
  error: '#FF453A',
  // Map pin colors per category
  food: '#FF9F0A',
  stay: '#30D158',
  activity: '#0A84FF',
  shopping: '#FF375F',
} as const;

export const Typography = {
  title: { fontSize: 28, fontWeight: '700' as const, color: Colors.textPrimary },
  heading: { fontSize: 20, fontWeight: '600' as const, color: Colors.textPrimary },
  body: { fontSize: 16, fontWeight: '400' as const, color: Colors.textPrimary },
  caption: { fontSize: 13, fontWeight: '400' as const, color: Colors.textSecondary },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/theme/index.ts
git commit -m "feat: add theme constants (colors, typography, spacing)"
```

---

## Task 4: Configure Supabase

**Files:**
- Create: `src/lib/supabase.ts`, `.env`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create a Supabase project (manual)**

1. Go to https://supabase.com and sign in.
2. Click **New project**. Name it `into-your-stories`. Choose a region close to you. Set a strong database password and save it somewhere safe.
3. Wait for provisioning (~1 min).
4. Go to **Project Settings → API**. Copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon public** key (the long JWT string)

- [ ] **Step 2: Create `.env`**

Create `.env` in the repo root (this file is gitignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace the placeholders with the values you copied.

- [ ] **Step 3: Create `.env.example`**

Create `.env.example` in the repo root:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 4: Ensure `.env` is gitignored**

Open `.gitignore` and confirm it contains:

```
.env
```

If not, add it.

- [ ] **Step 5: Create the Supabase client**

```bash
mkdir -p src/lib
```

Create `src/lib/supabase.ts`:

```typescript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 6: Verify the client loads without errors**

Temporarily import supabase in `App.tsx` and log it:

```typescript
import { supabase } from './src/lib/supabase';
console.log('Supabase ready:', !!supabase);
```

Run `npx expo start --ios`. Open Metro logs. Expected: `Supabase ready: true` (no crash, no undefined).

Remove the console.log and import from App.tsx when done.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase.ts .env.example .gitignore
git commit -m "feat: add Supabase client with AsyncStorage session persistence"
```

---

## Task 5: Create navigation types

**Files:**
- Create: `src/navigation/types.ts`

- [ ] **Step 1: Create the types file**

```bash
mkdir -p src/navigation
```

Create `src/navigation/types.ts`:

```typescript
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type TabParamList = {
  Home: undefined;
  Destinations: undefined;
  Search: undefined;
  Blog: undefined;
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type TabScreenProps<T extends keyof TabParamList> =
  BottomTabScreenProps<TabParamList, T>;
```

- [ ] **Step 2: Commit**

```bash
git add src/navigation/types.ts
git commit -m "feat: add navigation param list types"
```

---

## Task 6: Build AuthContext

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Create: `__tests__/AuthContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```bash
mkdir -p __tests__ src/contexts
```

Create `__tests__/AuthContext.test.tsx`:

```typescript
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signOut: jest.fn().mockResolvedValue({}),
    },
  },
}));

describe('useAuth', () => {
  it('provides null session and loading=false after init', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('throws when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within AuthProvider'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/AuthContext.test.tsx --verbose
```

Expected: FAIL — `Cannot find module '../src/contexts/AuthContext'`

- [ ] **Step 3: Implement AuthContext**

Create `src/contexts/AuthContext.tsx`:

```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/AuthContext.test.tsx --verbose
```

Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.tsx __tests__/AuthContext.test.tsx
git commit -m "feat: add AuthContext with session management and signOut"
```

---

## Task 7: Build placeholder screens

**Files:**
- Create: `src/screens/HomeScreen.tsx`
- Create: `src/screens/DestinationsScreen.tsx`
- Create: `src/screens/SearchScreen.tsx`
- Create: `src/screens/BlogScreen.tsx`

- [ ] **Step 1: Create all four placeholder screens**

```bash
mkdir -p src/screens
```

Create `src/screens/HomeScreen.tsx`:

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={Typography.heading}>Trips</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.md,
    paddingTop: 60,
  },
});
```

Create `src/screens/DestinationsScreen.tsx`:

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

export function DestinationsScreen() {
  return (
    <View style={styles.container}>
      <Text style={Typography.heading}>Destinations</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.md,
    paddingTop: 60,
  },
});
```

Create `src/screens/SearchScreen.tsx`:

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

export function SearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={Typography.heading}>Search</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.md,
    paddingTop: 60,
  },
});
```

Create `src/screens/BlogScreen.tsx`:

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

export function BlogScreen() {
  return (
    <View style={styles.container}>
      <Text style={Typography.heading}>Blog</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.md,
    paddingTop: 60,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/screens/HomeScreen.tsx src/screens/DestinationsScreen.tsx src/screens/SearchScreen.tsx src/screens/BlogScreen.tsx
git commit -m "feat: add placeholder screens for all four tabs"
```

---

## Task 8: Build TabNavigator

**Files:**
- Create: `src/navigation/TabNavigator.tsx`

- [ ] **Step 1: Create TabNavigator**

Create `src/navigation/TabNavigator.tsx`:

```typescript
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { DestinationsScreen } from '../screens/DestinationsScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { BlogScreen } from '../screens/BlogScreen';
import type { TabParamList } from './types';
import { Colors } from '../theme';

const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textSecondary,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Trips' }} />
      <Tab.Screen name="Destinations" component={DestinationsScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Blog" component={BlogScreen} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/navigation/TabNavigator.tsx
git commit -m "feat: add bottom tab navigator with all four tabs"
```

---

## Task 9: Build auth screens

**Files:**
- Create: `src/screens/auth/LoginScreen.tsx`
- Create: `src/screens/auth/SignupScreen.tsx`

- [ ] **Step 1: Create auth screens directory and LoginScreen**

```bash
mkdir -p src/screens/auth
```

Create `src/screens/auth/LoginScreen.tsx`:

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { AuthStackScreenProps } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing } from '../../theme';

type Props = AuthStackScreenProps<'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Login failed', error.message);
    // On success, AuthContext picks up the new session and AppNavigator switches to tabs.
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={[Typography.title, styles.title]}>Into Your Stories</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={Colors.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={Colors.textSecondary}
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign In'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={styles.link}>
        <Text style={Typography.caption}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  title: {
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: 16,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
  link: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
});
```

Create `src/screens/auth/SignupScreen.tsx`:

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { AuthStackScreenProps } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing } from '../../theme';

type Props = AuthStackScreenProps<'Signup'>;

export function SignupScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Signup failed', error.message);
    } else {
      Alert.alert(
        'Check your email',
        'We sent a confirmation link. Click it, then come back and sign in.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={[Typography.title, styles.title]}>Create Account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={Colors.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min 6 characters)"
        placeholderTextColor={Colors.textSecondary}
        secureTextEntry
        textContentType="newPassword"
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Sign Up'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
        <Text style={Typography.caption}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  title: {
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: 16,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  buttonText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
  link: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/screens/auth/LoginScreen.tsx src/screens/auth/SignupScreen.tsx
git commit -m "feat: add login and signup screens with Supabase auth"
```

---

## Task 10: Build AppNavigator

**Files:**
- Create: `src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Create AppNavigator**

Create `src/navigation/AppNavigator.tsx`:

```typescript
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignupScreen } from '../screens/auth/SignupScreen';
import { TabNavigator } from './TabNavigator';
import type { AuthStackParamList } from './types';
import { Colors } from '../theme';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

export function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session ? (
        <TabNavigator />
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Signup" component={SignupScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/navigation/AppNavigator.tsx
git commit -m "feat: add root navigator gating tabs behind auth session"
```

---

## Task 11: Wire App.tsx

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Replace App.tsx content**

Replace the entire contents of `App.tsx` with:

```typescript
import React from 'react';
import { AuthProvider } from './src/contexts/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Run and verify**

```bash
npx expo start --ios
```

Expected: App opens to a dark Login screen with "Into Your Stories" title, email + password fields, and a "Sign In" button. Tapping "Sign up" navigates to the Signup screen.

- [ ] **Step 3: Commit**

```bash
git add App.tsx
git commit -m "feat: wire AuthProvider and AppNavigator into App.tsx"
```

---

## Task 12: Manual end-to-end test

No code changes — verification only.

- [ ] **Step 1: Create a test account**

1. Open the simulator.
2. On the Signup screen, enter `test@example.com` and a password of at least 6 characters.
3. Tap **Sign Up**.
4. Expected: Alert saying "Check your email".

- [ ] **Step 2: Confirm email in Supabase dashboard**

1. Go to your Supabase project → **Authentication → Users**.
2. Find `test@example.com`. Click the three-dot menu → **Send confirmation email** (or manually confirm in the dashboard by toggling the "Email confirmed" flag).

- [ ] **Step 3: Log in**

1. Back in the simulator, tap "Already have an account? Sign in."
2. Enter the same email and password.
3. Tap **Sign In**.
4. Expected: App transitions to the tab navigator. Four tabs visible at the bottom: Trips, Destinations, Search, Blog. Each tab shows its placeholder screen.

- [ ] **Step 4: Test tab navigation**

Tap each tab. Expected: Each navigates to its placeholder screen with the correct title (Trips, Destinations, Search, Blog) on a dark background.

- [ ] **Step 5: Test session persistence**

Force-quit the simulator app and reopen it. Expected: App opens directly to the tab navigator — not the login screen — because the session is persisted via AsyncStorage.

- [ ] **Step 6: Test sign out (manual, in-app)**

For now there is no sign-out button — that comes in Phase 2 (settings / profile). To test it manually:

In `src/screens/HomeScreen.tsx`, temporarily add a sign-out button:

```typescript
import { useAuth } from '../contexts/AuthContext';
import { TouchableOpacity } from 'react-native';

// Inside HomeScreen:
const { signOut } = useAuth();
// Add below the Trips text:
<TouchableOpacity onPress={signOut}>
  <Text style={Typography.caption}>Sign out</Text>
</TouchableOpacity>
```

Tap it. Expected: App returns to the Login screen. Remove the temporary button after confirming, and commit the reverted `HomeScreen.tsx`.

- [ ] **Step 7: Final commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "chore: revert temp sign-out button from HomeScreen after testing"
```

---

## Phase 1 Complete

The app now:
- Runs on iOS simulator
- Shows a dark-mode Login screen on first launch
- Creates accounts via Supabase Auth
- Logs in and routes to the bottom-tab navigator
- Persists the session across app restarts
- Has placeholder screens for all four tabs

**Next:** Write and execute the Phase 2 plan — Trip CRUD + Home screen.
