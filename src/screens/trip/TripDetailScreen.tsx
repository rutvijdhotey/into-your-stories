import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';
import { Colors, Spacing, Typography } from '../../theme';
import { useTripDetail } from '../../hooks/useTripDetail';
import { endTrip } from '../../services/tripService';
import { formatDateRange, isOverdueActive } from '../../services/tripHelpers';
import TripStatusBadge from '../../components/TripStatusBadge';
import TripFeedScreen from './TripFeedScreen';
import TripMapScreen from './TripMapScreen';

type Props = NativeStackScreenProps<MainStackParamList, 'TripDetail'>;

type Tab = 'feed' | 'map';

export default function TripDetailScreen({ route }: Props) {
  const { tripId } = route.params;
  const { trip, loading } = useTripDetail(tripId);
  const [tab, setTab] = useState<Tab>('feed');
  const [ending, setEnding] = useState(false);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.loading}>
        <Text style={styles.body}>This trip is no longer available.</Text>
      </View>
    );
  }

  const overdue = isOverdueActive(trip);
  const destinations = trip.destinations.length > 0 ? trip.destinations.join(', ') : 'No destination yet';

  const handleEndTrip = () => {
    Alert.alert(
      'End trip?',
      'You will not be able to add more notes to this trip once it is ended.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End trip',
          style: 'destructive',
          onPress: async () => {
            setEnding(true);
            try {
              await endTrip(trip.id);
            } catch (e) {
              Alert.alert('Could not end trip', (e as Error).message);
            } finally {
              setEnding(false);
            }
          },
        },
      ],
    );
  };

  const handleGenerateBlog = () => {
    Alert.alert('Generate Blog', 'Blog generation lands in Phase 9.');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{trip.name}</Text>
        <Text style={styles.destinations}>{destinations}</Text>
        <Text style={styles.dates}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
        <View style={styles.headerActions}>
          <TripStatusBadge status={trip.status} overdue={overdue} />
          {trip.status === 'active' ? (
            <Pressable style={styles.endButton} onPress={handleEndTrip} disabled={ending}>
              <Text style={styles.endButtonLabel}>{ending ? 'Ending...' : 'End Trip'}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.generateButton} onPress={handleGenerateBlog}>
              <Text style={styles.generateButtonLabel}>Generate Blog</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.tabBar}>
        <Pressable style={[styles.tab, tab === 'feed' && styles.tabActive]} onPress={() => setTab('feed')}>
          <Text style={[styles.tabLabel, tab === 'feed' && styles.tabLabelActive]}>Feed</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'map' && styles.tabActive]} onPress={() => setTab('map')}>
          <Text style={[styles.tabLabel, tab === 'map' && styles.tabLabelActive]}>Map</Text>
        </Pressable>
      </View>

      <View style={styles.tabBody}>
        {tab === 'feed' ? <TripFeedScreen tripId={tripId} /> : <TripMapScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  body: { ...Typography.body, color: Colors.textSecondary },
  header: {
    padding: Spacing.md,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { ...Typography.title, marginBottom: Spacing.xs },
  destinations: { ...Typography.body, color: Colors.textSecondary, marginBottom: Spacing.xs },
  dates: { ...Typography.caption, marginBottom: Spacing.sm },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  endButton: {
    borderColor: Colors.error,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  endButtonLabel: { ...Typography.body, color: Colors.error, fontWeight: '600' },
  generateButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  generateButtonLabel: { ...Typography.body, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  tabActive: { borderBottomColor: Colors.accent, borderBottomWidth: 2 },
  tabLabel: { ...Typography.body, color: Colors.textSecondary },
  tabLabelActive: { color: Colors.textPrimary, fontWeight: '600' },
  tabBody: { flex: 1 },
});
