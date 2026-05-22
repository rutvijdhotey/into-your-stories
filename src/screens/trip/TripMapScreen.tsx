import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';

export default function TripMapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Map</Text>
      <Text style={styles.body}>Apple Maps with categorized pins lands in Phase 7.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  title: { ...Typography.heading, marginBottom: Spacing.sm },
  body: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
});
