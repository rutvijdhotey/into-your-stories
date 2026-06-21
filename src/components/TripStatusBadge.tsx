import { View, Text, StyleSheet } from 'react-native';
import type { TripStatus } from '../services/tripHelpers';

type Props = {
  status: TripStatus;
  overdue?: boolean;
};

export default function TripStatusBadge({ status, overdue = false }: Props) {
  const label =
    status === 'completed' ? 'Completed' : overdue ? 'Overdue' : 'Active';
  const bgColor =
    status === 'completed'
      ? 'rgba(28,28,30,0.92)'
      : overdue
      ? 'rgba(255,69,58,0.9)'
      : 'rgba(52,199,89,0.92)';

  return (
    <View style={[styles.base, { backgroundColor: bgColor }]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
