import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';

export default function TripFeedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Feed</Text>
      <Text style={styles.body}>Notes will appear here in Phase 3.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  title: { ...Typography.heading, marginBottom: Spacing.sm },
  body: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
});
