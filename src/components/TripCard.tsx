import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Shadows, BorderRadius, getTripGradient } from '../theme';
import TripStatusBadge from './TripStatusBadge';
import { formatDateRange, isOverdueActive, type Trip } from '../services/tripHelpers';
import { useSignedPhotoUrl } from '../hooks/useSignedPhotos';

export const SWIPE_THRESHOLD = 80;

type Props = {
  trip: Trip;
  onPress: () => void;
  onLongPress: () => void;
};

export default function TripCard({ trip, onPress, onLongPress }: Props) {
  const overdue = isOverdueActive(trip);
  const destinations =
    trip.destinations.length > 0 ? trip.destinations.join(', ') : 'No destination yet';
  const noteCountLabel = `${trip.note_count} ${trip.note_count === 1 ? 'note' : 'notes'}`;
  const gradient = getTripGradient(trip.name);
  // Falls back to the gradient while the cover URL is being signed, and stays
  // there if signing fails — never a blank card.
  const coverUri = useSignedPhotoUrl(trip.cover_photo_url);

  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onUpdate((e) => {
      // Clamp to [−SWIPE_THRESHOLD, 0]: card follows finger left but stops at threshold
      translateX.value = Math.max(-SWIPE_THRESHOLD, Math.min(0, e.translationX));
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        // Crossed threshold: slide off-screen then fire navigation
        translateX.value = withTiming(-500, { duration: 150 }, (finished) => {
          if (finished) {
            translateX.value = 0; // reset before navigating so card is in place on back
            runOnJS(onPress)();
          }
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Pressable
          style={({ pressed }) => [styles.inner, pressed && styles.cardPressed]}
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={400}
        >
          {coverUri ? (
            <Image
              source={{ uri: coverUri }}
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
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.scrim}
          />
          <View style={styles.statusBadgeWrap}>
            <TripStatusBadge status={trip.status} overdue={overdue} />
          </View>
          <View style={styles.bottomLeft}>
            <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
            <Text style={styles.destination} numberOfLines={1}>{destinations}</Text>
            <Text style={styles.dates}>{formatDateRange(trip.start_date, trip.end_date)}</Text>
          </View>
          <Text style={styles.noteCount}>{noteCountLabel}</Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 160,
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  inner: { flex: 1 },
  cardPressed: { opacity: 0.85 },
  scrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  statusBadgeWrap: { position: 'absolute', top: 10, right: 10 },
  bottomLeft: { position: 'absolute', bottom: 10, left: 12, right: 80 },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  destination: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  dates: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  noteCount: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
});
