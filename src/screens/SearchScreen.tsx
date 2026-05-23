import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchPlaceholder}>Search notes and stories</Text>
          <Text style={styles.micIcon}>🎙️</Text>
        </View>
      </View>
      <Text style={styles.sectionLabel}>YOUR NOTES</Text>
      <Text style={styles.emptyHint}>Search to find your notes</Text>
      <Text style={styles.sectionLabel}>COMMUNITY</Text>
      <Text style={styles.emptyHint}>Search community stories</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.button,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  searchIcon: { fontSize: 16 },
  searchPlaceholder: { fontSize: 15, color: '#555555', flex: 1 },
  micIcon: { fontSize: 16 },
  sectionLabel: {
    ...Typography.label,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyHint: { fontSize: 14, color: '#555555', paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg },
});
