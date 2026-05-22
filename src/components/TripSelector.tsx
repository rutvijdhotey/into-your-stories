import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
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
    return (
      <View style={styles.singleRow}>
        <Text style={styles.singleLabel}>{activeTrips[0].name}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {activeTrips.map((trip) => {
        const selected = trip.id === selectedTripId;
        return (
          <Pressable
            key={trip.id}
            onPress={() => onSelect(trip.id)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
              {trip.name}
            </Text>
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
  emptyLabel: { ...Typography.body, color: Colors.textSecondary },
  link: { ...Typography.body, color: Colors.accent, fontWeight: '600' },
  singleRow: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  singleLabel: { ...Typography.heading, color: Colors.textPrimary },
  chips: { gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  chip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipLabel: { ...Typography.body, color: Colors.textSecondary },
  chipLabelSelected: { color: Colors.background, fontWeight: '600' },
});
