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
