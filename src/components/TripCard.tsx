import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import TripStatusBadge from './TripStatusBadge';
import { formatDateRange, isOverdueActive, type Trip } from '../services/tripHelpers';

type Props = {
  trip: Trip;
  onPress: () => void;
  onLongPress: () => void;
};

export default function TripCard({ trip, onPress, onLongPress }: Props) {
  const overdue = isOverdueActive(trip);
  const destinations = trip.destinations.length > 0 ? trip.destinations.join(', ') : 'No destination yet';
  const noteCountLabel = `${trip.note_count} ${trip.note_count === 1 ? 'note' : 'notes'}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <View style={styles.coverPlaceholder} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
          <TripStatusBadge status={trip.status} overdue={overdue} />
        </View>
        <Text style={styles.destinations} numberOfLines={1}>{destinations}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.meta}>{noteCountLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  cardPressed: { opacity: 0.7 },
  coverPlaceholder: {
    height: 120,
    backgroundColor: Colors.border,
  },
  body: { padding: Spacing.md },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  name: { ...Typography.heading, flexShrink: 1 },
  destinations: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  meta: { ...Typography.caption },
  metaDot: { ...Typography.caption, color: Colors.textSecondary },
});
