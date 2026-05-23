import { View, Text, StyleSheet } from 'react-native';
import { CategoryColors } from '../theme';
import type { Category } from '../services/noteHelpers';

type Props = { category: Category | null };

export default function CategoryBadge({ category }: Props) {
  if (!category) return null;
  const colors = CategoryColors[category] ?? CategoryColors['general'];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]}>{category}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
