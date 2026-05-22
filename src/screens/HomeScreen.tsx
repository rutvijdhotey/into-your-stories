import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/types';
import { Colors, Spacing, Typography } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { splitByStatus, type Trip } from '../services/tripHelpers';
import { deleteTrip } from '../services/tripService';
import TripCard from '../components/TripCard';
import EmptyState from '../components/EmptyState';
import CreateTripSheet from '../components/CreateTripSheet';

type Nav = NativeStackNavigationProp<MainStackParamList, 'Tabs'>;

type Row =
  | { kind: 'header'; id: string; label: string; count: number }
  | { kind: 'trip'; id: string; trip: Trip }
  | { kind: 'toggle'; id: string; expanded: boolean; hidden: number };

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { session, signOut } = useAuth();
  const { trips, loading, error } = useTrips(session?.user.id);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const { active, completed } = splitByStatus(trips);
    const out: Row[] = [];
    if (active.length > 0) {
      out.push({ kind: 'header', id: 'h-active', label: 'Active', count: active.length });
      for (const t of active) out.push({ kind: 'trip', id: t.id, trip: t });
    }
    if (completed.length > 0) {
      out.push({ kind: 'header', id: 'h-completed', label: 'Completed', count: completed.length });
      const collapsed = completed.length > 3 && !completedExpanded;
      const visible = collapsed ? completed.slice(0, 3) : completed;
      for (const t of visible) out.push({ kind: 'trip', id: t.id, trip: t });
      if (collapsed) {
        out.push({ kind: 'toggle', id: 'toggle-completed', expanded: false, hidden: completed.length - 3 });
      } else if (completed.length > 3) {
        out.push({ kind: 'toggle', id: 'toggle-completed', expanded: true, hidden: 0 });
      }
    }
    return out;
  }, [trips, completedExpanded]);

  const confirmDelete = (trip: Trip) => {
    Alert.alert(
      `Delete "${trip.name}"?`,
      'This will permanently delete the trip and all of its notes. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTrip(trip.id);
            } catch (e) {
              Alert.alert('Could not delete trip', (e as Error).message);
            }
          },
        },
      ],
    );
  };

  const handleLongPressTrip = (trip: Trip) => {
    if (Platform.OS !== 'ios') {
      Alert.alert(trip.name, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Trip', style: 'destructive', onPress: () => confirmDelete(trip) },
      ]);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: trip.name,
        options: ['Cancel', 'Delete Trip'],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 1,
      },
      (idx) => {
        if (idx === 1) confirmDelete(trip);
      },
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load trips.</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.heading}>My Trips</Text>
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {trips.length === 0 ? (
        <EmptyState
          title="No trips yet"
          subtitle="Start your first trip to begin capturing notes, photos, and places."
          ctaLabel="Start your first trip"
          onCtaPress={() => setSheetVisible(true)}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <Text style={styles.sectionHeader}>
                  {item.label} ({item.count})
                </Text>
              );
            }
            if (item.kind === 'toggle') {
              return (
                <Pressable
                  style={styles.toggleButton}
                  onPress={() => setCompletedExpanded((e) => !e)}
                >
                  <Text style={styles.toggleLabel}>
                    {item.expanded ? 'Show fewer' : `Show ${item.hidden} more`}
                  </Text>
                </Pressable>
              );
            }
            return (
              <TripCard
                trip={item.trip}
                onPress={() => navigation.getParent()?.navigate('TripDetail', { tripId: item.trip.id })}
                onLongPress={() => handleLongPressTrip(item.trip)}
              />
            );
          }}
        />
      )}

      {trips.length > 0 ? (
        <View style={[styles.ctaContainer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable style={styles.cta} onPress={() => setSheetVisible(true)}>
            <Text style={styles.ctaLabel}>Start new trip</Text>
          </Pressable>
        </View>
      ) : null}

      <CreateTripSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  heading: { ...Typography.title },
  signOut: { ...Typography.body, color: Colors.accent },
  listContent: { padding: Spacing.md },
  sectionHeader: { ...Typography.caption, marginTop: Spacing.md, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  toggleButton: { paddingVertical: Spacing.sm, alignItems: 'center' },
  toggleLabel: { ...Typography.body, color: Colors.accent },
  ctaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.background,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
  },
  cta: {
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaLabel: { ...Typography.body, fontWeight: '600' },
  errorText: { ...Typography.heading, marginBottom: Spacing.sm },
  errorDetail: { ...Typography.caption, textAlign: 'center' },
});
