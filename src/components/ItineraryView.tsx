import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../theme';
import CategoryBadge from './CategoryBadge';
import { formatBlogDate, type Itinerary, type TimeOfDay } from '../services/blogHelpers';

const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export default function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
  return (
    <View style={styles.container}>
      {itinerary.map((day) => (
        <View key={day.day} style={styles.card}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayNumber}>Day {day.day}</Text>
            {day.date ? <Text style={styles.dayDate}>{formatBlogDate(day.date)}</Text> : null}
          </View>
          {day.title ? <Text style={styles.dayTitle}>{day.title}</Text> : null}
          {day.stops.map((stop, i) => (
            <View key={i} style={styles.stop}>
              {stop.time_of_day ? (
                <Text style={styles.timeLabel}>{TIME_LABELS[stop.time_of_day]}</Text>
              ) : null}
              <View style={styles.stopHeader}>
                <Text style={styles.placeName}>{stop.place_name}</Text>
                <CategoryBadge category={stop.category} />
              </View>
              {stop.description ? <Text style={styles.description}>{stop.description}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  dayNumber: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: Colors.accent, textTransform: 'uppercase' },
  dayDate: { fontSize: 12, color: Colors.textSecondary },
  dayTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  stop: {
    gap: 2,
    paddingTop: Spacing.sm,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  timeLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  placeName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
});
