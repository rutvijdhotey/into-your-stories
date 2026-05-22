import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import { useAuth } from '../contexts/AuthContext';

export default function HomeScreen() {
  const { signOut } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
      <Text style={styles.body}>Your trips will live here.</Text>
      <Pressable style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { ...Typography.title, marginBottom: Spacing.sm },
  body: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xl },
  signOut: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  signOutText: { ...Typography.body, color: Colors.accent },
});
