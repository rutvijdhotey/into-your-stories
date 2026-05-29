import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';
import { Colors, Spacing, getTripGradient } from '../../theme';
import { useTripDetail } from '../../hooks/useTripDetail';
import { endTrip } from '../../services/tripService';
import { formatDateRange, isOverdueActive } from '../../services/tripHelpers';
import TripStatusBadge from '../../components/TripStatusBadge';
import TripFeedScreen from './TripFeedScreen';
import TripMapScreen from './TripMapScreen';
import { useAuth } from '../../contexts/AuthContext';
import { generateBlog } from '../../services/blogService';

type Props = NativeStackScreenProps<MainStackParamList, 'TripDetail'>;

type Tab = 'feed' | 'map';

export default function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { trip, loading } = useTripDetail(tripId);
  const [tab, setTab] = useState<Tab>('feed');
  const [ending, setEnding] = useState(false);
  const { session } = useAuth();
  const [generatingBlog, setGeneratingBlog] = useState(false);

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
        <Text style={styles.bodyText}>This trip is no longer available.</Text>
      </View>
    );
  }

  const overdue = isOverdueActive(trip);
  const destinations =
    trip.destinations.length > 0 ? trip.destinations.join(', ') : 'No destination yet';
  const gradient = getTripGradient(trip.name);

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

  const handleGenerateBlog = async () => {
    const userId = session?.user.id;
    if (!userId) return;
    setGeneratingBlog(true);
    try {
      const postId = await generateBlog(trip.id, userId);
      if (postId) {
        navigation.navigate('BlogPost', { postId });
      } else {
        Alert.alert('Could not start generation', 'Please try again.');
      }
    } finally {
      setGeneratingBlog(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerScrim}
        />
        <View style={styles.headerContent}>
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
              <Pressable
                style={styles.generateButton}
                onPress={handleGenerateBlog}
                disabled={generatingBlog}
              >
                <Text style={styles.generateButtonLabel}>
                  {generatingBlog ? 'Starting…' : 'Generate Blog'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, tab === 'feed' && styles.tabActive]}
          onPress={() => setTab('feed')}
        >
          <Text style={[styles.tabLabel, tab === 'feed' && styles.tabLabelActive]}>Feed</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'map' && styles.tabActive]}
          onPress={() => setTab('map')}
        >
          <Text style={[styles.tabLabel, tab === 'map' && styles.tabLabelActive]}>Map</Text>
        </Pressable>
      </View>

      <View style={styles.tabBody}>
        {tab === 'feed' ? <TripFeedScreen tripId={tripId} /> : <TripMapScreen tripId={tripId} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  bodyText: { fontSize: 16, color: Colors.textSecondary },
  header: { height: 160, overflow: 'hidden' },
  headerScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
  },
  headerContent: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
  },
  name: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 2 },
  destinations: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  dates: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: Spacing.sm },
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
  endButtonLabel: { fontSize: 14, color: Colors.error, fontWeight: '600' },
  generateButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
  },
  generateButtonLabel: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  tabBar: {
    flexDirection: 'row',
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: Colors.background,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center' },
  tabActive: { borderBottomColor: Colors.accent, borderBottomWidth: 2 },
  tabLabel: { fontSize: 15, fontWeight: '500', color: '#555555' },
  tabLabelActive: { fontWeight: '700', color: Colors.textPrimary },
  tabBody: { flex: 1 },
});
