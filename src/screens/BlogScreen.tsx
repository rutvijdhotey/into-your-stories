import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';

export default function BlogScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>BLOG</Text>
        <Text style={styles.heading}>Your Stories</Text>
      </View>

      <Text style={styles.sectionLabel}>DRAFTS</Text>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyCardText}>No drafts yet</Text>
      </View>

      <Text style={styles.sectionLabel}>PUBLISHED</Text>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyCardText}>Nothing published yet</Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={styles.generateButton}
          onPress={() => Alert.alert('Generate Blog', 'Blog generation lands in Phase 9.')}
        >
          <Text style={styles.generateButtonLabel}>Generate Blog</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heading: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  sectionLabel: {
    ...Typography.label,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  emptyCardText: { fontSize: 14, color: '#555555' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  generateButton: {
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  generateButtonLabel: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
});
