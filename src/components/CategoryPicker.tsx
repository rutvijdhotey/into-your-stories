import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { CATEGORIES, categoryLabel, type Category } from '../services/noteHelpers';
import { Colors, Spacing, Typography } from '../theme';

type Props = {
  value: Category | null;
  onChange: (next: Category | null) => void;
};

export default function CategoryPicker({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {CATEGORIES.map((c) => {
        const selected = c === value;
        return (
          <Pressable
            key={c}
            onPress={() => onChange(selected ? null : c)}
            style={[styles.pill, selected && styles.pillSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Category ${categoryLabel(c)}`}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {categoryLabel(c)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.md, gap: Spacing.sm, paddingVertical: Spacing.sm },
  pill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  label: { ...Typography.body, color: Colors.textSecondary },
  labelSelected: { color: Colors.background, fontWeight: '600' },
});
