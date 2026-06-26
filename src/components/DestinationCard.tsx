import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius, CategoryColors, Shadows } from '../theme';
import type { Destination } from '../services/publicPlaceHelpers';

type Props = { destination: Destination; onPress: () => void };

export default function DestinationCard({ destination, onPress }: Props) {
  const { city, place_count, total_visits, categories } = destination;
  const placeLabel = `${place_count} ${place_count === 1 ? 'place' : 'places'}`;
  const visitLabel = `${total_visits} ${total_visits === 1 ? 'visit' : 'visits'}`;
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.city} numberOfLines={1}>{city}</Text>
      <Text style={styles.meta}>{`${placeLabel} · ${visitLabel}`}</Text>
      <View style={styles.dots}>
        {categories.map((c) => (
          <View
            key={c}
            style={[styles.dot, { backgroundColor: (CategoryColors[c] ?? CategoryColors.general).text }]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 110,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    justifyContent: 'space-between',
    ...Shadows.card,
  },
  city: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  meta: { ...Typography.caption, color: Colors.textSecondary, marginTop: 4 },
  dots: { flexDirection: 'row', gap: 6, marginTop: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
