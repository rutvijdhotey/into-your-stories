import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import type { TripStatus } from '../services/tripHelpers';

type Props = {
  status: TripStatus;
  overdue?: boolean;
};

export default function TripStatusBadge({ status, overdue = false }: Props) {
  const label = status === 'active' ? (overdue ? 'Active · past end date' : 'Active') : 'Completed';
  const tone = status === 'active' ? styles.active : styles.completed;
  return (
    <View style={[styles.base, tone]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  active: { backgroundColor: Colors.accent },
  completed: { backgroundColor: Colors.border },
  label: { ...Typography.caption, color: Colors.textPrimary, fontWeight: '600' },
});
