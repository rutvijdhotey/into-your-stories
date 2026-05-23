import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native';
import { Colors, Spacing } from '../theme';
import type { Trip } from '../services/tripHelpers';

type Props = {
  activeTrips: Trip[];
  selectedTripId: string | null;
  onSelect: (tripId: string) => void;
  onStartTrip: () => void;
};

export default function TripSelector({
  activeTrips,
  selectedTripId,
  onSelect,
  onStartTrip,
}: Props) {
  if (activeTrips.length === 0) {
    return (
      <View style={styles.emptyRow}>
        <Text style={styles.emptyLabel}>No active trips.</Text>
        <Pressable onPress={onStartTrip} accessibilityRole="button">
          <Text style={styles.link}>Start one →</Text>
        </Pressable>
      </View>
    );
  }

  if (activeTrips.length === 1) {
    const trip = activeTrips[0];
    const dest = trip.destinations.length > 0 ? trip.destinations[0] : null;
    return (
      <View style={styles.singleCard}>
        <Text style={styles.singleName}>{trip.name}</Text>
        {dest ? <Text style={styles.singleDest}>{dest}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.chips}
    >
      {activeTrips.map((trip) => {
        const selected = trip.id === selectedTripId;
        const dest = trip.destinations.length > 0 ? trip.destinations[0] : null;
        return (
          <Pressable
            key={trip.id}
            onPress={() => onSelect(trip.id)}
            style={[styles.card, selected && styles.cardSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.tripName, selected && styles.tripNameSelected]}>
              {trip.name}
            </Text>
            {dest ? <Text style={styles.tripDest}>{dest}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyLabel: { fontSize: 14, color: Colors.textSecondary },
  link: { fontSize: 14, color: Colors.accent, fontWeight: '600' },
  singleCard: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  singleName: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
  singleDest: { fontSize: 9, color: '#555555', marginTop: 2 },
  scroll: { flexGrow: 0 },
  chips: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  card: {
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    minWidth: 110,
  },
  cardSelected: {
    borderWidth: 1.5,
    borderColor: Colors.accent,
    backgroundColor: 'rgba(200,112,58,0.15)',
  },
  tripName: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
  tripNameSelected: { color: Colors.accent },
  tripDest: { fontSize: 9, color: '#555555', marginTop: 2 },
});
