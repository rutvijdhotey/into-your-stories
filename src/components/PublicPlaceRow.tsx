import { Pressable, View, Text, StyleSheet } from 'react-native';
import CategoryBadge from './CategoryBadge';
import { avgRating, type PublicPlace } from '../services/publicPlaceHelpers';
import { Colors, Spacing, Typography } from '../theme';

type Props = { place: PublicPlace; onPress: () => void };

export default function PublicPlaceRow({ place, onPress }: Props) {
  const avg = avgRating(place.rating_sum, place.rating_count);
  const visitLabel = `${place.visit_count} ${place.visit_count === 1 ? 'visit' : 'visits'}`;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        <Text style={styles.name} numberOfLines={1}>{place.place_name}</Text>
        <View style={styles.meta}>
          <CategoryBadge category={place.dominant_category} />
          <Text style={styles.visits}>{visitLabel}</Text>
        </View>
      </View>
      {avg != null && <Text style={styles.rating}>{`★ ${avg.toFixed(1)}`}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  left: { flex: 1, gap: 4 },
  name: { ...Typography.body, fontWeight: '600', color: Colors.textPrimary },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  visits: { ...Typography.caption, color: Colors.textSecondary },
  rating: { fontSize: 15, fontWeight: '700', color: Colors.accent },
});
