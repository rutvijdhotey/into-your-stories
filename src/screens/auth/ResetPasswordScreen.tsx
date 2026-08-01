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
