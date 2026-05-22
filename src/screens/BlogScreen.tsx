import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';

export default function BlogScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Blog</Text>
      <Text style={styles.body}>Your drafts and published posts.</Text>
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
