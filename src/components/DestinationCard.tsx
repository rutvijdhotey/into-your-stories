import { Pressable, View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, CategoryColors, Shadows, getTripGradient } from '../theme';
import type { Destination } from '../services/publicPlaceHelpers';

type Props = { destination: Destination; onPress: () => void };

export default function DestinationCard({ destination, onPress }: Props) {
  const { city, place_count, total_visits, categories } = destination;
  const placeLabel = `${place_count} ${place_count === 1 ? 'place' : 'places'}`;
  const visitLabel = `${total_visits} ${total_visits === 1 ? 'visit' : 'visits'}`;
  // Deterministic per-city gradient (same hash-based palette Home's TripCard uses),
  // so each destination reads as a distinct color and Paris is always Paris.
  const gradient = getTripGradient(city);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <Text style={styles.city} numberOfLines={1}>{city}</Text>
        <View>
          <Text style={styles.meta}>{`${placeLabel} · ${visitLabel}`}</Text>
          <View style={styles.dots}>
            {categories.map((c) => (
              <View
                key={c}
                style={[styles.dot, { backgroundColor: (CategoryColors[c] ?? CategoryColors.general).text }]}
              />
            ))}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 110,
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    ...Shadows.card,
  },
  content: { flex: 1, padding: Spacing.md, justifyContent: 'space-between' },
  city: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  meta: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  dots: { flexDirection: 'row', gap: 6, marginTop: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
