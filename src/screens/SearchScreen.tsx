import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';

export default function SearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Search</Text>
      <Text style={styles.body}>Unified semantic search across personal notes and community posts.</Text>
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
  body: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
});
