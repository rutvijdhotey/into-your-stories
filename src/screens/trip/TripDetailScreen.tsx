import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';
import { Colors, Spacing, getTripGradient } from '../../theme';
import { useTripDetail } from '../../hooks/useTripDetail';
import { endTrip } from '../../services/tripService';
import { formatDateRange, isOverdueActive } from '../../services/tripHelpers';
import TripStatusBadge from '../../components/TripStatusBadge';
import GradientButton from '../../components/GradientButton';
import TripFeedScreen from './TripFeedScreen';
import TripMapScreen from './TripMapScreen';
import { useAuth } from '../../contexts/AuthContext';
import { generateBlog } from '../../services/blogService';
import { useCoverPhoto } from '../../hooks/useCoverPhoto';

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

  const { setCover, removeCover, busy: coverBusy } = useCoverPhoto(trip);

  const handleEditCover = () => {
    const options = trip.cover_photo_url
      ? [
          { text: 'Choose photo', onPress: () => void setCover() },
          { text: 'Remove cover', style: 'destructive' as const, onPress: () => void removeCover() },
          { text: 'Cancel', style: 'cancel' as const },
        ]
      : [
          { text: 'Choose photo', onPress: () => void setCover() },
          { text: 'Cancel', style: 'cancel' as const },
        ];
    Alert.alert('Cover photo', undefined, options);
  };

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
      const postId = await generateBlog(trip.id);
      if (postId) {
        navigation.navigate('BlogPost', { postId });
      } else {
        Alert.alert('Could not start generation', 'Please try again.');
      }
    } catch (e) {
      Alert.alert('Could not start generation', (e as Error).message);
    } finally {
      setGeneratingBlog(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {trip.cover_photo_url ? (
          <Image
            source={{ uri: trip.cover_photo_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerScrim}
        />
        <Pressable
          style={styles.coverEditButton}
          onPress={handleEditCover}
          disabled={coverBusy}
          hitSlop={8}
        >
          <Ionicons name="camera" size={18} color="#FFFFFF" />
        </Pressable>
        {coverBusy && (
          <View style={styles.coverBusyOverlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
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
              <GradientButton
                label={generatingBlog ? 'Starting…' : 'Generate Blog'}
                onPress={handleGenerateBlog}
                disabled={generatingBlog}
                contentStyle={styles.generateButton}
                textStyle={styles.generateButtonLabel}
              />
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
  coverEditButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
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
